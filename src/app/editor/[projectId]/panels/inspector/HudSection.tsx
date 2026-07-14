'use client';

// HUD 위젯 편집 섹션 — 게임 변수를 텍스트/체력바/목숨으로 화면 표시. GAME_LOGIC.md Phase 2.
// EnvironmentPanel에서 추출(게임 컨트롤러 GNB Logic 탭과 공유).

import { Plus, Trash2 } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox } from './ui';
import type { HudElement } from '@/types/scene';

export function HudSection() {
  const { hudElements, addHudElement, updateHudElement, removeHudElement, variables, pushHistory } = useSceneStore();
  return (
    <GroupBox>
      <div className="relative">
        <SectionHeader
          title="HUD (화면 표시)"
          hint="게임 변수를 화면 구석에 텍스트·체력바·목숨 아이콘으로 표시합니다. 각 위젯을 변수에 연결하고 종류·위치·색을 정하세요. (변수의 '화면 HUD에 표시' 간단 텍스트와 별개로, 더 꾸민 위젯)"
        />
        <button
          onClick={addHudElement}
          disabled={variables.length === 0}
          title="HUD 위젯 추가"
          className="absolute top-2.5 right-3 w-6 h-6 rounded-xs flex items-center justify-center text-muted hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={15} />
        </button>
      </div>
      {hudElements.length > 0 && (
        <div className="px-3 pb-4 space-y-2">
          {hudElements.map((el) => (
            <div key={el.id} className="bg-surface border border-border rounded-xs p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <SelectBox
                  value={el.variable || variables[0]?.name || ""}
                  onChange={(name) => {
                    updateHudElement(el.id, { variable: name });
                    pushHistory();
                  }}
                  options={variables.length ? variables.map((v) => ({ value: v.name, label: v.name })) : [{ value: "", label: "(변수 없음)" }]}
                />
                <button
                  onClick={() => removeHudElement(el.id)}
                  title="위젯 삭제"
                  className="p-1 rounded-xs text-muted/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <SelectBox
                  value={el.kind}
                  onChange={(k) => {
                    updateHudElement(el.id, { kind: k as HudElement["kind"] });
                    pushHistory();
                  }}
                  options={[
                    { value: "text", label: "텍스트" },
                    { value: "bar", label: "체력바" },
                    { value: "lives", label: "목숨(아이콘)" },
                  ]}
                />
                <SelectBox
                  value={el.position}
                  onChange={(p) => {
                    updateHudElement(el.id, { position: p as HudElement["position"] });
                    pushHistory();
                  }}
                  options={[
                    { value: "top-left", label: "↖ 좌상" },
                    { value: "top-center", label: "↑ 상단" },
                    { value: "top-right", label: "↗ 우상" },
                    { value: "bottom-left", label: "↙ 좌하" },
                    { value: "bottom-center", label: "↓ 하단" },
                    { value: "bottom-right", label: "↘ 우하" },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5 items-center">
                <input
                  value={el.label ?? ""}
                  onChange={(e) => updateHudElement(el.id, { label: e.target.value || undefined })}
                  onBlur={pushHistory}
                  placeholder="라벨(선택)"
                  className="bg-background border border-border rounded-xs px-2 py-1 text-[11px] text-foreground placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {(el.kind === "bar" || el.kind === "lives") && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted/60 shrink-0">최대</span>
                    <input
                      type="number"
                      min={1}
                      value={el.max ?? (el.kind === "bar" ? 100 : 3)}
                      onChange={(e) => updateHudElement(el.id, { max: Number(e.target.value) })}
                      onBlur={pushHistory}
                      className="w-full bg-background border border-border rounded-xs px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}
              </div>
              {(el.kind === "bar" || el.kind === "lives") && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted/60">색</span>
                  <input
                    type="color"
                    value={el.color ?? "#ef4444"}
                    onChange={(e) => updateHudElement(el.id, { color: e.target.value })}
                    onBlur={pushHistory}
                    className="w-8 h-6 rounded border border-border bg-transparent cursor-pointer"
                  />
                  {el.kind === "lives" && (
                    <SelectBox
                      value={el.icon ?? "heart"}
                      onChange={(ic) => {
                        updateHudElement(el.id, { icon: ic as HudElement["icon"] });
                        pushHistory();
                      }}
                      options={[
                        { value: "heart", label: "하트" },
                        { value: "star", label: "별" },
                        { value: "circle", label: "원" },
                      ]}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </GroupBox>
  );
}
