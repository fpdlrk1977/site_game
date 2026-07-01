'use client';

import { useSceneStore } from '@/store/sceneStore';

export function ViewportStatusBar() {
  const { selectedId, objects } = useSceneStore();
  const obj = selectedId ? objects.find((o) => o.id === selectedId) : null;

  const f = (n: number) => n.toFixed(2);
  const deg = (n: number) => `${n.toFixed(1)}°`;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-7 bg-zinc-950/80 backdrop-blur-sm border-t border-zinc-800/50 flex items-center px-4 pointer-events-none select-none z-10">
      {obj ? (
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-600 text-[10px] uppercase tracking-wider w-4">P</span>
            <span className="text-zinc-400">{f(obj.position.x)}</span>
            <span className="text-zinc-400">{f(obj.position.y)}</span>
            <span className="text-zinc-400">{f(obj.position.z)}</span>
          </div>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-600 text-[10px] uppercase tracking-wider w-4">R</span>
            <span className="text-zinc-400">{deg(obj.rotation.x)}</span>
            <span className="text-zinc-400">{deg(obj.rotation.y)}</span>
            <span className="text-zinc-400">{deg(obj.rotation.z)}</span>
          </div>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-600 text-[10px] uppercase tracking-wider w-4">S</span>
            <span className="text-zinc-400">{f(obj.scale.x)}</span>
            <span className="text-zinc-400">{f(obj.scale.y)}</span>
            <span className="text-zinc-400">{f(obj.scale.z)}</span>
          </div>
        </div>
      ) : (
        <span className="text-[11px] text-zinc-700 font-mono">오브젝트를 선택하면 좌표가 표시됩니다</span>
      )}
      <div className="ml-auto text-[11px] text-zinc-700 font-mono tracking-wider">Perspective</div>
    </div>
  );
}
