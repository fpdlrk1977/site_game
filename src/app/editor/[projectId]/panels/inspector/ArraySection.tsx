'use client';

// Array / Cloner 섹션 — 선택 오브젝트를 N개 복제 배치(직선/격자/원형 + 회전 증분) 또는 라이브 클로너 생성.
// 자체 로컬 상태(개수/간격/모드/반경/축/열·행/회전) 소유. 배치 로직은 lib/cloner의 공용 함수를 스토어가 재사용.
import { useState } from 'react';
import { CircleDot, Grid2x2, Rows3 } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { Tooltip } from '@/components/ui/Tooltip';
import { RangeSlider } from '@/components/ui/RangeSlider';
import { LinkToggle } from '@/components/ui/LinkToggle';
import { SectionHeader, GroupBox, LabeledNum, XYZRow } from './ui';
import type { ObjectNodeSchema, ClonerConfig } from '@/types/scene';

// 격자 배치 실시간 미리보기 — cols×rows 점을 간격 비율 반영해 박스에 맞춰 그린다.
function GridPreview({ cols, rows, spX, spZ }: { cols: number; rows: number; spX: number; spZ: number }) {
  const PV = 72, pad = 9;
  const gw = Math.max(1e-3, (cols - 1) * Math.abs(spX));
  const gh = Math.max(1e-3, (rows - 1) * Math.abs(spZ));
  const s = (PV - 2 * pad) / Math.max(gw, gh);
  const totalW = gw * s, totalH = gh * s;
  const ox = (PV - totalW) / 2, oy = (PV - totalH) / 2;
  const many = cols > 20 || rows > 20; // 점이 너무 많으면 영역만 표시(가벼움)
  return (
    <svg width={PV} height={PV} viewBox={`0 0 ${PV} ${PV}`} className="shrink-0 rounded-xs bg-background border border-border">
      {many ? (
        <rect x={ox} y={oy} width={Math.max(4, totalW)} height={Math.max(4, totalH)} fill="var(--color-primary)" fillOpacity={0.15} stroke="var(--color-primary)" strokeOpacity={0.6} strokeWidth={1} />
      ) : (
        Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((__, c) => (
            <circle key={`${r}-${c}`} cx={ox + c * Math.abs(spX) * s} cy={oy + r * Math.abs(spZ) * s} r={1.7} fill="var(--color-primary)" />
          )),
        )
      )}
    </svg>
  );
}

export function ArraySection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { arraySelected, makeCloner } = useSceneStore();
  const { addToast } = useToast();
  const [arrayCount, setArrayCount] = useState(5);
  const [arrayOffset, setArrayOffset] = useState({ x: 2, y: 0, z: 0 });
  const [arrayMode, setArrayMode] = useState<'linear' | 'grid' | 'radial'>('linear');
  const [arrayRadius, setArrayRadius] = useState(3);
  const [arrayAxis, setArrayAxis] = useState<'x' | 'y' | 'z'>('y');
  const [arrayRise, setArrayRise] = useState(0);   // radial: 칸마다 Y 상승(나선 계단)
  const [gridCols, setGridCols] = useState(4);
  const [gridRows, setGridRows] = useState(4);
  const [gridSpacing, setGridSpacing] = useState({ x: 1, z: 1 }); // grid 전용 간격(linear와 분리)
  const [linkCR, setLinkCR] = useState(false);  // cols=rows 잠금
  const [linkSp, setLinkSp] = useState(false);  // col간격=row간격 잠금
  const [rotStep, setRotStep] = useState(0);

  const clampN = (v: number) => Math.max(1, Math.min(50, Math.round(v)));
  const onCols = (v: number) => { const n = clampN(v); setGridCols(n); if (linkCR) setGridRows(n); };
  const onRows = (v: number) => { const n = clampN(v); setGridRows(n); if (linkCR) setGridCols(n); };
  const onSpX = (v: number) => setGridSpacing((s) => ({ x: v, z: linkSp ? v : s.z }));
  const onSpZ = (v: number) => setGridSpacing((s) => ({ x: linkSp ? v : s.x, z: v }));

  const total = arrayMode === 'grid' ? gridCols * gridRows : arrayCount;
  const cfg = (): ClonerConfig => ({
    mode: arrayMode,
    count: arrayCount,
    offset: arrayMode === 'grid' ? { x: gridSpacing.x, y: 0, z: gridSpacing.z } : arrayOffset,
    ...(arrayMode === 'radial' ? { radius: arrayRadius, axis: arrayAxis, ...(arrayRise ? { rise: arrayRise } : {}) } : {}),
    ...(arrayMode === 'grid' ? { cols: gridCols, rows: gridRows } : {}),
    ...(rotStep ? { rotStep } : {}),
  });

  return (
        <GroupBox>
          <SectionHeader title="Array / Cloner" hint="Duplicate the selected object multiple times. Linear = evenly spaced (fences, stairs), Grid = rows × columns (floor tiles, seats), Radial = arranged in a circle. Rotation step twists each copy (spiral). Count includes the source; undo works. Make it a 'Live cloner' to change settings later in real time." isOpen={open} onToggle={onToggle} />
            <div className="px-3 pb-4 space-y-2">
              {/* 모드 토글 */}
              <div className="grid grid-cols-3 gap-1">
                {(['linear', 'grid', 'radial'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setArrayMode(m)}
                    className={`py-1 rounded-xs text-[10px] transition-colors ${arrayMode === m ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                  >
                    {m === 'linear' ? 'Linear' : m === 'grid' ? 'Grid' : 'Radial'}
                  </button>
                ))}
              </div>

              {arrayMode === 'grid' ? (
                <>
                  <div className="flex gap-2 items-center">
                    {/* 실시간 미리보기 */}
                    <GridPreview cols={gridCols} rows={gridRows} spX={gridSpacing.x} spZ={gridSpacing.z} />
                    <div className="flex-1 space-y-2 min-w-0">
                      {/* 열/행 (+ 잠금은 맨 끝) */}
                      <div className="flex items-end gap-1">
                        <div className="flex-1 min-w-0"><LabeledNum label="Columns" value={gridCols} onChange={onCols} onCommit={() => {}} min={1} max={50} precision={0} dragStep={1} /></div>
                        <div className="flex-1 min-w-0"><LabeledNum label="Rows" value={gridRows} onChange={onRows} onCommit={() => {}} min={1} max={50} precision={0} dragStep={1} /></div>
                        <LinkToggle value={linkCR} onChange={(v) => { setLinkCR(v); if (v) setGridRows(gridCols); }} title="열=행 함께 조절" />
                      </div>
                      {/* 간격 (+ 잠금은 맨 끝) */}
                      <div className="flex items-end gap-1">
                        <div className="flex-1 min-w-0"><LabeledNum label="Col spacing" value={gridSpacing.x} onChange={onSpX} onCommit={() => {}} precision={2} dragStep={0.25} /></div>
                        <div className="flex-1 min-w-0"><LabeledNum label="Row spacing" value={gridSpacing.z} onChange={onSpZ} onCommit={() => {}} precision={2} dragStep={0.25} /></div>
                        <LinkToggle value={linkSp} onChange={(v) => { setLinkSp(v); if (v) setGridSpacing((s) => ({ ...s, z: s.x })); }} title="가로=세로 간격 함께 조절" />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted/50">{gridCols} × {gridRows} = {total} (incl. source)</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Count (incl. source)</span>
                  </div>
                  <RangeSlider value={arrayCount} onChange={(v) => setArrayCount(Math.max(1, Math.min(100, Math.round(v))))} min={1} max={100} step={1} showValue precision={0} />
                  {arrayMode === 'linear' ? (
                    <XYZRow label="Spacing" x={arrayOffset.x} y={arrayOffset.y} z={arrayOffset.z}
                      onChangeX={(v) => setArrayOffset((o) => ({ ...o, x: v }))}
                      onChangeY={(v) => setArrayOffset((o) => ({ ...o, y: v }))}
                      onChangeZ={(v) => setArrayOffset((o) => ({ ...o, z: v }))}
                      onCommit={() => {}} dragStep={0.5}
                    />
                  ) : (
                    <>
                      <LabeledNum label="Radius" value={arrayRadius} onChange={(v) => setArrayRadius(Math.max(0.1, v))} onCommit={() => {}} min={0.1} max={100} precision={2} dragStep={0.25} />
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
                      {/* 나선 계단 — Rise=칸마다 상승 */}
                      <LabeledNum label="Rise / step" value={arrayRise} onChange={setArrayRise} onCommit={() => {}} min={0} max={10} precision={2} dragStep={0.05} />
                      <button
                        onClick={() => setRotStep(+(360 / Math.max(1, arrayCount)).toFixed(2))}
                        className="w-full py-1 rounded-xs bg-background text-muted hover:text-foreground text-[10px] transition-colors"
                        title="Rotation step을 계단이 원을 따라 돌게(360÷Count) 맞춰요"
                      >나선 계단 방향 맞춤 (Rotation step 자동)</button>
                    </>
                  )}
                </>
              )}

              {/* 회전 증분 — 복제마다 Y축 회전(도). 나선 계단·트위스트. 모든 모드 공통. */}
              <LabeledNum label="Rotation step (°/copy)" value={rotStep} onChange={setRotStep} onCommit={() => {}} min={-180} max={180} precision={1} dragStep={1} />

              {/* 위 설정을 공유하는 두 방식 — 한 번 복제(독립) vs 라이브 클로너(계속 편집) */}
              <Tooltip wide className="w-full" content="Creates independent objects now. The count can't be changed later (they become normal objects).">
                <button
                  onClick={() => {
                    arraySelected(cfg());
                    addToast(`Created ${total - 1} independent copies`, 'success');
                  }}
                  className="w-full py-1.5 rounded-xs bg-surface border border-border text-foreground hover:text-muted hover:bg-background text-[11px] font-medium transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5">{arrayMode === 'radial' ? <CircleDot size={13} /> : arrayMode === 'grid' ? <Grid2x2 size={13} /> : <Rows3 size={13} />} Duplicate once ({total}, independent)</span>
                </button>
              </Tooltip>
              {!obj.parentId && (
                <Tooltip wide className="w-full" content="Change count and spacing anytime, and editing the source updates all copies in real time.">
                  <button
                    onClick={() => {
                      makeCloner(cfg());
                      addToast('Created a live cloner', 'success');
                    }}
                    className="w-full py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
                  >
                    <span className="inline-flex items-center gap-1.5"><Grid2x2 size={13} /> Make live cloner ({total})</span>
                  </button>
                </Tooltip>
              )}
            </div>
        </GroupBox>
  );
}
