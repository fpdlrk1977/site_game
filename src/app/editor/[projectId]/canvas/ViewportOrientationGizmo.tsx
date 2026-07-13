'use client';

import { useState } from 'react';
import { SelectBox } from '@/components/ui/SelectBox';

type Projection = 'Perspective' | 'Orthographic';

export function ViewportOrientationGizmo() {
  const [projection, setProjection] = useState<Projection>('Perspective');

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-col items-center gap-1.5 pointer-events-auto select-none">
      {/* XYZ 방향 기즈모 */}
      <div className="w-[60px] h-[60px] rounded-xs bg-surface/90 backdrop-blur-sm border border-border/80 shadow-floating flex items-center justify-center">
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
      <SelectBox
        value={projection}
        onChange={(v) => setProjection(v as Projection)}
        options={[
          { value: 'Perspective', label: 'Perspective' },
          { value: 'Orthographic', label: 'Orthographic' },
        ]}
        fullWidth={false}
        className="bg-surface/90 backdrop-blur-sm border border-border/80 rounded-xs px-2.5 py-1 shadow-card text-[10px] font-medium hover:border-border transition-all whitespace-nowrap"
      />
    </div>
  );
}
