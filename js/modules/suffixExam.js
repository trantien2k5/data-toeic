import { ANSWER_OPTIONS } from './constants.js';

const SUFFIX_FILE_URL = 'js/data/hau-to.txt';

// File hau-to.txt là text thuần, mỗi câu là 1 đoạn cách nhau bằng dòng trống:
//   Câu N
//   <word>
//   A. Danh từ
//   B. Động từ
//   C. Tính từ
//   D. Trạng từ
//   Đáp án: <A|B|C|D>
//   Giải thích: <lý do>
// Hàm này chuyển mỗi đoạn thành object câu hỏi cùng hình dạng mà quiz.js dùng
// cho bộ đề chính (question/options/correctAnswer/explanation/word).
export function parseSuffixFile(text) {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const word = lines[1];
      const answerLine = lines.find(l => l.startsWith('Đáp án'));
      const explanationLine = lines.find(l => l.startsWith('Giải thích'));
      if (!word || !answerLine) return null;

      const correctAnswer = answerLine.split(':')[1].trim();
      const reason = explanationLine ? explanationLine.split(':').slice(1).join(':').trim() : '';
      const correctOption = ANSWER_OPTIONS.find(o => o.id === correctAnswer);
      if (!correctOption) return null;

      return {
        word,
        meaning: '',
        question: 'Từ "' + word + '" thuộc từ loại nào?',
        options: ANSWER_OPTIONS,
        correctAnswer,
        explanation: {
          correct: word + ' là ' + correctOption.text + '.',
          reason,
          example: '',
        },
        family: word,
      };
    })
    .filter(Boolean);
}

// Tải + parse file hậu tố, dựng thành 1 đề độc lập (không thuộc 4 Level chính).
// Trả về null nếu file không tồn tại hoặc rỗng, để app vẫn chạy bình thường
// khi không có file bổ trợ này.
export async function loadSuffixExam() {
  try {
    const res = await fetch(SUFFIX_FILE_URL);
    if (!res.ok) return null;
    const text = await res.text();
    const questions = parseSuffixFile(text);
    if (questions.length === 0) return null;

    return {
      id: 'suffix-practice',
      title: 'Bài tập nhận diện từ loại',
      level: 'Bài tập bổ trợ · Hậu tố thường gặp',
      questions,
    };
  } catch (err) {
    return null;
  }
}
