import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import FloatingChatbot from "@/components/FloatingChatbot";
import ToastViewport from "@/components/ToastViewport";
import { NO_FLASH_THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Hệ thống",
  description:
    "Nền tảng quản lý ngân hàng câu hỏi, tạo đề thi và thi trực tuyến cho giáo viên và học sinh.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* Đặt data-theme TRƯỚC khi trang vẽ ra — tránh chớp sáng rồi mới
            chuyển tối. Phải là script chặn (không strategy="afterInteractive"
            như MathJax bên dưới), nên viết thẳng ở đây thay vì <Script>. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
          <FloatingChatbot />
        </AuthProvider>
        <ToastViewport />
        {/* MathJax: afterInteractive tránh SSR trong <head>, loại bỏ hydration mismatch */}
        <Script
          id="MathJax-config"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
    window.MathJax = {
    tex: {
     inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
     displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
     packages: {'[+]': ['ams']},
    },
    options: { skipHtmlTags: ['script','noscript','style','textarea'] },
    // chtml: {
    //   font: 'mathjax-newcm'
    // },
    };
   `,
          }}
        />
        <Script
          id="MathJax-script"
          strategy="afterInteractive"
          src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js"
        />
      </body>
    </html>
  );
}
