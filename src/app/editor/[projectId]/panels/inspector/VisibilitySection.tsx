'use client';

// Visibility 섹션 — 표시/숨김·잠금 + (프리미티브) 셰이딩·양면·그림자 옵션. 모든 오브젝트에 표시.
// InspectorPanel 분리 리팩터: 접힘 상태는 부모가 open/onToggle prop으로 내려준다.

import { useSceneStore } from '@/store/sceneStore';
import { SectionHeader, GroupBox, Toggle } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function VisibilitySection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  return (
        <GroupBox>
        <SectionHeader title="Visibility" hint="표시/숨김·잠금 + (프리미티브) 셰이딩·양면·그림자 옵션. 숨김은 뷰어에도 반영되고, 잠금은 뷰포트에서 선택·이동을 막아요(계층 리스트에선 선택 가능)." isOpen={open} onToggle={onToggle} />
        {open && (
          <div className="px-3 pb-4 space-y-2">
            {(['visible', 'locked'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-[10px] font-semibold text-muted/50 capitalize">{key === 'visible' ? 'Visible' : 'Locked'}</span>
                <Toggle
                  value={obj[key]}
                  onChange={() => { updateObject(obj.id, { [key]: !obj[key] }); pushHistory(); }}
                />
              </label>
            ))}
            {/* 렌더 옵션 — 프리미티브 전용(GLB는 모델 자체 재질, 콘텐츠/라이트/파티클 제외) */}
            {obj.primitiveShape && !obj.content && !obj.assetId && !obj.light && !obj.particle && (
              <div className="pt-2 mt-1 border-t border-border/60 space-y-2">
                {([
                  { k: 'flatShading', label: 'Flat Shading (각진 면)', def: false },
                  { k: 'doubleSided', label: 'Double-sided (양면)', def: false },
                  { k: 'castShadow', label: 'Cast Shadow (그림자 생성)', def: true },
                  { k: 'receiveShadow', label: 'Receive Shadow (그림자 수신)', def: true },
                ] as const).map(({ k, label, def }) => (
                  <label key={k} className="flex items-center justify-between cursor-pointer">
                    <span className="text-[10px] font-semibold text-muted/50">{label}</span>
                    <Toggle
                      value={obj.render?.[k] ?? def}
                      onChange={(v) => { updateObject(obj.id, { render: { ...obj.render, [k]: v } }); pushHistory(); }}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        </GroupBox>
  );
}
