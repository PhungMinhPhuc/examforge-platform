"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Nhớ vị trí cuộn theo URL, CHỈ trả lại khi quay lại bằng nút Back/Forward
// THẬT của trình duyệt — bấm menu/link (điều hướng tiến, kể cả tới lại đúng
// URL cũ) luôn coi là trang mới, về đầu trang. Trình duyệt tự khôi phục
// scroll khi bấm back, nhưng lúc đó dữ liệu còn đang fetch nên trang trống,
// không cuộn tới đâu được — Truyền ready = đã có dữ liệu.
//
// App Router không tự báo "lần điều hướng này là push hay pop" — phân biệt
// bằng sự kiện `popstate` (chỉ nổ ra khi bấm Back/Forward của trình duyệt,
// hoặc router.back() vì nó gọi thẳng history.back()). Đăng ký Ở CẤP MODULE
// (không phải trong effect) để không bỏ lỡ event nổ ra giữa lúc route đang
// chuyển và effect của trang đích chưa kịp mount.
let isPopNavigation = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    isPopNavigation = true;
  });
}

export default function useScrollRestoration(ready: boolean) {
  const pathname = usePathname();
  const restoredFor = useRef("");

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        sessionStorage.setItem(scrollKey(), String(window.scrollY));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  useEffect(() => {
    const key = scrollKey();
    if (!ready || restoredFor.current === key) return;
    restoredFor.current = key;

    const wasPop = isPopNavigation;
    isPopNavigation = false; // đã dùng cho lần điều hướng này, dọn cờ cho lần sau

    if (!wasPop) {
      sessionStorage.removeItem(key); // điều hướng tiến — coi như trang mới, bỏ lịch sử cuộn cũ
      return;
    }

    const saved = Number(sessionStorage.getItem(key) || 0);
    if (!saved) return;
    // đợi một frame cho nội dung có đủ chiều cao rồi mới cuộn
    requestAnimationFrame(() => window.scrollTo(0, saved));
  }, [ready, pathname]);
}

// gồm cả query string để mỗi tab nhớ vị trí riêng
function scrollKey() {
  return `scroll:${window.location.pathname}${window.location.search}`;
}
