// Gọi typesetPromise RIÊNG cho từng phần tử, từ hàng chục LatexRenderer/
// RichLatexEditor mount gần như cùng lúc (vd cả trang ngân hàng câu hỏi sau
// khi đổi trang, hay 6 ô soạn trong modal "Chi tiết câu hỏi" mở cùng lúc) làm
// MathJax dựng chậm/lặp không cần thiết (mỗi lệnh gọi tự quét lại DOM). Gom
// lại, đợi một nhịp ngắn cho các thẻ mount xong rồi gọi typesetPromise() MỘT
// LẦN cho TOÀN TRANG (không truyền phần tử) — MathJax tự quét DOM và bỏ qua
// phần đã dựng rồi. Lưu ý: với trang nhiều công thức (~20 câu), bản thân
// MathJax dựng CHTML lần đầu có thể mất vài giây (dựng font) — đây là tốc độ
// thật của MathJax, không phải lỗi ở hàm này.
declare global {
  interface Window {
    MathJax?: {
      typesetPromise: (elements?: HTMLElement[]) => Promise<void>;
      typesetClear: (elements?: HTMLElement[]) => void;
    };
  }
}

let pending = false;

export function queueTypeset() {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    window.MathJax?.typesetPromise?.().catch(() => {});
  }, 80);
}
