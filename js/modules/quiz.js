import { SECONDS_PER_QUESTION, ANSWER_TO_CATEGORY, ICON, TIME_BUCKETS, HISTORY_CAP } from './constants.js';
import { state } from './state.js';
import { el, shuffle, getSuffix, getTimeBucketKey, recordAnswerTiming, showConfirm, showAlert, formatDate, showScreen } from './utils.js';
import { getExamProgress, saveProgress } from './storage.js';

export function groupExamsByLevel() {
  const groups = [];
  state.EXAMS.forEach(exam => {
    let group = groups.find(g => g.level === exam.level);
    if (!group) { 
      group = { level: exam.level, exams: [] }; 
      groups.push(group); 
    }
    group.exams.push(exam);
  });
  return groups;
}

export function renderExamList() {
  const wrap = el('exam-grid');
  wrap.innerHTML = '';

  groupExamsByLevel().forEach(group => {
    const doneCount = group.exams.filter(e => getExamProgress(e.id).status === 'done').length;
    const pct = Math.round(doneCount / group.exams.length * 100);

    const card = document.createElement('div');
    card.className = 'level-card';
    card.innerHTML =
      '<div class="lc-top"><span class="material-symbols-outlined">layers</span><h3>' + group.level + '</h3></div>' +
      '<div class="lc-sub">' + group.exams.length + ' đề · ' + group.exams.reduce((s, e) => s + e.questions.length, 0) + ' câu</div>' +
      '<div class="lc-progress-bg"><div class="lc-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="lc-footer"><span>' + doneCount + '/' + group.exams.length + ' đề hoàn thành</span>' +
      '<span class="lc-arrow">Xem đề <span class="material-symbols-outlined">arrow_forward</span></span></div>';
    card.addEventListener('click', () => openLevel(group.level));
    wrap.appendChild(card);
  });
}

export function openLevel(levelLabel) {
  const group = groupExamsByLevel().find(g => g.level === levelLabel);
  if (!group) return;
  el('level-detail-title').textContent = levelLabel;
  renderExamCardsInto(el('level-exam-grid'), group.exams);
  showScreen('screen-level-detail');
}

export function renderExamCardsInto(container, exams) {
  container.innerHTML = '';
  exams.forEach(exam => {
    const p = getExamProgress(exam.id);
    const card = document.createElement('div');
    card.className = 'exam-card';
    const statusText = p.status === 'done' ? 'Hoàn thành' : p.status === 'in_progress' ? 'Đang làm' : 'Chưa làm';
    const scoreLine = p.attempts > 0
      ? '<div class="score-line">Lần gần nhất: <b>' + p.lastCorrect + '/' + p.lastTotal + '</b> (' + p.lastPercent + '%) — Cao nhất: <b>' + p.bestPercent + '%</b></div>'
      : '<div class="score-line">Chưa có lượt làm nào</div>';
    card.innerHTML =
      '<h3>' + exam.title + '</h3>' +
      '<div class="sub">' + exam.level + ' · ' + exam.questions.length + ' câu · ~' + Math.ceil(exam.questions.length * SECONDS_PER_QUESTION / 60) + ' phút</div>' +
      '<span class="status-badge ' + p.status + '"><span class="material-symbols-outlined">' + ICON[p.status] + '</span>' + statusText + '</span>' +
      scoreLine +
      '<button class="btn-primary btn-sm" data-exam="' + exam.id + '"><span class="material-symbols-outlined">' + (p.attempts > 0 ? ICON.retry : ICON.start) + '</span>' + (p.attempts > 0 ? 'Làm lại' : 'Bắt đầu') + '</button>';
    card.querySelector('button').addEventListener('click', () => startExam(exam.id));
    container.appendChild(card);
  });
}

/* ---------- start exam ---------- */
export function startExam(examId) {
  state.currentExam = state.EXAMS.find(e => e.id === examId) || state.customExamPool[examId];
  if (!state.currentExam) return;

  state.runQuestions = shuffle(state.currentExam.questions).map(q => ({
    ...q,
    options: shuffle(q.options)
  }));

  state.userAnswers = {};
  state.currentIndex = 0;
  state.remainingSeconds = state.runQuestions.length * SECONDS_PER_QUESTION;
  state.viewMode = 'list';
  state.answerTimeSec = {};
  state.lastAnswerAt = Date.now();

  const p = getExamProgress(examId);
  p.status = 'in_progress';
  saveProgress();

  el('sidebar-title').textContent = state.currentExam.title + ' — ' + state.currentExam.level;
  el('exit-exam-btn').style.display = 'inline-flex';
  el('btn-toggle-view').style.display = 'inline-flex';
  el('total-num').textContent = state.runQuestions.length;
  el('total-num-m').textContent = state.runQuestions.length;
  el('timer').style.display = 'inline-flex';
  el('btn-submit').style.display = 'inline-flex';
  el('single-view').style.display = 'none';
  el('list-view').style.display = 'block';
  el('btn-toggle-view').innerHTML = '<span class="material-symbols-outlined">view_agenda</span> Xem từng câu';

  document.body.classList.add('exam-mode');

  buildNavGrid();
  startTimer();
  showScreen('screen-quiz');
  renderListView();
}

export function toggleView() {
  state.viewMode = state.viewMode === 'single' ? 'list' : 'single';
  if (state.viewMode === 'list') {
    el('single-view').style.display = 'none';
    el('list-view').style.display = 'block';
    el('btn-toggle-view').innerHTML = '<span class="material-symbols-outlined">view_agenda</span> Xem từng câu';
    renderListView();
  } else {
    el('single-view').style.display = 'block';
    el('list-view').style.display = 'none';
    el('btn-toggle-view').innerHTML = '<span class="material-symbols-outlined">view_list</span> Xem danh sách câu hỏi';
    renderQuestion();
  }
}

export function renderListView() {
  const wrap = el('list-view');
  wrap.innerHTML = '';
  state.runQuestions.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'q-card list-item';
    card.id = 'list-q-' + i;

    let optsHtml = '';
    q.options.forEach(opt => {
      const picked = state.userAnswers[i] === opt.id;
      optsHtml +=
        '<label class="option' + (picked ? ' selected' : '') + '">' +
          '<input type="radio" name="opt-list-' + i + '" value="' + opt.id + '" ' + (picked ? 'checked' : '') + '>' +
          '<span class="opt-id">' + opt.id + '.</span><span>' + opt.text + '</span>' +
        '</label>';
    });

    card.innerHTML =
      '<div class="q-meta">Câu ' + (i + 1) + '/' + state.runQuestions.length + '</div>' +
      '<p class="q-text">' + q.question + '</p>' +
      '<div class="options">' + optsHtml + '</div>';

    card.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        state.userAnswers[i] = e.target.value;
        recordAnswerTiming(i);
        card.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
        e.target.closest('.option').classList.add('selected');
        updateProgress();
      });
    });

    wrap.appendChild(card);
  });
}

export function buildNavGrid() {
  ['nav-grid', 'nav-grid-m'].forEach(gridId => {
    const grid = el(gridId);
    grid.innerHTML = '';
    state.runQuestions.forEach((q, i) => {
      const dot = document.createElement('div');
      dot.className = 'nav-dot';
      dot.textContent = i + 1;
      dot.addEventListener('click', () => {
        if (state.viewMode === 'list') {
          const target = el('list-q-' + i);
          if (target) target.scrollIntoView({ behavior: 'auto', block: 'center' });
        } else {
          state.currentIndex = i;
          renderQuestion();
        }
      });
      grid.appendChild(dot);
    });
  });
}

export function startTimer() {
  updateTimerDisplay();
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.remainingSeconds--;
    updateTimerDisplay();
    if (state.remainingSeconds <= 0) {
      clearInterval(state.timerInterval);
      showAlert('⏰ Hết giờ! Bài thi sẽ được tự động nộp.').then(() => finishExam());
    }
  }, 1000);
}

export function updateTimerDisplay() {
  const m = Math.floor(state.remainingSeconds / 60).toString().padStart(2, '0');
  const s = (state.remainingSeconds % 60).toString().padStart(2, '0');
  el('timer').innerHTML = '<span class="material-symbols-outlined">timer</span> ' + m + ':' + s;
  el('timer').style.background = state.remainingSeconds <= 30 ? '#fad2cf' : 'var(--red-light)';
}

export function renderQuestion() {
  const q = state.runQuestions[state.currentIndex];
  el('cur-num-m').textContent = state.currentIndex + 1;
  el('q-meta').textContent = '';
  el('q-text').innerHTML = q.question;

  const optsWrap = el('q-options');
  optsWrap.innerHTML = '';
  q.options.forEach(opt => {
    const picked = state.userAnswers[state.currentIndex] === opt.id;
    const div = document.createElement('label');
    div.className = 'option' + (picked ? ' selected' : '');
    div.innerHTML =
      '<input type="radio" name="opt" value="' + opt.id + '" ' + (picked ? 'checked' : '') + '>' +
      '<span class="opt-id">' + opt.id + '.</span><span>' + opt.text + '</span>';
    div.querySelector('input').addEventListener('change', () => {
      state.userAnswers[state.currentIndex] = opt.id;
      recordAnswerTiming(state.currentIndex);
      renderQuestion();
      updateProgress();
    });
    optsWrap.appendChild(div);
  });

  document.querySelectorAll('.nav-dot').forEach((dot, i) => {
    const realIndex = i % state.runQuestions.length;
    dot.classList.toggle('current', realIndex === state.currentIndex);
    dot.classList.toggle('answered', state.userAnswers[realIndex] !== undefined);
  });

  el('btn-prev').disabled = state.currentIndex === 0;
  const isLast = state.currentIndex === state.runQuestions.length - 1;
  el('btn-next').style.display = isLast ? 'none' : 'inline-flex';

  if (isLast) {
    const hasUnanswered = Object.keys(state.userAnswers).length < state.runQuestions.length;
    el('btn-jump-unanswered').style.display = hasUnanswered ? 'inline-flex' : 'none';
    el('btn-submit-inline').style.display = hasUnanswered ? 'none' : 'inline-flex';
  } else {
    el('btn-jump-unanswered').style.display = 'none';
    el('btn-submit-inline').style.display = 'none';
  }

  updateProgress();
}

export function updateProgress() {
  const answered = Object.keys(state.userAnswers).length;
  const pct = (answered / state.runQuestions.length * 100) + '%';
  el('answered-count').textContent = 'Đã làm: ' + answered + '/' + state.runQuestions.length;
  el('answered-count-m').textContent = 'Đã làm: ' + answered + '/' + state.runQuestions.length;
  el('progress-fill').style.width = pct;
  el('progress-fill-m').style.width = pct;
  document.querySelectorAll('.nav-dot').forEach((dot, i) => {
    const realIndex = i % state.runQuestions.length;
    dot.classList.toggle('answered', state.userAnswers[realIndex] !== undefined);
  });
}

export function buildReviewCard(displayIndex, detail) {
  const card = document.createElement('div');
  card.className = 'review-card ' + detail.status;
  card.dataset.status = detail.status;
  const badgeIcon = detail.status === 'correct' ? 'check_circle' : detail.status === 'wrong' ? 'cancel' : 'radio_button_unchecked';
  const badgeText = detail.status === 'correct' ? 'Đúng' : detail.status === 'wrong' ? 'Sai' : 'Bỏ trống';

  let optionsHtml = '';
  (detail.options || []).forEach(opt => {
    let cls = '';
    if (opt.id === detail.correctAnswer) cls = 'is-correct';
    else if (opt.id === detail.userPick) cls = 'is-wrong-pick';
    const marker = opt.id === detail.correctAnswer ? ' ✔' : (opt.id === detail.userPick ? ' ✘' : '');
    optionsHtml += '<div class="r-option ' + cls + '"><b>' + opt.id + '.</b> ' + opt.text + marker + '</div>';
  });

  const exp = detail.explanation || {};
  card.innerHTML =
    '<div class="review-head">' +
      '<div>' +
        '<p class="q-text" style="margin-bottom:4px;">Câu ' + (displayIndex + 1) + ': ' + detail.question + '</p>' +
        '<div class="q-meta" style="margin-bottom:10px;">Từ vựng: "' + detail.word + '"' + (detail.meaning ? ' — nghĩa: ' + detail.meaning : '') + '</div>' +
      '</div>' +
      '<span class="badge ' + detail.status + '"><span class="material-symbols-outlined">' + badgeIcon + '</span>' + badgeText + '</span>' +
    '</div>' +
    '<div class="review-options">' + optionsHtml + '</div>' +
    '<div class="explanation">' +
      (exp.correct ? '<div><b>Đáp án đúng:</b> ' + exp.correct + '</div>' : '') +
      (exp.reason ? '<div><b>Giải thích:</b> ' + exp.reason + '</div>' : '') +
      (exp.example ? '<div><b>Ví dụ:</b> ' + exp.example + '</div>' : '') +
    '</div>';
  return card;
}

export function renderReviewCards(details) {
  state.lastReviewDetails = details;
  const reviewList = el('review-list');
  reviewList.innerHTML = '';
  details.forEach((d, i) => reviewList.appendChild(buildReviewCard(i, d)));

  const total = details.length;
  const correct = details.filter(d => d.status === 'correct').length;
  const wrong = details.filter(d => d.status === 'wrong').length;
  const skip = details.filter(d => d.status === 'skip').length;
  el('filter-count-all').textContent = total;
  el('filter-count-correct').textContent = correct;
  el('filter-count-wrong').textContent = wrong;
  el('filter-count-skip').textContent = skip;
  applyReviewFilter('all');
}

export function paintResultSummary(correct, wrong, skip, total, pct) {
  el('score-ring').style.setProperty('--pct', pct);
  el('result-pct').textContent = pct + '%';
  el('result-frac').textContent = correct + '/' + total;
  el('stat-correct').innerHTML = '<span class="material-symbols-outlined">check_circle</span> Đúng: ' + correct;
  el('stat-wrong').innerHTML = '<span class="material-symbols-outlined">cancel</span> Sai: ' + wrong;
  el('stat-skip').innerHTML = '<span class="material-symbols-outlined">radio_button_unchecked</span> Bỏ trống: ' + skip;

  let msg, icon;
  if (pct >= 90) { msg = 'Xuất sắc! Bạn nắm rất chắc từ loại.'; icon = 'workspace_premium'; }
  else if (pct >= 70) { msg = 'Khá tốt! Cố gắng thêm một chút nữa.'; icon = 'thumb_up'; }
  else if (pct >= 50) { msg = 'Trung bình. Cần ôn lại các quy tắc hậu tố.'; icon = 'sentiment_neutral'; }
  else { msg = 'Cần luyện tập thêm nhiều hơn.'; icon = 'auto_stories'; }
  el('result-msg').innerHTML = '<span class="material-symbols-outlined">' + icon + '</span> ' + msg;
}

export function finishExam() {
  clearInterval(state.timerInterval);
  el('timer').style.display = 'none';
  el('exit-exam-btn').style.display = 'none';
  el('btn-submit').style.display = 'none';
  el('btn-toggle-view').style.display = 'none';
  document.body.classList.remove('exam-mode');

  let correct = 0, wrong = 0, skip = 0;
  const details = [];

  if (!state.progress.streak) state.progress.streak = { current: 0, best: 0 };
  let streakCurrent = state.progress.streak.current;
  let streakBest = state.progress.streak.best;

  state.runQuestions.forEach((q, i) => {
    const userPick = state.userAnswers[i];
    const category = ANSWER_TO_CATEGORY[q.correctAnswer];
    if (category && state.progress.categoryStats[category]) {
      state.progress.categoryStats[category].total++;
    }

    let status;
    if (userPick === undefined) {
      status = 'skip';
      skip++;
      streakCurrent = 0;
    } else if (userPick === q.correctAnswer) {
      status = 'correct';
      correct++;
      if (category && state.progress.categoryStats[category]) {
        state.progress.categoryStats[category].correct++;
      }
      streakCurrent++;
      streakBest = Math.max(streakBest, streakCurrent);
    } else {
      status = 'wrong';
      wrong++;
      streakCurrent = 0;
    }

    let ws = state.progress.wordStats[q.word];
    if (!ws) {
      ws = state.progress.wordStats[q.word] = {
        word: q.word, meaning: q.meaning, correct: 0, wrong: 0, skip: 0,
        correctAnswer: q.correctAnswer, wrongPicks: {},
      };
    }
    if (!ws.wrongPicks) ws.wrongPicks = {};
    if (!ws.correctAnswer) ws.correctAnswer = q.correctAnswer;
    ws[status === 'correct' ? 'correct' : status === 'wrong' ? 'wrong' : 'skip']++;
    if (status === 'wrong') {
      ws.wrongPicks[userPick] = (ws.wrongPicks[userPick] || 0) + 1;
    }

    if (status !== 'skip' && typeof state.answerTimeSec[i] === 'number') {
      const bucketKey = getTimeBucketKey(state.answerTimeSec[i]);
      state.progress.timeStats[bucketKey] = (state.progress.timeStats[bucketKey] || 0) + 1;
    }

    details.push({
      question: q.question, word: q.word, meaning: q.meaning, options: q.options,
      correctAnswer: q.correctAnswer, explanation: q.explanation, userPick, status,
    });
  });

  state.progress.streak.current = streakCurrent;
  state.progress.streak.best = streakBest;

  const total = state.runQuestions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  const p = getExamProgress(state.currentExam.id);
  p.attempts++;
  p.status = 'done';
  p.lastCorrect = correct;
  p.lastTotal = total;
  p.lastPercent = pct;
  p.bestPercent = Math.max(p.bestPercent || 0, pct);

  state.progress.history.unshift({
    examId: state.currentExam.id,
    examTitle: state.currentExam.title,
    level: state.currentExam.level,
    date: new Date().toISOString(),
    correct, wrong, skip, total, percent: pct,
    details,
  });
  if (state.progress.history.length > HISTORY_CAP) {
    state.progress.history.length = HISTORY_CAP;
  }

  saveProgress();

  paintResultSummary(correct, wrong, skip, total, pct);
  renderReviewCards(details);

  state.resultViewSource = 'exam';
  el('result-title').style.display = 'none';
  el('btn-retry').style.display = 'inline-flex';
  el('btn-redo-wrong').style.display = (wrong + skip) > 0 ? 'inline-flex' : 'none';
  el('btn-back-list').style.display = 'inline-flex';
  el('btn-back-history').style.display = 'none';

  showScreen('screen-result');
}

export function viewHistoryEntry(idx) {
  const entry = state.progress.history[idx];
  if (!entry) return;
  if (!entry.details) {
    showAlert('Lượt làm bài này được lưu trước khi có tính năng xem chi tiết, nên không có dữ liệu từng câu.');
    return;
  }

  state.currentExam = state.EXAMS.find(e => e.id === entry.examId) || null;
  state.resultViewSource = 'history';

  paintResultSummary(entry.correct, entry.wrong, entry.skip, entry.total, entry.percent);
  renderReviewCards(entry.details);

  el('result-title').style.display = 'block';
  el('result-title').textContent = entry.examTitle + ' · ' + entry.level + ' · ' + formatDate(entry.date);
  el('btn-retry').style.display = state.currentExam ? 'inline-flex' : 'none';
  el('btn-redo-wrong').style.display = (entry.wrong + entry.skip) > 0 ? 'inline-flex' : 'none';
  el('btn-back-list').style.display = 'none';
  el('btn-back-history').style.display = 'inline-flex';

  showScreen('screen-result');
}

export function applyReviewFilter(filter) {
  document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));
  const cards = document.querySelectorAll('#review-list .review-card');
  let visibleCount = 0;
  cards.forEach(card => {
    const show = filter === 'all' || card.dataset.status === filter;
    card.style.display = show ? '' : 'none';
    if (show) visibleCount++;
  });
  el('review-empty').style.display = visibleCount === 0 ? 'block' : 'none';
}
