import { ReactNode, CSSProperties } from "react";

/**
 * Khung danh sách mệnh đề Đúng/Sai (a) b) c) d)) dùng chung — chỉ lo khoảng
 * cách/bố cục ngoài, KHÔNG lo màu từng dòng (đúng/sai/đáp án học sinh khác
 * nhau tùy trang) — giống cách AdaptiveOptionGrid chỉ lo lưới, con nhồi vào
 * tự quyết định nội dung từng ô.
 *
 * Dùng ở: questions/page.tsx (Ngân hàng câu hỏi), results/[id]/page.tsx
 * (Kết quả bài thi), questions/upload/page.tsx (xem trước lúc nhập). CỐ Ý
 * không dùng ở exam/[id]/page.tsx (đang làm bài) và QuestionEditor.tsx (modal
 * sửa câu hỏi) — hai chỗ đó có ngữ cảnh khác, giữ nguyên riêng.
 */
export default function TrueFalseOptionList({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        marginTop: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
