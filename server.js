// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ==========================================
// 💾 JSON 파일 기반 데이터베이스 세팅
// ==========================================
const dbPath = path.join(__dirname, 'data.json');
let db = { events: [], attendees: [], nextEventId: 1 };

if (fs.existsSync(dbPath)) {
  const rawData = fs.readFileSync(dbPath, 'utf-8');
  db = JSON.parse(rawData);
}

function saveDB() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
}

// ==========================================
// 🔑 인증 및 이메일 세팅
// ==========================================
const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim()) : [];
let authCodes = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'qr.html')); });

// ✅ 수정됨: 이메일 제목 분리 (스레드 겹침 방지)
app.post('/api/admin/request-code', async (req, res) => {
  const { email, type } = req.body;
  if (!adminEmails.includes(email)) return res.status(403).json({ message: '등록되지 않은 관리자 이메일입니다.' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 3 * 60 * 1000;
  authCodes[email] = { code, expiresAt };

  let subjectTitle = '관리자 로그인';
  if (type === 'edit') subjectTitle = '행사 마감시간 변경';
  if (type === 'delete') subjectTitle = '행사 삭제';

  try {
    await transporter.sendMail({
      from: `"쓱첵 관리자" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `[쓱첵] ${subjectTitle} 인증번호`,
      text: `${subjectTitle}을(를) 진행하기 위한 인증번호는 [${code}] 입니다.\n보안을 위해 3분 안에 입력해주세요.`
    });
    res.json({ message: '인증번호가 발송되었습니다.' });
  } catch (error) {
    res.status(500).json({ message: '메일 발송에 실패했습니다.' });
  }
});

// ✅ 404 에러의 원인이었던 인증 확인 라우터
app.post('/api/admin/verify-code', (req, res) => {
  const { email, code } = req.body;
  const record = authCodes[email];
  if (record && record.code === code) {
    if (Date.now() > record.expiresAt) {
      delete authCodes[email];
      return res.status(401).json({ message: '인증번호가 만료되었습니다.' });
    }
    delete authCodes[email];
    res.json({ message: 'success' });
  } else {
    res.status(401).json({ message: '인증번호가 일치하지 않습니다.' });
  }
});

// ==========================================
// 📅 행사 및 QR 관리 API
// ==========================================
app.get('/api/events', (req, res) => { res.json(db.events); });

app.post('/api/events', (req, res) => {
  const { name, location, eventType, qrStartTime, endTime } = req.body;
  if (!name || !location || !eventType || !qrStartTime || !endTime) return res.status(400).json({ message: '입력 누락' });
  
  const newEvent = { id: db.nextEventId++, name, location, eventType, qrStartTime, endTime };
  db.events.push(newEvent);
  saveDB();
  res.status(201).json({ message: 'success', event: newEvent });
});

app.delete('/api/events/:id', (req, res) => {
  const { email, code } = req.body;
  const record = authCodes[email];
  if (!record || record.code !== code || Date.now() > record.expiresAt) return res.status(401).json({ message: '인증 실패' });
  delete authCodes[email]; 
  
  const targetId = parseInt(req.params.id);
  db.events = db.events.filter(e => e.id !== targetId);
  db.attendees = db.attendees.filter(a => a.eventId !== targetId);
  saveDB(); 
  res.json({ message: 'success' });
});

app.patch('/api/events/:id/endtime', (req, res) => {
  const { email, code, newEndTime } = req.body;
  const record = authCodes[email];

  if (!record || record.code !== code || Date.now() > record.expiresAt) return res.status(401).json({ message: '인증 실패' });
  delete authCodes[email]; 
  
  const targetId = parseInt(req.params.id);
  const event = db.events.find(e => e.id === targetId);
  if (!event) return res.status(404).json({ message: '행사를 찾을 수 없습니다.' });

  event.endTime = newEndTime;
  saveDB(); 
  res.json({ message: 'success', event });
});

app.get('/api/events/:id/attendees', (req, res) => {
  const list = db.attendees.filter(a => a.eventId === parseInt(req.params.id));
  res.json(list);
});

app.post('/api/qr/generate', (req, res) => {
  const { eventId, orgType, orgName, orgRole, name } = req.body;
  const event = db.events.find(e => e.id == eventId);
  if (!event) return res.status(404).json({ message: '행사가 없습니다.' });

  const now = new Date();
  if (now < new Date(event.qrStartTime)) return res.status(403).json({ message: '발급 시작 시간이 아닙니다.' });
  if (now > new Date(event.endTime)) return res.status(403).json({ message: '종료된 행사입니다.' });

  let attendee = db.attendees.find(a => a.eventId == eventId && a.orgName === orgName && a.name === name);
  if (attendee && attendee.attended) return res.status(409).json({ message: '이미 출석 완료되었습니다.' });
  if (attendee) return res.status(409).json({ message: '이미 발급 이력이 있습니다.' });

  const qrToken = Math.random().toString(36).substring(2, 15);
  const tokenExpiresAt = Date.now() + 3 * 60 * 1000;
  
  db.attendees.push({ eventId: parseInt(eventId), orgType, orgName, orgRole, name, qrToken, tokenExpiresAt, attended: false, scannedAt: null });
  saveDB(); 
  res.json({ message: 'success', qrData: qrToken, expiresAt: tokenExpiresAt });
});

app.post('/api/qr/reissue', (req, res) => {
  const { eventId, orgName, name } = req.body;
  let attendee = db.attendees.find(a => a.eventId == eventId && a.orgName === orgName && a.name === name);
  if (!attendee) return res.status(404).json({ message: '등록된 정보가 없습니다.' });
  if (attendee.attended) return res.status(409).json({ message: '이미 출석이 완료되었습니다.' });

  attendee.qrToken = Math.random().toString(36).substring(2, 15);
  attendee.tokenExpiresAt = Date.now() + 3 * 60 * 1000;
  saveDB(); 
  res.json({ message: 'success', qrData: attendee.qrToken, expiresAt: attendee.tokenExpiresAt });
});

app.post('/api/qr/scan', (req, res) => {
  const { eventId, qrToken } = req.body;
  const attendee = db.attendees.find(a => a.qrToken === qrToken && a.eventId == eventId);
  
  if (!attendee) return res.status(404).json({ message: '유효하지 않거나 다른 행사의 QR입니다.' });
  if (Date.now() > attendee.tokenExpiresAt) return res.status(403).json({ message: 'QR 코드가 만료되었습니다.' });
  if (attendee.attended) return res.status(409).json({ message: '이미 출석 처리되었습니다.' });

  attendee.attended = true;
  attendee.scannedAt = new Date();
  saveDB(); 
  res.json({ message: 'success', attendee });
});

app.listen(port, () => console.log(`✅ 서버 실행: http://localhost:${port}`));