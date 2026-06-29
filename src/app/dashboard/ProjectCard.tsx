'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { deleteProject, renameProject, togglePublish } from './actions';
import { ShareModal } from './ShareModal';

interface Project {
  id: string;
  name: string;
  is_published: boolean;
  updated_at: string;
  thumbnail_url: string | null;
  default_scene_id: string | null;
}

export function ProjectCard({ project }: { project: Project }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
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

  const updatedDate = new Date(project.updated_at).toLocaleDateString('ko-KR', {
    month: 'short', day: 'numeric',
  });

  return (
    <div className={`group relative bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all duration-200 hover:border-zinc-700 hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5 ${deleting ? 'opacity-40 pointer-events-none' : ''}`}>
      {/* 썸네일 */}
      <Link href={`/editor/${project.id}`} className="block relative aspect-video bg-zinc-800 overflow-hidden">
        {project.thumbnail_url ? (
          <img src={project.thumbnail_url} alt={project.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-700/60 flex items-center justify-center text-3xl opacity-50 group-hover:opacity-70 transition-opacity">
              🌐
            </div>
            {/* 배경 장식 */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 to-cyan-900/20" />
          </div>
        )}
        {/* 편집 오버레이 */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
            편집하기 →
          </span>
        </div>
        {/* 배포 배지 */}
        <div className={`absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full ${
          project.is_published
            ? 'bg-emerald-500/90 text-white'
            : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700'
        }`}>
          {project.is_published ? '공개' : '비공개'}
        </div>
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
              className="w-full bg-zinc-800 border border-violet-500 rounded-lg px-2 py-0.5 text-sm text-white focus:outline-none"
            />
          ) : (
            <p className="text-sm font-medium text-white truncate">{project.name}</p>
          )}
          <p className="text-xs text-zinc-500 mt-0.5">{updatedDate} 수정</p>
        </div>

        {/* 더보기 메뉴 */}
        <div ref={menuRef} className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 transition-all opacity-0 group-hover:opacity-100"
          >
            ···
          </button>
          {menuOpen && (
            <div className="absolute right-0 bottom-full mb-1 w-36 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10 py-1">
              <Link
                href={`/editor/${project.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <span>✏️</span> 편집하기
              </Link>
              <button
                onClick={() => { setMenuOpen(false); setRenaming(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <span>✏</span> 이름 변경
              </button>
              {project.default_scene_id && (
                <button
                  onClick={() => { setMenuOpen(false); setSharing(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  <span>🔗</span> 공유하기
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); togglePublish(project.id, !project.is_published); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <span>{project.is_published ? '🔒' : '🌐'}</span>
                {project.is_published ? '비공개로 전환' : '공개 배포'}
              </button>
              <div className="border-t border-zinc-700 my-1" />
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
              >
                <span>🗑</span> 삭제
              </button>
            </div>
          )}
        </div>
      </div>
    {sharing && project.default_scene_id && (
      <ShareModal
        projectName={project.name}
        sceneId={project.default_scene_id}
        isPublished={project.is_published}
        onClose={() => setSharing(false)}
      />
    )}
    </div>
  );
}
