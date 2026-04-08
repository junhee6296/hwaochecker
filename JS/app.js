// app.js

// 서버 API 주소 (나중에 실제 서버 주소로 변경)
const API_BASE_URL = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
  const createForm = document.getElementById('create-event-form');
  
  // 1. 행사 생성 로직 (POST 요청)
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // DB 구조에 맞춰 데이터 수집
      const eventData = {
        name: document.getElementById('eventName').value,
        location: document.getElementById('location').value,
        eventType: document.getElementById('eventType').value,
        // 기타 필요한 데이터들...
      };

      try {
        // fetch를 이용해 우리 백엔드 서버로 데이터 전송
        const response = await fetch(`${API_BASE_URL}/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventData)
        });

        const result = await response.json();

        if (response.ok) {
          alert('행사가 성공적으로 생성되었습니다!');
          createForm.reset();
        } else {
          alert(`생성 실패: ${result.message}`);
        }
      } catch (error) {
        console.error('서버 통신 오류:', error);
        alert('서버와 연결할 수 없습니다.');
      }
    });
  }

  // 2. 행사 목록 불러오기 로직 (GET 요청)
  async function loadEventsForDashboard() {
    const selectBox = document.getElementById('dashboard-event-select');
    if (!selectBox) return;

    try {
      // 서버에서 행사 목록(Events 테이블) 가져오기
      const response = await fetch(`${API_BASE_URL}/events`);
      const events = await response.json();

      selectBox.innerHTML = '<option value="">선택해주세요.</option>';
      
      events.forEach(event => {
        const option = document.createElement('option');
        option.value = event.id;
        option.textContent = event.name;
        selectBox.appendChild(option);
      });
    } catch (error) {
      selectBox.innerHTML = '<option value="">목록 로드 실패</option>';
      console.error(error);
    }
  }

  // 초기 실행
  loadEventsForDashboard();
  
  // 탭 전환 로직 등 UI 제어 코드는 여기에 이어서 작성...
});
