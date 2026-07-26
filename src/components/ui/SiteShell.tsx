import type { ReactNode } from 'react';
import { AmbientBackground } from '@/components/ui/AmbientBackground';

/**
 * 비-에디터 화면 공용 앱셸 — 레이아웃 왜곡 방지 구조.
 *  ┌ top-bar (h-14=56px, 전체폭, shrink-0, 비스크롤) ┐
 *  └ main (flex-1, overflow-y-auto, 내부만 스크롤, 가로 꽉 채움) ┘
 * 뷰포트 고정(h-dvh + overflow-hidden) → 페이지 자체는 스크롤 안 하고 main 내부만 스크롤.
 *
 * overlayNav=true면 상단바가 흐름에서 빠져 콘텐츠 위에 뜬다(뒤가 비치는 유리 바).
 * 이때 콘텐츠가 상단바 아래로 지나가므로 첫 섹션이 그만큼의 여백을 스스로 감안해야 한다.
 */
export function SiteShell({ nav, children, ambient = true, overlayNav = false, navClassName }: {
  nav?: ReactNode;
  children: ReactNode;
  ambient?: boolean;
  overlayNav?: boolean;
  navClassName?: string;
}) {
  return (
    <div className="relative flex flex-col h-dvh overflow-hidden bg-background text-foreground">
      {ambient && <AmbientBackground />}
      {nav && (
        <header
          className={`${overlayNav ? 'absolute inset-x-0 top-0' : 'relative'} z-30 h-14 shrink-0 transition-colors duration-300 ${
            navClassName ?? 'border-b border-border bg-background/80 backdrop-blur-xl'
          }`}
        >
          {nav}
        </header>
      )}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
