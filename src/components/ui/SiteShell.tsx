import type { ReactNode } from 'react';
import { AmbientBackground } from '@/components/ui/AmbientBackground';

/**
 * 비-에디터 화면 공용 앱셸 — 레이아웃 왜곡 방지 구조.
 *  ┌ top-bar (h-14=56px, 전체폭, shrink-0, 비스크롤) ┐
 *  └ main (flex-1, overflow-y-auto, 내부만 스크롤, 가로 꽉 채움) ┘
 * 뷰포트 고정(h-dvh + overflow-hidden) → 페이지 자체는 스크롤 안 하고 main 내부만 스크롤.
 */
export function SiteShell({ nav, children, ambient = true }: {
  nav?: ReactNode;
  children: ReactNode;
  ambient?: boolean;
}) {
  return (
    <div className="relative flex flex-col h-dvh overflow-hidden bg-background text-foreground">
      {ambient && <AmbientBackground />}
      {nav && (
        <header className="relative z-30 h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
          {nav}
        </header>
      )}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
