import { DATA_URL, QUESTIONS_PER_EXAM, ANSWER_TO_CATEGORY } from './js/modules/constants.js';
import { state } from './js/modules/state.js';
import { el, showScreen, showTab, initFullscreen, onTabChange, showConfirm, showAlert, shuffle, getSuffix } from './js/modules/utils.js';
import { loadProgress, exportProgressJSON, mergeProgressJSON } from './js/modules/storage.js';
import { renderExamList, startExam, toggleView, renderQuestion, finishExam, applyReviewFilter } from './js/modules/quiz.js';
import { renderStats, showStatScreen, buildReportText } from './js/modules/stats.js';

async function loadQuestions() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    let data = await res.json();
    if (!data) throw new Error("Dữ liệu trống");
    if (!Array.isArray(data)) data = [data];
    state.ALL_QUESTIONS = data;
  } catch (err) {
    el('loading').innerHTML =
      '⚠️ Không thể tải file dữ liệu <code>' + DATA_URL + '</code>.<br>' +
      'Nếu bạn đang mở file này trực tiếp (file://), trình duyệt có thể chặn fetch local file.<br><br>' +
      'Hãy chạy bằng local server, ví dụ: <code>npx serve .</code> hoặc <code>python -m http.server</code>, ' +
      'rồi mở <code>http://localhost:PORT/index.html</code>.';
    return;
  }
  el('loading').style.display = 'none';

  state.WORD_FAMILY_MAP = {};
  state.ALL_QUESTIONS.forEach(q => { state.WORD_FAMILY_MAP[q.word] = q.family || q.word; });

  const LEVEL_LABELS = [
    "Level 1 · Cơ bản",
    "Level 2 · Theo hậu tố",
    "Level 3 · Từ dễ nhầm",
    "Level 4 · TOEIC thực tế",
  ];
  const EXAMS_PER_LEVEL = 5;
  const LEVEL_SIZE = EXAMS_PER_LEVEL * QUESTIONS_PER_EXAM;
  const PER_CATEGORY_PER_EXAM = QUESTIONS_PER_EXAM / 4;

  state.EXAMS = [];
  state.WORD_LEVEL_MAP = {};
  for (let levelStart = 0; levelStart < state.ALL_QUESTIONS.length; levelStart += LEVEL_SIZE) {
    const levelQuestions = state.ALL_QUESTIONS.slice(levelStart, levelStart + LEVEL_SIZE);
    const levelLabel = LEVEL_LABELS[levelStart / LEVEL_SIZE] || "";
    levelQuestions.forEach(q => { state.WORD_LEVEL_MAP[q.word] = levelLabel; });

    const byCategory = { N: [], V: [], ADJ: [], ADV: [] };
    levelQuestions.forEach(q => {
      const cat = ANSWER_TO_CATEGORY[q.correctAnswer];
      if (byCategory[cat]) byCategory[cat].push(q);
    });

    for (let e = 0; e < EXAMS_PER_LEVEL; e++) {
      const examQuestions = [];
      Object.keys(byCategory).forEach(cat => {
        const start = e * PER_CATEGORY_PER_EXAM;
        examQuestions.push(...byCategory[cat].slice(start, start + PER_CATEGORY_PER_EXAM));
      });
      const idx = state.EXAMS.length + 1;
      state.EXAMS.push({ id: "de" + idx, title: "Đề " + idx, level: levelLabel, questions: examQuestions });
    }
  }

  loadProgress();
  renderExamList();
}

function initEventListeners() {
  // Tab buttons
  document.querySelectorAll('#top-tabs button, #mobile-bottom-nav button').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  // Tab change triggers stats render
  onTabChange((tab) => {
    if (tab === 'stats') {
      renderStats();
    }
  });

  // Exit exam
  el('exit-exam-btn').addEventListener('click', () => {
    showConfirm('Thoát đề đang làm? Tiến độ hiện tại sẽ không được lưu.', 'Thoát đề', 'Huỷ').then(ok => {
      if (!ok) return;
      clearInterval(state.timerInterval);
      el('timer').style.display = 'none';
      el('exit-exam-btn').style.display = 'none';
      el('btn-submit').style.display = 'none';
      el('btn-toggle-view').style.display = 'none';
      document.body.classList.remove('exam-mode');
      showScreen('screen-exam-list');
      renderExamList();
    });
  });

  // View toggle
  el('btn-toggle-view').addEventListener('click', toggleView);

  // Collapsible mobile question-number grid
  el('mobile-checklist-toggle').addEventListener('click', () => {
    el('mobile-checklist').classList.toggle('open');
  });

  // Submit exam
  el('btn-submit').addEventListener('click', () => {
    const answered = Object.keys(state.userAnswers).length;
    const unanswered = state.runQuestions.length - answered;
    const msg = unanswered > 0
      ? 'Bạn còn ' + unanswered + ' câu chưa làm. Bạn có chắc chắn muốn nộp bài?'
      : 'Bạn có chắc chắn muốn nộp bài?';
    showConfirm(msg, 'Nộp bài', 'Huỷ').then(ok => { if (ok) finishExam(); });
  });

  // Prev / Next questions (in single view)
  el('btn-prev').addEventListener('click', () => { 
    if (state.currentIndex > 0) { 
      state.currentIndex--; 
      renderQuestion(); 
    } 
  });
  el('btn-next').addEventListener('click', () => { 
    if (state.currentIndex < state.runQuestions.length - 1) { 
      state.currentIndex++; 
      renderQuestion(); 
    } 
  });

  // Jump to unanswered
  el('btn-jump-unanswered').addEventListener('click', () => {
    const idx = state.runQuestions.findIndex((q, i) => state.userAnswers[i] === undefined);
    if (idx !== -1) { 
      state.currentIndex = idx; 
      renderQuestion(); 
    }
  });

  // Submit inline
  el('btn-submit-inline').addEventListener('click', () => el('btn-submit').click());

  // Back from level detail to level grid
  el('btn-back-levels').addEventListener('click', () => {
    showScreen('screen-exam-list');
    renderExamList();
  });

  // Review filter chips
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => applyReviewFilter(btn.dataset.filter));
  });

  // Retry / Back buttons from result screen
  el('btn-retry').addEventListener('click', () => startExam(state.currentExam.id));
  el('btn-back-list').addEventListener('click', () => { 
    showScreen('screen-exam-list'); 
    renderExamList(); 
  });
  el('btn-back-history').addEventListener('click', () => { 
    showTab('stats'); 
    showStatScreen('stat-detail-history'); 
  });

  // Redo wrong ones
  el('btn-redo-wrong').addEventListener('click', () => {
    const wrongOnes = state.lastReviewDetails.filter(d => d.status !== 'correct');
    if (wrongOnes.length === 0) return;
    state.customExamPool['redo-wrong'] = {
      id: 'redo-wrong',
      title: 'Ôn lại câu sai/bỏ trống',
      level: 'Ôn tập điểm yếu',
      questions: wrongOnes.map(d => ({
        word: d.word, meaning: d.meaning, question: d.question,
        options: d.options, correctAnswer: d.correctAnswer, explanation: d.explanation,
      })),
    };
    startExam('redo-wrong');
  });

  // Practice worst words
  el('btn-practice-worst-words').addEventListener('click', async () => {
    const words = Object.values(state.progress.wordStats || {}).filter(w => w.wrong > 0).map(w => w.word);
    if (words.length === 0) {
      await showAlert('Bạn chưa có từ nào sai cả — cứ tiếp tục phát huy!');
      return;
    }
    const pool = state.ALL_QUESTIONS.filter(q => words.includes(q.word));
    const picked = shuffle(pool).slice(0, Math.min(20, pool.length));
    state.customExamPool['practice-worst-words'] = {
      id: 'practice-worst-words',
      title: 'Ôn tập từ sai nhiều nhất',
      level: 'Ôn tập điểm yếu',
      questions: picked,
    };
    showTab('exams');
    startExam('practice-worst-words');
  });

  // Practice weak suffixes
  el('btn-practice-weak-suffix').addEventListener('click', async () => {
    if (state.WEAK_SUFFIXES.length === 0) {
      await showAlert('Bạn chưa có hậu tố yếu nào cần ôn — hãy làm thêm vài đề trước!');
      return;
    }
    const pool = state.ALL_QUESTIONS.filter(q => state.WEAK_SUFFIXES.includes(getSuffix(q.word)));
    const picked = shuffle(pool).slice(0, Math.min(20, pool.length));
    state.customExamPool['practice-weak-suffix'] = {
      id: 'practice-weak-suffix',
      title: 'Ôn tập điểm yếu (hậu tố)',
      level: 'Ôn tập điểm yếu',
      questions: picked,
    };
    showTab('exams');
    startExam('practice-weak-suffix');
  });

  // Stats navigation
  document.querySelectorAll('#tab-stats .stat-back').forEach(btn => {
    btn.addEventListener('click', () => showStatScreen('stat-home'));
  });

  // Export report
  el('btn-export-report').addEventListener('click', () => {
    const text = buildReportText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
      '_' + pad(now.getHours()) + 'h' + pad(now.getMinutes());
    a.href = url;
    a.download = 'bao-cao-thong-ke-toeic-' + ts + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Sync / Backup buttons
  el('btn-export-json').addEventListener('click', exportProgressJSON);
  el('btn-import-json').addEventListener('click', () => {
    el('sync-file-input').click();
  });
  el('sync-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        showConfirm(
          "Bạn có chắc chắn muốn gộp dữ liệu từ file sao lưu này vào tiến trình hiện tại?\nHệ thống sẽ lọc trùng lịch sử và giữ lại kết quả tốt nhất của bạn.",
          "Gộp dữ liệu",
          "Huỷ"
        ).then(confirm => {
          if (confirm) {
            mergeProgressJSON(importedData);
          }
          el('sync-file-input').value = '';
        });
      } catch (err) {
        showAlert("Không thể đọc file. Hãy chắc chắn rằng bạn đã chọn một file sao lưu JSON hợp lệ.");
        el('sync-file-input').value = '';
      }
    };
    reader.readAsText(file);
  });
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initFullscreen();
  initEventListeners();
  loadQuestions();
});
