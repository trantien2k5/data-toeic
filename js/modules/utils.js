import { TIME_BUCKETS, SUFFIX_LIST } from './constants.js';
import { state } from './state.js';

export const el = (id) => document.getElementById(id);

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getSuffix(word) {
  if (!word) return null;
  const w = word.toLowerCase();
  for (const suf of SUFFIX_LIST) {
    if (w.endsWith(suf) && w.length > suf.length + 2) return '-' + suf;
  }
  return null;
}

export function getTimeBucketKey(seconds) {
  const b = TIME_BUCKETS.find(b => b.test(seconds));
  return b ? b.key : '>5s';
}

export function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

export function recordAnswerTiming(index) {
  const now = Date.now();
  state.answerTimeSec[index] = (now - state.lastAnswerAt) / 1000;
  state.lastAnswerAt = now;
}

/* ---------- custom modal (replaces native confirm/alert) ---------- */
export function showConfirm(message, okText, cancelText) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box">' +
        '<p class="modal-message"></p>' +
        '<div class="modal-actions">' +
          '<button class="btn-outline modal-cancel"></button>' +
          '<button class="btn-primary modal-ok"></button>' +
        '</div>' +
      '</div>';
    overlay.querySelector('.modal-message').textContent = message;
    overlay.querySelector('.modal-cancel').textContent = cancelText || 'Hủy';
    overlay.querySelector('.modal-ok').textContent = okText || 'Đồng ý';
    document.body.appendChild(overlay);
    
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('.modal-cancel').addEventListener('click', () => cleanup(false));
    overlay.querySelector('.modal-ok').addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
  });
}

export function showAlert(message, okText) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box">' +
        '<p class="modal-message"></p>' +
        '<div class="modal-actions">' +
          '<button class="btn-primary modal-ok"></button>' +
        '</div>' +
      '</div>';
    overlay.querySelector('.modal-message').textContent = message;
    overlay.querySelector('.modal-ok').textContent = okText || 'Đã hiểu';
    document.body.appendChild(overlay);
    
    const cleanup = () => { overlay.remove(); resolve(); };
    overlay.querySelector('.modal-ok').addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
  });
}

/* ---------- screens / tabs ---------- */
const tabChangeListeners = [];

export function onTabChange(callback) {
  tabChangeListeners.push(callback);
}

// .dir-fwd/.dir-back chỉ cần tồn tại trong lúc animation chạy — chúng đặt
// CSS `transform` lên màn hình, mà hễ có `transform` (kể cả translateX(0) ở
// cuối animation) thì MỌI `position: fixed` bên trong nó (vd thanh nav-buttons
// Trước/Tiếp lúc làm bài) sẽ fix theo phần tử đó thay vì theo viewport, làm
// nó tụt xuống giữa trang. Phải tự gỡ class sau khi animation kết thúc,
// không thể dựa vào lần showScreen() kế tiếp vì người dùng có thể ở nguyên
// 1 màn hình rất lâu (cả lúc làm bài) trước khi chuyển màn khác.
export function clearDirAfterAnimation(screen) {
  screen.addEventListener('animationend', function handler() {
    screen.classList.remove('dir-fwd', 'dir-back');
    screen.removeEventListener('animationend', handler);
  }, { once: true });
}

// direction: 'forward' (drilling into a screen, slide from right) | 'back'
// (returning to a previous screen, slide from left) | 'none' (no animation,
// e.g. resetting to the home screen on a bottom-tab switch).
export function showScreen(id, direction = 'forward') {
  document.querySelectorAll('#tab-exams .screen').forEach(s => s.classList.remove('active', 'dir-fwd', 'dir-back'));
  const screen = el(id);
  screen.classList.add('active');
  if (direction !== 'none') {
    screen.classList.add(direction === 'back' ? 'dir-back' : 'dir-fwd');
    clearDirAfterAnimation(screen);
  }
  window.scrollTo(0, 0);
}

export function showTab(tab) {
  document.querySelectorAll('.tabview').forEach(t => t.classList.remove('active'));
  window.scrollTo(0, 0);
  el('tab-' + tab).classList.add('active');
  document.querySelectorAll('#top-tabs button, #mobile-bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  tabChangeListeners.forEach(cb => cb(tab));
}

/* ---------- fullscreen toggle (desktop only) ---------- */
export function updateFullscreenIcon() {
  const btn = el('btn-fullscreen');
  if (!btn) return;
  const isFs = !!document.fullscreenElement;
  btn.querySelector('.material-symbols-outlined').textContent = isFs ? 'fullscreen_exit' : 'fullscreen';
  btn.title = isFs ? 'Thoát toàn màn hình' : 'Bật toàn màn hình';
}

export function initFullscreen() {
  const fsBtn = el('btn-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
    document.addEventListener('fullscreenchange', updateFullscreenIcon);
  }
}

