require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let events = [
  { id: 1, name: '2026 상반기 신규 공무원 직무연수', location: '이산홀', eventType: '확정', qrStartTime: '2026-01-01T00:00', endTime: '2099-12-31T23:59' }
];
let nextEventId = 2;

// 참석자 DB (출석 여부와 토큰 추가)
let attendees = []; // { eventId, orgType, orgName, orgRole, name, qrToken, tokenExpiresAt, attended: false, scannedAt: null }

const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim()) : [];
let authCodes = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'qr.html')); });

// [이메일 인증]
app.post('/api/admin/request-code', async (req, res) => {
  const { email } = req.body;
  if (!adminEmails.includes(email)) return res.status(403).json({ message: '등록되지 않은 관리자 이메일입니다.' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 3 * 60 * 1000; // 3분 유효
  authCodes[email] = { code, expiresAt };

  try {
    await transporter.sendMail({
      from: `"쓱첵 관리자" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '[쓱첵] 관리자 인증번호',
      text: `인증번호는 [${code}] 입니다. 3분 안에 입력해주세요.`
    });
    res.json({ message: '인증번호가 발송되었습니다.' });
  } catch (error) {
    res.status(500).json({ message: '메일 발송에 실패했습니다.' });
  }
});

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

// [행사] API
app.get('/api/events', (req, res) => { res.json(events); });
app.post('/api/events', (req, res) => {
  const { name, location, eventType, qrStartTime, endTime } = req.body;
  if (!name || !location || !eventType || !qrStartTime || !endTime) return res.status(400).json({ message: '입력 누락' });
  const newEvent = { id: nextEventId++, name, location, eventType, qrStartTime, endTime };
  events.push(newEvent);
  res.status(201).json({ message: 'success', event: newEvent });
});
app.delete('/api/events/:id', (req, res) => {
  const { email, code } = req.body;
  const record = authCodes[email];
  if (!record || record.code !== code || Date.now() > record.expiresAt) return res.status(401).json({ message: '인증 실패' });
  delete authCodes[email];
  events = events.filter(e => e.id !== parseInt(req.params.id));
  attendees = attendees.filter(a => a.eventId !== parseInt(req.params.id));
  res.json({ message: 'success' });
});

// [대시보드용] 행사 참석자 및 통계 불러오기
app.get('/api/events/:id/attendees', (req, res) => {
  const list = attendees.filter(a => a.eventId === parseInt(req.params.id));
  res.json(list);
});

// [QR] 생성 및 발급 (3분 타이머 적용)
app.post('/api/qr/generate', (req, res) => {
  const { eventId, orgType, orgName, orgRole, name } = req.body;
  const event = events.find(e => e.id == eventId);
  if (!event) return res.status(404).json({ message: '존재하지 않는 행사입니다.' });

  const now = new Date();
  if (now < new Date(event.qrStartTime)) return res.status(403).json({ message: '아직 QR 발급 시작 시간이 아닙니다.' });
  if (now > new Date(event.endTime)) return res.status(403).json({ message: '종료된 행사입니다.' });

  let attendee = attendees.find(a => a.eventId == eventId && a.orgName === orgName && a.name === name);
  if (attendee && attendee.attended) return res.status(409).json({ message: '이미 출석이 완료되었습니다.' });
  if (attendee) return res.status(409).json({ message: '이미 발급이력이 있습니다. 재발급을 누르세요.' });

  // 3분 유효한 새 토큰 발급
  const qrToken = Math.random().toString(36).substring(2, 15);
  const tokenExpiresAt = Date.now() + 3 * 60 * 1000;
  
  attendees.push({ eventId: parseInt(eventId), orgType, orgName, orgRole, name, qrToken, tokenExpiresAt, attended: false, scannedAt: null });
  res.json({ message: 'success', qrData: qrToken, expiresAt: tokenExpiresAt });
});

// [QR] 기등록자 재발급
app.post('/api/qr/reissue', (req, res) => {
  const { eventId, orgName, name } = req.body;
  let attendee = attendees.find(a => a.eventId == eventId && a.orgName === orgName && a.name === name);
  if (!attendee) return res.status(404).json({ message: '정보가 없습니다. 신규 발급해주세요.' });
  if (attendee.attended) return res.status(409).json({ message: '이미 출석이 완료되었습니다.' });

  // 토큰 갱신
  attendee.qrToken = Math.random().toString(36).substring(2, 15);
  attendee.tokenExpiresAt = Date.now() + 3 * 60 * 1000;
  res.json({ message: 'success', qrData: attendee.qrToken, expiresAt: attendee.tokenExpiresAt });
});

// [QR] 관리자 스캐너 출석 처리
app.post('/api/qr/scan', (req, res) => {
  const { eventId, qrToken } = req.body;
  const attendee = attendees.find(a => a.qrToken === qrToken && a.eventId == eventId);
  
  if (!attendee) return res.status(404).json({ message: '유효하지 않은 QR이거나 다른 행사의 QR입니다.' });
  if (Date.now() > attendee.tokenExpiresAt) return res.status(403).json({ message: 'QR 코드가 만료되었습니다. 참석자에게 재발급을 요청하세요.' });
  if (attendee.attended) return res.status(409).json({ message: '이미 출석 처리된 인원입니다.' });

  // 출석 승인
  attendee.attended = true;
  attendee.scannedAt = new Date();
  res.json({ message: 'success', attendee });
});

app.listen(port, () => console.log(`✅ 서버 실행: http://localhost:${port}`));