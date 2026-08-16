# Tổng quan dự án: Hệ thống CSDL Ngân hàng Câu hỏi

Dự án này là một hệ thống quản lý cơ sở dữ liệu ngân hàng câu hỏi, cho phép xử lý, lưu trữ, và trích xuất câu hỏi từ nhiều định dạng khác nhau (DOCX, JSON, v.v.) và cung cấp giao diện người dùng thông qua ứng dụng web.

## Kiến trúc dự án (Architecture)

Dự án được chia thành 3 phần chính:

1. **Frontend (Giao diện người dùng):** 
   - Sử dụng framework **Next.js 16** (React 19) kết hợp với **TypeScript**.
   - Có tích hợp các thư viện hỗ trợ nhập công thức toán học (`mathlive`) và chỉnh sửa ảnh (`cropperjs`).
2. **API (Dịch vụ Backend chính):** 
   - Được xây dựng bằng **FastAPI** (Python).
   - Cung cấp các RESTful API phục vụ frontend với các endpoint cho xác thực (auth), quản lý câu hỏi (questions), tải lên (upload), lớp học (classes) và kỳ thi (contests).
   - Kết nối trực tiếp với cơ sở dữ liệu PostgreSQL thông qua thư viện `psycopg2`.
3. **Engine (Xử lý tài liệu và dữ liệu):**
   - Chứa trong thư mục `backend/src/engine`.
   - Bao gồm các script Python (engine) phục vụ việc bóc tách và xử lý dữ liệu phức tạp. Ví dụ:
     - `parse_docx*.py`: Phân tích file Word (câu hỏi trắc nghiệm, tự luận, v.v.).
     - `getQ_db2docx.py` / `getQ_db2tex.py`: Trích xuất dữ liệu từ Database ra file DOCX hoặc LaTeX.
     - `importJson.py` / `insert_into_db_from_json.py`: Hỗ trợ nhập liệu thông qua file JSON.

## Tech Stack (Công nghệ sử dụng)

- **Ngôn ngữ:** Python, TypeScript, JavaScript.
- **Frontend:** Next.js (React), ESLint.
- **Backend Framework:** FastAPI, Uvicorn.
- **Database:** PostgreSQL.
- **Xử lý tài liệu:** python-docx, pandoc, pdf2image, Wand, LaTeX (xeLatex/LuaLatex).
- **Computer Vision (tùy chọn trong engine):** ultralytics (YOLO) để nhận diện các vùng ảnh trong câu hỏi (Đang bận chưa có thời gian làm).
- **Xác thực (Auth):** JWT (python-jose, passlib).

## Cấu trúc thư mục

```text
database_question_dataset/
├── api/                   # Mã nguồn API (FastAPI)
│   ├── main.py            # Entry point của API, cấu hình CORS & Static files
│   ├── db.py              # Kết nối Database (PostgreSQL)
│   ├── auth.py, models.py # Logic xác thực và định nghĩa Model
│   ├── requirements.txt   # Các thư viện python cần thiết cho API
│   └── routers/           # Chứa các endpoint API (auth, questions, upload...)
├── backend/
│   └── src/engine/        # Mã nguồn xử lý lõi (Core Engine)
│       ├── parse_docx*.py # Đọc và bóc tách dữ liệu từ file Word
│       ├── getQ_db2*.py   # Xuất câu hỏi từ DB ra file DOCX/TeX
│       ├── process_*.py   # Xử lý các dạng câu hỏi (trắc nghiệm, tự luận...)
│       └── logic_manager.py
├── frontend/              # Mã nguồn giao diện người dùng (Next.js)
│   ├── src/               # Component và Pages
│   ├── public/            # Tài nguyên tĩnh
│   ├── package.json       # Thư viện npm (next, react, mathlive...)
│   └── next.config.ts     # Cấu hình Next.js
├── db_project2025.2.sql   # File dump Database PostgreSQL
├── README.md              # Hướng dẫn cài đặt sơ bộ
└── storage/               # (Thư mục được sinh ra) Nơi lưu trữ ảnh tĩnh của câu hỏi
```

## Hướng dẫn cài đặt cơ bản

1. **Database:** Tải PostgreSQL và import file `db_project2025.2.sql`.
2. **Môi trường và Công cụ hệ thống:**
   - Để chạy các công cụ xuất file `db2docx`, cần cài đặt: `pandoc`, `miktex` (hoặc LatexWorkshop build bằng xeLatex/LuaLatex), `strawberry perl`.
   - Cần cài đặt Microsoft Visual C++ dev.
   - Cấu hình biến môi trường bằng cách tạo một file `.env` ở thư mục `api` và copy đoạn này vào (nhớ thay đổi tên db, mật khẩu phù hợp):
     ```env
     DB_NAME=xxxxxx
     DB_USER=postgres
     DB_PASSWORD=xxxxxx
     DB_HOST=localhost
     DB_PORT=5432
     SECRET_KEY=your-super-secret-jwt-key
     ALGORITHM=xxxxxx
     ACCESS_TOKEN_EXPIRE_MINUTES=xxxxxx
     IMG_STORAGE_PATH=xxxxxx
     FRONTEND_URL=xxxxxx
     ```
3. **Cài đặt thư viện Python (API & Engine):**
   ```bash
   cd api
   # File này include requirements/api.txt và requirements/engine.txt ở gốc repo.
   pip install -r requirements.txt
   # Cài Chromium dùng để preview/xuất PDF HTML.
   playwright install chromium
   ```
   Khi phát triển toàn bộ backend từ thư mục gốc, có thể dùng
   `pip install -r requirements/dev.txt`.

   Các chương trình hệ thống như XeLaTeX, Pandoc, Poppler, ImageMagick và
   LibreOffice không phải package Python; cần cài riêng trên máy/container
   nếu sử dụng luồng xuất tương ứng.
   Sau đó chạy API:
   ```bash
   uvicorn main:app --reload
   ```
4. **Cài đặt Frontend:**
   ```bash
   cd frontend
   npm install
   # Một số thư viện bổ sung (nếu cần thiết): npm install mathlive @uiw/react-katex uuid
   npm run dev
   ```
   Sau đó truy cập `http://localhost:3000`.
