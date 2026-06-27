export const DATA_URL = "js/data/nhan-dien-tu-loai-toiec.json";
export const QUESTIONS_PER_EXAM = 20;
export const SECONDS_PER_QUESTION = 60;
export const STORAGE_KEY = "toeicPosProgressV1";
export const HISTORY_CAP = 60;

export const CATEGORY_LABEL = { 
  N: "Danh từ", 
  V: "Động từ", 
  ADJ: "Tính từ", 
  ADV: "Trạng từ" 
};

export const ANSWER_TO_CATEGORY = {
  A: "N",
  B: "V",
  C: "ADJ",
  D: "ADV"
};

// Mọi câu hỏi dùng chung 4 đáp án này — không lặp lại trong file dữ liệu.
export const ANSWER_OPTIONS = [
  { id: "A", text: "Danh từ (Noun)" },
  { id: "B", text: "Động từ (Verb)" },
  { id: "C", text: "Tính từ (Adjective)" },
  { id: "D", text: "Trạng từ (Adverb)" },
];

// Chỉ có 30 mẫu giải thích hậu tố/quy tắc lặp lại trên toàn bộ 400 câu —
// file dữ liệu lưu index vào đây (trường "r") thay vì lặp lại cả câu chữ.
export const REASONS = [
  "Hậu tố '-sion' thường tạo thành danh từ.",
  "Hậu tố '-ment' thường tạo thành danh từ.",
  "Hậu tố '-tion' thường tạo thành danh từ.",
  "Hậu tố '-ness' thường tạo thành danh từ.",
  "Hậu tố '-ity' thường tạo thành danh từ.",
  "Hậu tố '-ance' thường tạo thành danh từ.",
  "Hậu tố '-ence' thường tạo thành danh từ.",
  "Hậu tố '-er' thường tạo thành danh từ.",
  "Hậu tố '-or' thường tạo thành danh từ.",
  "Hậu tố '-ee' thường tạo thành danh từ.",
  "Đây là động từ gốc, không có hậu tố đặc biệt, thường gặp trong TOEIC.",
  "Hậu tố '-ful' thường tạo thành tính từ.",
  "Hậu tố '-able' thường tạo thành tính từ.",
  "Hậu tố '-al' thường tạo thành tính từ.",
  "Hậu tố '-ible' thường tạo thành tính từ.",
  "Hậu tố '-less' thường tạo thành tính từ.",
  "Hậu tố '-ive' thường tạo thành tính từ.",
  "Hậu tố '-ous' thường tạo thành tính từ.",
  "Hậu tố '-ic' thường tạo thành tính từ.",
  "Hậu tố '-ed' thường tạo thành tính từ.",
  "Hậu tố '-ing' thường tạo thành tính từ.",
  "Hậu tố '-ly' thường tạo thành trạng từ.",
  "Hậu tố '-th' thường tạo thành danh từ.",
  "Hậu tố '-dom' thường tạo thành danh từ.",
  "Hậu tố '-ship' thường tạo thành danh từ.",
  "Hậu tố '-ify' thường tạo thành động từ.",
  "Hậu tố '-ate' thường tạo thành động từ.",
  "Hậu tố '-en' thường tạo thành động từ.",
  "Đây là tính từ, cần ghi nhớ vì không theo hậu tố quen thuộc.",
  "Đây là danh từ gốc, thường gặp trong văn cảnh kinh doanh/TOEIC.",
];

export const ICON = {
  done: 'check_circle', 
  in_progress: 'pending', 
  not_started: 'radio_button_unchecked',
  start: 'rocket_launch', 
  retry: 'refresh'
};

export const SUFFIX_LIST = [
  'tion', 'sion', 'ment', 'ness', 'ity', 'ance', 'ence', 'hood', 'ship', 'dom',
  'able', 'ible', 'ful', 'less', 'ive', 'ous', 'ic', 'ed', 'ing', 'al', 'er', 'or', 'ee', 'ly',
].sort((a, b) => b.length - a.length);

export const TIME_BUCKETS = [
  { key: '<1s', label: '< 1 giây', test: (s) => s < 1 },
  { key: '1-2s', label: '1 - 2 giây', test: (s) => s >= 1 && s < 2 },
  { key: '2-3s', label: '2 - 3 giây', test: (s) => s >= 2 && s < 3 },
  { key: '3-5s', label: '3 - 5 giây', test: (s) => s >= 3 && s < 5 },
  { key: '>5s', label: '> 5 giây', test: (s) => s >= 5 },
];
