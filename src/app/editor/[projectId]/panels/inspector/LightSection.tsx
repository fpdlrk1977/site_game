'use client';

// Light 섹션 — 포인트/스팟/방향 광원(색·강도·거리·감쇠·그림자). obj.light가 있는 오브젝트.
// InspectorPanel 분리 리팩터: 접힘 상태는 부모가 open/onToggle prop으로 내려준다.

import { Lightbulb, Flashlight, Sun } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function LightSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  if (!obj.light) return null; // 부모가 obj.light일 때만 렌더 — 내부 좁히기용
  return (
          <GroupBox>
            <SectionHeader title="Light" hint="Point / spot / directional light. Adjust color, intensity, distance, decay and more." isOpen={open} onToggle={onToggle} />
            {open && (
              <div className="px-3 pb-4 space-y-2">
                {/* Type */}
                <div>
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Type</span>
                  <SelectBox
                    value={obj.light.type}
                    onChange={(v) => { updateObject(obj.id, { light: { ...obj.light!, type: v as 'point' | 'spot' | 'directional' } }); pushHistory(); }}
                    options={[
                      { value: 'point', label: 'Point Light', icon: <Lightbulb size={14} /> },
                      { value: 'spot', label: 'Spot Light', icon: <Flashlight size={14} /> },
                      { value: 'directional', label: 'Directional Light', icon: <Sun size={14} /> },
                    ]}
                  />
                </div>
                {/* Color */}
                <div className="">
                  <span className="text-[10px] font-semibold text-muted/50">Color</span>
                  {/* <div className="flex items-center gap-2">
                    <input type="color" value={obj.light.color}
                      onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
                    <span className="text-[10px]  text-muted">{obj.light.color}</span>
                  </div> */}

                  <div className="px-2 flex items-center border border-border rounded-xs">
                    <input
                      type="color"
                      value={obj.light.color}
                    onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="w-5 h-5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={obj.light.color}
                      onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="flex-1 px-2.5 py-1.5  text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                </div>
                {/* Intensity */}
                <div>
                  <LabeledNum
                    label="Intensity"
                    value={obj.light.intensity}
                    onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, intensity: v } })}
                    onCommit={pushHistory}
                    min={0} max={10} precision={1} dragStep={0.05}
                  />
                </div>
                {/* Distance (point, spot) */}
                {obj.light.type !== 'directional' && (
                  <div>
                    <LabeledNum
                      label="Distance"
                      value={obj.light.distance ?? 20}
                      onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, distance: v } })}
                      onCommit={pushHistory}
                      min={1} max={100} precision={0} dragStep={1}
                    />
                  </div>
                )}
                {/* Decay (point, spot) */}
                {obj.light.type !== 'directional' && (
                  <div>
                    <LabeledNum
                      label="Decay"
                      value={obj.light.decay ?? 2}
                      onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, decay: v } })}
                      onCommit={pushHistory}
                      min={0} max={3} precision={1} dragStep={0.02}
                    />
                  </div>
                )}
                {/* Angle + Penumbra (spot only) */}
                {obj.light.type === 'spot' && (
                  <>
                    <div>
                      <LabeledNum
                        label="Angle (°)"
                        value={Math.round((obj.light.angle ?? Math.PI / 6) * 180 / Math.PI)}
                        onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, angle: v * Math.PI / 180 } })}
                        onCommit={pushHistory}
                        min={5} max={89} precision={0} dragStep={1}
                      />
                    </div>
                    <div>
                      <LabeledNum
                        label="Penumbra"
                        value={obj.light.penumbra ?? 0.1}
                        onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, penumbra: v } })}
                        onCommit={pushHistory}
                        min={0} max={1} precision={2} dragStep={0.005}
                      />
                    </div>
                  </>
                )}
                {/* Cast Shadow */}
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[10px] font-semibold text-muted/50">Cast Shadow</span>
                  <Toggle
                    value={obj.light.castShadow ?? false}
                    onChange={(v) => { updateObject(obj.id, { light: { ...obj.light!, castShadow: v } }); pushHistory(); }}
                  />
                </label>
              </div>
            )}
    </GroupBox>
  );
}
