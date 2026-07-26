'use client';

import Link from 'next/link';
import { Square, Store, Frame, Trees, Coffee, Upload, Sparkles } from 'lucide-react';
import { SCENE_TEMPLATE_META, type SceneTemplateMeta } from '@/lib/sceneTemplateMeta';
import { createProject } from './actions';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

const ICON: Record<SceneTemplateMeta['icon'], React.ReactNode> = {
  blank: <Square size={18} />,
  showroom: <Store size={18} />,
  gallery: <Frame size={18} />,
  plaza: <Trees size={18} />,
  cafe: <Coffee size={18} />,
};

/** 템플릿 카드 — 누르면 그 템플릿으로 프로젝트를 만들고 바로 에디터로 이동 */
function TemplateCard({ meta }: { meta: SceneTemplateMeta }) {
  return (
    <form action={createProject}>
      <input type="hidden" name="template" value={meta.id} />
      <input type="hidden" name="name" value={meta.name} />
      <button type="submit"
        className="group w-full text-left bg-surface border border-border rounded-xs overflow-hidden transition-colors hover:border-border/50"
        style={{ boxShadow: 'var(--shadow-card)' }}>
        <span className="block aspect-[16/10] relative" style={{ background: meta.gradient }}>
          <span className="absolute inset-0" style={{ background: 'radial-gradient(circle at 28% 20%, rgba(255,255,255,.18), transparent 55%)' }} />
          <span className="absolute left-3 bottom-3 w-8 h-8 rounded-xs grid place-items-center text-white bg-black/25 border border-white/20 backdrop-blur-sm">
            {ICON[meta.icon]}
          </span>
        </span>
        <span className="block px-3.5 py-3">
          <span className="block text-[.9rem] font-semibold group-hover:text-primary transition-colors">{meta.name}</span>
          <span className="block text-[.75rem] text-muted mt-0.5 truncate">{meta.description}</span>
        </span>
      </button>
    </form>
  );
}

/**
 * "무엇부터 만들지"를 대시보드 첫 화면에서 보여 준다.
 * 기존엔 템플릿이 에디터 안 '새 씬' 모달에만 있어 사실상 발견되지 않았다.
 */
export function TemplateGallery() {
  return (
    <section className="mb-9">
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-[1.02rem] font-semibold">Start something new</h2>
        <span className="text-[.78rem] text-muted">Pick a furnished space, or start empty</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-3.5">
        {SCENE_TEMPLATE_META.map((m) => <TemplateCard key={m.id} meta={m} />)}

        {/* GLB 업로드 — 에디터에서 이어서 */}
        <form action={createProject}>
          <input type="hidden" name="name" value="Imported project" />
          <button type="submit" title="Create a project, then upload .glb in the editor"
            className="group w-full h-full text-left bg-surface border border-dashed border-border rounded-xs overflow-hidden transition-colors hover:border-primary/50">
            <span className="block aspect-[16/10] relative grid place-items-center text-muted group-hover:text-foreground transition-colors">
              <Upload size={20} />
            </span>
            <span className="block px-3.5 py-3">
              <span className="block text-[.9rem] font-semibold">Import .glb</span>
              <span className="block text-[.75rem] text-muted mt-0.5 truncate">Bring your own model</span>
            </span>
          </button>
        </form>

        {/* 남의 작품에서 시작 */}
        <Link href="/community"
          className="group bg-surface border border-border rounded-xs overflow-hidden transition-colors hover:border-border/50 block">
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
