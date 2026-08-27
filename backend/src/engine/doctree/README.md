# TreeDoc — cấu trúc nhanh

TreeDoc là JSON biểu diễn **nội dung có cấu trúc** của câu hỏi, đáp án và lời giải.
Một cây luôn có dạng:

```json
{
  "type": "doc",
  "side": "center",
  "content": [/* các block theo thứ tự hiển thị */]
}
```

## Hình thái một câu hỏi

```json
{
  "content_doc": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "align": "left",
        "content": [
          { "type": "text", "text": "Tính ", "marks": ["bold"] },
          { "type": "math", "tex": "x^2+1" }
        ]
      },
      {
        "type": "table",
        "rows": [[{ "content": [{ "type": "text", "text": "Dữ kiện" }] }]]
      }
    ]
  },
  "options": [
    { "content_doc": { "type": "doc", "content": [] }, "is_correct": true }
  ],
  "solution_doc": {
    "type": "doc",
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Lời giải" }] }]
  }
}
```

`content_doc`, mỗi `options[].content_doc` và `solution_doc` đều là các TreeDoc độc lập.

## Các node

| Nhóm | `type` | Nội dung chính |
|---|---|---|
| Block | `paragraph` | `content: Inline[]`, `align?` |
| Block | `math_block` | `tex` |
| Block | `table` | `rows[][]`, `widths?`, `row_heights?` |
| Block | `list` | `items: Block[][]`, `ordered?` |
| Block | `image` | `figure_id`, `caption?` |
| Block | `code_block` | `text`, `lang?` |
| Block | `columns` | `columns[].content: Block[]` |
| Inline | `text` | `text`, `marks?`, `color?` |
| Inline | `math` | `tex` |
| Inline | `hard_break` | không có dữ liệu thêm |
| Inline | `image_inline` | `figure_id` |

Ô bảng chứa inline, `code_block` và có thể chứa một `table` khác, tối đa 3 cấp. Ảnh chỉ lưu
`figure_id`; dữ liệu file nằm trong kho ảnh riêng.

Nguồn kiểm tra chính xác cuối cùng là [`schema.py`](./schema.py). Gọi
`validate(doc)`; danh sách rỗng nghĩa là cây hợp lệ.
