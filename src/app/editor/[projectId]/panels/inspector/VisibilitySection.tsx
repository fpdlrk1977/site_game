"use client";

// Render 섹션 — 프리미티브가 어떻게 그려지는가(셰이딩·양면·그림자 생성/수신).
//   표시/숨김·잠금은 인스펙터 헤더 아이콘 버튼으로 옮겼다(2026-07-21) → 이 섹션은 프리미티브 전용.
//   ※ 파일명/섹션 키는 'visibility' 그대로 — 내부 식별자라 바꾸면 사용자의 접힘 상태만 리셋된다.
// InspectorPanel 분리 리팩터: 접힘 상태는 부모가 open/onToggle prop으로 내려준다.

import { Contrast } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { SectionHeader, GroupBox, Toggle } from "./ui";
import type { ObjectNodeSchema } from "@/types/scene";

export function VisibilitySection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  // 표시/잠금 토글은 인스펙터 헤더의 아이콘 버튼으로 옮겼다(중복 제거).
  //   → 이 섹션에 남는 건 프리미티브 렌더 옵션뿐이므로, 대상이 아니면 섹션 자체를 띄우지 않는다
  //     (안 그러면 GLB·그룹·라이트에서 내용 없는 빈 섹션이 뜬다).
  const isPrimitive = !!obj.primitiveShape && !obj.content && !obj.assetId && !obj.light && !obj.particle;
  if (!isPrimitive) return null;
  return (
    <GroupBox>
      <SectionHeader
        title="Render"
        icon={<Contrast size={14} />}
        hint="How this primitive is drawn — flat vs smooth shading, whether back faces are visible, and whether it casts or receives shadows. (Show/hide and lock are the icon buttons at the top of the inspector.)"
        isOpen={open}
        onToggle={onToggle}
      />
      {open && (
        <div className="px-3 pb-4 space-y-3">
          {(
            [
              { k: "flatShading", label: "Flat Shading", def: false },
              { k: "doubleSided", label: "Double-sided", def: false },
              { k: "castShadow", label: "Cast Shadow", def: false },
              { k: "receiveShadow", label: "Receive Shadow", def: false },
            ] as const
          ).map(({ k, label, def }) => (
            <label key={k} className="flex items-center justify-between cursor-pointer">
              <span className="text-[10px] text-muted/70 dark:text-muted">{label}</span>
              <Toggle
                value={obj.render?.[k] ?? def}
                onChange={(v) => {
                  updateObject(obj.id, { render: { ...obj.render, [k]: v } });
                  pushHistory();
                }}
              />
            </label>
          ))}
        </div>
      )}
    </GroupBox>
  );
}
