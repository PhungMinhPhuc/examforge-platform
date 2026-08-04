import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import FloatingChatbot from "@/components/FloatingChatbot";

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
      <head />
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
          <FloatingChatbot />
        </AuthProvider>
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
    options: { skipHtmlTags: ['script','noscript','style','textarea'] }
    };
   `,
          }}
        />
        <Script
          id="MathJax-script"
          strategy="afterInteractive"
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"
        />
      </body>
    </html>
  );
}
