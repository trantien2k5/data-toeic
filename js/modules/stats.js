import { CATEGORY_LABEL, TIME_BUCKETS, ANSWER_TO_CATEGORY } from './constants.js';
import { state } from './state.js';
import { el, formatDate, getSuffix, shuffle, showTab, showAlert } from './utils.js';
import { getExamProgress } from './storage.js';
import { startExam, viewHistoryEntry } from './quiz.js';

const LEVEL_LABELS = [
  "Level 1 · Cơ bản",
  "Level 2 · Theo hậu tố",
  "Level 3 · Từ dễ nhầm",
  "Level 4 · TOEIC thực tế",
];

// Một đề "ổn định" khi ≥3 lượt làm gần nhất đều đạt ≥90% — phân biệt với
// việc chỉ đạt điểm cao đúng 1 lần (có thể do may mắn) rồi không lặp lại được.
const STABILITY_MIN_ATTEMPTS = 3;
const STABILITY_THRESHOLD = 90;

export function isExamStable(examId) {
  const attempts = (state.progress.history || []).filter(h => h.examId === examId);
  if (attempts.length < STABILITY_MIN_ATTEMPTS) return false;
  return attempts.slice(0, STABILITY_MIN_ATTEMPTS).every(h => h.percent >= STABILITY_THRESHOLD);
}

export function renderStats() {
  const examIds = state.EXAMS.map(e => e.id);
  let completed = 0, totalAttempts = 0, totalAnswered = 0, totalCorrect = 0;

  const tbody = el('exam-table-body');
  tbody.innerHTML = '';
  let lastLevel = null;
  state.EXAMS.forEach(exam => {
    const p = getExamProgress(exam.id);
    if (p.status === 'done') completed++;
    totalAttempts += p.attempts;
    if (p.attempts > 0) {
      totalAnswered += p.lastTotal;
      totalCorrect += p.lastCorrect;
    }

    if (exam.level !== lastLevel) {
      lastLevel = exam.level;
      const divider = document.createElement('tr');
      divider.className = 'level-divider-row';
      divider.innerHTML = '<td colspan="6">' + exam.level + '</td>';
      tbody.appendChild(divider);
    }

    const statusText = p.status === 'done' ? 'Hoàn thành' : p.status === 'in_progress' ? 'Đang làm' : 'Chưa làm';
    const stable = isExamStable(exam.id);
    const row = document.createElement('tr');
    row.innerHTML =
      '<td>' + exam.title + '</td>' +
      '<td>' + statusText + '</td>' +
      '<td>' + p.attempts + '</td>' +
      '<td>' + (p.attempts > 0 ? p.lastCorrect + '/' + p.lastTotal + ' (' + p.lastPercent + '%)' : '—') + '</td>' +
      '<td>' + (p.attempts > 0 ? p.bestPercent + '%' : '—') + '</td>' +
      '<td>' + (stable ? '<span class="badge correct"><span class="material-symbols-outlined">verified</span> Ổn định</span>' : '—') + '</td>';
    tbody.appendChild(row);
  });

  el('ov-attempts').textContent = totalAttempts;
  el('ov-accuracy').textContent = (totalAnswered > 0 ? Math.round(totalCorrect / totalAnswered * 100) : 0) + '%';
  el('ov-answered').textContent = totalAnswered;

  // Accuracy "hiện tại" (ov-accuracy) chỉ tính trên lần làm gần nhất mỗi đề,
  // nên 1 lượt timeout/nộp trắng gần đây có thể kéo tụt số này dù năng lực
  // thật đã tốt hơn nhiều. Accuracy "lịch sử" cộng dồn TOÀN BỘ các lượt làm
  // đã từng có, phản ánh đúng quá trình học hơn.
  const lifetimeHistory = state.progress.history || [];
  const lifetimeTotal = lifetimeHistory.reduce((s, h) => s + h.total, 0);
  const lifetimeCorrect = lifetimeHistory.reduce((s, h) => s + h.correct, 0);
  const lifetimeAccuracy = lifetimeTotal > 0 ? Math.round(lifetimeCorrect / lifetimeTotal * 100) : 0;
  el('ov-accuracy-lifetime').textContent = lifetimeAccuracy + '%';

  renderHeroStats(completed, examIds.length, totalAnswered, totalCorrect);

  const catWrap = el('cat-stats');
  catWrap.innerHTML = '';
  Object.keys(CATEGORY_LABEL).forEach(cat => {
    const c = state.progress.categoryStats[cat] || { correct: 0, total: 0 };
    const pct = c.total > 0 ? Math.round(c.correct / c.total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML =
      '<div class="cat-top"><b>' + CATEGORY_LABEL[cat] + '</b><span>' + c.correct + '/' + c.total + ' (' + pct + '%)</span></div>' +
      '<div class="cat-bar-bg"><div class="cat-bar-fill" style="width:' + pct + '%"></div></div>';
    catWrap.appendChild(row);
  });

  renderWorstWords();
  renderBestWords();
  renderConfusion();
  renderHistory();
  renderLevelAccuracy();
  renderSuffixStats();
  renderFamilyStats();
  renderTimeStats();
  renderStudyPlan();
  renderReportsHome();
  renderReviewHome();
}

// Tổng tiến độ + tiến độ từng level + streak + ước tính TOEIC tham khảo.
export function renderHeroStats(completedExams, totalExams, totalAnswered, totalCorrect) {
  const progressPct = totalExams > 0 ? Math.round(completedExams / totalExams * 100) : 0;
  el('hero-progress-fill').style.width = progressPct + '%';
  el('hero-progress-pct').textContent = progressPct + '%';

  renderHeroLevels();

  const streak = state.progress.streak || { current: 0, best: 0 };
  el('hero-streak-current').textContent = streak.current;
  el('hero-streak-best').textContent = streak.best;

  const accuracyPct = totalAnswered > 0 ? Math.round(totalCorrect / totalAnswered * 100) : 0;
  el('hero-toeic-range').textContent = estimateToeicRange(accuracyPct);
}

// Trạng thái hoàn thành từng Level (đề đã xong / tổng số đề) trong hero.
function renderHeroLevels() {
  const wrap = el('hero-levels');
  wrap.innerHTML = '';
  LEVEL_LABELS.forEach((label, i) => {
    const exams = state.EXAMS.filter(e => e.level === label);
    if (exams.length === 0) return;
    const doneCount = exams.filter(e => getExamProgress(e.id).status === 'done').length;
    const pct = Math.round(doneCount / exams.length * 100);
    const row = document.createElement('div');
    row.className = 'hero-level-row';
    row.innerHTML =
      '<span class="hero-level-name">' + (doneCount === exams.length ? '✅' : '⬜') + ' Level ' + (i + 1) + '</span>' +
      '<div class="hero-level-bar-bg"><div class="hero-level-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="hero-level-count">' + doneCount + '/' + exams.length + '</span>';
    wrap.appendChild(row);
  });
}

// Quy đổi tham khảo THÔ từ % chính xác nhận diện từ loại sang khoảng điểm TOEIC.
// Đây KHÔNG phải dự đoán điểm thi thật — TOEIC còn nhiều kỹ năng khác (nghe,
// đọc hiểu...) mà app này không đo được. Chỉ mang tính minh hoạ/tham khảo.
function estimateToeicRange(accuracyPct) {
  if (accuracyPct <= 0) return '—';
  if (accuracyPct < 50) return '300-350';
  if (accuracyPct < 65) return '350-400';
  if (accuracyPct < 75) return '400-450';
  if (accuracyPct < 85) return '450-500';
  if (accuracyPct < 93) return '500-550';
  return '550-600';
}

// Tìm đề chưa hoàn thành đầu tiên (theo thứ tự Level) và bắt đầu làm ngay.
export function continueLearning() {
  const next = state.EXAMS.find(e => getExamProgress(e.id).status !== 'done');
  if (!next) {
    showAlert('🎉 Bạn đã hoàn thành tất cả các đề hiện có!');
    return;
  }
  showTab('exams');
  startExam(next.id);
}

// Với mỗi từ bị sai, tìm đáp án bạn hay chọn nhầm nhất — giúp thấy rõ kiểu
// nhầm lẫn (vd: hay nhầm Verb thành Noun) thay vì chỉ biết đúng/sai.
export function buildConfusionRows() {
  return Object.values(state.progress.wordStats || {})
    .filter(w => w.wrongPicks && Object.values(w.wrongPicks).some(n => n > 0))
    .map(w => {
      const [topPickId, topPickCount] = Object.entries(w.wrongPicks).sort((a, b) => b[1] - a[1])[0];
      return { ...w, topPickId, topPickCount };
    })
    .sort((a, b) => b.topPickCount - a.topPickCount);
}

export function renderConfusion() {
  const rows = buildConfusionRows().slice(0, 20);

  const tbody = el('confusion-body');
  tbody.innerHTML = '';
  rows.forEach(w => {
    const correctCat = CATEGORY_LABEL[ANSWER_TO_CATEGORY[w.correctAnswer]] || '—';
    const pickCat = CATEGORY_LABEL[ANSWER_TO_CATEGORY[w.topPickId]] || w.topPickId;
    const row = document.createElement('tr');
    row.innerHTML =
      '<td><b>' + w.word + '</b></td>' +
      '<td>' + (w.meaning || '—') + '</td>' +
      '<td>' + correctCat + '</td>' +
      '<td>' + pickCat + ' (' + w.topPickCount + ' lần)</td>';
    tbody.appendChild(row);
  });

  el('confusion-table').style.display = rows.length > 0 ? 'table' : 'none';
  el('confusion-empty').style.display = rows.length > 0 ? 'none' : 'block';
}

// "Báo cáo" và "Ôn tập" giờ là 2 tab riêng, dùng chung hệ screen-stat — chọn
// global thay vì scope theo 1 tab cố định, vì các #id màn chi tiết nằm rải
// trong cả #tab-reports và #tab-review.
export function showStatScreen(id, direction = 'forward') {
  document.querySelectorAll('.screen-stat').forEach(s => s.classList.remove('active', 'dir-fwd', 'dir-back'));
  const screen = el(id);
  screen.classList.add('active');
  if (direction !== 'none') screen.classList.add(direction === 'back' ? 'dir-back' : 'dir-fwd');
  window.scrollTo(0, 0);
}

function buildStatCard(c) {
  const card = document.createElement('div');
  card.className = 'level-card';
  card.innerHTML =
    '<div class="lc-top"><span class="lc-icon">' + c.icon + '</span><h3>' + c.title + '</h3></div>' +
    '<div class="lc-sub">' + c.sub + '</div>' +
    '<div class="lc-footer"><span></span><span class="lc-arrow">Xem chi tiết <span class="material-symbols-outlined">arrow_forward</span></span></div>';
  card.addEventListener('click', () => showStatScreen(c.id, 'forward'));
  return card;
}

// Tab "Báo cáo": các trang phân tích số liệu thuần (xu hướng, accuracy theo
// level/từ loại/thời gian, nhầm lẫn, theo đề, lịch sử).
export function renderReportsHome() {
  const examIds = state.EXAMS.map(e => e.id);
  const completedExams = state.EXAMS.filter(e => getExamProgress(e.id).status === 'done').length;
  const historyCount = (state.progress.history || []).length;
  const answeredWithTime = TIME_BUCKETS.reduce((s, b) => s + (state.progress.timeStats[b.key] || 0), 0);
  const confusionCount = buildConfusionRows().length;
  const historyForTrend = state.progress.history || [];

  const cards = [
    { id: 'stat-detail-trend', icon: '📈', title: 'Tiến độ theo thời gian', sub: historyForTrend.length + ' lượt đã ghi nhận' },
    { id: 'stat-detail-level', icon: '🎯', title: 'Accuracy theo Level', sub: 'Tiến độ từng giai đoạn' },
    { id: 'stat-detail-category', icon: '📚', title: 'Theo từ loại', sub: 'Noun / Verb / Adjective / Adverb' },
    { id: 'stat-detail-time', icon: '⚡', title: 'Theo thời gian trả lời', sub: answeredWithTime + ' câu đã đo thời gian' },
    { id: 'stat-detail-confusion', icon: '🧠', title: 'Phân tích nhầm lẫn', sub: confusionCount + ' từ hay bị nhầm từ loại' },
    { id: 'stat-detail-exams', icon: '📝', title: 'Theo từng đề', sub: completedExams + '/' + examIds.length + ' đề hoàn thành' },
    { id: 'stat-detail-history', icon: '📜', title: 'Lịch sử làm bài', sub: historyCount + ' lượt đã làm' },
  ];

  const grid = el('report-grid');
  grid.innerHTML = '';
  cards.forEach(c => grid.appendChild(buildStatCard(c)));
}

// Tab "Ôn tập": điểm yếu cần luyện lại + điểm mạnh đã thành thạo + kế hoạch.
export function renderReviewHome() {
  const wrongWordsCount = Object.values(state.progress.wordStats || {}).filter(w => w.wrong > 0).length;
  const familyCount = Object.keys(buildFamilyGroups()).length;

  const cards = [
    { id: 'stat-detail-suffix', icon: '🧩', title: 'Theo hậu tố', sub: 'Quy tắc hậu tố bạn còn yếu' },
    { id: 'stat-detail-worst', icon: '🔥', title: 'Từ sai nhiều nhất', sub: wrongWordsCount + ' từ cần ôn lại' },
    { id: 'stat-detail-best', icon: '⭐', title: 'Từ đã thành thạo', sub: buildBestWordsRows().length + ' từ làm tốt' },
    { id: 'stat-detail-family', icon: '🔤', title: 'Theo Word Family', sub: familyCount + ' nhóm từ cùng gốc' },
    { id: 'stat-detail-plan', icon: '📋', title: 'Kế hoạch tiếp theo', sub: 'Bạn nên học gì tiếp theo?' },
  ];

  const grid = el('review-grid');
  grid.innerHTML = '';
  cards.forEach(c => grid.appendChild(buildStatCard(c)));
}

// Xu hướng điểm số của 10 lượt gần nhất (trái = cũ nhất, phải = mới nhất) —
// giúp thấy ngay đang tiến bộ hay chững lại, không cần đọc cả bảng lịch sử.
export function renderTrend() {
  const history = state.progress.history || [];
  const recent = history.slice(0, 10).reverse();
  const wrap = el('history-trend');
  wrap.innerHTML = '';
  wrap.style.display = recent.length > 0 ? 'flex' : 'none';
  recent.forEach(h => {
    const bar = document.createElement('div');
    bar.className = 'trend-bar ' + (h.percent >= 80 ? 'good' : h.percent >= 50 ? 'mid' : 'low');
    bar.style.height = Math.max(8, h.percent) + '%';
    bar.title = h.examTitle + ': ' + h.percent + '%';
    wrap.appendChild(bar);
  });
}

export function renderHistory() {
  const history = state.progress.history || [];
  renderTrend();
  const tbody = el('history-body');
  tbody.innerHTML = '';
  const shown = history.slice(0, 30);

  shown.forEach((h, idx) => {
    const row = document.createElement('tr');
    row.className = h.details ? 'history-row-clickable' : '';
    row.innerHTML =
      '<td>' + formatDate(h.date) + '</td>' +
      '<td>' + h.examTitle + '</td>' +
      '<td>' + h.level + '</td>' +
      '<td><b>' + h.correct + '/' + h.total + '</b> (' + h.percent + '%)</td>' +
      '<td>' + h.correct + ' / ' + h.wrong + ' / ' + h.skip + '</td>' +
      '<td>' + (h.details ? '<button class="btn-outline btn-history-detail" type="button"><span class="material-symbols-outlined">visibility</span> Xem chi tiết</button>' : '') + '</td>';
    if (h.details) {
      row.querySelector('.btn-history-detail').addEventListener('click', () => {
        showTab('exams');
        viewHistoryEntry(idx);
      });
    }
    tbody.appendChild(row);
  });

  el('history-table').style.display = shown.length > 0 ? 'table' : 'none';
  el('history-empty').style.display = shown.length > 0 ? 'none' : 'block';
  if (history.length > shown.length) {
    el('history-more').style.display = 'block';
    el('history-more').textContent = 'Hiển thị 30 lượt gần nhất trong tổng số ' + history.length + ' lượt.';
  } else {
    el('history-more').style.display = 'none';
  }
}

export function renderWorstWords() {
  const words = Object.values(state.progress.wordStats || {}).filter(w => w.wrong > 0);
  words.sort((a, b) => b.wrong - a.wrong || (a.correct / (a.correct + a.wrong)) - (b.correct / (b.correct + b.wrong)));
  const top = words.slice(0, 15);

  const tbody = el('worst-words-body');
  tbody.innerHTML = '';
  top.forEach(w => {
    const total = w.correct + w.wrong;
    const pct = total > 0 ? Math.round(w.correct / total * 100) : 0;
    const row = document.createElement('tr');
    row.innerHTML =
      '<td><b>' + w.word + '</b></td>' +
      '<td>' + (w.meaning || '—') + '</td>' +
      '<td>' + w.wrong + '</td>' +
      '<td>' + w.correct + '</td>' +
      '<td>' + pct + '%</td>';
    tbody.appendChild(row);
  });

  el('worst-words-table').style.display = top.length > 0 ? 'table' : 'none';
  el('worst-words-empty').style.display = top.length > 0 ? 'none' : 'block';
}

// Đối xứng với "Từ sai nhiều nhất" — liệt kê các từ làm tốt nhất (đúng nhiều,
// chưa sai lần nào) để tạo cảm giác tiến bộ, không chỉ thấy toàn điểm yếu.
export function buildBestWordsRows() {
  return Object.values(state.progress.wordStats || {})
    .filter(w => w.correct >= 2 && w.wrong === 0)
    .sort((a, b) => b.correct - a.correct);
}

export function renderBestWords() {
  const top = buildBestWordsRows().slice(0, 15);

  const tbody = el('best-words-body');
  tbody.innerHTML = '';
  top.forEach(w => {
    const row = document.createElement('tr');
    row.innerHTML =
      '<td><b>' + w.word + '</b></td>' +
      '<td>' + (w.meaning || '—') + '</td>' +
      '<td>' + w.correct + '</td>' +
      '<td>100%</td>';
    tbody.appendChild(row);
  });

  el('best-words-table').style.display = top.length > 0 ? 'table' : 'none';
  el('best-words-empty').style.display = top.length > 0 ? 'none' : 'block';
}

export function buildSuffixGroups() {
  const groups = {};
  Object.values(state.progress.wordStats || {}).forEach(w => {
    const suf = getSuffix(w.word);
    if (!suf) return;
    if (!groups[suf]) groups[suf] = { correct: 0, wrong: 0 };
    groups[suf].correct += w.correct;
    groups[suf].wrong += w.wrong;
  });
  return groups;
}

export function renderSuffixStats() {
  const groups = buildSuffixGroups();
  const rows = Object.keys(groups).map(suf => {
    const g = groups[suf];
    const total = g.correct + g.wrong;
    return { suf, total, pct: total > 0 ? Math.round(g.correct / total * 100) : 0 };
  }).filter(r => r.total > 0);

  const weak = rows.filter(r => r.pct < 50).sort((a, b) => a.pct - b.pct);
  const improve = rows.filter(r => r.pct >= 50 && r.pct < 80).sort((a, b) => a.pct - b.pct);
  const mastered = rows.filter(r => r.pct >= 80).sort((a, b) => b.pct - a.pct);
  state.WEAK_SUFFIXES = weak.concat(improve).map(r => r.suf);

  const wrap = el('suffix-tiers');
  wrap.innerHTML = '';

  function buildTier(label, icon, cls, items, showPct) {
    if (items.length === 0) return;
    const block = document.createElement('div');
    block.className = 'suffix-tier ' + cls;
    const chips = items.map(r =>
      '<span class="suffix-chip">' + r.suf + (showPct ? ' (' + r.pct + '%)' : '') + '</span>'
    ).join('');
    block.innerHTML = '<div class="suffix-tier-title">' + icon + ' ' + label + '</div><div class="suffix-chip-row">' + chips + '</div>';
    wrap.appendChild(block);
  }

  buildTier('Cần ôn', '🔥', 'weak', weak, true);
  buildTier('Cần cải thiện', '🟡', 'improve', improve, true);
  buildTier('Đã thành thạo', '🟢', 'mastered', mastered, false);

  el('suffix-empty').style.display = rows.length > 0 ? 'none' : 'block';
  el('btn-practice-weak-suffix').disabled = state.WEAK_SUFFIXES.length === 0;
}

export function buildLevelAccuracy() {
  const groups = {};
  LEVEL_LABELS.forEach(l => { groups[l] = { correct: 0, wrong: 0 }; });
  Object.values(state.progress.wordStats || {}).forEach(w => {
    const level = state.WORD_LEVEL_MAP[w.word];
    if (!level || !groups[level]) return;
    groups[level].correct += w.correct;
    groups[level].wrong += w.wrong;
  });
  return LEVEL_LABELS.map(level => {
    const g = groups[level];
    const total = g.correct + g.wrong;
    return { level, total, pct: total > 0 ? Math.round(g.correct / total * 100) : 0 };
  });
}

export function renderLevelAccuracy() {
  const rows = buildLevelAccuracy();
  const wrap = el('level-accuracy-stats');
  wrap.innerHTML = '';
  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML =
      '<div class="cat-top"><b>' + r.level + '</b><span>' + (r.total > 0 ? r.pct + '% (' + r.total + ' câu)' : 'Chưa làm') + '</span></div>' +
      '<div class="cat-bar-bg"><div class="cat-bar-fill" style="width:' + r.pct + '%"></div></div>';
    wrap.appendChild(row);
  });
}

export function buildFamilyGroups() {
  const groups = {};
  Object.values(state.progress.wordStats || {}).forEach(w => {
    const family = state.WORD_FAMILY_MAP[w.word] || w.word;
    if (!groups[family]) groups[family] = [];
    groups[family].push(w);
  });
  // chỉ giữ các nhóm có từ 2 thành viên trở lên
  Object.keys(groups).forEach(family => {
    if (groups[family].length < 2) delete groups[family];
  });
  return groups;
}

export function renderFamilyStats() {
  const groups = buildFamilyGroups();
  const families = Object.keys(groups).sort((a, b) => {
    const wrongA = groups[a].reduce((s, w) => s + w.wrong, 0);
    const wrongB = groups[b].reduce((s, w) => s + w.wrong, 0);
    return wrongB - wrongA;
  });

  const wrap = el('family-stats');
  wrap.innerHTML = '';
  families.forEach(family => {
    const members = groups[family];
    const totalCorrect = members.reduce((s, w) => s + w.correct, 0);
    const totalWrong = members.reduce((s, w) => s + w.wrong, 0);

    const card = document.createElement('div');
    card.className = 'family-card';
    let membersHtml = '';
    members.forEach(w => {
      const total = w.correct + w.wrong;
      const pct = total > 0 ? Math.round(w.correct / total * 100) : 0;
      const category = w.correctAnswer ? CATEGORY_LABEL[ANSWER_TO_CATEGORY[w.correctAnswer]] : null;
      membersHtml += '<div class="family-member"><span>' + w.word + (category ? ' <i>(' + category + ')</i>' : '') + '</span><span>' + w.correct + ' đúng / ' + w.wrong + ' sai (' + pct + '%)</span></div>';
    });
    card.innerHTML =
      '<div class="family-head"><b>' + family + '</b><span>Đúng: ' + totalCorrect + ' · Sai: ' + totalWrong + '</span></div>' +
      '<div class="family-members">' + membersHtml + '</div>';
    wrap.appendChild(card);
  });

  el('family-empty').style.display = families.length > 0 ? 'none' : 'block';
}

export function renderTimeStats() {
  const wrap = el('time-stats');
  wrap.innerHTML = '';
  const total = TIME_BUCKETS.reduce((s, b) => s + (state.progress.timeStats[b.key] || 0), 0);

  TIME_BUCKETS.forEach(b => {
    const count = state.progress.timeStats[b.key] || 0;
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML =
      '<div class="cat-top"><b>' + b.label + '</b><span>' + count + ' câu (' + pct + '%)</span></div>' +
      '<div class="cat-bar-bg"><div class="cat-bar-fill" style="width:' + pct + '%;background:var(--primary);"></div></div>';
    wrap.appendChild(row);
  });

  el('time-empty').style.display = total > 0 ? 'none' : 'block';
}

export function renderStudyPlan() {
  const wrap = el('study-plan-content');
  const levelNames = ["Level 1", "Level 2", "Level 3", "Level 4"];
  const levelStatus = levelNames.map(name => {
    const exams = state.EXAMS.filter(e => e.level.startsWith(name));
    const done = exams.length > 0 && exams.every(e => (getExamProgress(e.id).bestPercent || 0) >= 90);
    const worstPct = exams.length > 0 ? Math.min(...exams.map(e => getExamProgress(e.id).bestPercent || 0)) : 0;
    return { name, exams, done, worstPct };
  });

  let html = '';
  let blockedAt = null;
  levelNames.forEach((name, i) => {
    const lvl = levelStatus[i];
    if (lvl.exams.length === 0) return;
    const icon = lvl.done ? 'check_circle' : 'radio_button_unchecked';
    const colorClass = lvl.done ? 'correct' : 'skip';
    html += '<div class="plan-step ' + colorClass + '">' +
      '<span class="material-symbols-outlined">' + icon + '</span>' +
      '<div><b>' + lvl.name + '</b> — ' + (lvl.done ? 'Đã đạt ≥90% tất cả đề' : 'Điểm cao nhất thấp nhất hiện tại: ' + lvl.worstPct + '%') + '</div>' +
    '</div>';
    if (!lvl.done && blockedAt === null) blockedAt = i;
  });

  let recommendation;
  if (blockedAt === null) {
    recommendation = '🎉 Bạn đã đạt ≥90% ở tất cả các Level hiện có! Đủ nền tảng để chuyển sang học Word Form TOEIC.';
  } else {
    const lvl = levelStatus[blockedAt];
    const notDone = lvl.exams.filter(e => (getExamProgress(e.id).bestPercent || 0) < 90).map(e => e.title);
    recommendation = 'Hãy hoàn thành nốt ' + lvl.name + ', đạt ≥90% ở: ' + notDone.join(', ') +
      ' rồi mới chuyển sang ' + (levelNames[blockedAt + 1] || 'cấp tiếp theo') + '.';
  }

  wrap.innerHTML = html + '<div class="plan-recommend">' + recommendation + '</div>';
}

export function buildReportText() {
  const examIds = state.EXAMS.map(e => e.id);
  let completed = 0, totalAttempts = 0, totalAnswered = 0, totalCorrect = 0;
  const lines = [];

  lines.push('=================================================');
  lines.push('   BÁO CÁO THỐNG KÊ - NHẬN DIỆN TỪ LOẠI TOEIC');
  lines.push('=================================================');
  lines.push('Thời điểm xuất: ' + new Date().toLocaleString('vi-VN'));
  lines.push('');

  state.EXAMS.forEach(exam => {
    const p = getExamProgress(exam.id);
    if (p.status === 'done') completed++;
    totalAttempts += p.attempts;
    if (p.attempts > 0) {
      totalAnswered += p.lastTotal;
      totalCorrect += p.lastCorrect;
    }
  });
  const accuracy = totalAnswered > 0 ? Math.round(totalCorrect / totalAnswered * 100) : 0;
  const history = state.progress.history || [];
  const lifetimeTotal = history.reduce((s, h) => s + h.total, 0);
  const lifetimeCorrect = history.reduce((s, h) => s + h.correct, 0);
  const lifetimeAccuracy = lifetimeTotal > 0 ? Math.round(lifetimeCorrect / lifetimeTotal * 100) : 0;
  const streak = state.progress.streak || { current: 0, best: 0 };
  const progressPct = examIds.length > 0 ? Math.round(completed / examIds.length * 100) : 0;
  const readiness = Math.round(progressPct * 0.4 + accuracy * 0.6);

  lines.push('--- TỔNG QUAN ---');
  lines.push('Tổng tiến độ (đề đã hoàn thành): ' + progressPct + '% (' + completed + '/' + examIds.length + ')');
  lines.push('Lượt làm bài: ' + totalAttempts);
  lines.push('Tổng câu đã trả lời (lần gần nhất mỗi đề): ' + totalAnswered);
  lines.push('Độ chính xác hiện tại (lần gần nhất mỗi đề): ' + accuracy + '%');
  lines.push('Độ chính xác lịch sử (toàn bộ các lượt đã làm): ' + lifetimeAccuracy + '%');
  lines.push('Streak đúng liên tiếp: ' + streak.current + ' (kỷ lục: ' + streak.best + ')');
  lines.push('Độ sẵn sàng TOEIC (dự đoán, kết hợp tiến độ + độ chính xác): ' + readiness + '% — ước tính ' + Math.round(accuracy / 100 * 30) + '/30 câu nếu gặp dạng này trong Part 5.');
  lines.push('');

  lines.push('--- THEO TỪ LOẠI ---');
  Object.keys(CATEGORY_LABEL).forEach(cat => {
    const c = state.progress.categoryStats[cat] || { correct: 0, total: 0 };
    const pct = c.total > 0 ? Math.round(c.correct / c.total * 100) : 0;
    lines.push(CATEGORY_LABEL[cat] + ': ' + c.correct + '/' + c.total + ' (' + pct + '%)');
  });
  lines.push('');

  lines.push('--- ACCURACY THEO LEVEL ---');
  buildLevelAccuracy().forEach(r => {
    lines.push(r.level + ' : ' + (r.total > 0 ? r.pct + '%' : 'chưa làm'));
  });
  lines.push('');

  lines.push('--- THEO HẬU TỐ (quan trọng nhất để biết bạn yếu quy tắc nào) ---');
  const suffixGroups = buildSuffixGroups();
  const suffixRows = Object.keys(suffixGroups).map(suf => {
    const g = suffixGroups[suf];
    const total = g.correct + g.wrong;
    return { suf, total, pct: total > 0 ? Math.round(g.correct / total * 100) : 0 };
  }).filter(r => r.total > 0);
  if (suffixRows.length === 0) {
    lines.push('Chưa có dữ liệu.');
  } else {
    const weak = suffixRows.filter(r => r.pct < 50).sort((a, b) => a.pct - b.pct);
    const improve = suffixRows.filter(r => r.pct >= 50 && r.pct < 80).sort((a, b) => a.pct - b.pct);
    const mastered = suffixRows.filter(r => r.pct >= 80).sort((a, b) => b.pct - a.pct);
    lines.push('🔥 Cần ôn:');
    weak.forEach(r => lines.push('  ' + r.suf + ' (' + r.pct + '%)'));
    if (weak.length === 0) lines.push('  (không có)');
    lines.push('🟡 Cần cải thiện:');
    improve.forEach(r => lines.push('  ' + r.suf + ' (' + r.pct + '%)'));
    if (improve.length === 0) lines.push('  (không có)');
    lines.push('🟢 Đã thành thạo:');
    mastered.forEach(r => lines.push('  ' + r.suf));
    if (mastered.length === 0) lines.push('  (không có)');
  }
  lines.push('');

  lines.push('--- THEO WORD FAMILY ---');
  const familyGroups = buildFamilyGroups();
  const familyNames = Object.keys(familyGroups);
  if (familyNames.length === 0) {
    lines.push('Chưa có dữ liệu (cần làm thêm các câu có từ cùng gốc).');
  } else {
    familyNames.forEach(family => {
      const members = familyGroups[family];
      const totalCorrect = members.reduce((s, w) => s + w.correct, 0);
      const totalWrong = members.reduce((s, w) => s + w.wrong, 0);
      const memberText = members.map(w => {
        const cat = w.correctAnswer ? CATEGORY_LABEL[ANSWER_TO_CATEGORY[w.correctAnswer]] : null;
        return w.word + (cat ? ' [' + cat + ']' : '') + ' (' + w.correct + 'đ/' + w.wrong + 's)';
      }).join(', ');
      lines.push(family + ' [Đúng ' + totalCorrect + ' / Sai ' + totalWrong + ']: ' + memberText);
    });
  }
  lines.push('');

  lines.push('--- THEO THỜI GIAN TRẢ LỜI ---');
  const timeTotal = TIME_BUCKETS.reduce((s, b) => s + (state.progress.timeStats[b.key] || 0), 0);
  if (timeTotal === 0) {
    lines.push('Chưa có dữ liệu.');
  } else {
    TIME_BUCKETS.forEach(b => lines.push(b.label + ' : ' + (state.progress.timeStats[b.key] || 0) + ' câu'));
  }
  lines.push('');

  lines.push('--- THEO TỪNG ĐỀ ---');
  state.EXAMS.forEach(exam => {
    const p = getExamProgress(exam.id);
    const statusText = p.status === 'done' ? 'Hoàn thành' : p.status === 'in_progress' ? 'Đang làm' : 'Chưa làm';
    const scoreText = p.attempts > 0 ? p.lastCorrect + '/' + p.lastTotal + ' (' + p.lastPercent + '%), cao nhất ' + p.bestPercent + '%' : 'chưa làm';
    const stableText = isExamStable(exam.id) ? ' - Ổn định ✓ (≥90% trong 3 lượt gần nhất)' : '';
    lines.push(exam.title + ' [' + exam.level + '] - ' + statusText + ' - Lượt làm: ' + p.attempts + ' - Điểm: ' + scoreText + stableText);
  });
  lines.push('');

  lines.push('--- TỪ SAI NHIỀU NHẤT (top 15) ---');
  const words = Object.values(state.progress.wordStats || {}).filter(w => w.wrong > 0);
  words.sort((a, b) => b.wrong - a.wrong);
  if (words.length === 0) {
    lines.push('Chưa có dữ liệu.');
  } else {
    words.slice(0, 15).forEach((w, i) => {
      const total = w.correct + w.wrong;
      const pct = total > 0 ? Math.round(w.correct / total * 100) : 0;
      lines.push((i + 1) + '. ' + w.word + ' (' + (w.meaning || '—') + ') - Sai: ' + w.wrong + ', Đúng: ' + w.correct + ', Tỉ lệ đúng: ' + pct + '%');
    });
    if (words.length > 15) lines.push('... và ' + (words.length - 15) + ' từ khác (xem đầy đủ trong tab Thống kê).');
  }
  lines.push('');

  lines.push('--- PHÂN TÍCH NHẦM LẪN (top 20, bạn hay chọn nhầm sang từ loại nào) ---');
  const confusionRows = buildConfusionRows();
  if (confusionRows.length === 0) {
    lines.push('Chưa có dữ liệu.');
  } else {
    confusionRows.slice(0, 20).forEach((w, i) => {
      const correctCat = CATEGORY_LABEL[ANSWER_TO_CATEGORY[w.correctAnswer]] || '—';
      const pickCat = CATEGORY_LABEL[ANSWER_TO_CATEGORY[w.topPickId]] || w.topPickId;
      lines.push((i + 1) + '. ' + w.word + ' (' + (w.meaning || '—') + ') - Đúng là: ' + correctCat + ' - Hay chọn nhầm: ' + pickCat + ' (' + w.topPickCount + ' lần)');
    });
  }
  lines.push('');

  lines.push('--- TỪ ĐÃ THÀNH THẠO (top 15, đúng ≥2 lần, chưa sai lần nào) ---');
  const bestWords = buildBestWordsRows();
  if (bestWords.length === 0) {
    lines.push('Chưa có dữ liệu.');
  } else {
    bestWords.slice(0, 15).forEach((w, i) => {
      lines.push((i + 1) + '. ' + w.word + ' (' + (w.meaning || '—') + ') - Đúng: ' + w.correct + ' lần');
    });
  }
  lines.push('');

  lines.push('--- LỊCH SỬ LÀM BÀI (20 lượt gần nhất) ---');
  if (history.length === 0) {
    lines.push('Chưa có lượt làm bài nào.');
  } else {
    history.slice(0, 20).forEach((h, i) => {
      lines.push((i + 1) + '. ' + formatDate(h.date) + ' - ' + h.examTitle + ' [' + h.level + '] - ' +
        h.correct + '/' + h.total + ' (' + h.percent + '%) - Đúng: ' + h.correct + ', Sai: ' + h.wrong + ', Bỏ trống: ' + h.skip);
    });
    if (history.length > 20) lines.push('... và ' + (history.length - 20) + ' lượt khác (xem đầy đủ trong tab Thống kê).');
  }
  lines.push('');

  lines.push('--- KẾ HOẠCH TIẾP THEO ---');
  const levelNamesReport = ["Level 1", "Level 2", "Level 3", "Level 4"];
  let blockedAtReport = null;
  levelNamesReport.forEach((name, i) => {
    const exams = state.EXAMS.filter(e => e.level.startsWith(name));
    if (exams.length === 0) return;
    const done = exams.every(e => (getExamProgress(e.id).bestPercent || 0) >= 90);
    const worstPct = Math.min(...exams.map(e => getExamProgress(e.id).bestPercent || 0));
    lines.push(name + ': ' + (done ? 'Đã đạt ≥90% tất cả đề' : 'Chưa đạt (điểm cao nhất thấp nhất: ' + worstPct + '%)'));
    if (!done && blockedAtReport === null) blockedAtReport = i;
  });
  if (blockedAtReport === null) {
    lines.push('=> Bạn đã đạt ≥90% ở tất cả các Level hiện có. Đủ nền tảng để chuyển sang học Word Form TOEIC.');
  } else {
    const exams = state.EXAMS.filter(e => e.level.startsWith(levelNamesReport[blockedAtReport]));
    const notDone = exams.filter(e => (getExamProgress(e.id).bestPercent || 0) < 90).map(e => e.title);
    lines.push('=> Hãy hoàn thành nốt ' + levelNamesReport[blockedAtReport] + ', đạt ≥90% ở: ' + notDone.join(', ') +
      ' rồi mới chuyển sang ' + (levelNamesReport[blockedAtReport + 1] || 'cấp tiếp theo') + '.');
  }
  lines.push('');
  lines.push('=================================================');

  return lines.join('\n');
}
