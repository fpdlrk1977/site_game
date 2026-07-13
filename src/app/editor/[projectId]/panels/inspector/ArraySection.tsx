'use client';

// Array / Cloner 섹션 — 선택 오브젝트를 N개 복제 배치(선형/원형) 또는 라이브 클로너 생성.
// 자체 로컬 상태(개수/간격/모드/반경/축) 소유.
import { useState } from 'react';
import { CircleDot, Grid2x2 } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { SectionHeader, GroupBox, LabeledNum, XYZRow } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function ArraySection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { arraySelected, makeCloner } = useSceneStore();
  const { addToast } = useToast();
  const [arrayCount, setArrayCount] = useState(5);
  const [arrayOffset, setArrayOffset] = useState({ x: 2, y: 0, z: 0 });
  const [arrayMode, setArrayMode] = useState<'linear' | 'radial'>('linear');
  const [arrayRadius, setArrayRadius] = useState(3);
  const [arrayAxis, setArrayAxis] = useState<'x' | 'y' | 'z'>('y');
  return (
        <GroupBox>
          <SectionHeader title="Array / Cloner" hint="Duplicate the selected object multiple times. Linear = evenly spaced (fences, pillars, stairs), Radial = arranged in a circle around a center (clock numbers, chairs around a round table). Count includes the source; undo (Ctrl+Z) works. Make it a 'Live cloner' to change count and spacing later in real time." isOpen={open} onToggle={onToggle} />
            <div className="px-3 pb-4 space-y-2">
              {/* 모드 토글 */}
              <div className="grid grid-cols-2 gap-1">
                {(['linear', 'radial'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setArrayMode(m)}
                    className={`py-1 rounded-xs text-[10px] transition-colors ${arrayMode === m ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                  >
                    {m === 'linear' ? 'Linear' : 'Radial'}
                  </button>
                ))}
              </div>
              <LabeledNum label="Count (incl. source)" value={arrayCount} onChange={(v) => setArrayCount(Math.max(2, Math.min(100, Math.round(v))))} onCommit={() => {}} min={2} max={100} precision={0} dragStep={1} />
              {arrayMode === 'linear' ? (
                <XYZRow label="Spacing (m)" x={arrayOffset.x} y={arrayOffset.y} z={arrayOffset.z}
                  onChangeX={(v) => setArrayOffset((o) => ({ ...o, x: v }))}
                  onChangeY={(v) => setArrayOffset((o) => ({ ...o, y: v }))}
                  onChangeZ={(v) => setArrayOffset((o) => ({ ...o, z: v }))}
                  onCommit={() => {}} dragStep={0.5}
                />
              ) : (
                <>
                  <LabeledNum label="Radius (m)" value={arrayRadius} onChange={(v) => setArrayRadius(Math.max(0.1, v))} onCommit={() => {}} min={0.1} max={100} precision={2} dragStep={0.25} />
                  <div>
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Rotation axis</span>
                    <div className="grid grid-cols-3 gap-1">
                      {(['x', 'y', 'z'] as const).map((ax) => (
                        <button key={ax} onClick={() => setArrayAxis(ax)}
                          className={`py-1 rounded-xs text-[10px] uppercase transition-colors ${arrayAxis === ax ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                        >{ax}{ax === 'y' ? ' (floor)' : ''}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {/* 위 설정을 공유하는 두 방식 — 한 번 복제(독립) vs 라이브 클로너(계속 편집) */}
              <button
                onClick={() => {
                  arraySelected(arrayCount, arrayOffset, arrayMode === 'radial' ? { radius: arrayRadius, axis: arrayAxis } : null);
                  addToast(`Created ${arrayCount - 1} independent copies`, 'success');
                }}
                className="w-full py-1.5 rounded-xs bg-surface border border-border text-foreground hover:text-muted hover:bg-background text-[11px] font-medium transition-colors"
              >
<span className="inline-flex items-center gap-1.5">{arrayMode === 'radial' ? <CircleDot size={13} /> : <Grid2x2 size={13} />} Duplicate once ({arrayCount}, independent)</span>
              </button>
              {!obj.parentId && (
                <button
                  onClick={() => {
                    makeCloner({ mode: arrayMode, count: arrayCount, offset: arrayOffset, ...(arrayMode === 'radial' ? { radius: arrayRadius, axis: arrayAxis } : {}) });
                    addToast('Created a live cloner', 'success');
                  }}
                  className="w-full py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
                >
<span className="inline-flex items-center gap-1.5"><Grid2x2 size={13} /> Make live cloner ({arrayCount})</span>
                </button>
              )}
              <p className="text-[10px] text-muted/50">
                <b>Duplicate once</b> = creates independent objects now (count can&apos;t change later). <b>Live cloner</b> = change count and spacing anytime, and editing the source updates them all.
              </p>
            </div>
        </GroupBox>
  );
}
