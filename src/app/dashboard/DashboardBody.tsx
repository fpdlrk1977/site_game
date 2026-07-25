'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Box, LayoutTemplate, Upload, Sparkles } from 'lucide-react';
import { ProjectCard } from './ProjectCard';
import { NewProjectButton } from './NewProjectButton';
import { NewProjectCard } from './NewProjectCard';
import { createProject } from './actions';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

interface Project {
  id: string;
  name: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  thumbnail_url: string | null;
  default_scene_id: string | null;
  custom_domain: string | null;
}

type Filter = 'all' | 'published' | 'private';

/** 빠른 생성 타일 — createProject 서버액션으로 새 프로젝트 → 에디터로 이동 */
function QuickTile({ icon, label, hint, name }: { icon: React.ReactNode; label: string; hint: string; name: string }) {
  return (
    <form action={createProject} className="contents">
      <input type="hidden" name="name" value={name} />
      <button type="submit" title={hint}
        className="bg-surface border border-border rounded-xs p-[18px] flex items-center gap-3 transition-all hover:-translate-y-[3px] hover:border-border/60 hover:shadow-[var(--shadow-card)] text-left w-full">
        <span className="w-[42px] h-[42px] rounded-xs grid place-items-center shrink-0" style={{ background: 'linear-gradient(145deg,rgba(139,120,255,.25),rgba(57,208,234,.12))', border: '1px solid var(--border)' }}>{icon}</span>
        <span className="min-w-0"><b className="text-[.92rem] block">{label}</b><span className="text-[.78rem] text-muted">{hint}</span></span>
      </button>
    </form>
  );
}

export function DashboardBody({ projects, viewCounts, showAnalytics, email }: {
  projects: Project[];
  viewCounts: Record<string, number>;
  showAnalytics: boolean;
  email: string;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = projects.filter((p) => {
    if (filter === 'published' && !p.is_published) return false;
    if (filter === 'private' && p.is_published) return false;
    if (q.trim() && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const chip = (on: boolean) =>
    `text-[.8rem] px-3.5 py-1.5 rounded-full border transition-colors ${on ? 'text-primary font-semibold' : 'text-muted hover:text-foreground'}`;
  const chipStyle = (on: boolean) => on ? { background: 'rgba(124,108,255,.16)', borderColor: 'rgba(124,108,255,.4)' } : { borderColor: 'var(--border)', background: 'var(--surface)' };

  return (
    <main className="flex-1 min-w-0 flex flex-col">
      {/* 상단 바 */}
      <div className="sticky top-0 z-10 flex items-center gap-4 px-7 py-4 border-b border-border backdrop-blur-xl" style={{ background: 'linear-gradient(180deg,rgba(14,13,19,.9),rgba(14,13,19,.55))' }}>
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold px-3.5 py-2 rounded-xs" style={{ background: 'rgba(255,255,255,.06)' }}>프로젝트</span>
          <Link href="/community" className="text-sm text-muted hover:text-foreground px-3.5 py-2 rounded-xs">둘러보기</Link>
        </div>
        <label className="ml-2 flex-1 max-w-[340px] flex items-center gap-2 bg-surface border border-border rounded-xs px-3 py-2 text-muted focus-within:border-primary transition-colors">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="프로젝트 검색…" className="bg-transparent text-sm text-foreground placeholder-muted w-full focus:outline-none" />
        </label>
        <div className="ml-auto flex items-center gap-3">
          <span title="AI 3D 생성 (곧)" className="hidden lg:inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xs text-muted/60 border border-border cursor-not-allowed"><Sparkles size={15} /> AI로 만들기 <span className="text-[.62rem] px-1.5 py-0.5 rounded-full bg-foreground/[0.06]">곧</span></span>
          <NewProjectButton />
          <span className="w-8 h-8 rounded-full grid place-items-center text-white text-[.8rem] font-bold" style={{ background: 'linear-gradient(145deg,#f2994a,#eb5757)' }}>{(email[0] || 'U').toUpperCase()}</span>
        </div>
      </div>

      <div className="px-7 py-7 max-w-[1240px] w-full">
        <div className="mb-1">
          <h1 className="text-[1.5rem] font-bold tracking-tight">내 프로젝트</h1>
          <p className="text-muted text-sm mt-1">{projects.length > 0 ? `${projects.length}개의 3D 공간` : '3D 공간을 만들고 배포하세요'}</p>
        </div>

        {/* 빠른 생성 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 my-6">
          <QuickTile icon={<Box size={20} className="text-foreground" />} label="빈 씬" hint="처음부터 시작" name="새 프로젝트" />
          <QuickTile icon={<LayoutTemplate size={20} className="text-foreground" />} label="템플릿" hint="에디터에서 쇼룸·갤러리·카페 선택" name="새 프로젝트" />
          <QuickTile icon={<Upload size={20} className="text-foreground" />} label="가져오기" hint="에디터에서 .glb 업로드" name="가져온 프로젝트" />
          <Link href="/community" className="rounded-xs p-[18px] flex items-center gap-3 text-white transition-transform hover:-translate-y-[3px]" style={{ background: GRAD }}>
            <span className="w-[42px] h-[42px] rounded-xs grid place-items-center shrink-0 bg-white/20 border border-white/30"><Sparkles size={20} /></span>
            <span><b className="text-[.92rem] block">둘러보고 리믹스</b><span className="text-[.78rem] text-white/85">남의 작품으로 시작</span></span>
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-24">
            <div className="inline-flex w-14 h-14 rounded-xs border border-border bg-surface items-center justify-center text-muted mb-4"><Box size={24} /></div>
            <h2 className="text-lg font-semibold">아직 프로젝트가 없어요</h2>
            <p className="text-muted text-sm mt-1.5">위의 <b className="text-foreground">빈 씬</b>으로 첫 3D 공간을 만들어보세요.</p>
          </div>
        ) : (
          <>
            {/* 필터 칩 */}
            <div className="flex items-center gap-2 mb-5">
              {([['all', '전체'], ['published', '공개'], ['private', '비공개']] as const).map(([f, l]) => (
                <button key={f} onClick={() => setFilter(f)} className={chip(filter === f)} style={chipStyle(filter === f)}>{l}</button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <p className="text-muted text-sm py-10 text-center">조건에 맞는 프로젝트가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((project) => (
                  <ProjectCard key={project.id} project={project}
                    viewCount={project.default_scene_id ? (viewCounts[project.default_scene_id] ?? 0) : 0}
                    showAnalytics={showAnalytics} />
                ))}
                <NewProjectCard />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
