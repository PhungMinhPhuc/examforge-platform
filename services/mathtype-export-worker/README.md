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
mvn -f services/mathtype-export-worker/pom.xml clean package -DskipTests
python services/mathtype-export-worker/worker.py --health
```

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
