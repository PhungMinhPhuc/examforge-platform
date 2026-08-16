# Bộ font production

Đây là nguồn font duy nhất cho giao diện, MathLive, HTML/PDF, XeLaTeX/TikZ và MathType worker.
Không lấy font từ thư mục font của Windows hoặc Linux khi render phía máy chủ.

- `document/`: font nội dung đề và Cambria text.
- `math/`: Cambria Math và XITS Math cho XeLaTeX/TikZ. XITS Math được dùng
  cho các bảng chữ cái `cal`/`bfcal` và đóng gói kèm giấy phép SIL OFL 1.1.
- `vector/`: font vector được Maven đóng vào MathType worker JAR.
- `web/ui/`: font giao diện website.
- `web/mathlive/`: font trình soạn công thức MathLive.
- `web/Temml.woff2`: font web của Temml.

`manifest.json` ghi kích thước và SHA-256 để phát hiện file thiếu hoặc bị thay đổi.
Các giấy phép nguồn mở hiện có nằm trong `vector/`. Font Microsoft/Monotype chỉ được
triển khai khi giấy phép của đơn vị cho phép nhúng và phân phối trên môi trường đích.
