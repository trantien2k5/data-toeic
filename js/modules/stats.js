import { CATEGORY_LABEL, TIME_BUCKETS, ANSWER_TO_CATEGORY } from './constants.js';
import { state } from './state.js';
import { el, formatDate, getSuffix, shuffle, showTab } from './utils.js';
import { getExamProgress } from './storage.js';
import { startExam, viewHistoryEntry } from './quiz.js';

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
      divider.innerHTML = '<td colspan="5">' + exam.level + '</td>';
      tbody.appendChild(divider);
    }

    const statusText = p.status === 'done' ? 'Hoàn thành' : p.status === 'in_progress' ? 'Đang làm' : 'Chưa làm';
    const row = document.createElement('tr');
    row.innerHTML =
      '<td>' + exam.title + '</td>' +
      '<td>' + statusText + '</td>' +
      '<td>' + p.attempts + '</td>' +
      '<td>' + (p.attempts > 0 ? p.lastCorrect + '/' + p.lastTotal + ' (' + p.lastPercent + '%)' : '—') + '</td>' +
      '<td>' + (p.attempts > 0 ? p.bestPercent + '%' : '—') + '</td>';
    tbody.appendChild(row);
  });

  el('ov-completed').textContent = completed + '/' + examIds.length;
  el('ov-attempts').textContent = totalAttempts;
  el('ov-accuracy').textContent = (totalAnswered > 0 ? Math.round(totalCorrect / totalAnswered * 100) : 0) + '%';
  el('ov-answered').textContent = totalAnswered;

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
  renderHistory();
  renderLevelAccuracy();
  renderSuffixStats();
  renderFamilyStats();
  renderTimeStats();
  renderStudyPlan();
  renderStatsHome();
  showStatScreen('stat-home');
}

export function showStatScreen(id) {
  document.querySelectorAll('#tab-stats .screen-stat').forEach(s => s.classList.remove('active'));
  el(id).classList.add('active');
  window.scrollTo(0, 0);
}

export function renderStatsHome() {
  const examIds = state.EXAMS.map(e => e.id);
  const completedExams = state.EXAMS.filter(e => getExamProgress(e.id).status === 'done').length;
  const wrongWordsCount = Object.values(state.progress.wordStats || {}).filter(w => w.wrong > 0).length;
  const historyCount = (state.progress.history || []).length;

  const familyCount = Object.keys(buildFamilyGroups()).length;
  const answeredWithTime = TIME_BUCKETS.reduce((s, b) => s + (state.progress.timeStats[b.key] || 0), 0);

  const cards = [
    { id: 'stat-detail-category', icon: 'category', title: 'Theo từ loại', sub: 'Noun / Verb / Adjective / Adverb' },
    { id: 'stat-detail-level', icon: 'stairs', title: 'Accuracy theo Level', sub: 'Tiến độ từng giai đoạn' },
    { id: 'stat-detail-suffix', icon: 'spellcheck', title: 'Theo hậu tố', sub: 'Quy tắc hậu tố bạn còn yếu' },
    { id: 'stat-detail-family', icon: 'account_tree', title: 'Theo Word Family', sub: familyCount + ' nhóm từ cùng gốc' },
    { id: 'stat-detail-time', icon: 'timer', title: 'Theo thời gian trả lời', sub: answeredWithTime + ' câu đã đo thời gian' },
    { id: 'stat-detail-exams', icon: 'table_chart', title: 'Theo từng đề', sub: completedExams + '/' + examIds.length + ' đề hoàn thành' },
    { id: 'stat-detail-worst', icon: 'trending_down', title: 'Từ sai nhiều nhất', sub: wrongWordsCount + ' từ cần ôn lại' },
    { id: 'stat-detail-history', icon: 'history', title: 'Lịch sử làm bài', sub: historyCount + ' lượt đã làm' },
    { id: 'stat-detail-plan', icon: 'flag', title: 'Kế hoạch tiếp theo', sub: 'Bạn nên học gì tiếp theo?' },
    { id: 'stat-detail-sync', icon: 'sync', title: 'Đồng bộ dữ liệu', sub: 'Sao lưu & khôi phục tiến độ học tập' },
  ];

  const grid = el('stat-category-grid');
  grid.innerHTML = '';
  cards.forEach(c => {
    const card = document.createElement('div');
    card.className = 'level-card';
    card.innerHTML =
      '<div class="lc-top"><span class="material-symbols-outlined">' + c.icon + '</span><h3>' + c.title + '</h3></div>' +
      '<div class="lc-sub">' + c.sub + '</div>' +
      '<div class="lc-footer"><span></span><span class="lc-arrow">Xem chi tiết <span class="material-symbols-outlined">arrow_forward</span></span></div>';
    card.addEventListener('click', () => showStatScreen(c.id));
    grid.appendChild(card);
  });
}

export function renderHistory() {
  const history = state.progress.history || [];
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
  const LEVEL_LABELS = [
    "Level 1 · Cơ bản",
    "Level 2 · Theo hậu tố",
    "Level 3 · Từ dễ nhầm",
    "Level 4 · TOEIC thực tế",
  ];
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
      membersHtml += '<div class="family-member"><span>' + w.word + '</span><span>' + w.correct + ' đúng / ' + w.wrong + ' sai (' + pct + '%)</span></div>';
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

  lines.push('--- TỔNG QUAN ---');
  lines.push('Đề đã hoàn thành: ' + completed + '/' + examIds.length);
  lines.push('Lượt làm bài: ' + totalAttempts);
  lines.push('Tổng câu đã trả lời (lần gần nhất mỗi đề): ' + totalAnswered);
  lines.push('Độ chính xác chung: ' + accuracy + '%');
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
      const memberText = members.map(w => w.word + ' (' + w.correct + 'đ/' + w.wrong + 's)').join(', ');
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
    lines.push(exam.title + ' [' + exam.level + '] - ' + statusText + ' - Lượt làm: ' + p.attempts + ' - Điểm: ' + scoreText);
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

  lines.push('--- LỊCH SỬ LÀM BÀI (20 lượt gần nhất) ---');
  const history = state.progress.history || [];
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
