// JS/app.js
import { initAuth } from './auth.js';
import { initEvents } from './events.js';
import { initScanner } from './scanner.js';

// HTML 요소가 모두 준비되면 각 기능들을 초기화(실행)합니다.
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initEvents();
  initScanner();
});