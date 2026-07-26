'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { createProject } from './actions';

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    await createProject(fd);
    // createProject redirects to /editor/:id, so this line rarely runs
    setPending(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold px-5 py-2.5 rounded-xs transition-all duration-200 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 text-sm"
      >
        <span className="text-base leading-none transition-transform group-hover:rotate-90 duration-200">+</span>
        새 프로젝트
      </button>

      {/* 모달 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-surface border border-border rounded-xs p-6 w-full max-w-sm shadow-modal">
            <h3 className="text-lg font-bold text-foreground mb-1">새 프로젝트</h3>
            <p className="text-muted text-sm mb-5">프로젝트 이름을 입력하세요</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                ref={inputRef}
                name="name"
                placeholder="나의 첫 번째 3D 공간"
                defaultValue=""
                className="w-full bg-background border border-border rounded-xs px-4 py-2.5 text-foreground placeholder-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 rounded-xs border border-border text-foreground hover:bg-background text-sm transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 py-2.5 rounded-xs bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
                >
                  {pending ? '생성 중...' : <span className="inline-flex items-center gap-1.5">만들기 <ArrowRight size={14} /></span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
