'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { NewProjectButton } from './NewProjectButton';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

/** 전체폭 상단 바 (h-14, 고정·비스크롤). 브랜드 + 액션 + 아바타. */
export function DashboardTopBar({ email }: { email: string }) {
  return (
    <header className="h-14 shrink-0 w-full flex items-center gap-4 px-5 border-b border-border bg-sidebar/80 backdrop-blur-xl z-20">
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem] w-[calc(240px-1.25rem)] shrink-0">
        <span className="w-[28px] h-[28px] rounded-xs grid place-items-center text-white text-[.85rem]" style={{ background: GRAD }}>⬡</span>
        Park3D
      </Link>

      <div className="ml-auto flex items-center gap-3">
        <span title="AI 3D generation (soon)" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xs text-muted/60 border border-border cursor-not-allowed">
          <Sparkles size={15} /> Create with AI <span className="text-[.62rem] px-1.5 py-0.5 rounded-xs bg-foreground/[0.06]">Soon</span>
        </span>
        <NewProjectButton />
        <span className="w-8 h-8 rounded-full grid place-items-center text-white text-[.8rem] font-bold shrink-0" style={{ background: 'linear-gradient(145deg,#f2994a,#eb5757)' }}>
          {(email[0] || 'U').toUpperCase()}
        </span>
      </div>
    </header>
  );
}
