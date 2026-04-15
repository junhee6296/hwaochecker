import { API_BASE_URL } from './config.js';

let currentAttendees = []; 
let html5QrCode = null; 
let isScanning = false;

export function stopCameraIfRunning() {
  if (html5QrCode && isScanning) {
    document.getElementById('btn-stop-camera').click();
  }
}

export async function loadAttendees(eventId) {
  const tbody = document.getElementById('attendee-table-body');
  const statsLabel = document.getElementById('attendance-stats');
  const res = await fetch(`${API_BASE_URL}/events/${eventId}/attendees`);
  currentAttendees = await res.json(); 
  
  tbody.innerHTML = '';
  let attendedCount = 0;

  currentAttendees.forEach(a => {
    if(a.attended) attendedCount++;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="p-4">${a.orgName}</td><td class="p-4">${a.orgRole}</td><td class="p-4 font-bold">${a.name}</td>
      <td class="p-4 text-center">${a.attended ? `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold text-sm">출석 완료</span>` : `<span class="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-sm">미출석</span>`}</td>`;
    tbody.appendChild(tr);
  });
  statsLabel.textContent = `총 발급: ${currentAttendees.length}명 / 실제 참석: ${attendedCount}명`;
}

export function initScanner() {
  const dashSelect = document.getElementById('dashboard-event-select');
  const scanResult = document.getElementById('scan-result');
  
  const btnModeCamera = document.getElementById('btn-mode-camera');
  const btnModeUpload = document.getElementById('btn-mode-upload');
  const cameraContainer = document.getElementById('camera-container');
  const uploadContainer = document.getElementById('upload-container');
  
  const cameraSelect = document.getElementById('camera-select');
  const btnStartCamera = document.getElementById('btn-start-camera');
  const btnStopCamera = document.getElementById('btn-stop-camera');
  const fileInput = document.getElementById('qr-file-input');

  let lastScannedToken = "";
  let lastScanTime = 0;

  async function processScannedToken(token) {
    const now = Date.now();
    if (token === lastScannedToken && (now - lastScanTime) < 3000) return;
    lastScannedToken = token;
    lastScanTime = now;

    const eventId = dashSelect.value;
    if(!eventId) return alert('먼저 행사를 선택해주세요.');

    scanResult.className = 'text-xl font-bold px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 shadow-sm h-12 flex items-center justify-center min-w-[300px]';
    scanResult.textContent = '인식 완료! 서버 확인 중...';

    try {
      const res = await fetch(`${API_BASE_URL}/qr/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, qrToken: token })
      });
      const data = await res.json();

      if (res.ok) {
        scanResult.className = 'text-xl font-bold px-4 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 shadow-sm h-12 flex items-center justify-center min-w-[300px]';
        scanResult.textContent = `✅ 출석 완료: ${data.attendee.orgName} ${data.attendee.name}님`;
        loadAttendees(eventId); 
      } else {
        scanResult.className = 'text-xl font-bold px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 shadow-sm h-12 flex items-center justify-center min-w-[300px]';
        scanResult.textContent = `❌ ${data.message}`;
      }
    } catch(e) {
      scanResult.textContent = `❌ 통신 오류 발생`;
    }
  }

  // --- 카메라 디바이스 불러오기 ---
  if(cameraSelect) {
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        cameraSelect.innerHTML = '';
        devices.forEach(device => {
          const option = document.createElement('option');
          option.value = device.id;
          option.text = device.label || `카메라 ${cameraSelect.length + 1}`;
          cameraSelect.appendChild(option);
        });
      } else {
        cameraSelect.innerHTML = '<option value="">사용 가능한 카메라가 없습니다.</option>';
      }
    }).catch(err => {
      cameraSelect.innerHTML = '<option value="">카메라 권한을 허용해주세요.</option>';
    });
  }

  if(btnStartCamera) {
    btnStartCamera.addEventListener('click', () => {
      if (!dashSelect.value) return alert('먼저 스캔할 행사를 선택하세요.');
      const cameraId = cameraSelect.value;
      if (!cameraId) return alert('선택된 카메라가 없습니다.');

      if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

      html5QrCode.start(
        cameraId, 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => processScannedToken(decodedText),
        (errorMessage) => {}
      ).then(() => {
        isScanning = true;
        btnStartCamera.classList.add('hidden');
        btnStopCamera.classList.remove('hidden');
        scanResult.className = 'text-xl font-bold px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-500 shadow-sm h-12 flex items-center justify-center min-w-[300px]';
        scanResult.textContent = '스캔 준비 완료.';
      }).catch(err => alert("카메라를 시작할 수 없습니다. 권한을 확인하세요."));
    });
  }

  if(btnStopCamera) {
    btnStopCamera.addEventListener('click', () => {
      if (html5QrCode && isScanning) {
        html5QrCode.stop().then(() => {
          isScanning = false;
          btnStopCamera.classList.add('hidden');
          btnStartCamera.classList.remove('hidden');
          scanResult.textContent = '카메라 정지됨';
        });
      }
    });
  }

  if(btnModeCamera && btnModeUpload) {
    btnModeCamera.addEventListener('click', () => {
      btnModeCamera.className = "flex-1 py-3 px-4 bg-blue-600 text-white font-bold rounded-xl shadow hover:bg-blue-700 transition";
      btnModeUpload.className = "flex-1 py-3 px-4 bg-white text-gray-700 border-2 border-gray-300 font-bold rounded-xl shadow hover:bg-gray-50 transition";
      uploadContainer.classList.add('hidden');
      cameraContainer.classList.remove('hidden');
      scanResult.className = 'text-xl font-bold px-4 py-2 rounded-lg bg-white border border-gray-200 shadow-sm h-12 flex items-center min-w-[300px] justify-center text-gray-400';
      scanResult.textContent = '대기 중...';
    });

    btnModeUpload.addEventListener('click', () => {
      btnModeUpload.className = "flex-1 py-3 px-4 bg-blue-600 text-white font-bold rounded-xl shadow hover:bg-blue-700 transition";
      btnModeCamera.className = "flex-1 py-3 px-4 bg-white text-gray-700 border-2 border-gray-300 font-bold rounded-xl shadow hover:bg-gray-50 transition";
      cameraContainer.classList.add('hidden');
      uploadContainer.classList.remove('hidden');
      stopCameraIfRunning();
      scanResult.className = 'text-xl font-bold px-4 py-2 rounded-lg bg-white border border-gray-200 shadow-sm h-12 flex items-center min-w-[300px] justify-center text-gray-400';
      scanResult.textContent = '대기 중...';
    });
  }

  if(fileInput) {
    fileInput.addEventListener('change', e => {
      if (e.target.files.length == 0) return;
      if (!dashSelect.value) return alert('먼저 스캔할 행사를 선택하세요.');

      const imageFile = e.target.files[0];
      const html5QrCodeTemp = new Html5Qrcode("reader"); 

      scanResult.className = 'text-xl font-bold px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 shadow-sm h-12 flex items-center justify-center min-w-[300px]';
      scanResult.textContent = '이미지 분석 중...';

      html5QrCodeTemp.scanFile(imageFile, true)
        .then(decodedText => { processScannedToken(decodedText); })
        .catch(err => {
          scanResult.className = 'text-xl font-bold px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 shadow-sm h-12 flex items-center justify-center min-w-[300px]';
          scanResult.textContent = '❌ 이미지에서 QR 코드를 찾지 못했습니다.';
        })
        .finally(() => { fileInput.value = ''; });
    });
  }

  // 엑셀 다운로드
  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    if (!currentAttendees || currentAttendees.length === 0) return alert('다운로드할 데이터가 없습니다.');
    const excelData = currentAttendees.map(a => ({
      '대분류': a.orgType, '기관/학교명': a.orgName, '부서/직위': a.orgRole, '이름': a.name,
      '출석 여부': a.attended ? '출석(O)' : '결석(X)', '출석 시간': a.scannedAt ? new Date(a.scannedAt).toLocaleString('ko-KR') : '-'
    }));
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "참석자 명단");
    const eventName = dashSelect.options[dashSelect.selectedIndex].text;
    XLSX.writeFile(workbook, `[쓱첵] ${eventName}_출석명단.xlsx`);
  });
}