'use client';

// 대시보드 "무엇부터 만들지" 스트립.
//
// ★ 2026-07-31: 씬 템플릿 5종(빈 씬·쇼룸·갤러리·광장·카페)을 **삭제**했다.
//   전부 구 오브젝트 시스템으로 지은 장면이라, 브릭 에디터로 열면 **아무것도 안 보인다.**
//   ".glb 가져오기"도 뺐다 — 에셋 업로드 경로 자체가 사라졌다.
//   브릭 템플릿(미리 지어 둔 집·성 같은 것)은 청크를 복제하는 방식이라 새로 만들어야 한다.

import Link from 'next/link';
import { Plus, Sparkles } from 'lucide-react';
import { createProject } from './actions';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

export function TemplateGallery() {
  return (
    <section className="mb-9">
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-[1.02rem] font-semibold">Start something new</h2>
        <span className="text-[.78rem] text-muted">Start with an empty world, or remix someone else&apos;s</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {/* 빈 프로젝트 — 지형이 깔린 무한 월드에서 시작한다 */}
        <form action={createProject}>
          <input type="hidden" name="name" value="New project" />
          <button
            type="submit"
            className="group w-full h-full text-left bg-surface border border-border rounded-xs overflow-hidden transition-colors hover:border-border/50"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <span className="block aspect-[16/10] relative grid place-items-center text-white" style={{ background: GRAD }}>
              <span
                className="absolute inset-0"
                style={{ background: 'radial-gradient(circle at 28% 20%, rgba(255,255,255,.18), transparent 55%)' }}
              />
              <Plus size={20} className="relative" />
            </span>
            <span className="block px-3.5 py-3">
              <span className="block text-[.9rem] font-semibold group-hover:text-primary transition-colors">New world</span>
              <span className="block text-[.75rem] text-muted mt-0.5 truncate">Start building with bricks</span>
            </span>
          </button>
        </form>

        {/* 남의 작품에서 시작 */}
        <Link
          href="/community"
          className="group bg-surface border border-border rounded-xs overflow-hidden transition-colors hover:border-border/50 block"
        >
          <span className="block aspect-[16/10] relative grid place-items-center text-white" style={{ background: GRAD }}>
            <Sparkles size={20} />
          </span>
          <span className="block px-3.5 py-3">
            <span className="block text-[.9rem] font-semibold group-hover:text-primary transition-colors">Remix</span>
            <span className="block text-[.75rem] text-muted mt-0.5 truncate">Start from others&apos; work</span>
          </span>
        </Link>
      </div>
    </section>
  );
}
