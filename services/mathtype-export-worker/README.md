# MathType export worker

Worker production cho contract:

```text
worker.py <input.docx> <formulas.json> <output.docx>
```

Java 25 chuyển LaTeX thành đối tượng OLE MathType/MTEF. Native renderer Windows
gọi `MT6.dll` của MathType 7 để áp dụng Factory Settings và tạo preview. Nếu một
công thức lỗi, DOCX OMML đầu vào được giữ lại riêng cho công thức đó.

## Cài đặt và build

```powershell
python -m pip install -r services/mathtype-export-worker/requirements.txt
npm --prefix services/mathtype-export-worker install
mvn -f services/mathtype-export-worker/pom.xml clean package -DskipTests
python services/mathtype-export-worker/worker.py --health
```

## Chạy thường trú

```powershell
.\.venv\Scripts\python.exe services\mathtype-export-worker\server.py
```

Trên Windows local, backend tự khởi động service tại `127.0.0.1:18765` nếu chưa
có tiến trình lắng nghe. Service mở `MathType.exe -server` đúng một lần, giữ
tiến trình supervisor sống giữa các lượt xuất và tuần tự hóa chuyển đổi để hai
tài liệu không dùng Native API đồng thời.

Khi backend chạy Linux, đặt `MATHTYPE_WORKER_URL` tới Windows worker và cấu hình
cùng `MATHTYPE_SERVER_TOKEN` ở hai phía. API truyền DOCX bằng HTTP nên hai máy
không cần dùng chung đường dẫn ổ đĩa hoặc volume.

## Font đóng gói

Toàn bộ font mà bộ dựng preview vector sử dụng lấy từ kho chung
`assets/fonts/vector`. Worker không đọc font DejaVu/Noto từ Windows hoặc Linux.
Maven kiểm tra và đóng gói các tệp sau vào
`target/mathtype-export-worker.jar`:

- DejaVu Serif: regular, bold, italic và bold italic;
- DejaVu Math TeX Gyre;
- Noto Serif SC biến thiên, dùng cho Unicode/CJK;
- giấy phép và manifest SHA-256 của bộ font.

Không thay các font này bằng file cùng tên lấy từ máy cục bộ: worker kiểm tra
SHA-256 trước khi đăng ký font và sẽ từ chối render nếu nội dung không đúng.
Font hiển thị của đối tượng OLE sau khi mở bằng MathType vẫn do MathType Factory
Settings quản lý; máy nhận file cần MathType 7 để chỉnh sửa đối tượng OLE.

Supervisor giữ `MathType.exe -server` và một Native API session chạy giữa các
lượt xuất. Mọi chuyển đổi được xếp hàng và thực hiện tuần tự trên main thread;
session chỉ disconnect khi supervisor dừng. Worker dùng template DSMT7 đóng gói
thay vì nhánh MTEF fallback. Công thức riêng lẻ không chuyển được vẫn về OMML.


Backend tự tìm worker này trên Windows. Có thể override bằng
`MATHTYPE_WORKER_COMMAND_JSON`. Cache và file làm việc vẫn nằm trong `.runtime`,
không nằm trong `storage`.

## Phạm vi mã nguồn

Chỉ chứa converter runtime và dependency trực tiếp: parser LaTeX, MathIR/layout,
MTEF writer/normalizer, OLE packager, preview renderer, `MathTypeEmbedder` và một
CLI chuyển DOCX. Các CLI mining, comparator và corpus vẫn chỉ nằm trong PoC.

## Linux/container

Linux không chạy `MT6.dll`. Giữ nguyên contract ba đường dẫn và cấu hình
`MATHTYPE_WORKER_COMMAND_JSON` tới một Windows worker từ xa/container phù hợp;
backend không cần thay đổi pipeline xuất.
