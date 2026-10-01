# Rich LaTeX Editor

Editor modular trong thư mục này là implementation mặc định của frontend. Các consumer import qua `@/components/rich-latex-editor` và không render editor hoặc toolbar legacy.

Các phần chính:

- `RichLatexEditor.tsx`: điều phối ribbon, surface, dialog MathLive và luồng ảnh.
- `hooks/useEditorController.ts`: formatting, bảng, clipboard, history và keyboard.
- `model/treeDomCodec.ts`: codec thuần `TreeDoc ↔ editable DOM`, độc lập với component legacy.
- `table/`, `math/`, `image/`: logic theo từng miền.

Editor chuyển tiếp cũ đã được lưu tại `frontend/old/src/components/` để tra cứu thủ công. Không dùng mã trong `frontend/old/` cho consumer production hoặc gọi handler legacy từ modular editor.

## Nested tables

TreeDoc và editor hỗ trợ bảng nằm trực tiếp trong ô của bảng khác, tối đa 3 cấp.
Giới hạn được kiểm tra giống nhau ở thao tác chèn và schema backend. Codec DOM,
clipboard nội bộ, HTML, plain text, LaTeX và DOCX đều phải giữ nguyên cây bảng lồng.

`code_block` là tên duy nhất cho khối mã, kể cả khi nằm trong ô bảng. Mọi khối
mã trong editor dùng chung `--code-bg` và `--code-text`; không tạo biến thể màu
theo vị trí.

Regression tests nằm ở `temp/rich-latex-editor-tests`. Chạy từ thư mục `frontend`:

```sh
npm run test:rich-editor
```

Các command chưa có persistence contract an toàn phải được ẩn hoặc disabled; không để nút enabled nhưng không có handler.
