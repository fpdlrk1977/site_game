'use client';

// 게임 변수(상태) 편집 섹션 — 점수·체력·상태 등. GAME_LOGIC.md 변수 로드맵.
// EnvironmentPanel에서 추출(게임 컨트롤러 GNB Logic 탭과 공유). 스토어를 직접 읽는다.

import { Plus, Trash2, Variable } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { SectionHeader, GroupBox, Toggle } from './ui';
import type { GameVariable } from '@/types/scene';

export function GameVariablesSection() {
  const { variables, addVariable, updateVariable, removeVariable, assets, pushHistory } = useSceneStore();
  return (
    <GroupBox>
      <div className="relative">
        <SectionHeader
          title="게임 변수"
          icon={<Variable size={14} />}
          hint="점수·체력·아이템 보유 같은 게임 상태값. 이벤트의 '변수 변경' 액션으로 값을 바꾸고, 이벤트 '조건'으로 값에 따라 발동을 걸 수 있어요. '변수 변경 시' 트리거로 '점수 10이 되면 문 열기' 같은 반응형 규칙도 가능. HUD를 켜면 뷰어 화면에 값이 표시됩니다."
        />
        <button
          onClick={addVariable}
          title="변수 추가"
          className="absolute top-2.5 right-3 w-6 h-6 rounded-xs flex items-center justify-center text-muted hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <Plus size={15} />
        </button>
      </div>
      {variables.length > 0 && (
        <div className="px-3 pb-4 space-y-2">
          {variables.map((v) => (
            <div key={v.id} className="bg-surface border border-border rounded-xs p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  value={v.name}
                  onChange={(e) => updateVariable(v.id, { name: e.target.value })}
                  onBlur={pushHistory}
                  placeholder="변수명 (예: score)"
                  className="flex-1 bg-background border border-border rounded-xs px-2 py-1 text-[11px] text-foreground placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={() => removeVariable(v.id)}
                  title="변수 삭제"
                  className="p-1 rounded-xs text-muted/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <SelectBox
                  value={v.type}
                  onChange={(t) => {
                    updateVariable(v.id, { type: t as GameVariable["type"] });
                    pushHistory();
                  }}
                  options={[
                    { value: "number", label: "숫자" },
                    { value: "boolean", label: "참/거짓" },
                    { value: "string", label: "텍스트" },
                    { value: "enum", label: "선택지(상태)" },
                    { value: "color", label: "색" },
                    { value: "asset", label: "모델(에셋)" },
                    { value: "timer", label: "타이머(카운트다운)" },
                  ]}
                />
                {v.type === "boolean" ? (
                  <SelectBox
                    value={v.initial === true ? "true" : "false"}
                    onChange={(b) => {
                      updateVariable(v.id, { initial: b === "true" });
                      pushHistory();
                    }}
                    options={[
                      { value: "false", label: "초기: 거짓" },
                      { value: "true", label: "초기: 참" },
                    ]}
                  />
                ) : (v.type === "number" || v.type === "timer") ? (
                  <input
                    type="number"
                    value={typeof v.initial === "number" ? v.initial : 0}
                    onChange={(e) => updateVariable(v.id, { initial: Number(e.target.value) })}
                    onBlur={pushHistory}
                    placeholder={v.type === "timer" ? "시작 초" : "초기값"}
                    className="w-full bg-background border border-border rounded-xs px-2 py-1 text-[11px] text-foreground placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : v.type === "enum" ? (
                  <SelectBox
                    value={typeof v.initial === "string" ? v.initial : (v.options?.[0] ?? "")}
                    onChange={(val) => { updateVariable(v.id, { initial: val }); pushHistory(); }}
                    options={(v.options ?? []).length ? (v.options ?? []).map((o) => ({ value: o, label: `초기: ${o}` })) : [{ value: "", label: "(선택지 없음)" }]}
                  />
                ) : v.type === "color" ? (
                  <ColorPicker
                    value={typeof v.initial === "string" && v.initial ? v.initial : "#ffffff"}
                    onChange={(hex) => updateVariable(v.id, { initial: hex })}
                    onCommit={pushHistory}
                  />
                ) : v.type === "asset" ? (
                  <SelectBox
                    value={typeof v.initial === "string" ? v.initial : ""}
                    onChange={(val) => { updateVariable(v.id, { initial: val }); pushHistory(); }}
                    options={assets.filter((a) => a.type === "model" || a.type === "character" || !a.type).length
                      ? assets.filter((a) => a.type === "model" || a.type === "character" || !a.type).map((a) => ({ value: a.id, label: a.name }))
                      : [{ value: "", label: "(모델 에셋 없음)" }]}
                  />
                ) : (
                  <input
                    type="text"
                    value={typeof v.initial === "string" ? v.initial : ""}
                    onChange={(e) => updateVariable(v.id, { initial: e.target.value })}
                    onBlur={pushHistory}
                    placeholder="초기 텍스트"
                    className="w-full bg-background border border-border rounded-xs px-2 py-1 text-[11px] text-foreground placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>
              {/* enum 선택지(상태) 목록 편집 */}
              {v.type === "enum" && (
                <div className="space-y-1 pt-0.5">
                  <span className="text-[10px] text-muted/60">선택지(상태) 목록</span>
                  {(v.options ?? []).map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-1">
                      <input
                        value={opt}
                        onChange={(e) => { const opts = [...(v.options ?? [])]; opts[oi] = e.target.value; updateVariable(v.id, { options: opts }); }}
                        onBlur={pushHistory}
                        placeholder={`상태 ${oi + 1} (예: locked)`}
                        className="flex-1 bg-background border border-border rounded-xs px-2 py-1 text-[11px] text-foreground placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => { const opts = (v.options ?? []).filter((_, j) => j !== oi); updateVariable(v.id, { options: opts.length ? opts : [""] }); pushHistory(); }}
                        title="선택지 삭제"
                        className="p-1 rounded-xs text-muted/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => { updateVariable(v.id, { options: [...(v.options ?? []), ""] }); pushHistory(); }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    + 선택지 추가
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted/60 shrink-0">유지 범위</span>
                <SelectBox
                  value={v.scope ?? "scene"}
                  onChange={(sc) => { updateVariable(v.id, { scope: sc as GameVariable["scope"] }); pushHistory(); }}
                  options={[
                    { value: "scene", label: "씬 (기본, 리셋)" },
                    { value: "global", label: "전역 (씬 이동 유지)" },
                    { value: "persistent", label: "저장 (최고점수 등)" },
                  ]}
                  fullWidth={false}
                />
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[10px] text-muted/60">화면 HUD에 표시</span>
                <Toggle
                  value={v.showInHud ?? false}
                  onChange={(on) => {
                    updateVariable(v.id, { showInHud: on });
                    pushHistory();
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </GroupBox>
  );
}
