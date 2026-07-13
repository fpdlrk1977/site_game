'use client';

// Cloner (라이브) 섹션 — 클로너 그룹 파라미터(개수/간격/모드) 실시간 재생성. 접힘 없음.
import { Grid2x2 } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SectionHeader, GroupBox, LabeledNum, XYZRow } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function ClonerSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { objects, updateCloner, pushHistory } = useSceneStore();
  if (!obj.clonerConfig) return null;
          const cfg = obj.clonerConfig!;
          const cloneCount = objects.filter((o) => o.parentId === obj.id).length;
          const setCfg = (patch: Partial<typeof cfg>) => updateCloner(obj.id, { ...cfg, ...patch });
          return (
            <GroupBox>
              <SectionHeader title="Cloner (Live)" icon={<Grid2x2 size={12} />} hint="Non-destructive array — changing count/spacing/mode regenerates the clones live. Editing the single source updates every clone. Clones appear under the cloner group in the tree." isOpen={open} onToggle={onToggle} />
              {open && <div className="px-3 pb-4 space-y-2">
                <div className="grid grid-cols-2 gap-1">
                  {(['linear', 'radial'] as const).map((m) => (
                    <button key={m} onClick={() => { setCfg({ mode: m }); pushHistory(); }}
                      className={`py-1 rounded-xs text-[10px] transition-colors ${cfg.mode === m ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                    >{m === 'linear' ? 'Linear' : 'Radial'}</button>
                  ))}
                </div>
                <LabeledNum label="Count (incl. source)" value={cfg.count} onChange={(v) => setCfg({ count: Math.max(2, Math.min(200, Math.round(v))) })} onCommit={pushHistory} min={2} max={200} precision={0} dragStep={1} />
                {cfg.mode === 'linear' ? (
                  <XYZRow label="Spacing (m)" x={cfg.offset.x} y={cfg.offset.y} z={cfg.offset.z}
                    onChangeX={(v) => setCfg({ offset: { ...cfg.offset, x: v } })}
                    onChangeY={(v) => setCfg({ offset: { ...cfg.offset, y: v } })}
                    onChangeZ={(v) => setCfg({ offset: { ...cfg.offset, z: v } })}
                    onCommit={pushHistory} dragStep={0.5}
                  />
                ) : (
                  <>
                    <LabeledNum label="Radius (m)" value={cfg.radius ?? 3} onChange={(v) => setCfg({ radius: Math.max(0.1, v) })} onCommit={pushHistory} min={0.1} max={100} precision={2} dragStep={0.25} />
                    <div>
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Rotation axis</span>
                      <div className="grid grid-cols-3 gap-1">
                        {(['x', 'y', 'z'] as const).map((ax) => (
                          <button key={ax} onClick={() => { setCfg({ axis: ax }); pushHistory(); }}
                            className={`py-1 rounded-xs text-[10px] uppercase transition-colors ${(cfg.axis ?? 'y') === ax ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                          >{ax}{ax === 'y' ? ' (floor)' : ''}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <p className="text-[10px] text-muted/50">{cloneCount} placed. Edit the source and clones update automatically.</p>
              </div>}
            </GroupBox>
          );
}
