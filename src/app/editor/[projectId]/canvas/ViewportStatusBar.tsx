'use client';

import { useSceneStore } from '@/store/sceneStore';

export function ViewportStatusBar() {
  const { selectedId, objects } = useSceneStore();
  const obj = selectedId ? objects.find((o) => o.id === selectedId) : null;

  const f = (n: number) => n.toFixed(2);
  const deg = (n: number) => `${n.toFixed(1)}°`;

  if (!obj) return null;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
      <div className="flex items-center gap-3 px-3.5 py-2 bg-surface/95 backdrop-blur-sm border border-border/80 rounded-xs shadow-floating text-[11px] font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-muted text-[9px] uppercase tracking-wider font-sans font-semibold">Pos</span>
          <span className="text-foreground">{f(obj.position.x)}</span>
          <span className="text-muted/60">,</span>
          <span className="text-foreground">{f(obj.position.y)}</span>
          <span className="text-muted/60">,</span>
          <span className="text-foreground">{f(obj.position.z)}</span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted text-[9px] uppercase tracking-wider font-sans font-semibold">Rot</span>
          <span className="text-foreground">{deg(obj.rotation.x)}</span>
          <span className="text-muted/60">,</span>
          <span className="text-foreground">{deg(obj.rotation.y)}</span>
          <span className="text-muted/60">,</span>
          <span className="text-foreground">{deg(obj.rotation.z)}</span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted text-[9px] uppercase tracking-wider font-sans font-semibold">Scl</span>
          <span className="text-foreground">{f(obj.scale.x)}</span>
          <span className="text-muted/60">,</span>
          <span className="text-foreground">{f(obj.scale.y)}</span>
          <span className="text-muted/60">,</span>
          <span className="text-foreground">{f(obj.scale.z)}</span>
        </div>
        <div className="w-px h-3 bg-border" />
        <span className="text-muted text-[10px] font-sans font-medium truncate max-w-[100px]">{obj.name}</span>
      </div>
    </div>
  );
}
