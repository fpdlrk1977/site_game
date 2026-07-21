'use client';

// Motion 섹션 — 앰비언트 애니메이션(둥실/회전/펄스/궤도/유동). 라이트 제외 오브젝트.
// InspectorPanel 분리 리팩터: 자체 완결 섹션(obj + updateObject/pushHistory + 공용 프리미티브)만 이동.

import { Wind } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function MotionSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  const hasMotion = !!obj.motion;
  return (
          <GroupBox>
          <SectionHeader title="Motion (ambient)" icon={<Wind size={14} />} hint="Decorative movement that always loops in the viewer — no trigger needed. Float / Spin / Pulse / Orbit / Wander (roams freely within an area like a hot-air balloon). Visual-only by default; turn on 'With collider' for a real moving obstacle. ↔ For a mechanical joint that opens/closes on cue use Actuator; for a scripted keyframe sequence use Animation." isOpen={open} onToggle={onToggle} dot={hasMotion} />
          {open && <div className="px-3 pb-4 space-y-2">
            {(() => {
              const m = obj.motion;
              const type = m?.type ?? 'none';
              const setM = (patch: Partial<NonNullable<ObjectNodeSchema['motion']>>) =>
                updateObject(obj.id, { motion: { ...(obj.motion ?? { type: 'float' }), ...patch } });
              return (
                <>
                  <SelectBox
                    value={type}
                    onChange={(v) => {
                      if (v === 'none') updateObject(obj.id, { motion: undefined });
                      else setM({ type: v as NonNullable<ObjectNodeSchema['motion']>['type'] });
                      pushHistory();
                    }}
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'float', label: 'Float (up & down)' },
                      { value: 'spin', label: 'Spin (in place)' },
                      { value: 'pulse', label: 'Pulse (grow & shrink)' },
                      { value: 'orbit', label: 'Orbit (circle)' },
                      { value: 'wander', label: 'Wander (free within area)' },
                    ]}
                  />
                  {type !== 'none' && (
                    <div className="grid grid-cols-2 gap-2">
                      <LabeledNum label="Speed" value={m?.speed ?? 1} onChange={(v) => setM({ speed: v })} onCommit={pushHistory} min={0.1} max={10} precision={2} dragStep={0.1} />
                      {(type === 'float' || type === 'pulse') && (
                        <LabeledNum label="Amplitude" value={m?.amplitude ?? (type === 'float' ? 0.5 : 0.2)} onChange={(v) => setM({ amplitude: v })} onCommit={pushHistory} min={0} max={5} precision={2} dragStep={0.05} />
                      )}
                      {(type === 'orbit' || type === 'wander') && (
                        <LabeledNum label="Radius" value={m?.radius ?? (type === 'orbit' ? 2 : 3)} onChange={(v) => setM({ radius: v })} onCommit={pushHistory} min={0.5} max={50} precision={1} dragStep={0.5} />
                      )}
                      {type === 'spin' && (
                        <div>
                          <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Axis</span>
                          <SelectBox
                            value={m?.axis ?? 'y'}
                            onChange={(v) => { setM({ axis: v as 'x' | 'y' | 'z' }); pushHistory(); }}
                            options={[{ value: 'y', label: 'Y (up)' }, { value: 'x', label: 'X (front-back)' }, { value: 'z', label: 'Z (left-right)' }]}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {type !== 'none' && type !== 'pulse' && (
                    <label className="flex items-center gap-2 text-[10px] text-muted/70 pt-0.5">
                      <Toggle value={m?.collider === true} onChange={(v) => { setM({ collider: v }); pushHistory(); }} />
                      <span>{obj.isGroup ? 'Whole group becomes a moving obstacle in play mode' : 'Collider moves too in play mode (real obstacle)'}</span>
                    </label>
                  )}
                  {type !== 'none' && (
                    <p className="text-[10px] text-muted/50">
                      Static in the editor; see the real motion in the viewer. <b>Collider OFF = pass-through decoration</b>, ON = a moving obstacle you collide with in play (the character won&apos;t ride on top of it).
                    </p>
                  )}
                </>
              );
            })()}
          </div>}
          </GroupBox>
  );
}
