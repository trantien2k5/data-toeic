import { STORAGE_KEY, TIME_BUCKETS, HISTORY_CAP, ANSWER_TO_CATEGORY } from './constants.js';
import { state } from './state.js';
import { showAlert, showConfirm } from './utils.js';

export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.progress = raw ? JSON.parse(raw) : {};
  } catch (e) {
    state.progress = {};
  }
  if (!state.progress.exams) state.progress.exams = {};
  if (!state.progress.categoryStats) {
    state.progress.categoryStats = { 
      N: { correct: 0, total: 0 }, 
      V: { correct: 0, total: 0 }, 
      ADJ: { correct: 0, total: 0 }, 
      ADV: { correct: 0, total: 0 } 
    };
  }
  if (!state.progress.wordStats) state.progress.wordStats = {};
  if (!state.progress.history) state.progress.history = [];
  if (!state.progress.timeStats) {
    state.progress.timeStats = {};
    TIME_BUCKETS.forEach(b => { state.progress.timeStats[b.key] = 0; });
  }
  if (!state.progress.streak) state.progress.streak = { current: 0, best: 0 };
}

export function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

export function getExamProgress(examId) {
  if (!state.progress.exams[examId]) {
    state.progress.exams[examId] = { 
      status: "not_started", 
      attempts: 0, 
      lastPercent: null, 
      lastCorrect: 0, 
      lastTotal: 0, 
      bestPercent: 0 
    };
  }
  return state.progress.exams[examId];
}

export function exportProgressJSON() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    showAlert("Không tìm thấy dữ liệu tiến trình nào để sao lưu.");
    return;
  }
  const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
    '_' + pad(now.getHours()) + 'h' + pad(now.getMinutes());
  a.href = url;
  a.download = 'toeic-progress-backup-' + ts + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function mergeProgressJSON(imported) {
  if (!imported || typeof imported !== 'object') {
    showAlert("File sao lưu không hợp lệ.");
    return;
  }
  
  if (!imported.history || !Array.isArray(imported.history)) {
    showAlert("File sao lưu không đúng cấu trúc tiến trình học tập.");
    return;
  }

  const localHistory = state.progress.history || [];
  const importedHistory = imported.history || [];
  
  const mergedHistoryMap = new Map();
  // Thêm lịch sử hiện tại
  localHistory.forEach(h => {
    if (h.date && h.examId) {
      mergedHistoryMap.set(h.date + '_' + h.examId, h);
    }
  });
  // Thêm lịch sử nhập vào
  importedHistory.forEach(h => {
    if (h.date && h.examId) {
      const key = h.date + '_' + h.examId;
      if (!mergedHistoryMap.has(key)) {
        mergedHistoryMap.set(key, h);
      }
    }
  });
  
  const mergedHistory = Array.from(mergedHistoryMap.values());
  mergedHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (mergedHistory.length > HISTORY_CAP) {
    mergedHistory.length = HISTORY_CAP;
  }
  
  // Dựng lại dữ liệu các đề thi (exams)
  const updatedExams = {};
  
  // Giữ lại các đề đang làm dở (in_progress) ở cả local lẫn file import
  Object.keys(state.progress.exams || {}).forEach(examId => {
    const p = state.progress.exams[examId];
    if (p.status === 'in_progress') {
      updatedExams[examId] = { ...p };
    }
  });
  Object.keys(imported.exams || {}).forEach(examId => {
    const p = imported.exams[examId];
    if (p.status === 'in_progress' && (!updatedExams[examId] || updatedExams[examId].status !== 'in_progress')) {
      updatedExams[examId] = { ...p };
    }
  });

  // Tính toán kết quả đề từ lịch sử đã gộp
  state.EXAMS.forEach(exam => {
    const examHistory = mergedHistory.filter(h => h.examId === exam.id);
    if (examHistory.length > 0) {
      const attempts = examHistory.length;
      const bestPercent = Math.max(...examHistory.map(h => h.percent || 0));
      const mostRecent = examHistory[0]; // sort desc nên [0] là gần nhất
      
      updatedExams[exam.id] = {
        status: "done",
        attempts,
        lastPercent: mostRecent.percent,
        lastCorrect: mostRecent.correct,
        lastTotal: mostRecent.total,
        bestPercent
      };
    } else {
      if (!updatedExams[exam.id]) {
        updatedExams[exam.id] = {
          status: "not_started",
          attempts: 0,
          lastPercent: null,
          lastCorrect: 0,
          lastTotal: 0,
          bestPercent: 0
        };
      }
    }
  });
  
  // Khởi dựng lại categoryStats & wordStats dựa trên chi tiết lịch sử đã gộp
  const newCategoryStats = {
    N: { correct: 0, total: 0 },
    V: { correct: 0, total: 0 },
    ADJ: { correct: 0, total: 0 },
    ADV: { correct: 0, total: 0 }
  };
  const newWordStats = {};
  
  mergedHistory.forEach(h => {
    if (h.details && Array.isArray(h.details)) {
      h.details.forEach(d => {
        const category = ANSWER_TO_CATEGORY[d.correctAnswer];
        if (category && newCategoryStats[category]) {
          newCategoryStats[category].total++;
          if (d.status === 'correct') {
            newCategoryStats[category].correct++;
          }
        }
        
        if (!newWordStats[d.word]) {
          newWordStats[d.word] = {
            word: d.word, meaning: d.meaning, correct: 0, wrong: 0, skip: 0,
            correctAnswer: d.correctAnswer, wrongPicks: {},
          };
        }
        const status = d.status;
        newWordStats[d.word][status === 'correct' ? 'correct' : status === 'wrong' ? 'wrong' : 'skip']++;
        if (status === 'wrong' && d.userPick) {
          newWordStats[d.word].wrongPicks[d.userPick] = (newWordStats[d.word].wrongPicks[d.userPick] || 0) + 1;
        }
      });
    }
  });

  // Tính lại streak (đúng liên tiếp) theo thứ tự thời gian tăng dần
  let streakCurrent = 0, streakBest = 0;
  [...mergedHistory].reverse().forEach(h => {
    (h.details || []).forEach(d => {
      if (d.status === 'correct') {
        streakCurrent++;
        streakBest = Math.max(streakBest, streakCurrent);
      } else {
        streakCurrent = 0;
      }
    });
  });

  // Gộp timeStats bằng cách lấy giá trị lớn nhất của từng bucket
  const newTimeStats = {};
  TIME_BUCKETS.forEach(b => {
    const localVal = (state.progress.timeStats && state.progress.timeStats[b.key]) || 0;
    const importedVal = (imported.timeStats && imported.timeStats[b.key]) || 0;
    newTimeStats[b.key] = Math.max(localVal, importedVal);
  });

  state.progress.history = mergedHistory;
  state.progress.exams = updatedExams;
  state.progress.categoryStats = newCategoryStats;
  state.progress.wordStats = newWordStats;
  state.progress.timeStats = newTimeStats;
  state.progress.streak = { current: streakCurrent, best: streakBest };


  saveProgress();
  showAlert("Gộp tiến trình thành công! Hệ thống sẽ tự động tải lại trang.").then(() => {
    window.location.reload();
  });
}
