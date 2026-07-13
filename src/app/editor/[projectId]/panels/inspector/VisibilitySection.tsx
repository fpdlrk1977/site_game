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
        <SectionHeader title="Visibility" hint="Show/hide and lock, plus (primitives) shading, double-sided and shadow options. Hidden objects are hidden in the viewer too; locking blocks selection and moving in the viewport (still selectable in the hierarchy list)." isOpen={open} onToggle={onToggle} />
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
                  { k: 'flatShading', label: 'Flat Shading', def: false },
                  { k: 'doubleSided', label: 'Double-sided', def: false },
                  { k: 'castShadow', label: 'Cast Shadow', def: true },
                  { k: 'receiveShadow', label: 'Receive Shadow', def: true },
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
