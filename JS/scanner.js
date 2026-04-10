// JS/scanner.js
import { API_BASE_URL } from './config.js';

export async function loadAttendees(eventId) {
  const tbody = document.getElementById('attendee-table-body');
  const statsLabel = document.getElementById('attendance-stats');
  
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/attendees`);
  const list = await res.json();
  
  tbody.innerHTML = '';
  let attendedCount = 0;

  list.forEach(a => {
    if(a.attended) attendedCount++;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-4 font-semibold text-gray-800">${a.orgName}</td>
      <td class="p-4 text-gray-600">${a.orgRole}</td>
      <td class="p-4 font-bold">${a.name}</td>
      <td class="p-4 text-center">
        ${a.attended ? `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold text-sm">출석 완료</span>` 
                     : `<span class="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-sm">미출석</span>`}
      </td>
    `;
    tbody.appendChild(tr);
  });

  statsLabel.textContent = `총 발급: ${list.length}명 / 실제 참석(인식완료): ${attendedCount}명`;
}

export function initScanner() {
  const scannerArea = document.getElementById('scanner-area');
  const scanResult = document.getElementById('scan-result');
  const dashSelect = document.getElementById('dashboard-event-select');

  if (!scannerArea) return;

  async function processScannedToken(token) {
    scanResult.className = 'mt-4 text-xl font-bold text-blue-600';
    scanResult.textContent = '인식 중...';

    const eventId = dashSelect.value;
    const res = await fetch(`${API_BASE_URL}/qr/scan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, qrToken: token })
    });
    const data = await res.json();

    if (res.ok) {
      scanResult.className = 'mt-4 text-xl font-bold text-green-600';
      scanResult.textContent = `✅ 출석 완료: ${data.attendee.orgName} - ${data.attendee.name}님`;
      loadAttendees(eventId); // 표 즉시 갱신
    } else {
      scanResult.className = 'mt-4 text-xl font-bold text-red-600';
      scanResult.textContent = `❌ ${data.message}`;
    }
  }

  scannerArea.addEventListener('paste', async (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        const img = new Image();
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          
          if (code) {
            processScannedToken(code.data);
          } else {
            scanResult.className = 'mt-4 text-xl font-bold text-red-600';
            scanResult.textContent = '❌ QR 코드를 인식하지 못했습니다. 선명한 이미지를 복사해주세요.';
          }
        };
        img.src = URL.createObjectURL(blob);
      }
    }
  });
}