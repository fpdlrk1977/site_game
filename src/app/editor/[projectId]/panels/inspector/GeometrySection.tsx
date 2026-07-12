'use client';

// Geometry 섹션 — 프리미티브 형태 조절(둥근 박스·각뿔대·로프트 단면).
import { useSceneStore } from '@/store/sceneStore';
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function GeometrySection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  return (
          <GroupBox>
            <SectionHeader title="Geometry" hint="프리미티브 형태 조절. 박스는 모서리 둥글기, 각뿔대는 윗면 크기, 로프트는 아래→위 단면 크기를 층마다 조절해요." isOpen={open} onToggle={onToggle} />
            {open && (
              <div className="px-3 pb-4 space-y-2">
                {obj.primitiveShape === 'box' && (
                  <>
                    <LabeledNum
                      label="모서리 둥글기"
                      value={obj.geom?.cornerRadius ?? 0}
                      onChange={(v) => updateObject(obj.id, { geom: { ...obj.geom, cornerRadius: Math.max(0, Math.min(0.5, v)) } })}
                      onCommit={pushHistory}
                      min={0} max={0.5} precision={2} dragStep={0.01}
                    />
                    {(obj.geom?.cornerRadius ?? 0) > 0 && (
                      <LabeledNum
                        label="둥근면 부드러움"
                        value={obj.geom?.cornerSegments ?? 4}
                        onChange={(v) => updateObject(obj.id, { geom: { ...obj.geom, cornerSegments: Math.max(1, Math.min(10, Math.round(v))) } })}
                        onCommit={pushHistory}
                        min={1} max={10} precision={0} dragStep={1}
                      />
                    )}
                    <p className="text-[10px] text-muted/50">둥글기 0 = 각진 기본 박스.</p>
                  </>
                )}
                {obj.primitiveShape === 'frustum' && (
                  <>
                    <LabeledNum
                      label="윗면 크기"
                      value={obj.geom?.topScale ?? 0.5}
                      onChange={(v) => updateObject(obj.id, { geom: { ...obj.geom, topScale: Math.max(0, Math.min(1, v)) } })}
                      onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.02}
                    />
                    <p className="text-[10px] text-muted/50">0 = 뾰족한 각뿔, 1 = 박스. 아랫면 기준 윗면 배율.</p>
                  </>
                )}
                {obj.primitiveShape === 'loft' && (() => {
                  const sections = obj.geom?.sections && obj.geom.sections.length >= 2 ? obj.geom.sections : [1, 0.7, 0.4];
                  const setSections = (next: number[]) => updateObject(obj.id, { geom: { ...obj.geom, sections: next } });
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-muted/50 tracking-wide">단면 (아래 → 위)</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setSections([...sections, sections[sections.length - 1]]); pushHistory(); }}
                            disabled={sections.length >= 8}
                            className="w-5 h-5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[11px] leading-none disabled:opacity-40"
                            title="단면 추가"
                          >+</button>
                          <button
                            onClick={() => { if (sections.length > 2) { setSections(sections.slice(0, -1)); pushHistory(); } }}
                            disabled={sections.length <= 2}
                            className="w-5 h-5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[11px] leading-none disabled:opacity-40"
                            title="마지막 단면 제거"
                          >−</button>
                        </div>
                      </div>
                      {sections.map((sv, i) => (
                        <LabeledNum
                          key={i}
                          label={`단면 ${i + 1}${i === 0 ? ' (바닥)' : i === sections.length - 1 ? ' (꼭대기)' : ''}`}
                          value={sv}
                          onChange={(v) => setSections(sections.map((x, j) => (j === i ? Math.max(0, Math.min(1, v)) : x)))}
                          onCommit={pushHistory}
                          min={0} max={1} precision={2} dragStep={0.02}
                        />
                      ))}
                      <p className="text-[10px] text-muted/50">아래→위 각 층의 폭(0~1). 층을 늘려 병·꽃병·로켓·탑처럼 굴곡진 형태를 만들어요.</p>
                    </>
                  );
                })()}
              </div>
            )}
          </GroupBox>
  );
}
