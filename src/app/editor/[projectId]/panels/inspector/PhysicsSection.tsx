'use client';

// Physics 섹션 — 플레이 모드 충돌(콜라이더/센서/질량/마찰/반발). 라이트·그룹 제외.
// InspectorPanel 분리 리팩터: 접힘 상태는 부모가 open/onToggle prop으로 내려준다.

import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema, ColliderType } from '@/types/scene';

// Physics는 '동작에 영향(enable)' 섹션 — 화살표 접기 없이 스위치 하나로 켜고 끈다(Ground와 동일 패턴).
export function PhysicsSection({ obj }: { obj: ObjectNodeSchema }) {
  const { updateObject, pushHistory } = useSceneStore();
  return (
        <GroupBox>
          <div className="relative">
          <SectionHeader title="Physics" hint="Collision in play mode. When on, the character bumps into it. Turn on Is Sensor to make it a pass-through invisible trigger zone used for area events." />
          <label className="flex items-center justify-between cursor-pointer absolute top-4.5 right-4">
            <Toggle
              value={obj.physics.enabled}
              onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, enabled: v } }); pushHistory(); }}
            />
          </label>
          {obj.physics.enabled && (
            <div className='px-3 pb-3 space-y-2'>
              <div className="flex gap-2 pt-1 justify-between items-center">
                <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Collider Type</span>
                <SelectBox
                  value={obj.physics.colliderType}
                  onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, colliderType: v as ColliderType } }); pushHistory(); }}
                  options={[
                    { value: 'box', label: 'Box (Cuboid)' },
                    { value: 'sphere', label: 'Sphere (Ball)' },
                    { value: 'capsule', label: 'Capsule' },
                    { value: 'hull', label: 'Convex Hull' },
                    { value: 'trimesh', label: 'Trimesh (accurate/slow)' },
                  ]}
                  fullWidth={false}
                  gray
                />
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-[10px] font-semibold text-muted/50">Is Sensor  <span className="text-[10px] font-normal text-muted/60 mt-0.5">(fires event on area enter)</span></p>
                  
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
                    <p className="text-[10px] font-semibold text-muted/50">Dynamic <span className="font-normal text-muted/60">(gravity fall &amp; bounce)</span></p>
                    <Toggle
                      value={obj.physics.mass > 0}
                      onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, mass: v ? (obj.physics.mass > 0 ? obj.physics.mass : 1) : 0 } }); pushHistory(); }}
                    />
                  </label>
                  {obj.physics.mass > 0 && (
                    <LabeledNum
                      label="Mass"
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
