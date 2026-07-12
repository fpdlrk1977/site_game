'use client';

// Motion 섹션 — 앰비언트 애니메이션(둥실/회전/펄스/궤도/유동). 라이트 제외 오브젝트.
// InspectorPanel 분리 리팩터: 자체 완결 섹션(obj + updateObject/pushHistory + 공용 프리미티브)만 이동.

import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function MotionSection({ obj }: { obj: ObjectNodeSchema }) {
  const { updateObject, pushHistory } = useSceneStore();
  return (
          <GroupBox>
          <SectionHeader title="Motion" hint="뷰어에서 항상 실행되는 앰비언트 애니메이션. 둥실/회전/펄스/궤도/유동(정해진 영역 안을 열기구처럼 자유 이동). 기본은 시각 전용이고, '콜라이더 동반'을 켜면 플레이 모드에서 실제 이동 장애물이 돼요." />
          <div className="px-3 pb-4 space-y-2">
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
                      { value: 'none', label: '없음' },
                      { value: 'float', label: '둥실 (위아래)' },
                      { value: 'spin', label: '회전 (제자리)' },
                      { value: 'pulse', label: '펄스 (커졌다 작아짐)' },
                      { value: 'orbit', label: '궤도 (원)' },
                      { value: 'wander', label: '유동 (영역 내 자유·열기구)' },
                    ]}
                  />
                  {type !== 'none' && (
                    <div className="grid grid-cols-2 gap-2">
                      <LabeledNum label="속도" value={m?.speed ?? 1} onChange={(v) => setM({ speed: v })} onCommit={pushHistory} min={0.1} max={5} precision={2} dragStep={0.1} />
                      {(type === 'float' || type === 'pulse') && (
                        <LabeledNum label="진폭" value={m?.amplitude ?? (type === 'float' ? 0.5 : 0.2)} onChange={(v) => setM({ amplitude: v })} onCommit={pushHistory} min={0} max={5} precision={2} dragStep={0.05} />
                      )}
                      {(type === 'orbit' || type === 'wander') && (
                        <LabeledNum label="반경" value={m?.radius ?? (type === 'orbit' ? 2 : 3)} onChange={(v) => setM({ radius: v })} onCommit={pushHistory} min={0.5} max={50} precision={1} dragStep={0.5} />
                      )}
                      {type === 'spin' && (
                        <div>
                          <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">회전축</span>
                          <SelectBox
                            value={m?.axis ?? 'y'}
                            onChange={(v) => { setM({ axis: v as 'x' | 'y' | 'z' }); pushHistory(); }}
                            options={[{ value: 'y', label: 'Y (세로)' }, { value: 'x', label: 'X (앞뒤)' }, { value: 'z', label: 'Z (좌우)' }]}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {type !== 'none' && type !== 'pulse' && (
                    <label className="flex items-center gap-2 text-[10px] text-muted/70 pt-0.5">
                      <Toggle value={m?.collider === true} onChange={(v) => { setM({ collider: v }); pushHistory(); }} />
                      <span>{obj.isGroup ? '플레이 모드에서 그룹 전체가 이동 장애물' : '플레이 모드에서 콜라이더도 이동(진짜 장애물)'}</span>
                    </label>
                  )}
                  {type !== 'none' && (
                    <p className="text-[10px] text-muted/50">
                      에디터엔 정적, 실제 움직임은 뷰어에서 확인. <b>콜라이더 동반 OFF = 통과 가능한 장식</b>, ON = 플레이 중 부딪히는 이동 장애물(캐릭터가 올라타 실려가진 않음).
                    </p>
                  )}
                </>
              );
            })()}
          </div>
          </GroupBox>
  );
}
