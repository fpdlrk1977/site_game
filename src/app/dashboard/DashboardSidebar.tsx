'use client';

import Link from 'next/link';
import { LayoutGrid, Compass, CreditCard, Settings, LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { PlanTier } from '@/store/userStore';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

export function DashboardSidebar({ planTier }: { planTier: PlanTier }) {
  const item = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xs text-sm transition-colors ${
      active ? 'text-primary font-semibold' : 'text-muted hover:text-foreground hover:bg-foreground/[0.04]'
    }`;
  const activeStyle = { background: 'rgba(124,108,255,.14)' };

  return (
    <aside className="w-[238px] shrink-0 bg-sidebar border-r border-border flex-col p-3 sticky top-0 h-screen hidden md:flex">
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem] px-2 py-2 mb-2">
        <span className="w-[30px] h-[30px] rounded-xs grid place-items-center text-white" style={{ background: GRAD, boxShadow: '0 6px 16px -4px rgba(106,77,255,.6)' }}>⬡</span>
        Park3D
      </Link>

      <nav className="flex flex-col gap-0.5">
        <Link href="/dashboard" className={item(true)} style={activeStyle}><LayoutGrid size={17} /> 내 프로젝트</Link>
        <Link href="/community" className={item(false)}><Compass size={17} /> 둘러보기</Link>
        <Link href="/pricing" className={item(false)}><CreditCard size={17} /> 요금제</Link>

        <div className="text-[.66rem] uppercase tracking-[.1em] text-muted/60 font-bold px-3 pt-4 pb-1.5">계정</div>
        <Link href="/account" className={item(false)}><Settings size={17} /> 계정 설정</Link>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className={`${item(false)} w-full text-left`}><LogOut size={17} /> 로그아웃</button>
        </form>
      </nav>

      <div className="mt-auto">
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="text-xs text-muted">테마</span>
          <ThemeToggle />
        </div>
        {planTier === 'free' && (
          <div className="rounded-xs p-4 border border-border" style={{ background: 'linear-gradient(160deg,rgba(106,77,255,.18),rgba(57,208,234,.1))' }}>
            <p className="text-sm font-semibold mb-1">Pro로 업그레이드</p>
            <p className="text-xs text-muted leading-relaxed">커스텀 도메인 · 무제한 씬 · 방문 통계</p>
            <Link href="/pricing" className="block text-center mt-3 text-white text-[.82rem] font-semibold py-2 rounded-xs" style={{ background: GRAD }}>업그레이드 →</Link>
          </div>
        )}
      </div>
    </aside>
  );
}
