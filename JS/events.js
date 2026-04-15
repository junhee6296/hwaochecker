// JS/events.js
import { API_BASE_URL, globalState } from './config.js';
import { loadAttendees, stopCameraIfRunning } from './scanner.js';

const dashSelect = document.getElementById('dashboard-event-select');
const eventBoard = document.getElementById('event-management-board');
let currentEvents = []; // 불러온 행사 목록 저장용

// 1. 행사 목록 불러오기
export async function loadEventsForDashboard() {
  if (!dashSelect) return;
  try {
    const res = await fetch(`${API_BASE_URL}/events`);
    currentEvents = await res.json();
    
    dashSelect.innerHTML = '<option value="">관리할 행사 선택...</option>';
    currentEvents.forEach(e => {
      const opt = document.createElement('option'); 
      opt.value = e.id; 
      opt.textContent = e.name;
      dashSelect.appendChild(opt);
    });
    eventBoard.classList.add('hidden');
  } catch (error) {
    console.error('행사 목록을 불러오지 못했습니다.', error);
  }
}

// 2. 대시보드 내 이벤트 초기화
export function initEvents() {
  
  // --- 탭 전환 로직 ---
  const tabCreate = document.getElementById('tab-create');
  const tabDashboard = document.getElementById('tab-dashboard');
  
  if (tabCreate) {
    tabCreate.addEventListener('click', () => {
      stopCameraIfRunning(); // 탭 이동 시 카메라 끄기
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

  // --- 행사 생성 로직 ---
  const createForm = document.getElementById('create-event-form');
  if(createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('eventName').value, 
        location: document.getElementById('location').value,
        eventType: document.getElementById('eventType').value,
        qrStartTime: document.getElementById('qrStartTime').value, 
        endTime: document.getElementById('endTime').value
      };
      
      if (new Date(payload.qrStartTime) >= new Date(payload.endTime)) {
        return alert('행사 마감 일시는 QR 발급 시작 시간보다 늦어야 합니다.');
      }
      
      try {
        await fetch(`${API_BASE_URL}/events`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(payload) 
        });
        alert('생성 완료'); 
        createForm.reset();
      } catch (error) {
        alert('생성 중 오류가 발생했습니다.');
      }
    });
  }

  // --- 관리할 행사 선택 시 이벤트 ---
  if (dashSelect) {
    dashSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        eventBoard.classList.remove('hidden');
        loadAttendees(e.target.value);
        
        const btnModeCamera = document.getElementById('btn-mode-camera');
        if(btnModeCamera) btnModeCamera.click(); 
        
        const selectedEvent = currentEvents.find(ev => ev.id == e.target.value);
        if (selectedEvent) {
          document.getElementById('newEndTime').value = selectedEvent.endTime;
        }

        // 다른 행사를 선택하면 위험 구역 UI 상태를 초기화합니다.
        document.getElementById('edit-auth-box').classList.add('hidden');
        document.getElementById('delete-auth-box').classList.add('hidden');
        document.getElementById('btn-req-edit-code').textContent = '시간 변경용 인증 메일 발송';
        document.getElementById('btn-req-delete-code').textContent = '삭제용 인증 메일 발송';
        document.getElementById('editCode').value = '';
        document.getElementById('deleteCode').value = '';

      } else {
        stopCameraIfRunning();
        eventBoard.classList.add('hidden');
      }
    });
  }

  // --- 관리자 권한 (시간 변경 & 행사 삭제) 공통 로직 ---
  // ✅ 누락되었던 confirmBtnId 파라미터를 추가하여 버튼 ID를 정확하게 매칭합니다.
  const setupAction = (btnId, boxId, urlSuffix, method, inputId, actionType, defaultBtnText, confirmBtnId) => {
    const btnReq = document.getElementById(btnId);
    const btnConfirm = document.getElementById(confirmBtnId); // ✅ 정확한 버튼 ID
    const authBox = document.getElementById(boxId);
    
    if (!btnReq || !btnConfirm) return;

    btnReq.addEventListener('click', async () => {
      if (inputId === 'editCode' && !document.getElementById('newEndTime').value) {
        return alert('새로운 마감 일시를 먼저 설정해주세요.');
      }

      btnReq.disabled = true;
      btnReq.textContent = '메일 발송 중...';

      try {
        const res = await fetch(`${API_BASE_URL}/admin/request-code`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ email: globalState.loggedInEmail, type: actionType }) 
        });
        
        if (res.ok) {
          alert('인증메일이 발송되었습니다. (3분 유효)');
          authBox.classList.remove('hidden');
          btnReq.textContent = '인증번호 재발송';
        } else {
          const errorData = await res.json();
          alert(errorData.message || '메일 발송 실패');
          btnReq.textContent = defaultBtnText;
        }
      } catch (e) {
        alert('서버와 통신할 수 없습니다.');
        btnReq.textContent = defaultBtnText;
      }
      btnReq.disabled = false;
    });

    btnConfirm.addEventListener('click', async () => {
      const code = document.getElementById(inputId).value.trim();
      const eventId = dashSelect.value;
      if (!code) return alert('인증번호를 입력해주세요.');

      if (method === 'DELETE' && !confirm("정말 이 행사를 영구 삭제하시겠습니까?")) return;

      const bodyData = { email: globalState.loggedInEmail, code };
      if (inputId === 'editCode') {
        bodyData.newEndTime = document.getElementById('newEndTime').value;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/events/${eventId}${urlSuffix}`, { 
          method: method, 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(bodyData) 
        });

        if (res.ok) { 
          alert('성공적으로 처리되었습니다.');
          document.getElementById(inputId).value = ''; 
          authBox.classList.add('hidden'); 
          btnReq.textContent = defaultBtnText; // 처리 완료 후 버튼 텍스트 복구
          loadEventsForDashboard(); 
        } else { 
          const errorData = await res.json();
          alert(errorData.message || '요청 처리 실패'); 
        }
      } catch (e) {
        alert('서버와 통신 중 오류가 발생했습니다.');
      }
    });
  };

  // ✅ 8개의 인자를 모두 전달하여 완벽하게 작동하도록 설정
  setupAction('btn-req-edit-code', 'edit-auth-box', '/endtime', 'PATCH', 'editCode', 'edit', '시간 변경용 인증 메일 발송', 'btn-confirm-edit-time');
  setupAction('btn-req-delete-code', 'delete-auth-box', '', 'DELETE', 'deleteCode', 'delete', '삭제용 인증 메일 발송', 'btn-confirm-delete');
}