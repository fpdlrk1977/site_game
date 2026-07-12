'use client';

// Particle 섹션 — 눈·불꽃 등 파티클 프리셋. 파티클 이미터 오브젝트.
// InspectorPanel 분리 리팩터: 접힘 상태는 부모가 open/onToggle prop으로 내려준다.

import { Flame, Wind, Sparkles, Snowflake } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, LabeledNum } from './ui';
import type { ObjectNodeSchema, ParticlePreset } from '@/types/scene';

export function ParticleSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  if (!obj.particle) return null;
  return (
          <GroupBox>
            <SectionHeader title="Particle" hint="눈·불꽃 같은 파티클 프리셋. 분위기 연출용이에요." isOpen={open} onToggle={onToggle} />
            {open && <div className="px-3 pb-4 space-y-2">
              <div>
                <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Preset</span>
                <SelectBox
                  value={obj.particle.preset}
                  onChange={(v) => { updateObject(obj.id, { particle: { ...obj.particle!, preset: v as ParticlePreset } }); pushHistory(); }}
                  options={[
                    { value: 'fire', label: '불꽃 (Fire)', icon: <Flame size={14} /> },
                    { value: 'dust', label: '먼지 (Dust)', icon: <Wind size={14} /> },
                    { value: 'light', label: '빛 파티클 (Light)', icon: <Sparkles size={14} /> },
                    { value: 'snow', label: '눈 (Snow)', icon: <Snowflake size={14} /> },
                  ]}
                />
              </div>
              <div>
                <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">색상 오버라이드</span>
                <div className="px-2 flex items-center border border-border rounded-xs">
                  <input type="color"
                    value={obj.particle.color ?? '#ffffff'}
                    onChange={(e) => updateObject(obj.id, { particle: { ...obj.particle!, color: e.target.value } })}
                    onBlur={pushHistory}
                    className="w-5 h-5 cursor-pointer"
                  />
                  <input type="text"
                    value={obj.particle.color ?? '#ffffff'}
                    onChange={(e) => updateObject(obj.id, { particle: { ...obj.particle!, color: e.target.value } })}
                    onBlur={pushHistory}
                    placeholder="프리셋 기본값"
                    className="flex-1 px-2.5 py-1.5  text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              {([
                { key: 'count', label: '파티클 수', min: 10, max: 500, precision: 0, dragStep: 2, fallback: 80 },
                { key: 'speed', label: '속도',       min: 0.1, max: 5,   precision: 1, dragStep: 0.05, fallback: 0.8 },
                { key: 'spread', label: '확산 범위', min: 0.1, max: 5,   precision: 1, dragStep: 0.05, fallback: 1 },
                { key: 'size',  label: '크기',       min: 0.01, max: 0.5, precision: 2, dragStep: 0.005, fallback: 0.08 },
              ] as const).map(({ key, label, min, max, precision, dragStep, fallback }) => (
                <LabeledNum key={key}
                  label={label}
                  value={(obj.particle![key] as number | undefined) ?? fallback}
                  onChange={(v) => updateObject(obj.id, { particle: { ...obj.particle!, [key]: v } })}
                  onCommit={pushHistory}
                  min={min} max={max} precision={precision} dragStep={dragStep}
                />
              ))}
            </div>}
          </GroupBox>
  );
}
