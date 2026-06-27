# Part of Speech Recognition (Nhận diện từ loại)

## Mục tiêu

Giúp người học hình thành phản xạ nhận diện nhanh 4 từ loại cơ bản trong TOEIC:

* A. Danh từ (Noun)
* B. Động từ (Verb)
* C. Tính từ (Adjective)
* D. Trạng từ (Adverb)

Sau khi hoàn thành module này, người học có thể xác định từ loại trong khoảng 1 giây, tạo nền tảng cho Word Form và Part 5 TOEIC.

---

# Quy mô dữ liệu

Khuyến nghị:

* 400–500 câu

Chia thành 4 level:

| Level   |  Số câu | Mục tiêu                   |
| ------- | ------: | -------------------------- |
| Level 1 |     100 | Nhận diện 4 từ loại cơ bản |
| Level 2 |     100 | Nhận diện theo hậu tố      |
| Level 3 |     100 | Phân biệt các từ dễ nhầm   |
| Level 4 | 100–200 | Từ vựng TOEIC thực tế      |

---

# Cấu trúc thư mục

```text
data/
└── word_form/
    └── part_of_speech.json
```

---

# Schema dữ liệu

```json
{
  "id": "pos_0001",
  "word": "development",
  "meaning": "sự phát triển",
  "question": "Từ \"development\" thuộc từ loại nào?",
  "options": [
    {
      "id": "A",
      "text": "Danh từ (Noun)"
    },
    {
      "id": "B",
      "text": "Động từ (Verb)"
    },
    {
      "id": "C",
      "text": "Tính từ (Adjective)"
    },
    {
      "id": "D",
      "text": "Trạng từ (Adverb)"
    }
  ],
  "correctAnswer": "A",
  "explanation": {
    "correct": "development là Danh từ.",
    "reason": "Hậu tố -ment thường tạo thành danh từ.",
    "example": "development = sự phát triển"
  }
}
```

---

# Quy tắc tạo dữ liệu

## Mỗi câu chỉ có một từ.

Ví dụ:

* development
* approve
* effective
* carefully

Không tạo câu hoàn chỉnh.

---

## Luôn có đủ 4 đáp án

A. Danh từ (Noun)

B. Động từ (Verb)

C. Tính từ (Adjective)

D. Trạng từ (Adverb)

Thứ tự đáp án luôn cố định.

---

## Luôn có giải thích

Mỗi câu phải có:

* đáp án đúng
* lý do
* ví dụ ngắn

Ví dụ:

```text
Đúng:
development là Danh từ.

Lý do:
Hậu tố -ment thường tạo thành danh từ.

Ví dụ:
development = sự phát triển
```

---

# Quy tắc chọn từ

Ưu tiên:

* Từ xuất hiện trong TOEIC
* Academic English
* Business English
* CEFR A2–B2

Không ưu tiên:

* Từ quá hiếm
* Từ cổ
* Tiếng lóng
* Thuật ngữ chuyên ngành khó

---

# Phân bố dữ liệu

## 25% Danh từ

Ví dụ:

* development
* decision
* agreement
* requirement

---

## 25% Động từ

Ví dụ:

* approve
* decide
* improve
* employ

---

## 25% Tính từ

Ví dụ:

* successful
* effective
* available
* financial

---

## 25% Trạng từ

Ví dụ:

* successfully
* carefully
* efficiently
* quickly

---

# Hậu tố cần xuất hiện

## Danh từ

* -tion
* -sion
* -ment
* -ness
* -ity
* -ance
* -ence
* -er
* -or
* -ee

---

## Tính từ

* -able
* -ible
* -al
* -ful
* -less
* -ive
* -ous
* -ic
* -ed
* -ing

---

## Trạng từ

* -ly

---

## Động từ

Ưu tiên động từ gốc thường gặp:

* approve
* decide
* employ
* require
* improve
* develop
* succeed
* organize
* inform
* recommend

---

# Tiêu chuẩn chất lượng

* Không có nhiều hơn một đáp án đúng.
* Nghĩa tiếng Việt ngắn gọn, chính xác.
* Giải thích đơn giản, dễ hiểu.
* Từ được viết đúng chính tả.
* Không trùng lặp dữ liệu.
* Ưu tiên các từ xuất hiện trong TOEIC.

---

# Mục tiêu đầu ra

Sau khi hoàn thành khoảng 500 câu, người học có thể:

* Nhận diện đúng 4 từ loại trong dưới 1 giây.
* Ghi nhớ các hậu tố phổ biến.
* Làm nền tảng cho Word Family.
* Tăng tốc và độ chính xác khi làm Word Form trong TOEIC Part 5.
