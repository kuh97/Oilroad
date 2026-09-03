import type { Metadata, Viewport } from "next";
import type React from "react";
import localFont from "next/font/local";
import "./globals.css";

// docs/DESIGN.md §3이 지정한 폰트는 재배포 권리가 없어 그대로 쓸 수 없다 —
// 한국어 UI에 가장 널리 쓰이는 무료 오픈소스 대체 폰트인 Pretendard를 대신 쓴다.
const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: "오일픽",
  description: "출발지부터 목적지까지의 경로를 고려해 가장 합리적인 주유소를 찾아드립니다.",
};

export const viewport: Viewport = {
  themeColor: "#3182F6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
