'use client';

import { useState, useRef, useEffect } from 'react';
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
        className="relative bg-zinc-900/50 border border-zinc-800 border-dashed rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-2 group hover:border-zinc-600 hover:bg-zinc-900 transition-all duration-200 min-h-[160px]"
      >
        <div className="w-10 h-10 rounded-xl bg-zinc-800 group-hover:bg-gradient-to-br group-hover:from-violet-600 group-hover:to-cyan-600 flex items-center justify-center text-zinc-400 group-hover:text-white text-xl transition-all duration-200 group-hover:shadow-lg group-hover:shadow-violet-500/25">
          +
        </div>
        <span className="text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors">새 프로젝트</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">새 프로젝트</h3>
            <p className="text-zinc-400 text-sm mb-5">프로젝트 이름을 입력하세요</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                ref={inputRef}
                name="name"
                placeholder="나의 첫 번째 3D 공간"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
                >
                  {pending ? '생성 중...' : '만들기 →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
