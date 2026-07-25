'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { createProject } from './actions';

export function NewProjectCard() {
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
    setPending(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative bg-surface/50 border border-border border-dashed rounded-xs overflow-hidden flex flex-col items-center justify-center gap-2 group hover:border-border/60 hover:bg-surface transition-all duration-200 min-h-[160px]"
      >
        <div className="w-10 h-10 rounded-xs bg-background group-hover:bg-gradient-to-br group-hover:from-violet-600 group-hover:to-cyan-600 flex items-center justify-center text-muted group-hover:text-white text-xl transition-all duration-200 group-hover:shadow-lg group-hover:shadow-violet-500/25">
          +
        </div>
        <span className="text-sm text-muted group-hover:text-foreground transition-colors">새 프로젝트</span>
      </button>

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
