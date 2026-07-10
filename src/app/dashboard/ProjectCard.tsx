'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, SquarePen, Pencil, Copy, Share2, Globe, Lock, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { deleteProject, duplicateProject, renameProject, togglePublish } from './actions';
import { ShareModal } from './ShareModal';
import { CustomDomainModal } from './CustomDomainModal';

// 상대 시간 표기 — 방금 / N분 전 / N시간 전 / N일 전 / N개월 전 / N년 전
function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return '방금';
  const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'always' });
  const table: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, s] of table) {
    if (sec >= s) return rtf.format(-Math.floor(sec / s), unit);
  }
  return '방금';
}

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

export function ProjectCard({ project, viewCount = 0, showAnalytics = false }: { project: Project; viewCount?: number; showAnalytics?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [domainOpen, setDomainOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleRename = async () => {
    setRenaming(false);
    if (nameValue.trim() && nameValue.trim() !== project.name) {
      await renameProject(project.id, nameValue);
    } else {
      setNameValue(project.name);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!confirm(`"${project.name}" 프로젝트를 삭제할까요? 복구할 수 없습니다.`)) return;
    setDeleting(true);
    await deleteProject(project.id);
  };

  const handleDuplicate = async () => {
    setMenuOpen(false);
    setDuplicating(true);
    try {
      await duplicateProject(project.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : '복제에 실패했습니다.');
    } finally {
      setDuplicating(false);
    }
  };

  const updatedDate = new Date(project.updated_at).toLocaleDateString('ko-KR', {
    month: 'short', day: 'numeric',
  });
  const createdAgo = timeAgo(project.created_at);

  return (
    <div className={`group relative bg-surface border border-border rounded-2xl transition-all duration-200 hover:border-border/60 hover:shadow-xl hover:shadow-black/10 hover:-translate-y-0.5 ${deleting || duplicating ? 'opacity-40 pointer-events-none' : ''}`}>
      {duplicating && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-sm">
          <span className="text-xs font-medium text-white bg-black/50 px-3 py-1.5 rounded-xs">복제 중…</span>
        </div>
      )}
      {/* 썸네일 */}
      <Link href={`/editor/${project.id}`} className="block relative aspect-video bg-background overflow-hidden rounded-t-2xl">
        {project.thumbnail_url ? (
          <img src={project.thumbnail_url} alt={project.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center text-muted opacity-50 group-hover:opacity-70 transition-opacity">
              <Globe size={30} />
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-violet-900/10 to-cyan-900/10" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-xs">
            편집하기 →
          </span>
        </div>
        {/* 배포 배지 */}
        <div className={`absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full ${
          project.is_published
            ? 'bg-emerald-500/90 text-white'
            : 'bg-surface/80 text-muted border border-border'
        }`}>
          {project.is_published ? '공개' : '비공개'}
        </div>
        {/* 커스텀 도메인 배지 */}
        {project.custom_domain && (
          <div className="absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/80 text-white">
            {project.custom_domain}
          </div>
        )}
      </Link>

      {/* 하단 정보 */}
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              ref={inputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') { setNameValue(project.name); setRenaming(false); }
              }}
              className="w-full bg-background border border-primary rounded-xs px-2 py-0.5 text-sm text-foreground focus:outline-none"
            />
          ) : (
            <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted" suppressHydrationWarning>{createdAgo} 등록 · {updatedDate} 수정</p>
            {showAnalytics && (
              <span className="text-[10px] text-muted">
                · 방문 {viewCount.toLocaleString()}회
              </span>
            )}
          </div>
        </div>

        {/* 더보기 메뉴 */}
        <div ref={menuRef} className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-foreground hover:bg-background transition-all opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 bottom-full mb-1 w-40 bg-surface border border-border rounded-xs shadow-dropdown overflow-hidden z-10 py-1">
              <Link
                href={`/editor/${project.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-background transition-colors"
              >
                <SquarePen size={15} className="text-muted" /> 편집하기
              </Link>
              <button
                onClick={() => { setMenuOpen(false); setRenaming(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-background transition-colors"
              >
                <Pencil size={15} className="text-muted" /> 이름 변경
              </button>
              <button
                onClick={handleDuplicate}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-background transition-colors"
              >
                <Copy size={15} className="text-muted" /> 복제
              </button>
              {project.default_scene_id && (
                <button
                  onClick={() => { setMenuOpen(false); setSharing(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-background transition-colors"
                >
                  <Share2 size={15} className="text-muted" /> 공유하기
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); setDomainOpen(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-background transition-colors"
              >
                <Globe size={15} className="text-muted" /> 커스텀 도메인
              </button>
              <button
                onClick={() => { setMenuOpen(false); togglePublish(project.id, !project.is_published); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-background transition-colors"
              >
                <span className="text-muted flex items-center">{project.is_published ? <Lock size={15} /> : <Globe size={15} />}</span>
                {project.is_published ? '비공개로 전환' : '공개 배포'}
              </button>
              <div className="border-t border-border my-1" />
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-background transition-colors"
              >
                <Trash2 size={15} /> 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 모달은 Portal로 document.body에 마운트 — 카드 transform 영향 차단 */}
      {sharing && project.default_scene_id && createPortal(
        <ShareModal
          projectName={project.name}
          sceneId={project.default_scene_id}
          isPublished={project.is_published}
          onClose={() => setSharing(false)}
        />,
        document.body,
      )}

      {domainOpen && createPortal(
        <CustomDomainModal
          projectId={project.id}
          projectName={project.name}
          currentDomain={project.custom_domain}
          onClose={() => setDomainOpen(false)}
        />,
        document.body,
      )}
    </div>
  );
}
