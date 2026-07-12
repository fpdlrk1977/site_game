'use client';

// Physics 섹션 — 플레이 모드 충돌(콜라이더/센서/질량/마찰/반발). 라이트·그룹 제외.
// InspectorPanel 분리 리팩터: 접힘 상태는 부모가 open/onToggle prop으로 내려준다.

import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema, ColliderType } from '@/types/scene';

export function PhysicsSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  return (
        <GroupBox>
          <div className="relative">
          <SectionHeader title="Physics" hint="플레이 모드 충돌. 켜면 캐릭터가 부딪혀요. Is Sensor를 켜면 통과 가능한 투명 트리거 영역이 되어 area 이벤트에 씁니다." isOpen={open} onToggle={onToggle} />
          {open &&<label className="flex items-center justify-between cursor-pointer absolute top-3 right-4">
            {/* <span className="text-[10px] font-semibold text-muted/50">Enable Physics</span> */}
            <Toggle
              value={obj.physics.enabled}
              onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, enabled: v } }); pushHistory(); }}
            />
          </label>
          }
          {open && obj.physics.enabled && (
            <div className='px-3 pb-3 space-y-1'>
              <div>
                <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Collider Type</span>
                <SelectBox
                  value={obj.physics.colliderType}
                  onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, colliderType: v as ColliderType } }); pushHistory(); }}
                  options={[
                    { value: 'box', label: 'Box (Cuboid)' },
                    { value: 'sphere', label: 'Sphere (Ball)' },
                    { value: 'capsule', label: 'Capsule' },
                    { value: 'hull', label: 'Convex Hull' },
                    { value: 'trimesh', label: 'Trimesh (정확/느림)' },
                  ]}
                />
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-[10px] font-semibold text-muted/50">Is Sensor  <span className="text-[10px] font-normal text-muted/60 mt-0.5">(Area 진입 시 이벤트 발생)</span></p>
                  
                </div>
                <Toggle
                  value={obj.physics.isSensor}
                  onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, isSensor: v } }); pushHistory(); }}
                />
              </label>
              {/* Dynamic — mass>0이면 플레이 모드에서 중력으로 떨어지고 튕긴다(fixed=정적 벽). 센서는 트리거라 제외. */}
              {!obj.physics.isSensor && (
                <>
                  <label className="flex items-center justify-between cursor-pointer">
                    <p className="text-[10px] font-semibold text-muted/50">Dynamic <span className="font-normal text-muted/60">(중력 낙하·튕김)</span></p>
                    <Toggle
                      value={obj.physics.mass > 0}
                      onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, mass: v ? (obj.physics.mass > 0 ? obj.physics.mass : 1) : 0 } }); pushHistory(); }}
                    />
                  </label>
                  {obj.physics.mass > 0 && (
                    <LabeledNum
                      label="Mass (질량)"
                      value={obj.physics.mass}
                      onChange={(v) => updateObject(obj.id, { physics: { ...obj.physics, mass: Math.max(0.01, v) } })}
                      onCommit={pushHistory}
                      min={0.01} max={100} precision={2} dragStep={0.1}
                    />
                  )}
                </>
              )}
              <div className='flex gap-2'>
                <div>
                  <LabeledNum
                    label="Friction"
                    value={obj.physics.friction}
                    onChange={(v) => updateObject(obj.id, { physics: { ...obj.physics, friction: v } })}
                    onCommit={pushHistory}
                    min={0} max={1} precision={2} dragStep={0.005}
                  />
                </div>
                <div>
                  <LabeledNum
                    label="Restitution"
                    value={obj.physics.restitution}
                    onChange={(v) => updateObject(obj.id, { physics: { ...obj.physics, restitution: v } })}
                    onCommit={pushHistory}
                    min={0} max={1} precision={2} dragStep={0.005}
                  />
                </div>
              </div>
            </div>
          )}
        
        </div>
    </GroupBox>
  );
}
