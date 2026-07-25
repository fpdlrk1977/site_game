import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { LucideProvider } from "lucide-react";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'Park3D — No-code 3D space builder',
  description: 'Build and publish interactive 3D spaces without code.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* FOUC 방지 — hydration 전에 localStorage 테마를 읽어 .dark 클래스 적용. 기본=light */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var s = localStorage.getItem('park3d-theme');
                var t = s ? JSON.parse(s) : null;
                var theme = (t && t.state && t.state.theme) ? t.state.theme : 'light';
                if (theme === 'dark') document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* lucide 아이콘 전역 기본값 — 얇은 선(1). 개별 아이콘의 strokeWidth가 이 값을 덮어쓴다
            (우선순위: 개별 > Provider > 라이브러리 기본 2). 색은 각 위치에서 관리(currentColor 상속). */}
        <LucideProvider strokeWidth={1}>
          <ThemeProvider>{children}</ThemeProvider>
        </LucideProvider>
      </body>
    </html>
  );
}
