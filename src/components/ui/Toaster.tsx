'use client';

import { useToast } from '@/hooks/useToast';

export function Toaster() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl backdrop-blur-sm pointer-events-auto animate-in fade-in slide-in-from-bottom-2 ${
            t.type === 'error'
              ? 'bg-red-950/90 border border-red-500/40 text-red-200'
              : t.type === 'success'
              ? 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-200'
              : 'bg-zinc-800/90 border border-zinc-600/40 text-zinc-200'
          }`}
        >
          <span>
            {t.type === 'error' ? '✕' : t.type === 'success' ? '✓' : 'ℹ'}
          </span>
          {t.message}
          <button
            onClick={() => removeToast(t.id)}
            className="ml-2 opacity-50 hover:opacity-100 transition-opacity text-xs"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
