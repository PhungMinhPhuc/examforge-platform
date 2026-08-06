-- 002 — Nội dung câu hỏi chuyển từ chuỗi LaTeX sang cây tài liệu jsonb.
--
-- Xem docs/chuan-hoa-du-lieu.md. Tóm tắt lý do: LaTeX đang đóng hai vai, vừa là
-- một định dạng nhập vừa là dạng lưu, nên mọi đầu ra phải đoán ngược từ chuỗi
-- trình bày. Cây tài liệu mang cấu trúc, mỗi định dạng chỉ còn một bộ đọc và
-- một bộ ghi.
--
-- CẢNH BÁO: bản này XÓA TOÀN BỘ DỮ LIỆU. Chỉ chạy được vì dữ liệu hiện tại là
-- dữ liệu mẫu. Sao lưu trước bằng pg_dump.
--
-- Chạy:  psql -U postgres -d db_project_2025.2 -f api/migrations/002_content_jsonb.sql

BEGIN;

-- 1 ── Dọn sạch dữ liệu -------------------------------------------------------
-- Phải xóa trước khi đổi kiểu: Postgres không cast được text bất kỳ sang jsonb.
-- CASCADE để không phải xếp thứ tự theo khóa ngoại; RESTART IDENTITY cho id về 1.

TRUNCATE TABLE
    accounts, teachers, students, classes, students_classes,
    questions, q_choice_details, q_truefalse_details, q_shortans_details,
    q_images, q_coding_details, q_coding_testcases,
    contests, contests_questions, contest_results, students_contests,
    class_contests, student_option_submissions,
    coding_assignments, coding_assignment_questions, coding_assignment_students,
    class_coding_assignments, student_coding_submissions,
    coding_submission_testcase_results
RESTART IDENTITY CASCADE;

-- 2 ── Cột nội dung: text -> jsonb --------------------------------------------
-- Chỉ những cột chứa văn xuôi CÓ ĐỊNH DẠNG. Cột chứa số, mã nguồn hay chuỗi
-- ngắn giữ nguyên text — xem bảng ở mục 9 của tài liệu.

ALTER TABLE questions
    ALTER COLUMN content  TYPE jsonb USING content::jsonb,
    ALTER COLUMN solution TYPE jsonb USING solution::jsonb;

ALTER TABLE q_choice_details
    ALTER COLUMN content TYPE jsonb USING content::jsonb;

ALTER TABLE q_truefalse_details
    ALTER COLUMN content      TYPE jsonb USING content::jsonb,
    ALTER COLUMN explaination TYPE jsonb USING explaination::jsonb;

-- q_shortans_details.content GIỮ text: đo trên 350 đáp án ngắn trong Sample/,
-- tất cả đều là số thuần ("8,7", "0,34"), không có công thức nào.

-- 3 ── Ràng buộc để cây không thể sai ngay từ CSDL -----------------------------
-- Rẻ và bắt được lỗi sớm hơn bộ kiểm tra ở tầng ứng dụng.

ALTER TABLE questions
    ADD CONSTRAINT questions_content_is_doc
        CHECK (content IS NULL OR content->>'type' = 'doc'),
    ADD CONSTRAINT questions_solution_is_doc
        CHECK (solution IS NULL OR solution->>'type' = 'doc');

ALTER TABLE q_choice_details
    ADD CONSTRAINT q_choice_content_is_doc
        CHECK (content IS NULL OR content->>'type' = 'doc');

ALTER TABLE q_truefalse_details
    ADD CONSTRAINT q_tf_content_is_doc
        CHECK (content IS NULL OR content->>'type' = 'doc'),
    ADD CONSTRAINT q_tf_explaination_is_doc
        CHECK (explaination IS NULL OR explaination->>'type' = 'doc');

-- Bất biến 6, mục 12: nhãn `side` trong cây phải khớp cột layout_type.
ALTER TABLE questions
    ADD CONSTRAINT questions_side_matches_layout CHECK (
        content IS NULL
        OR (COALESCE(layout_type, 'normal') = 'normal'
            AND COALESCE(content->>'side', 'center') = 'center')
        OR (layout_type LIKE 'immini%'
            AND content->>'side' IN ('left', 'right'))
    );

-- 4 ── q_images: đổi đơn vị kích thước ----------------------------------------
-- img_scale đang là hệ số `zoom` của trình duyệt, nên web, PDF và Word mỗi bên
-- ra một cỡ. Đổi thành TỈ LỆ so với bề rộng vùng chữ, số thực 0–1:
--     HTML  -> width: 45%
--     LaTeX -> width=0.45\textwidth
--     Word  -> Inches(0.45 × bề rộng vùng chữ)

ALTER TABLE q_images RENAME COLUMN img_scale TO width;

ALTER TABLE q_images
    ALTER COLUMN width TYPE numeric(4, 3),
    ALTER COLUMN width SET DEFAULT 0.45,
    ADD CONSTRAINT q_images_width_range
        CHECK (width IS NULL OR (width > 0 AND width <= 1));

-- img_type còn đúng hai giá trị. Không còn 'mathtype': công thức MathType nay
-- được dịch thành nút math trong cây, không sinh ảnh WMF nữa.
ALTER TABLE q_images
    ADD CONSTRAINT q_images_type CHECK (img_type IN ('tikz', 'graphic'));

-- 5 ── Chỉ mục cho tìm kiếm ---------------------------------------------------
-- Cột content thành jsonb nên `content ILIKE` ở questions.py:57 hết chạy.
-- Chỉ mục này đỡ cho cách thay thế: content::text ILIKE.
CREATE INDEX IF NOT EXISTS idx_questions_content_text
    ON questions USING gin (to_tsvector('simple', content::text));

COMMIT;
