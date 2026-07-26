'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Box, LayoutTemplate, Upload, Sparkles } from 'lucide-react';
import { ProjectCard } from './ProjectCard';
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
        className="bg-surface border border-border rounded-xs p-[18px] flex items-center gap-3 transition-all hover:border-border/60 hover:shadow-[var(--shadow-card)] text-left w-full">
        <span className="w-[42px] h-[42px] rounded-xs grid place-items-center shrink-0" style={{ background: 'linear-gradient(145deg,rgba(139,120,255,.25),rgba(57,208,234,.12))', border: '1px solid var(--border)' }}>{icon}</span>
        <span className="min-w-0"><b className="text-[.92rem] block">{label}</b><span className="text-[.78rem] text-muted">{hint}</span></span>
      </button>
    </form>
  );
}

export function DashboardBody({ projects, viewCounts, showAnalytics }: {
  projects: Project[];
  viewCounts: Record<string, number>;
  showAnalytics: boolean;
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
    `text-[.8rem] px-3 py-1.5 rounded-xs border transition-colors ${on ? 'text-primary font-semibold' : 'text-muted hover:text-foreground'}`;
  const chipStyle = (on: boolean) => on ? { background: 'rgba(124,108,255,.16)', borderColor: 'rgba(124,108,255,.4)' } : { borderColor: 'var(--border)', background: 'var(--surface)' };

  return (
    <main className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-8 py-8 w-full">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
          <div>
            <h1 className="text-[1.6rem] font-bold tracking-tight">My projects</h1>
            <p className="text-muted text-sm mt-1">{projects.length > 0 ? `${projects.length} 3D ${projects.length === 1 ? 'space' : 'spaces'}` : 'Create and publish 3D spaces'}</p>
          </div>
          <label className="flex items-center gap-2 bg-surface border border-border rounded-xs px-3 py-2 text-muted focus-within:border-primary transition-colors w-full sm:w-[280px]">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" className="bg-transparent text-sm text-foreground placeholder-muted w-full focus:outline-none" />
          </label>
        </div>

        {/* Quick create */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-9">
          <QuickTile icon={<Box size={20} className="text-foreground" />} label="Blank scene" hint="Start from scratch" name="New project" />
          <QuickTile icon={<LayoutTemplate size={20} className="text-foreground" />} label="Template" hint="Showroom, gallery, café — in editor" name="New project" />
          <QuickTile icon={<Upload size={20} className="text-foreground" />} label="Import" hint="Upload .glb in editor" name="Imported project" />
          <Link href="/community" className="rounded-xs p-[18px] flex items-center gap-3 text-white transition-transform" style={{ background: GRAD }}>
            <span className="w-[42px] h-[42px] rounded-xs grid place-items-center shrink-0 bg-white/20 border border-white/30"><Sparkles size={20} /></span>
            <span><b className="text-[.92rem] block">Explore & remix</b><span className="text-[.78rem] text-white/85">Start from others&apos; work</span></span>
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-24">
            <div className="inline-flex w-14 h-14 rounded-xs border border-border bg-surface items-center justify-center text-muted mb-4"><Box size={24} /></div>
            <h2 className="text-lg font-semibold">No projects yet</h2>
            <p className="text-muted text-sm mt-1.5">Create your first 3D space with a <b className="text-foreground">Blank scene</b> above.</p>
          </div>
        ) : (
          <>
            {/* Filter chips */}
            <div className="flex items-center gap-2 mb-5">
              {([['all', 'All'], ['published', 'Public'], ['private', 'Private']] as const).map(([f, l]) => (
                <button key={f} onClick={() => setFilter(f)} className={chip(filter === f)} style={chipStyle(filter === f)}>{l}</button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <p className="text-muted text-sm py-10 text-center">No projects match your filters.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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
