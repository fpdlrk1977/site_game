'use client';

import { useState } from 'react';

type Projection = 'Perspective' | 'Orthographic';

export function ViewportOrientationGizmo() {
  const [projection, setProjection] = useState<Projection>('Perspective');
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-col items-center gap-1.5 pointer-events-auto select-none">
      {/* XYZ 방향 기즈모 */}
      <div className="w-[60px] h-[60px] rounded-xl bg-surface/90 backdrop-blur-sm border border-border/80 shadow-floating flex items-center justify-center">
        <div className="relative w-8 h-8">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-muted/40" />
          <div className="absolute top-1/2 left-1/2 -translate-y-1/2 flex items-center">
            <div className="w-[14px] h-px bg-red-500 ml-1" />
            <span className="text-[8px] font-bold text-red-400 ml-0.5 leading-none">X</span>
          </div>
          <div className="absolute left-1/2 top-0 -translate-x-1/2 flex flex-col items-center">
            <span className="text-[8px] font-bold text-green-400 leading-none">Y</span>
            <div className="w-px h-[14px] bg-green-500" />
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-end" style={{ transform: 'translate(-50%, -50%) rotate(135deg)' }}>
            <div className="w-[10px] h-px bg-blue-400 opacity-60" />
          </div>
          <div className="absolute bottom-0 left-0 flex items-center">
            <span className="text-[7px] font-bold text-blue-400 leading-none opacity-70">Z</span>
          </div>
        </div>
      </div>

      {/* Perspective 드롭다운 */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 px-2.5 py-1 bg-surface/90 backdrop-blur-sm border border-border/80 rounded-lg shadow-card text-[10px] font-medium text-foreground hover:border-border transition-all whitespace-nowrap"
        >
          {projection}
          <span className="text-[8px] text-muted ml-0.5">▾</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-dropdown z-50 overflow-hidden min-w-[120px]">
              {(['Perspective', 'Orthographic'] as Projection[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setProjection(p); setOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
                    projection === p
                      ? 'text-primary bg-primary/10'
                      : 'text-foreground hover:bg-background'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
