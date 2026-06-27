const DATA_URL = "nhan-dien-tu-loai-toiec.json";
const QUESTIONS_PER_EXAM = 20;
const SECONDS_PER_QUESTION = 60;
const STORAGE_KEY = "toeicPosProgressV1";
const HISTORY_CAP = 60; // mỗi entry giờ lưu kèm chi tiết từng câu nên giảm cap để nhẹ localStorage
const CATEGORY_LABEL = { N: "Danh từ", V: "Động từ", ADJ: "Tính từ", ADV: "Trạng từ" };
const ANSWER_TO_CATEGORY = { A: "N", B: "V", C: "ADJ", D: "ADV" };
const ICON = {
  done: 'check_circle', in_progress: 'pending', not_started: 'radio_button_unchecked',
  start: 'rocket_launch', retry: 'refresh'
};

// Hậu tố quan trọng cần theo dõi riêng (kiểm tra hậu tố dài trước để tránh nhầm,
// ví dụ "-tion" phải được nhận trước "-ion").
const SUFFIX_LIST = [
  'tion', 'sion', 'ment', 'ness', 'ity', 'ance', 'ence', 'hood', 'ship', 'dom',
  'able', 'ible', 'ful', 'less', 'ive', 'ous', 'ic', 'ed', 'ing', 'al', 'er', 'or', 'ee', 'ly',
].sort((a, b) => b.length - a.length);

function getSuffix(word){
  if(!word) return null;
  const w = word.toLowerCase();
  for(const suf of SUFFIX_LIST){
    if(w.endsWith(suf) && w.length > suf.length + 2) return '-' + suf;
  }
  return null;
}

const TIME_BUCKETS = [
  { key: '<1s', label: '< 1 giây', test: (s) => s < 1 },
  { key: '1-2s', label: '1 - 2 giây', test: (s) => s >= 1 && s < 2 },
  { key: '2-3s', label: '2 - 3 giây', test: (s) => s >= 2 && s < 3 },
  { key: '3-5s', label: '3 - 5 giây', test: (s) => s >= 3 && s < 5 },
  { key: '>5s', label: '> 5 giây', test: (s) => s >= 5 },
];
function getTimeBucketKey(seconds){
  const b = TIME_BUCKETS.find(b => b.test(seconds));
  return b ? b.key : '>5s';
}

let ALL_QUESTIONS = [];
let WORD_FAMILY_MAP = {}; // word -> family root
let WORD_LEVEL_MAP = {}; // word -> level label
let customExamPool = {}; // examId -> exam object, dùng cho đề ôn tập điểm yếu tự sinh
let WEAK_SUFFIXES = []; // hậu tố thuộc nhóm 🔥 + 🟡 (tính lại mỗi lần render thống kê)
let lastReviewDetails = []; // chi tiết các câu đang hiển thị ở màn kết quả (dùng cho nút "Ôn lại câu sai")
let resultViewSource = 'exam'; // 'exam' (vừa nộp bài) | 'history' (xem lại từ lịch sử)
let EXAMS = [];          // [{id, title, level, questions:[...]}]
let progress = {};       // persisted progress object

let currentExam = null;
let runQuestions = [];   // shuffled working copy for current attempt
let userAnswers = {};
let currentIndex = 0;
let timerInterval = null;
let remainingSeconds = 0;
let viewMode = 'single'; // 'single' | 'list'
let answerTimeSec = {};  // index -> giây tính từ lần chọn đáp án trước đó
let lastAnswerAt = 0;

const el = (id) => document.getElementById(id);

/* ---------- utils ---------- */
function shuffle(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ước lượng thời gian trả lời 1 câu bằng khoảng cách so với lần chọn đáp án
// gần nhất (vì giao diện mặc định hiện toàn bộ câu hỏi cùng lúc, không có
// mốc "bắt đầu xem câu X" rõ ràng như chế độ từng câu).
function recordAnswerTiming(index){
  const now = Date.now();
  answerTimeSec[index] = (now - lastAnswerAt) / 1000;
  lastAnswerAt = now;
}

/* ---------- custom modal (replaces native confirm/alert) ---------- */
function showConfirm(message, okText, cancelText){
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
    overlay.addEventListener('click', (e) => { if(e.target === overlay) cleanup(false); });
  });
}
function showAlert(message, okText){
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
    overlay.addEventListener('click', (e) => { if(e.target === overlay) cleanup(); });
  });
}

/* ---------- fullscreen toggle (desktop only) ---------- */
function updateFullscreenIcon(){
  const btn = el('btn-fullscreen');
  if(!btn) return;
  const isFs = !!document.fullscreenElement;
  btn.querySelector('.material-symbols-outlined').textContent = isFs ? 'fullscreen_exit' : 'fullscreen';
  btn.title = isFs ? 'Thoát toàn màn hình' : 'Bật toàn màn hình';
}
const fsBtn = el('btn-fullscreen');
if(fsBtn){
  fsBtn.addEventListener('click', () => {
    if(document.fullscreenElement){
      document.exitFullscreen().catch(() => {});
    }else{
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', updateFullscreenIcon);
}

function loadProgress(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    progress = raw ? JSON.parse(raw) : {};
  }catch(e){ progress = {}; }
  if(!progress.exams) progress.exams = {};
  if(!progress.categoryStats){
    progress.categoryStats = { N:{correct:0,total:0}, V:{correct:0,total:0}, ADJ:{correct:0,total:0}, ADV:{correct:0,total:0} };
  }
  if(!progress.wordStats) progress.wordStats = {};
  if(!progress.history) progress.history = [];
  if(!progress.timeStats){
    progress.timeStats = {};
    TIME_BUCKETS.forEach(b => { progress.timeStats[b.key] = 0; });
  }
}
function saveProgress(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
function getExamProgress(examId){
  if(!progress.exams[examId]){
    progress.exams[examId] = { status: "not_started", attempts: 0, lastPercent: null, lastCorrect: 0, lastTotal: 0, bestPercent: 0 };
  }
  return progress.exams[examId];
}

/* ---------- screens / tabs ---------- */
function showScreen(id){
  document.querySelectorAll('#tab-exams .screen').forEach(s => s.classList.remove('active'));
  el(id).classList.add('active');
  window.scrollTo(0, 0);
}
function showTab(tab){
  document.querySelectorAll('.tabview').forEach(t => t.classList.remove('active'));
  window.scrollTo(0, 0);
  el('tab-' + tab).classList.add('active');
  document.querySelectorAll('#top-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if(tab === 'stats') renderStats();
}
document.querySelectorAll('#top-tabs button').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

/* ---------- load data ---------- */
async function loadQuestions(){
  try{
    const res = await fetch(DATA_URL, {cache:"no-store"});
    if(!res.ok) throw new Error("HTTP " + res.status);
    let data = await res.json();
    if(!Array.isArray(data)) data = [data];
    ALL_QUESTIONS = data;
  }catch(err){
    el('loading').innerHTML =
      '⚠️ Không thể tải file dữ liệu <code>' + DATA_URL + '</code>.<br>' +
      'Nếu bạn đang mở file này trực tiếp (file://), trình duyệt có thể chặn fetch local file.<br><br>' +
      'Hãy chạy bằng local server, ví dụ: <code>npx serve .</code> hoặc <code>python -m http.server</code>, ' +
      'rồi mở <code>http://localhost:PORT/trac-nghiem.html</code>.';
    return;
  }
  el('loading').style.display = 'none';

  WORD_FAMILY_MAP = {};
  ALL_QUESTIONS.forEach(q => { WORD_FAMILY_MAP[q.word] = q.family || q.word; });

  const LEVEL_LABELS = [
    "Level 1 · Cơ bản",
    "Level 2 · Theo hậu tố",
    "Level 3 · Từ dễ nhầm",
    "Level 4 · TOEIC thực tế",
  ];
  const EXAMS_PER_LEVEL = 5;
  const LEVEL_SIZE = EXAMS_PER_LEVEL * QUESTIONS_PER_EXAM; // 100
  const PER_CATEGORY_PER_EXAM = QUESTIONS_PER_EXAM / 4;    // 5 câu/loại/đề

  EXAMS = [];
  WORD_LEVEL_MAP = {};
  for(let levelStart = 0; levelStart < ALL_QUESTIONS.length; levelStart += LEVEL_SIZE){
    const levelQuestions = ALL_QUESTIONS.slice(levelStart, levelStart + LEVEL_SIZE);
    const levelLabel = LEVEL_LABELS[levelStart / LEVEL_SIZE] || "";
    levelQuestions.forEach(q => { WORD_LEVEL_MAP[q.word] = levelLabel; });

    // Dữ liệu trong file được xếp theo từng khối 1 loại từ (N/V/ADJ/ADV) liên tiếp.
    // Gom lại theo loại rồi rút đều mỗi đề 5 câu/loại để mỗi đề luôn đủ 4 từ loại.
    const byCategory = { N: [], V: [], ADJ: [], ADV: [] };
    levelQuestions.forEach(q => {
      const cat = ANSWER_TO_CATEGORY[q.correctAnswer];
      if(byCategory[cat]) byCategory[cat].push(q);
    });

    for(let e = 0; e < EXAMS_PER_LEVEL; e++){
      const examQuestions = [];
      Object.keys(byCategory).forEach(cat => {
        const start = e * PER_CATEGORY_PER_EXAM;
        examQuestions.push(...byCategory[cat].slice(start, start + PER_CATEGORY_PER_EXAM));
      });
      const idx = EXAMS.length + 1;
      EXAMS.push({ id: "de" + idx, title: "Đề " + idx, level: levelLabel, questions: examQuestions });
    }
  }

  loadProgress();
  renderExamList();
}

/* ---------- exam list: drill-down Level -> danh sách đề ---------- */
function groupExamsByLevel(){
  const groups = [];
  EXAMS.forEach(exam => {
    let group = groups.find(g => g.level === exam.level);
    if(!group){ group = { level: exam.level, exams: [] }; groups.push(group); }
    group.exams.push(exam);
  });
  return groups;
}

function renderExamList(){
  const wrap = el('exam-grid');
  wrap.innerHTML = '';

  groupExamsByLevel().forEach(group => {
    const doneCount = group.exams.filter(e => getExamProgress(e.id).status === 'done').length;
    const pct = Math.round(doneCount / group.exams.length * 100);

    const card = document.createElement('div');
    card.className = 'level-card';
    card.innerHTML =
      '<div class="lc-top"><span class="material-symbols-outlined">layers</span><h3>' + group.level + '</h3></div>' +
      '<div class="lc-sub">' + group.exams.length + ' đề · ' + group.exams.reduce((s,e) => s + e.questions.length, 0) + ' câu</div>' +
      '<div class="lc-progress-bg"><div class="lc-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="lc-footer"><span>' + doneCount + '/' + group.exams.length + ' đề hoàn thành</span>' +
      '<span class="lc-arrow">Xem đề <span class="material-symbols-outlined">arrow_forward</span></span></div>';
    card.addEventListener('click', () => openLevel(group.level));
    wrap.appendChild(card);
  });
}

function openLevel(levelLabel){
  const group = groupExamsByLevel().find(g => g.level === levelLabel);
  if(!group) return;
  el('level-detail-title').textContent = levelLabel;
  renderExamCardsInto(el('level-exam-grid'), group.exams);
  showScreen('screen-level-detail');
}
el('btn-back-levels').addEventListener('click', () => {
  showScreen('screen-exam-list');
  renderExamList();
});

function renderExamCardsInto(container, exams){
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
function startExam(examId){
  currentExam = EXAMS.find(e => e.id === examId) || customExamPool[examId];
  if(!currentExam) return;

  runQuestions = shuffle(currentExam.questions).map(q => ({
    ...q,
    options: shuffle(q.options)
  }));

  userAnswers = {};
  currentIndex = 0;
  remainingSeconds = runQuestions.length * SECONDS_PER_QUESTION;
  viewMode = 'list';
  answerTimeSec = {};
  lastAnswerAt = Date.now();

  const p = getExamProgress(examId);
  p.status = 'in_progress';
  saveProgress();

  el('sidebar-title').textContent = currentExam.title + ' — ' + currentExam.level;
  el('exit-exam-btn').style.display = 'inline-flex';
  el('btn-toggle-view').style.display = 'inline-flex';
  el('total-num').textContent = runQuestions.length;
  el('total-num-m').textContent = runQuestions.length;
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

function toggleView(){
  viewMode = viewMode === 'single' ? 'list' : 'single';
  if(viewMode === 'list'){
    el('single-view').style.display = 'none';
    el('list-view').style.display = 'block';
    el('btn-toggle-view').innerHTML = '<span class="material-symbols-outlined">view_agenda</span> Xem từng câu';
    renderListView();
  }else{
    el('single-view').style.display = 'block';
    el('list-view').style.display = 'none';
    el('btn-toggle-view').innerHTML = '<span class="material-symbols-outlined">view_list</span> Xem danh sách câu hỏi';
    renderQuestion();
  }
}
el('btn-toggle-view').addEventListener('click', toggleView);

function renderListView(){
  const wrap = el('list-view');
  wrap.innerHTML = '';
  runQuestions.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'q-card list-item';
    card.id = 'list-q-' + i;

    let optsHtml = '';
    q.options.forEach(opt => {
      const picked = userAnswers[i] === opt.id;
      optsHtml +=
        '<label class="option' + (picked ? ' selected' : '') + '">' +
          '<input type="radio" name="opt-list-' + i + '" value="' + opt.id + '" ' + (picked ? 'checked' : '') + '>' +
          '<span class="opt-id">' + opt.id + '.</span><span>' + opt.text + '</span>' +
        '</label>';
    });

    card.innerHTML =
      '<div class="q-meta">Câu ' + (i + 1) + '/' + runQuestions.length + '</div>' +
      '<p class="q-text">' + q.question + '</p>' +
      '<div class="options">' + optsHtml + '</div>';

    card.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        userAnswers[i] = e.target.value;
        recordAnswerTiming(i);
        card.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
        e.target.closest('.option').classList.add('selected');
        updateProgress();
      });
    });

    wrap.appendChild(card);
  });
}

function buildNavGrid(){
  ['nav-grid', 'nav-grid-m'].forEach(gridId => {
    const grid = el(gridId);
    grid.innerHTML = '';
    runQuestions.forEach((q, i) => {
      const dot = document.createElement('div');
      dot.className = 'nav-dot';
      dot.textContent = i + 1;
      dot.addEventListener('click', () => {
        if(viewMode === 'list'){
          const target = el('list-q-' + i);
          if(target) target.scrollIntoView({ behavior: 'auto', block: 'center' });
        }else{
          currentIndex = i;
          renderQuestion();
        }
      });
      grid.appendChild(dot);
    });
  });
}

function startTimer(){
  updateTimerDisplay();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateTimerDisplay();
    if(remainingSeconds <= 0){
      clearInterval(timerInterval);
      showAlert('⏰ Hết giờ! Bài thi sẽ được tự động nộp.').then(() => finishExam());
    }
  }, 1000);
}
function updateTimerDisplay(){
  const m = Math.floor(remainingSeconds / 60).toString().padStart(2,'0');
  const s = (remainingSeconds % 60).toString().padStart(2,'0');
  el('timer').innerHTML = '<span class="material-symbols-outlined">timer</span> ' + m + ':' + s;
  el('timer').style.background = remainingSeconds <= 30 ? '#fad2cf' : 'var(--red-light)';
}

function renderQuestion(){
  const q = runQuestions[currentIndex];
  el('cur-num-m').textContent = currentIndex + 1;
  el('q-meta').textContent = '';
  el('q-text').innerHTML = q.question;

  const optsWrap = el('q-options');
  optsWrap.innerHTML = '';
  q.options.forEach(opt => {
    const picked = userAnswers[currentIndex] === opt.id;
    const div = document.createElement('label');
    div.className = 'option' + (picked ? ' selected' : '');
    div.innerHTML =
      '<input type="radio" name="opt" value="' + opt.id + '" ' + (picked ? 'checked' : '') + '>' +
      '<span class="opt-id">' + opt.id + '.</span><span>' + opt.text + '</span>';
    div.querySelector('input').addEventListener('change', () => {
      userAnswers[currentIndex] = opt.id;
      recordAnswerTiming(currentIndex);
      renderQuestion();
      updateProgress();
    });
    optsWrap.appendChild(div);
  });

  document.querySelectorAll('.nav-dot').forEach((dot, i) => {
    const realIndex = i % runQuestions.length;
    dot.classList.toggle('current', realIndex === currentIndex);
    dot.classList.toggle('answered', userAnswers[realIndex] !== undefined);
  });

  el('btn-prev').disabled = currentIndex === 0;
  const isLast = currentIndex === runQuestions.length - 1;
  el('btn-next').style.display = isLast ? 'none' : 'inline-flex';

  if(isLast){
    const hasUnanswered = Object.keys(userAnswers).length < runQuestions.length;
    el('btn-jump-unanswered').style.display = hasUnanswered ? 'inline-flex' : 'none';
    el('btn-submit-inline').style.display = hasUnanswered ? 'none' : 'inline-flex';
  }else{
    el('btn-jump-unanswered').style.display = 'none';
    el('btn-submit-inline').style.display = 'none';
  }

  updateProgress();
}

el('btn-jump-unanswered').addEventListener('click', () => {
  const idx = runQuestions.findIndex((q, i) => userAnswers[i] === undefined);
  if(idx !== -1){ currentIndex = idx; renderQuestion(); }
});
el('btn-submit-inline').addEventListener('click', () => el('btn-submit').click());

function updateProgress(){
  const answered = Object.keys(userAnswers).length;
  const pct = (answered / runQuestions.length * 100) + '%';
  el('answered-count').textContent = 'Đã làm: ' + answered + '/' + runQuestions.length;
  el('answered-count-m').textContent = 'Đã làm: ' + answered + '/' + runQuestions.length;
  el('progress-fill').style.width = pct;
  el('progress-fill-m').style.width = pct;
  document.querySelectorAll('.nav-dot').forEach((dot, i) => {
    const realIndex = i % runQuestions.length;
    dot.classList.toggle('answered', userAnswers[realIndex] !== undefined);
  });
}

el('btn-prev').addEventListener('click', () => { if(currentIndex > 0){ currentIndex--; renderQuestion(); } });
el('btn-next').addEventListener('click', () => { if(currentIndex < runQuestions.length - 1){ currentIndex++; renderQuestion(); } });
el('btn-submit').addEventListener('click', () => {
  const answered = Object.keys(userAnswers).length;
  const unanswered = runQuestions.length - answered;
  const msg = unanswered > 0
    ? 'Bạn còn ' + unanswered + ' câu chưa làm. Bạn có chắc chắn muốn nộp bài?'
    : 'Bạn có chắc chắn muốn nộp bài?';
  showConfirm(msg, 'Nộp bài', 'Huỷ').then(ok => { if(ok) finishExam(); });
});
el('exit-exam-btn').addEventListener('click', () => {
  showConfirm('Thoát đề đang làm? Tiến độ hiện tại sẽ không được lưu.', 'Thoát đề', 'Huỷ').then(ok => {
    if(!ok) return;
    clearInterval(timerInterval);
    el('timer').style.display = 'none';
    el('exit-exam-btn').style.display = 'none';
    el('btn-submit').style.display = 'none';
    el('btn-toggle-view').style.display = 'none';
    document.body.classList.remove('exam-mode');
    showScreen('screen-exam-list');
    renderExamList();
  });
});

function buildReviewCard(displayIndex, detail){
  const card = document.createElement('div');
  card.className = 'review-card ' + detail.status;
  card.dataset.status = detail.status;
  const badgeIcon = detail.status === 'correct' ? 'check_circle' : detail.status === 'wrong' ? 'cancel' : 'radio_button_unchecked';
  const badgeText = detail.status === 'correct' ? 'Đúng' : detail.status === 'wrong' ? 'Sai' : 'Bỏ trống';

  let optionsHtml = '';
  (detail.options || []).forEach(opt => {
    let cls = '';
    if(opt.id === detail.correctAnswer) cls = 'is-correct';
    else if(opt.id === detail.userPick) cls = 'is-wrong-pick';
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

function renderReviewCards(details){
  lastReviewDetails = details;
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

function paintResultSummary(correct, wrong, skip, total, pct){
  el('score-ring').style.setProperty('--pct', pct);
  el('result-pct').textContent = pct + '%';
  el('result-frac').textContent = correct + '/' + total;
  el('stat-correct').innerHTML = '<span class="material-symbols-outlined">check_circle</span> Đúng: ' + correct;
  el('stat-wrong').innerHTML = '<span class="material-symbols-outlined">cancel</span> Sai: ' + wrong;
  el('stat-skip').innerHTML = '<span class="material-symbols-outlined">radio_button_unchecked</span> Bỏ trống: ' + skip;

  let msg, icon;
  if(pct >= 90){ msg = 'Xuất sắc! Bạn nắm rất chắc từ loại.'; icon = 'workspace_premium'; }
  else if(pct >= 70){ msg = 'Khá tốt! Cố gắng thêm một chút nữa.'; icon = 'thumb_up'; }
  else if(pct >= 50){ msg = 'Trung bình. Cần ôn lại các quy tắc hậu tố.'; icon = 'sentiment_neutral'; }
  else { msg = 'Cần luyện tập thêm nhiều hơn.'; icon = 'auto_stories'; }
  el('result-msg').innerHTML = '<span class="material-symbols-outlined">' + icon + '</span> ' + msg;
}

function finishExam(){
  clearInterval(timerInterval);
  el('timer').style.display = 'none';
  el('exit-exam-btn').style.display = 'none';
  el('btn-submit').style.display = 'none';
  el('btn-toggle-view').style.display = 'none';
  document.body.classList.remove('exam-mode');

  let correct = 0, wrong = 0, skip = 0;
  const details = [];

  runQuestions.forEach((q, i) => {
    const userPick = userAnswers[i];
    const category = ANSWER_TO_CATEGORY[q.correctAnswer];
    if(category && progress.categoryStats[category]){
      progress.categoryStats[category].total++;
    }

    let status;
    if(userPick === undefined){ status = 'skip'; skip++; }
    else if(userPick === q.correctAnswer){
      status = 'correct'; correct++;
      if(category && progress.categoryStats[category]) progress.categoryStats[category].correct++;
    }
    else { status = 'wrong'; wrong++; }

    if(!progress.wordStats[q.word]){
      progress.wordStats[q.word] = { word: q.word, meaning: q.meaning, correct: 0, wrong: 0, skip: 0 };
    }
    progress.wordStats[q.word][status === 'correct' ? 'correct' : status === 'wrong' ? 'wrong' : 'skip']++;

    if(status !== 'skip' && typeof answerTimeSec[i] === 'number'){
      const bucketKey = getTimeBucketKey(answerTimeSec[i]);
      progress.timeStats[bucketKey] = (progress.timeStats[bucketKey] || 0) + 1;
    }

    details.push({
      question: q.question, word: q.word, meaning: q.meaning, options: q.options,
      correctAnswer: q.correctAnswer, explanation: q.explanation, userPick, status,
    });
  });

  const total = runQuestions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  const p = getExamProgress(currentExam.id);
  p.attempts++;
  p.status = 'done';
  p.lastCorrect = correct;
  p.lastTotal = total;
  p.lastPercent = pct;
  p.bestPercent = Math.max(p.bestPercent || 0, pct);

  progress.history.unshift({
    examId: currentExam.id,
    examTitle: currentExam.title,
    level: currentExam.level,
    date: new Date().toISOString(),
    correct, wrong, skip, total, percent: pct,
    details,
  });
  if(progress.history.length > HISTORY_CAP) progress.history.length = HISTORY_CAP;

  saveProgress();

  paintResultSummary(correct, wrong, skip, total, pct);
  renderReviewCards(details);

  resultViewSource = 'exam';
  el('result-title').style.display = 'none';
  el('btn-retry').style.display = 'inline-flex';
  el('btn-redo-wrong').style.display = (wrong + skip) > 0 ? 'inline-flex' : 'none';
  el('btn-back-list').style.display = 'inline-flex';
  el('btn-back-history').style.display = 'none';

  showScreen('screen-result');
}

function viewHistoryEntry(idx){
  const entry = progress.history[idx];
  if(!entry) return;
  if(!entry.details){
    showAlert('Lượt làm bài này được lưu trước khi có tính năng xem chi tiết, nên không có dữ liệu từng câu.');
    return;
  }

  currentExam = EXAMS.find(e => e.id === entry.examId) || null;
  resultViewSource = 'history';

  paintResultSummary(entry.correct, entry.wrong, entry.skip, entry.total, entry.percent);
  renderReviewCards(entry.details);

  el('result-title').style.display = 'block';
  el('result-title').textContent = entry.examTitle + ' · ' + entry.level + ' · ' + formatDate(entry.date);
  el('btn-retry').style.display = currentExam ? 'inline-flex' : 'none';
  el('btn-redo-wrong').style.display = (entry.wrong + entry.skip) > 0 ? 'inline-flex' : 'none';
  el('btn-back-list').style.display = 'none';
  el('btn-back-history').style.display = 'inline-flex';

  showTab('exams');
  showScreen('screen-result');
}

function applyReviewFilter(filter){
  document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));
  const cards = document.querySelectorAll('#review-list .review-card');
  let visibleCount = 0;
  cards.forEach(card => {
    const show = filter === 'all' || card.dataset.status === filter;
    card.style.display = show ? '' : 'none';
    if(show) visibleCount++;
  });
  el('review-empty').style.display = visibleCount === 0 ? 'block' : 'none';
}
document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => applyReviewFilter(btn.dataset.filter));
});

el('btn-retry').addEventListener('click', () => startExam(currentExam.id));
el('btn-back-list').addEventListener('click', () => { showScreen('screen-exam-list'); renderExamList(); });
el('btn-back-history').addEventListener('click', () => { showTab('stats'); showStatScreen('stat-detail-history'); });

el('btn-redo-wrong').addEventListener('click', () => {
  const wrongOnes = lastReviewDetails.filter(d => d.status !== 'correct');
  if(wrongOnes.length === 0) return;
  customExamPool['redo-wrong'] = {
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

el('btn-practice-worst-words').addEventListener('click', async () => {
  const words = Object.values(progress.wordStats || {}).filter(w => w.wrong > 0).map(w => w.word);
  if(words.length === 0){
    await showAlert('Bạn chưa có từ nào sai cả — cứ tiếp tục phát huy!');
    return;
  }
  const pool = ALL_QUESTIONS.filter(q => words.includes(q.word));
  const picked = shuffle(pool).slice(0, Math.min(20, pool.length));
  customExamPool['practice-worst-words'] = {
    id: 'practice-worst-words',
    title: 'Ôn tập từ sai nhiều nhất',
    level: 'Ôn tập điểm yếu',
    questions: picked,
  };
  showTab('exams');
  startExam('practice-worst-words');
});

el('btn-practice-weak-suffix').addEventListener('click', async () => {
  if(WEAK_SUFFIXES.length === 0){
    await showAlert('Bạn chưa có hậu tố yếu nào cần ôn — hãy làm thêm vài đề trước!');
    return;
  }
  const pool = ALL_QUESTIONS.filter(q => WEAK_SUFFIXES.includes(getSuffix(q.word)));
  const picked = shuffle(pool).slice(0, Math.min(20, pool.length));
  customExamPool['practice-weak-suffix'] = {
    id: 'practice-weak-suffix',
    title: 'Ôn tập điểm yếu (hậu tố)',
    level: 'Ôn tập điểm yếu',
    questions: picked,
  };
  showTab('exams');
  startExam('practice-weak-suffix');
});

/* ---------- stats tab ---------- */
function renderStats(){
  const examIds = EXAMS.map(e => e.id);
  let completed = 0, totalAttempts = 0, totalAnswered = 0, totalCorrect = 0;

  const tbody = el('exam-table-body');
  tbody.innerHTML = '';
  let lastLevel = null;
  EXAMS.forEach(exam => {
    const p = getExamProgress(exam.id);
    if(p.status === 'done') completed++;
    totalAttempts += p.attempts;
    if(p.attempts > 0){
      totalAnswered += p.lastTotal;
      totalCorrect += p.lastCorrect;
    }

    if(exam.level !== lastLevel){
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
    const c = progress.categoryStats[cat] || {correct:0,total:0};
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

/* ---------- stats: trang chủ 4 thẻ -> drill-down chi tiết ---------- */
function showStatScreen(id){
  document.querySelectorAll('#tab-stats .screen-stat').forEach(s => s.classList.remove('active'));
  el(id).classList.add('active');
  window.scrollTo(0, 0);
}

function renderStatsHome(){
  const examIds = EXAMS.map(e => e.id);
  const completedExams = EXAMS.filter(e => getExamProgress(e.id).status === 'done').length;
  const wrongWordsCount = Object.values(progress.wordStats || {}).filter(w => w.wrong > 0).length;
  const historyCount = (progress.history || []).length;

  const familyCount = Object.keys(buildFamilyGroups()).length;
  const answeredWithTime = TIME_BUCKETS.reduce((s, b) => s + (progress.timeStats[b.key] || 0), 0);

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

document.querySelectorAll('#tab-stats .stat-back').forEach(btn => {
  btn.addEventListener('click', () => showStatScreen('stat-home'));
});

function formatDate(iso){
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderHistory(){
  const history = progress.history || [];
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
    if(h.details) row.querySelector('.btn-history-detail').addEventListener('click', () => viewHistoryEntry(idx));
    tbody.appendChild(row);
  });

  el('history-table').style.display = shown.length > 0 ? 'table' : 'none';
  el('history-empty').style.display = shown.length > 0 ? 'none' : 'block';
  if(history.length > shown.length){
    el('history-more').style.display = 'block';
    el('history-more').textContent = 'Hiển thị 30 lượt gần nhất trong tổng số ' + history.length + ' lượt.';
  }else{
    el('history-more').style.display = 'none';
  }
}

function renderWorstWords(){
  const words = Object.values(progress.wordStats || {}).filter(w => w.wrong > 0);
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

/* ---------- thống kê theo hậu tố ---------- */
function buildSuffixGroups(){
  const groups = {};
  Object.values(progress.wordStats || {}).forEach(w => {
    const suf = getSuffix(w.word);
    if(!suf) return;
    if(!groups[suf]) groups[suf] = { correct: 0, wrong: 0 };
    groups[suf].correct += w.correct;
    groups[suf].wrong += w.wrong;
  });
  return groups;
}

function renderSuffixStats(){
  const groups = buildSuffixGroups();
  const rows = Object.keys(groups).map(suf => {
    const g = groups[suf];
    const total = g.correct + g.wrong;
    return { suf, total, pct: total > 0 ? Math.round(g.correct / total * 100) : 0 };
  }).filter(r => r.total > 0);

  const weak = rows.filter(r => r.pct < 50).sort((a, b) => a.pct - b.pct);
  const improve = rows.filter(r => r.pct >= 50 && r.pct < 80).sort((a, b) => a.pct - b.pct);
  const mastered = rows.filter(r => r.pct >= 80).sort((a, b) => b.pct - a.pct);
  WEAK_SUFFIXES = weak.concat(improve).map(r => r.suf);

  const wrap = el('suffix-tiers');
  wrap.innerHTML = '';

  function buildTier(label, icon, cls, items, showPct){
    if(items.length === 0) return;
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
  el('btn-practice-weak-suffix').disabled = WEAK_SUFFIXES.length === 0;
}

/* ---------- thống kê accuracy theo level ---------- */
function buildLevelAccuracy(){
  const LEVEL_LABELS = [
    "Level 1 · Cơ bản",
    "Level 2 · Theo hậu tố",
    "Level 3 · Từ dễ nhầm",
    "Level 4 · TOEIC thực tế",
  ];
  const groups = {};
  LEVEL_LABELS.forEach(l => { groups[l] = { correct: 0, wrong: 0 }; });
  Object.values(progress.wordStats || {}).forEach(w => {
    const level = WORD_LEVEL_MAP[w.word];
    if(!level || !groups[level]) return;
    groups[level].correct += w.correct;
    groups[level].wrong += w.wrong;
  });
  return LEVEL_LABELS.map(level => {
    const g = groups[level];
    const total = g.correct + g.wrong;
    return { level, total, pct: total > 0 ? Math.round(g.correct / total * 100) : 0 };
  });
}

function renderLevelAccuracy(){
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

/* ---------- thống kê theo Word Family ---------- */
function buildFamilyGroups(){
  const groups = {};
  Object.values(progress.wordStats || {}).forEach(w => {
    const family = WORD_FAMILY_MAP[w.word] || w.word;
    if(!groups[family]) groups[family] = [];
    groups[family].push(w);
  });
  // chỉ giữ các nhóm có từ 2 thành viên trở lên (mới thật sự là "word family")
  Object.keys(groups).forEach(family => {
    if(groups[family].length < 2) delete groups[family];
  });
  return groups;
}

function renderFamilyStats(){
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

/* ---------- thống kê theo thời gian trả lời ---------- */
function renderTimeStats(){
  const wrap = el('time-stats');
  wrap.innerHTML = '';
  const total = TIME_BUCKETS.reduce((s, b) => s + (progress.timeStats[b.key] || 0), 0);

  TIME_BUCKETS.forEach(b => {
    const count = progress.timeStats[b.key] || 0;
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

/* ---------- kế hoạch tiếp theo ---------- */
function renderStudyPlan(){
  const wrap = el('study-plan-content');
  const levelNames = ["Level 1", "Level 2", "Level 3", "Level 4"];
  const levelStatus = levelNames.map(name => {
    const exams = EXAMS.filter(e => e.level.startsWith(name));
    const done = exams.length > 0 && exams.every(e => (getExamProgress(e.id).bestPercent || 0) >= 90);
    const worstPct = exams.length > 0 ? Math.min(...exams.map(e => getExamProgress(e.id).bestPercent || 0)) : 0;
    return { name, exams, done, worstPct };
  });

  let html = '';
  let blockedAt = null;
  levelNames.forEach((name, i) => {
    const lvl = levelStatus[i];
    if(lvl.exams.length === 0) return;
    const icon = lvl.done ? 'check_circle' : 'radio_button_unchecked';
    const colorClass = lvl.done ? 'correct' : 'skip';
    html += '<div class="plan-step ' + colorClass + '">' +
      '<span class="material-symbols-outlined">' + icon + '</span>' +
      '<div><b>' + lvl.name + '</b> — ' + (lvl.done ? 'Đã đạt ≥90% tất cả đề' : 'Điểm cao nhất thấp nhất hiện tại: ' + lvl.worstPct + '%') + '</div>' +
    '</div>';
    if(!lvl.done && blockedAt === null) blockedAt = i;
  });

  let recommendation;
  if(blockedAt === null){
    recommendation = '🎉 Bạn đã đạt ≥90% ở tất cả các Level hiện có! Đủ nền tảng để chuyển sang học Word Form TOEIC.';
  }else{
    const lvl = levelStatus[blockedAt];
    const notDone = lvl.exams.filter(e => (getExamProgress(e.id).bestPercent || 0) < 90).map(e => e.title);
    recommendation = 'Hãy hoàn thành nốt ' + lvl.name + ', đạt ≥90% ở: ' + notDone.join(', ') +
      ' rồi mới chuyển sang ' + (levelNames[blockedAt + 1] || 'cấp tiếp theo') + '.';
  }

  wrap.innerHTML = html + '<div class="plan-recommend">' + recommendation + '</div>';
}

function buildReportText(){
  const examIds = EXAMS.map(e => e.id);
  let completed = 0, totalAttempts = 0, totalAnswered = 0, totalCorrect = 0;
  const lines = [];

  lines.push('=================================================');
  lines.push('   BÁO CÁO THỐNG KÊ - NHẬN DIỆN TỪ LOẠI TOEIC');
  lines.push('=================================================');
  lines.push('Thời điểm xuất: ' + new Date().toLocaleString('vi-VN'));
  lines.push('');

  EXAMS.forEach(exam => {
    const p = getExamProgress(exam.id);
    if(p.status === 'done') completed++;
    totalAttempts += p.attempts;
    if(p.attempts > 0){
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
    const c = progress.categoryStats[cat] || {correct:0,total:0};
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
  if(suffixRows.length === 0){
    lines.push('Chưa có dữ liệu.');
  }else{
    const weak = suffixRows.filter(r => r.pct < 50).sort((a, b) => a.pct - b.pct);
    const improve = suffixRows.filter(r => r.pct >= 50 && r.pct < 80).sort((a, b) => a.pct - b.pct);
    const mastered = suffixRows.filter(r => r.pct >= 80).sort((a, b) => b.pct - a.pct);
    lines.push('🔥 Cần ôn:');
    weak.forEach(r => lines.push('  ' + r.suf + ' (' + r.pct + '%)'));
    if(weak.length === 0) lines.push('  (không có)');
    lines.push('🟡 Cần cải thiện:');
    improve.forEach(r => lines.push('  ' + r.suf + ' (' + r.pct + '%)'));
    if(improve.length === 0) lines.push('  (không có)');
    lines.push('🟢 Đã thành thạo:');
    mastered.forEach(r => lines.push('  ' + r.suf));
    if(mastered.length === 0) lines.push('  (không có)');
  }
  lines.push('');

  lines.push('--- THEO WORD FAMILY ---');
  const familyGroups = buildFamilyGroups();
  const familyNames = Object.keys(familyGroups);
  if(familyNames.length === 0){
    lines.push('Chưa có dữ liệu (cần làm thêm các câu có từ cùng gốc).');
  }else{
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
  const timeTotal = TIME_BUCKETS.reduce((s, b) => s + (progress.timeStats[b.key] || 0), 0);
  if(timeTotal === 0){
    lines.push('Chưa có dữ liệu.');
  }else{
    TIME_BUCKETS.forEach(b => lines.push(b.label + ' : ' + (progress.timeStats[b.key] || 0) + ' câu'));
  }
  lines.push('');

  lines.push('--- THEO TỪNG ĐỀ ---');
  EXAMS.forEach(exam => {
    const p = getExamProgress(exam.id);
    const statusText = p.status === 'done' ? 'Hoàn thành' : p.status === 'in_progress' ? 'Đang làm' : 'Chưa làm';
    const scoreText = p.attempts > 0 ? p.lastCorrect + '/' + p.lastTotal + ' (' + p.lastPercent + '%), cao nhất ' + p.bestPercent + '%' : 'chưa làm';
    lines.push(exam.title + ' [' + exam.level + '] - ' + statusText + ' - Lượt làm: ' + p.attempts + ' - Điểm: ' + scoreText);
  });
  lines.push('');

  lines.push('--- TỪ SAI NHIỀU NHẤT (top 15) ---');
  const words = Object.values(progress.wordStats || {}).filter(w => w.wrong > 0);
  words.sort((a, b) => b.wrong - a.wrong);
  if(words.length === 0){
    lines.push('Chưa có dữ liệu.');
  }else{
    words.slice(0, 15).forEach((w, i) => {
      const total = w.correct + w.wrong;
      const pct = total > 0 ? Math.round(w.correct / total * 100) : 0;
      lines.push((i + 1) + '. ' + w.word + ' (' + (w.meaning || '—') + ') - Sai: ' + w.wrong + ', Đúng: ' + w.correct + ', Tỉ lệ đúng: ' + pct + '%');
    });
    if(words.length > 15) lines.push('... và ' + (words.length - 15) + ' từ khác (xem đầy đủ trong tab Thống kê).');
  }
  lines.push('');

  lines.push('--- LỊCH SỬ LÀM BÀI (20 lượt gần nhất) ---');
  const history = progress.history || [];
  if(history.length === 0){
    lines.push('Chưa có lượt làm bài nào.');
  }else{
    history.slice(0, 20).forEach((h, i) => {
      lines.push((i + 1) + '. ' + formatDate(h.date) + ' - ' + h.examTitle + ' [' + h.level + '] - ' +
        h.correct + '/' + h.total + ' (' + h.percent + '%) - Đúng: ' + h.correct + ', Sai: ' + h.wrong + ', Bỏ trống: ' + h.skip);
    });
    if(history.length > 20) lines.push('... và ' + (history.length - 20) + ' lượt khác (xem đầy đủ trong tab Thống kê).');
  }
  lines.push('');

  lines.push('--- KẾ HOẠCH TIẾP THEO ---');
  const levelNamesReport = ["Level 1", "Level 2", "Level 3", "Level 4"];
  let blockedAtReport = null;
  levelNamesReport.forEach((name, i) => {
    const exams = EXAMS.filter(e => e.level.startsWith(name));
    if(exams.length === 0) return;
    const done = exams.every(e => (getExamProgress(e.id).bestPercent || 0) >= 90);
    const worstPct = Math.min(...exams.map(e => getExamProgress(e.id).bestPercent || 0));
    lines.push(name + ': ' + (done ? 'Đã đạt ≥90% tất cả đề' : 'Chưa đạt (điểm cao nhất thấp nhất: ' + worstPct + '%)'));
    if(!done && blockedAtReport === null) blockedAtReport = i;
  });
  if(blockedAtReport === null){
    lines.push('=> Bạn đã đạt ≥90% ở tất cả các Level hiện có. Đủ nền tảng để chuyển sang học Word Form TOEIC.');
  }else{
    const exams = EXAMS.filter(e => e.level.startsWith(levelNamesReport[blockedAtReport]));
    const notDone = exams.filter(e => (getExamProgress(e.id).bestPercent || 0) < 90).map(e => e.title);
    lines.push('=> Hãy hoàn thành nốt ' + levelNamesReport[blockedAtReport] + ', đạt ≥90% ở: ' + notDone.join(', ') +
      ' rồi mới chuyển sang ' + (levelNamesReport[blockedAtReport + 1] || 'cấp tiếp theo') + '.');
  }
  lines.push('');
  lines.push('=================================================');

  return lines.join('\n');
}

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

loadQuestions();
