// JS/events.js
import { API_BASE_URL, globalState } from './config.js';
import { loadAttendees } from './scanner.js';

const dashSelect = document.getElementById('dashboard-event-select');
const eventBoard = document.getElementById('event-management-board');

export async function loadEventsForDashboard() {
  if (!dashSelect) return;
  const res = await fetch(`${API_BASE_URL}/events`);
  const events = await res.json();
  dashSelect.innerHTML = '<option value="">관리할 행사 선택...</option>';
  events.forEach(e => {
    const opt = document.createElement('option'); opt.value = e.id; opt.textContent = e.name;
    dashSelect.appendChild(opt);
  });
  eventBoard.classList.add('hidden');
}

export function initEvents() {
  // 1. 탭 전환 로직
  const tabCreate = document.getElementById('tab-create');
  const tabDashboard = document.getElementById('tab-dashboard');
  if (tabCreate) {
    tabCreate.addEventListener('click', () => {
      tabCreate.className = "flex-1 py-4 text-xl font-semibold text-blue-600 border-b-4 border-blue-600";
      tabDashboard.className = "flex-1 py-4 text-xl font-semibold text-gray-500 hover:text-gray-700 border-b-4 border-transparent";
      document.getElementById('content-create').classList.remove('hidden');
      document.getElementById('content-dashboard').classList.add('hidden');
    });
    tabDashboard.addEventListener('click', () => {
      tabDashboard.className = "flex-1 py-4 text-xl font-semibold text-blue-600 border-b-4 border-blue-600";
      tabCreate.className = "flex-1 py-4 text-xl font-semibold text-gray-500 hover:text-gray-700 border-b-4 border-transparent";
      document.getElementById('content-dashboard').classList.remove('hidden');
      document.getElementById('content-create').classList.add('hidden');
      loadEventsForDashboard();
    });
  }

  // 2. 행사 생성 로직
  const createForm = document.getElementById('create-event-form');
  if(createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('eventName').value, location: document.getElementById('location').value,
        eventType: document.getElementById('eventType').value,
        qrStartTime: document.getElementById('qrStartTime').value, endTime: document.getElementById('endTime').value
      };
      if (new Date(payload.qrStartTime) >= new Date(payload.endTime)) {
        return alert('행사 마감 일시는 QR 발급 시작 시간보다 늦어야 합니다.');
      }
      await fetch(`${API_BASE_URL}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      alert('생성 완료'); createForm.reset();
    });
  }

  // 3. 행사 선택 시 참석자 목록 로드
  if (dashSelect) {
    dashSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        eventBoard.classList.remove('hidden');
        loadAttendees(e.target.value);
      } else {
        eventBoard.classList.add('hidden');
      }
    });
  }

  // 4. 행사 삭제 로직
  const btnReqDelCode = document.getElementById('btn-req-delete-code');
  const btnConfirmDel = document.getElementById('btn-confirm-delete');
  const deleteAuthBox = document.getElementById('delete-auth-box');

  if (btnReqDelCode) {
    btnReqDelCode.addEventListener('click', async () => {
      btnReqDelCode.disabled = true; btnReqDelCode.textContent = '메일 발송 중...';
      const res = await fetch(`${API_BASE_URL}/admin/request-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: globalState.loggedInEmail })
      });
      if (res.ok) {
        alert('삭제 확인용 인증번호가 발송되었습니다. (3분 유효)');
        deleteAuthBox.classList.remove('hidden');
        btnReqDelCode.textContent = '인증번호 재발송';
      } else { alert('발송 실패'); }
      btnReqDelCode.disabled = false;
    });

    btnConfirmDel.addEventListener('click', async () => {
      const code = document.getElementById('deleteCode').value.trim();
      const eventId = dashSelect.value;
      if (!code) return alert('인증번호를 입력해주세요.');

      const res = await fetch(`${API_BASE_URL}/events/${eventId}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: globalState.loggedInEmail, code })
      });

      if (res.ok) {
        alert('삭제되었습니다.');
        document.getElementById('deleteCode').value = '';
        loadEventsForDashboard();
      } else {
        alert((await res.json()).message);
      }
    });
  }
}