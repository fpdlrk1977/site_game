"use client";

// Events 섹션 — 트리거→액션 이벤트 + 조건(다중/else) + 타이머 + 대화(dialogue) 말풍선. 그룹 제외.
// InspectorPanel 분리 리팩터 마지막 조각: 이벤트 폼 상태·핸들러·600줄 renderEventForm·리스트·대화 UI를 통째 이동.
// previewPopup 오버레이는 부모(aside relative 기준 positioning)에 남기고, 리스트 미리보기는 onPreview 콜백으로 위임.
import { useState, useEffect } from "react";
import { MathUtils } from "three";
import { X, Pencil, Play, Music } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { useToast } from "@/hooks/useToast";
import { createBrowserSupabase } from "@/lib/supabase";
import { SelectBox } from "@/components/ui/SelectBox";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { GlbClipPicker } from "./GlbClipPicker";
import { SectionHeader, GroupBox, Toggle, LabeledNum, LabeledText, XYZRow, TEXT_INPUT_CLASS } from "./ui";
import { DraggablePopup } from "@/components/ui/DraggablePopup";
import type { ObjectNodeSchema, EventSchema, EventCondition, EventAction, DialogueConfig, PopupConfig, GameVariable } from "@/types/scene";

const TRIGGER_LABELS: Record<EventSchema["trigger"], string> = {
  click: "Click",
  hover_enter: "Hover In",
  hover_exit: "Hover Out",
  area_enter: "Area Enter",
  area_exit: "Area Exit",
  interact: "Interact (E)",
  approach_enter: "Approach In (근접)",
  approach_exit: "Approach Out",
  dialogue_end: "대사 종료 시",
  variable_changed: "변수 변경 시 (조건)",
  scene_start: "시작 시 (로드)",
  on_timer: "타이머 (반복)",
};
const ACTION_LABELS: Record<string, string> = {
  open_url: "URL 열기",
  show_popup: "팝업",
  emit_event: "이벤트 발송",
  play_animation: "애니메이션 재생",
  go_to_scene: "씬 이동",
  show_object: "오브젝트 표시",
  hide_object: "오브젝트 숨김",
  toggle_object: "오브젝트 토글",
  focus_object: "카메라 포커스",
  reset_camera: "카메라 초기화",
  animate_object: "오브젝트 애니메이션",
  move_object: "오브젝트 이동",
  set_passable: "통과 가능(문 열기)",
  set_solid: "통과 불가(문 닫기)",
  toggle_collision: "통과 토글",
  play_sound: "사운드 재생",
  set_variable: "변수 변경 (점수 등)",
  spawn_object: "오브젝트 생성(스폰)",
  despawn_object: "오브젝트 제거(디스폰)",
  game_win: "게임 승리",
  game_lose: "게임 오버",
  swap_model: "모델 교체",
  play_clip: "애니 재생",
  run_script: "스크립트 실행",
};

// value가 대상 objectId인 액션들 (에디터에서 오브젝트 선택 드롭다운 표시)
const OBJECT_TARGET_ACTIONS = new Set([
  "show_object",
  "hide_object",
  "toggle_object",
  "focus_object",
  "set_passable",
  "set_solid",
  "toggle_collision",
  "despawn_object",
]);

// 게임 변수 타입 라벨 (드롭다운 표기용)
const VAR_TYPE_LABEL: Record<string, string> = {
  number: "숫자",
  boolean: "참/거짓",
  string: "텍스트",
  enum: "선택",
  color: "색",
  asset: "모델",
  timer: "타이머",
};

// 조건 추가 시 변수 타입에 맞는 기본 연산/값
function defaultCondition(v?: GameVariable): EventCondition {
  const t = v?.type;
  const isNum = t === "number" || t === "timer";
  return {
    variable: v?.name ?? "",
    op: isNum ? ">=" : "==",
    value: t === "boolean" ? true : isNum ? 0 : t === "enum" ? (v?.options?.[0] ?? "") : t === "color" ? "#ffffff" : "",
  };
}

// else 분기에서 고를 수 있는 액션(간단 입력만 지원 — 팝업/스폰/스크립트 등 복합 입력은 제외).
const ELSE_ACTION_OPTIONS: { value: string; label: string }[] = [
  "show_object",
  "hide_object",
  "toggle_object",
  "set_passable",
  "set_solid",
  "set_variable",
  "play_sound",
  "go_to_scene",
  "open_url",
  "focus_object",
  "reset_camera",
  "despawn_object",
  "game_win",
  "game_lose",
].map((a) => ({ value: a, label: ACTION_LABELS[a] ?? a }));

export function EventsSection({
  obj,
  open,
  onToggle,
  onPreview,
}: {
  obj: ObjectNodeSchema;
  open: boolean;
  onToggle: () => void;
  onPreview: (p: { content: string; config?: PopupConfig }) => void;
}) {
  const { objects, assets, projectId, sceneId, environment, updateObject, pushHistory, variables, animClips } = useSceneStore();
  const { addToast } = useToast();
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newTrigger, setNewTrigger] = useState<EventSchema["trigger"]>("click");
  const [newAction, setNewAction] = useState<EventSchema["action"]>("show_popup");
  const [newValue, setNewValue] = useState("");
  // show_popup 팝업 설정(모드/크기/색). undefined=auto(기존 동작).
  const [newPopup, setNewPopup] = useState<PopupConfig | undefined>(undefined);
  // 조건 게이트(옵셔널) — 빈 배열이면 조건 없음(항상 발동). 다중 조건 AND/OR. GAME_LOGIC.md.
  const [newConditions, setNewConditions] = useState<EventCondition[]>([]);
  const [newLogic, setNewLogic] = useState<"and" | "or">("and");
  // if/else 분기(Phase 2 후속) — 조건 거짓일 때 대신 실행할 액션. undefined=없음.
  const [newElse, setNewElse] = useState<{ action: EventAction; value: string } | undefined>(undefined);
  // on_timer 트리거 설정(Phase 2). everySec 간격 반복, once면 그 시간 뒤 1회.
  const [newTimer, setNewTimer] = useState<{ everySec: number; once?: boolean }>({ everySec: 3 });
  // null이면 신규 추가, 값이 있으면 그 이벤트를 수정 중
  const [editingId, setEditingId] = useState<string | null>(null);
  // go_to_scene 액션용 씬 목록 — 폼을 열거나 이미 씬 이동 이벤트가 있을 때만 로드
  const [sceneList, setSceneList] = useState<{ id: string; name: string }[]>([]);
  const needScenes = showAddEvent || (obj?.events?.some((e) => e.action === "go_to_scene") ?? false);
  useEffect(() => {
    if (!needScenes || !projectId || sceneList.length > 0) return;
    createBrowserSupabase()
      .from("scenes")
      .select("id, name")
      .eq("project_id", projectId)
      .order("created_at")
      .then(({ data }) => setSceneList(data ?? []));
  }, [needScenes, projectId, sceneList.length]);
  const sceneName = (id: string) => sceneList.find((s) => s.id === id)?.name ?? id;
  const objectName = (id: string) => objects.find((o) => o.id === id)?.name ?? id;
  const cleanPopup = (p: PopupConfig | undefined): PopupConfig | undefined => {
    if (!p) return undefined;
    const mode = p.mode ?? "auto";
    const hasPos = !!(p.position && p.position !== "center");
    const hasAnim = !!(p.anim && p.anim !== "auto");
    const hasChrome = p.chrome === false;
    const hasPad = !!(p.padding && p.padding.trim());
    const hasStyle = !!(p.width || p.height || p.bg || p.title?.trim() || hasPos || hasAnim || hasChrome || hasPad);
    if (mode === "auto" && !hasStyle) return undefined;
    return {
      mode,
      ...(hasPos ? { position: p.position } : {}),
      ...(hasAnim ? { anim: p.anim } : {}),
      ...(hasChrome ? { chrome: false } : {}),
      ...(hasPad ? { padding: p.padding } : {}),
      ...(p.width ? { width: p.width } : {}),
      ...(p.height ? { height: p.height } : {}),
      ...(p.bg ? { bg: p.bg } : {}),
      ...(p.title?.trim() ? { title: p.title.trim() } : {}),
    };
  };

  const addEvent = () => {
    // 값 없이도 되는 액션: 팝업(빈 내용)·카메라초기화·승패(기본 메시지)·디스폰(자기 자신)
    const valueOptional = new Set(["show_popup", "reset_camera", "game_win", "game_lose", "despawn_object"]);
    if (!newValue.trim() && !valueOptional.has(newAction)) return;
    const popupToSave = newAction === "show_popup" ? cleanPopup(newPopup) : undefined;
    const conds = newConditions.filter((c) => c.variable);
    const timerToSave =
      newTrigger === "on_timer" ? { everySec: Math.max(0.1, newTimer.everySec), ...(newTimer.once ? { once: true } : {}) } : undefined;
    // 다중조건/else는 조건이 있을 때만 의미. 저장 시 레거시 단일 condition은 비운다(conditions로 통일).
    const gate = {
      condition: undefined as EventCondition | undefined,
      conditions: conds.length > 0 ? conds : undefined,
      conditionLogic: undefined, // 연결어는 각 조건의 logic(혼합)으로 저장 — 전역 로직 미사용
      elseAction: conds.length > 0 && newElse ? newElse.action : undefined,
      elseValue: conds.length > 0 && newElse ? newElse.value.trim() : undefined,
    };
    if (editingId) {
      // 기존 이벤트 수정
      updateObject(obj.id, {
        events: obj.events.map((e) =>
          e.id === editingId
            ? { ...e, trigger: newTrigger, action: newAction, value: newValue.trim(), popup: popupToSave, timer: timerToSave, ...gate }
            : e,
        ),
      });
    } else {
      const ev: EventSchema = {
        id: MathUtils.generateUUID(),
        trigger: newTrigger,
        action: newAction,
        value: newValue.trim(),
        ...(popupToSave ? { popup: popupToSave } : {}),
        ...(timerToSave ? { timer: timerToSave } : {}),
        ...(gate.conditions ? { conditions: gate.conditions } : {}),
        ...(gate.conditionLogic ? { conditionLogic: gate.conditionLogic } : {}),
        ...(gate.elseAction ? { elseAction: gate.elseAction, elseValue: gate.elseValue } : {}),
      };
      updateObject(obj.id, { events: [...obj.events, ev] });
    }
    pushHistory();
    setNewValue("");
    setNewPopup(undefined);
    setNewConditions([]);
    setNewLogic("and");
    setNewElse(undefined);
    setNewTimer({ everySec: 3 });
    setEditingId(null);
    setShowAddEvent(false);
  };

  const startEdit = (ev: EventSchema) => {
    setEditingId(ev.id);
    setNewTrigger(ev.trigger);
    setNewAction(ev.action);
    setNewValue(ev.value);
    setNewPopup(ev.popup);
    // conditions[](신규) 우선, 없으면 레거시 단일 condition을 배열로 승격.
    setNewConditions(ev.conditions && ev.conditions.length ? ev.conditions : ev.condition ? [ev.condition] : []);
    setNewLogic(ev.conditionLogic ?? "and");
    setNewElse(ev.elseAction ? { action: ev.elseAction, value: ev.elseValue ?? "" } : undefined);
    setNewTimer(ev.timer ?? { everySec: 3 });
    setShowAddEvent(true);
  };

  // 폼 필드를 신규 기본값으로 전부 초기화(editingId 포함). 편집→추가 전환 시 이전 값이 남지 않게.
  const resetNewEvent = () => {
    setNewTrigger("click");
    setNewAction("show_popup");
    setNewValue("");
    setNewPopup(undefined);
    setNewConditions([]);
    setNewLogic("and");
    setNewElse(undefined);
    setNewTimer({ everySec: 3 });
    setEditingId(null);
  };

  const cancelEventForm = () => {
    setShowAddEvent(false);
    resetNewEvent();
  };

  const removeEvent = (id: string) => {
    updateObject(obj.id, { events: obj.events.filter((e) => e.id !== id) });
    pushHistory();
    if (editingId === id) cancelEventForm();
  };

  // area_enter는 physics/센서 설정 없이도 접촉 시 발동한다 (PlayCanvas가 자동 처리).
  // Is Sensor를 켜면 오브젝트가 통과 가능한 트리거 영역이 된다는 안내만 표시.
  const showAreaEnterHint = newTrigger === "area_enter" || newTrigger === "area_exit";
  const showInteractHint = newTrigger === "interact";
  const showApproachHint = newTrigger === "approach_enter" || newTrigger === "approach_exit";

  // 대화(말풍선) — dialogue 또는 레거시 interactLabel에서 편집값을 구성
  const dlg: DialogueConfig =
    obj.dialogue ??
    (obj.interactLabel?.trim()
      ? { lines: [obj.interactLabel.trim()], show: "approach", advance: "auto" }
      : { lines: [], show: "approach", advance: "auto" });
  const setDlg = (patch: Partial<DialogueConfig>) => updateObject(obj.id, { dialogue: { ...dlg, ...patch }, interactLabel: undefined });

  // 이벤트 추가/수정 폼 — 신규는 목록 하단, 수정은 해당 항목 자리에 인라인으로 렌더한다
  const renderEventForm = () => (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <span className="text-[10px] text-muted/70 dark:text-muted block mb-1 tracking-wide">Trigger</span>
          <SelectBox
            value={newTrigger}
            onChange={(v) => setNewTrigger(v as EventSchema["trigger"])}
            options={[
              { value: "click", label: "Click" },
              { value: "hover_enter", label: "Hover In" },
              { value: "hover_exit", label: "Hover Out" },
              { value: "area_enter", label: "Area Enter" },
              { value: "area_exit", label: "Area Exit" },
              { value: "interact", label: "Interact (E)" },
              { value: "approach_enter", label: "Approach In (근접)" },
              { value: "approach_exit", label: "Approach Out" },
              { value: "dialogue_end", label: "대사 종료 시" },
              { value: "variable_changed", label: "변수 변경 시 (조건)" },
              { value: "scene_start", label: "시작 시 (로드)" },
              { value: "on_timer", label: "타이머 (반복)" },
            ]}
          />
        </div>
        <div>
          <span className="text-[10px] text-muted/70  dark:text-muted block mb-1 tracking-wide">Action</span>
          <SelectBox
            value={newAction}
            onChange={(v) => setNewAction(v as EventSchema["action"])}
            options={[
              { value: "show_popup", label: "팝업" },
              { value: "open_url", label: "URL 열기" },
              { value: "go_to_scene", label: "씬 이동" },
              { value: "show_object", label: "오브젝트 표시" },
              { value: "hide_object", label: "오브젝트 숨김" },
              { value: "toggle_object", label: "오브젝트 토글" },
              { value: "move_object", label: "오브젝트 이동" },
              { value: "set_passable", label: "통과 가능(문 열기)" },
              { value: "set_solid", label: "통과 불가(문 닫기)" },
              { value: "toggle_collision", label: "통과 토글" },
              { value: "focus_object", label: "카메라 포커스" },
              { value: "reset_camera", label: "카메라 초기화" },
              { value: "play_animation", label: "애니메이션 재생" },
              { value: "animate_object", label: "오브젝트 애니메이션" },
              { value: "play_sound", label: "사운드 재생" },
              { value: "set_variable", label: "변수 변경 (점수 등)" },
              { value: "spawn_object", label: "오브젝트 생성(스폰)" },
              { value: "despawn_object", label: "오브젝트 제거(디스폰)" },
              { value: "swap_model", label: "모델 교체" },
              { value: "play_clip", label: "애니 재생 (키프레임)" },
              { value: "game_win", label: "게임 승리" },
              { value: "game_lose", label: "게임 오버" },
              { value: "run_script", label: "스크립트 실행 (고급)" },
              { value: "emit_event", label: "이벤트 발송" },
            ]}
          />
        </div>
      </div>

      {showAreaEnterHint && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          캐릭터가 오브젝트에 닿으면 발동합니다. 통과 가능한 투명 트리거 영역으로 쓰려면 Physics → Is Sensor를 켜세요.
        </p>
      )}

      {showInteractHint && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          플레이 모드에서 캐릭터가 가까이(약 3m) 가면 화면에 <b>E</b> 프롬프트가 뜨고, E키(모바일=버튼)를 누르면 발동합니다. NPC 대화·간판·아이템 등에
          쓰세요. 탐색 모드에선 발동하지 않습니다(대신 Click 트리거 사용).
        </p>
      )}

      {showApproachHint && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          플레이 모드에서 캐릭터가 오브젝트에 근접(약 3m)하면 <b>키 없이 자동</b>으로 발동합니다 (In=들어올 때, Out=벗어날 때). 다가가면 NPC가 손
          흔들기·사운드 재생 같은 연출에 쓰세요. 오브젝트를 <b>솔리드로 유지</b>한 채 쓸 수 있습니다(Area와 달리 센서 불필요). 영역 반경 기반이라 임의
          구역 트리거는 Area를 쓰세요.
        </p>
      )}

      {newTrigger === "dialogue_end" && (
        <p className="text-muted text-[10px] bg-muted/5 dark:bg-muted/10 border border-border rounded-xs px-2 py-1.5">
          이 오브젝트의 <b>대화(말풍선) 마지막 문장에 액션 버튼</b>이 뜨고, 방문자가 <b>버튼을 누르면</b> 발동합니다 (자동으로 넘어가지 않아요).
          &quot;대사 끝나면 팝업 열기·씬 이동·문 열기&quot; 같은 연결에 쓰세요. 아래 <b>대화 말풍선</b>에 대사를 먼저 채우고, 버튼 이름은 대화
          설정에서 정할 수 있어요. 플레이 모드 전용.
        </p>
      )}

      {newTrigger === "variable_changed" && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          게임 <b>변수가 바뀔 때마다</b> 아래 <b>조건</b>을 검사해, 조건이 <b>거짓→참</b>이 되는 순간 1회 발동합니다 (예: &quot;점수 ≥ 10이 되면 문
          열기&quot;). 오브젝트 위치·근접과 무관한 순수 상태 규칙이에요. 아래 <b>조건</b>을 꼭 설정하세요. 변수는 Environment(빈 곳 클릭) →{" "}
          <b>게임 변수</b>에서 만듭니다.
        </p>
      )}

      {newTrigger === "scene_start" && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          뷰어가 <b>로드될 때 1회</b> 자동 발동합니다(게임 재시작 시에도). 초기화·인트로 팝업·배경음 시작·타이머 시작에 쓰세요.
        </p>
      )}

      {newTrigger === "on_timer" && (
        <div className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5 space-y-1.5">
          <p>
            <b>일정 간격마다</b> 자동 발동합니다(주기적 스폰·카운트다운 등). 게임 오버되면 멈춥니다.
          </p>
          <LabeledNum
            label="간격(초)"
            value={newTimer.everySec}
            onChange={(v) => setNewTimer((t) => ({ ...t, everySec: v }))}
            onCommit={() => {}}
            min={0.1}
            precision={1}
            dragStep={0.1}
          />
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={!!newTimer.once} onChange={(e) => setNewTimer((t) => ({ ...t, once: e.target.checked }))} />
            <span>1회만</span>
          </label>
        </div>
      )}

      <div>
        <span className="text-[10px] text-muted/70  dark:text-muted block mb-1 tracking-wide">
          {newAction === "open_url"
            ? "URL"
            : newAction === "emit_event"
              ? "이벤트 이름"
              : newAction === "play_animation"
                ? "클립 이름"
                : newAction === "go_to_scene"
                  ? "이동할 씬"
                  : newAction === "reset_camera"
                    ? "설정"
                    : newAction === "animate_object"
                      ? "대상 오브젝트 + 클립"
                      : newAction === "move_object"
                        ? "대상 오브젝트 + 이동량"
                        : newAction === "play_sound"
                          ? "오디오 URL"
                          : newAction === "set_variable"
                            ? "변경할 변수"
                            : newAction === "spawn_object"
                              ? "생성할 템플릿 오브젝트"
                              : newAction === "swap_model"
                                ? "모델 교체 (대상 + 소스)"
                                : newAction === "play_clip"
                                  ? "재생할 애니메이션"
                                  : newAction === "game_win" || newAction === "game_lose"
                                    ? "표시할 메시지 (선택)"
                                    : newAction === "run_script"
                                      ? "자바스크립트 코드"
                                      : OBJECT_TARGET_ACTIONS.has(newAction)
                                        ? "대상 오브젝트"
                                        : "팝업 내용"}
        </span>
        {(() => {
          if (newAction === "set_variable") {
            // value = "변수명|연산|값"
            const [vn = "", op = "add", amt = ""] = newValue.split("|");
            const setSV = (name: string, o: string, a: string) => setNewValue(`${name}|${o}|${a}`);
            const selVar = variables.find((v) => v.name === vn) ?? variables[0];
            const vtype = selVar?.type ?? "number";
            const inputCls = TEXT_INPUT_CLASS;
            if (variables.length === 0) {
              return (
                <p className="text-muted text-[10px] bg-surface border border-amber-500/40 rounded-xs px-2 py-1.5">
                  아직 게임 변수가 없어요. 빈 곳을 클릭해 Environment → <b>게임 변수</b>에서 먼저 변수를 만드세요.
                </p>
              );
            }
            return (
              <div className="space-y-1.5">
                <SelectBox
                  value={vn || variables[0].name}
                  onChange={(name) => {
                    const nv = variables.find((v) => v.name === name);
                    const defOp = nv?.type === "number" ? "add" : "set"; // 숫자만 기본 더하기, 나머지는 설정
                    setSV(name, defOp, "");
                  }}
                  options={variables.map((v) => ({ value: v.name, label: `${v.name} (${VAR_TYPE_LABEL[v.type] ?? v.type})` }))}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <SelectBox
                    value={op}
                    onChange={(o) => setSV(vn || variables[0].name, o, o === "random" ? "1,6" : o === "clamp" ? "0,100" : amt)}
                    options={
                      vtype === "boolean"
                        ? [
                            { value: "set", label: "설정 =" },
                            { value: "toggle", label: "토글(반전)" },
                          ]
                        : vtype === "string"
                          ? [
                              { value: "set", label: "설정 =" },
                              { value: "append", label: "이어붙이기 +" },
                            ]
                          : vtype === "enum"
                            ? [
                                { value: "set", label: "설정 =" },
                                { value: "next", label: "다음 상태 ▶" },
                              ]
                            : vtype === "color" || vtype === "asset"
                              ? [{ value: "set", label: "설정 =" }]
                              : [
                                  { value: "add", label: "더하기 +" },
                                  { value: "sub", label: "빼기 −" },
                                  { value: "set", label: "설정 =" },
                                  { value: "mul", label: "곱하기 ×" },
                                  { value: "div", label: "나누기 ÷" },
                                  { value: "mod", label: "나머지 %" },
                                  { value: "random", label: "랜덤 🎲" },
                                  { value: "clamp", label: "범위제한" },
                                ]
                    }
                  />
                  {op === "toggle" || op === "next" ? (
                    <div className="text-[10px] text-muted/60 flex items-center px-1">값 불필요</div>
                  ) : op === "random" || op === "clamp" ? (
                    (() => {
                      const [lo = op === "clamp" ? "0" : "1", hi = op === "clamp" ? "100" : "6"] = amt.split(",");
                      return (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={lo}
                            onChange={(e) => setSV(vn || variables[0].name, op, `${e.target.value},${hi}`)}
                            placeholder="min"
                            className={inputCls}
                          />
                          <span className="text-[10px] text-muted/60">~</span>
                          <input
                            type="number"
                            value={hi}
                            onChange={(e) => setSV(vn || variables[0].name, op, `${lo},${e.target.value}`)}
                            placeholder="max"
                            className={inputCls}
                          />
                        </div>
                      );
                    })()
                  ) : vtype === "boolean" ? (
                    <SelectBox
                      value={amt === "true" ? "true" : "false"}
                      onChange={(a) => setSV(vn || variables[0].name, op, a)}
                      options={[
                        { value: "true", label: "참(true)" },
                        { value: "false", label: "거짓(false)" },
                      ]}
                    />
                  ) : vtype === "enum" ? (
                    <SelectBox
                      value={amt || selVar?.options?.[0] || ""}
                      onChange={(a) => setSV(vn || variables[0].name, op, a)}
                      options={
                        (selVar?.options ?? []).length
                          ? (selVar?.options ?? []).map((o) => ({ value: o, label: o }))
                          : [{ value: "", label: "(선택지 없음)" }]
                      }
                    />
                  ) : vtype === "color" ? (
                    <ColorPicker
                      value={/^#/.test(amt) ? amt : "#ffffff"}
                      onChange={(hex) => setSV(vn || variables[0].name, op, hex)}
                    />
                  ) : vtype === "string" ? (
                    <input
                      type="text"
                      value={amt}
                      onChange={(e) => setSV(vn || variables[0].name, op, e.target.value)}
                      placeholder="텍스트"
                      className={inputCls}
                    />
                  ) : vtype === "asset" ? (
                    <SelectBox
                      value={amt}
                      onChange={(a) => setSV(vn || variables[0].name, op, a)}
                      options={assets
                        .filter((a) => a.type === "model" || a.type === "character" || !a.type)
                        .map((a) => ({ value: a.id, label: a.name }))}
                      placeholder="모델 선택..."
                    />
                  ) : (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amt}
                      onChange={(e) => setSV(vn || variables[0].name, op, e.target.value)}
                      placeholder="값 또는 변수명"
                      className={inputCls}
                    />
                  )}
                </div>
                <p className="text-muted/60 text-[10px]">
                  {vtype === "number" ? (
                    <>
                      예: 점수 +1 → <b>더하기·1</b> / 주사위 → <b>랜덤·1~6</b> / 다른 변수로 → <b>더하기·coins</b>
                    </>
                  ) : vtype === "enum" ? (
                    <>
                      선택지 중 하나로 <b>설정</b>하거나 <b>다음 상태</b>로 순환
                    </>
                  ) : vtype === "string" ? (
                    <>
                      텍스트를 <b>설정</b>하거나 뒤에 <b>이어붙이기</b>
                    </>
                  ) : vtype === "color" ? (
                    <>
                      색을 <b>설정</b> (HUD·재질 연결용)
                    </>
                  ) : vtype === "asset" ? (
                    <>
                      모델을 <b>설정</b> (모델 교체 액션에서 <b>@변수</b>로 사용)
                    </>
                  ) : (
                    <>
                      참/거짓을 <b>설정</b>하거나 <b>토글(반전)</b>
                    </>
                  )}
                </p>
              </div>
            );
          }
          if (newAction === "swap_model") {
            // value = "대상objectId|소스"  소스: '@변수명'(asset 변수) 또는 에셋 id 직접. 변수 Phase C.
            const [tid = "", source = ""] = newValue.split("|");
            const setSM = (t: string, s: string) => setNewValue(`${t}|${s}`);
            const assetVars = variables.filter((v) => v.type === "asset");
            const modelAssets = assets.filter((a) => a.type === "model" || a.type === "character" || !a.type);
            return (
              <div className="space-y-1.5">
                <SelectBox
                  value={tid}
                  onChange={(t) => setSM(t, source)}
                  options={objects.map((o) => ({ value: o.id, label: o.id === obj?.id ? `${o.name} (이 오브젝트)` : o.name }))}
                  placeholder="대상 오브젝트 (모델)..."
                />
                <SelectBox
                  value={source}
                  onChange={(s) => setSM(tid, s)}
                  options={[
                    ...assetVars.map((v) => ({ value: `@${v.name}`, label: `변수: ${v.name}` })),
                    ...modelAssets.map((a) => ({ value: a.id, label: `모델: ${a.name}` })),
                  ]}
                  placeholder="바꿀 모델 (변수 또는 에셋)..."
                />
                <p className="text-muted/60 text-[10px]">
                  대상의 모델을 <b>asset 변수</b>가 가리키는 것 또는 <b>선택한 에셋</b>으로 교체(플레이/뷰어). 변수(@)면 런타임 값 사용.
                </p>
              </div>
            );
          }
          if (newAction === "play_clip") {
            return animClips.length === 0 ? (
              <p className="text-muted text-[10px] bg-surface border border-amber-500/40 rounded-xs px-2 py-1.5">
                아직 애니메이션이 없어요. 오브젝트(또는 그룹) 선택 후 인스펙터 <b>Animation</b> 섹션에서 만드세요.
              </p>
            ) : (
              <SelectBox
                value={newValue}
                onChange={setNewValue}
                options={animClips.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="재생할 애니 선택..."
              />
            );
          }
          if (newAction === "spawn_object") {
            // value = "템플릿id|dx,dy,dz|모델소스?"
            const [tid = "", offStr = "", modelSrc = ""] = newValue.split("|");
            const [ox = "", oy = "", oz = ""] = offStr.split(",");
            const spawnTargets = objects.filter((o) => !o.isGroup);
            const inputCls = TEXT_INPUT_CLASS;
            const setSpawn = (id: string, x: string, y: string, z: string, src: string) =>
              setNewValue(`${id}|${x || 0},${y || 0},${z || 0}${src ? `|${src}` : ""}`);
            const cur = tid || spawnTargets[0]?.id || "";
            const assetVars = variables.filter((v) => v.type === "asset");
            const modelAssets = assets.filter((a) => a.type === "model" || a.type === "character" || !a.type);
            if (spawnTargets.length === 0) {
              return (
                <p className="text-muted text-[10px] bg-surface border border-amber-500/40 rounded-xs px-2 py-1.5">
                  생성할 오브젝트(템플릿)가 없어요. 먼저 오브젝트를 하나 만들어 두세요(원본은 숨겨두고 템플릿으로 씀).
                </p>
              );
            }
            return (
              <div className="space-y-1.5">
                <SelectBox
                  value={cur}
                  onChange={(id) => setSpawn(id, ox, oy, oz, modelSrc)}
                  options={spawnTargets.map((o) => ({ value: o.id, label: o.name }))}
                />
                <div>
                  <span className="text-[10px] text-muted/70  dark:text-muted block mb-0.5">위치 오프셋 (원본 기준 X, Y, Z)</span>
                  <div className="grid grid-cols-3 gap-1">
                    <input
                      type="number"
                      step={0.5}
                      value={ox}
                      onChange={(e) => setSpawn(cur, e.target.value, oy, oz, modelSrc)}
                      placeholder="X"
                      className={inputCls}
                    />
                    <input
                      type="number"
                      step={0.5}
                      value={oy}
                      onChange={(e) => setSpawn(cur, ox, e.target.value, oz, modelSrc)}
                      placeholder="Y"
                      className={inputCls}
                    />
                    <input
                      type="number"
                      step={0.5}
                      value={oz}
                      onChange={(e) => setSpawn(cur, ox, oy, e.target.value, modelSrc)}
                      placeholder="Z"
                      className={inputCls}
                    />
                  </div>
                </div>
                {(assetVars.length > 0 || modelAssets.length > 0) && (
                  <div>
                    <span className="text-[10px] text-muted/70  dark:text-muted block mb-0.5">모델 (선택 — 변수로 다른 모델 스폰)</span>
                    <SelectBox
                      value={modelSrc}
                      onChange={(s) => setSpawn(cur, ox, oy, oz, s)}
                      options={[
                        { value: "", label: "(원본 모델 그대로)" },
                        ...assetVars.map((v) => ({ value: `@${v.name}`, label: `변수: ${v.name}` })),
                        ...modelAssets.map((a) => ({ value: a.id, label: `모델: ${a.name}` })),
                      ]}
                    />
                  </div>
                )}
                <p className="text-muted/60 text-[10px]">
                  선택 오브젝트의 <b>복사본</b>을 생성합니다. 모델을 지정하면 <b>@변수(asset)</b>가 가리키는 모델로 스폰. 원본을 숨겨 템플릿으로 쓰면
                  좋아요.
                </p>
              </div>
            );
          }
          if (newAction === "run_script") {
            return (
              <div className="space-y-1">
                <textarea
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  rows={5}
                  placeholder={"api.add('score', 1);\nif (api.get('score') >= 10) api.win('클리어!');"}
                  className={`${TEXT_INPUT_CLASS} font-mono resize-y`}
                />
                <p className="text-muted/60 text-[10px] leading-relaxed">
                  사용: <b>api.get/set/add</b>(변수) · <b>api.show/hide</b>(id) · <b>api.despawn</b>(id) · <b>api.popup</b>(내용) · <b>api.sound</b>
                  (url) · <b>api.win/lose</b>(메시지) · <b>self</b>(이 오브젝트). 제작자 자신의 코드가 뷰어에서 실행됩니다.
                </p>
              </div>
            );
          }
          if (newAction === "show_popup") {
            const p = newPopup ?? {};
            const mode = p.mode ?? "auto";
            const setP = (patch: Partial<PopupConfig>) => setNewPopup({ ...p, ...patch });
            const inputCls = TEXT_INPUT_CLASS;
            return (
              <div className="space-y-2">
                <SelectBox
                  value={mode}
                  onChange={(m) => setP({ mode: m as PopupConfig["mode"] })}
                  options={[
                    { value: "auto", label: "자동 (텍스트·이미지·영상·YouTube)" },
                    { value: "url", label: "웹사이트 URL (iframe 삽입)" },
                    { value: "html", label: "커스텀 HTML (샌드박스)" },
                  ]}
                />
                {mode === "html" ? (
                  <textarea
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={'<div style="padding:16px">안녕하세요</div>'}
                    rows={5}
                    className={`${inputCls} font-mono resize-y`}
                  />
                ) : (
                  <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={mode === "url" ? "https://example.com" : "텍스트 또는 이미지/영상/YouTube URL"}
                    className={inputCls}
                    onKeyDown={(e) => e.key === "Enter" && addEvent()}
                  />
                )}
                <div className="space-y-1.5 border-t border-border/60 pt-2">
                  <label className="block">
                    <span className="text-[10px] text-muted/70  dark:text-muted block mb-1">위치</span>
                    <SelectBox
                      value={p.position ?? "center"}
                      onChange={(v) => setP({ position: v as PopupConfig["position"] })}
                      options={[
                        { value: "center", label: "중앙 모달 (기본)" },
                        { value: "bottom", label: "하단 시트" },
                        { value: "left", label: "왼쪽 패널" },
                        { value: "right", label: "오른쪽 패널" },
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-muted/70  dark:text-muted block mb-1">애니메이션</span>
                    <SelectBox
                      value={p.anim ?? "auto"}
                      onChange={(v) => setP({ anim: v as PopupConfig["anim"] })}
                      options={[
                        { value: "auto", label: "자동 (위치에 맞게)" },
                        { value: "fade", label: "페이드" },
                        { value: "scale", label: "스케일" },
                        { value: "slide", label: "슬라이드" },
                        { value: "none", label: "없음" },
                      ]}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block">
                      <span className="text-[10px] text-muted/70  dark:text-muted block mb-1">너비 (선택)</span>
                      <input
                        type="text"
                        value={p.width ?? ""}
                        onChange={(e) => setP({ width: e.target.value })}
                        placeholder="예: 800px, 90vw"
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-muted/70  dark:text-muted block mb-1">높이 (선택)</span>
                      <input
                        type="text"
                        value={p.height ?? ""}
                        onChange={(e) => setP({ height: e.target.value })}
                        placeholder="예: 600px, 80vh"
                        className={inputCls}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-[10px] text-muted/70  dark:text-muted block mb-1">제목 (선택)</span>
                    <input
                      type="text"
                      value={p.title ?? ""}
                      onChange={(e) => setP({ title: e.target.value })}
                      placeholder="오브젝트 이름"
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-muted/70  dark:text-muted block mb-1">배경색 (선택)</span>
                    <ColorPicker value={p.bg || "#ffffff"} onChange={(hex) => setP({ bg: hex })} />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[10px] text-muted/70  dark:text-muted">제목·닫기 표시 (chrome)</span>
                    <Toggle value={p.chrome !== false} onChange={(v) => setP({ chrome: v })} />
                  </label>
                  {p.chrome === false && (
                    <p className="text-muted/40 text-[10px] leading-relaxed">
                      몰입형 — 제목바·하단 닫기 버튼을 숨기고 우상단 플로팅 ✕만 표시, 여백 0(iframe이 카드에 꽉 참).
                    </p>
                  )}
                  <label className="block">
                    <span className="text-[10px] text-muted/70  dark:text-muted block mb-1">내부 여백 (선택)</span>
                    <input
                      type="text"
                      value={p.padding ?? ""}
                      onChange={(e) => setP({ padding: e.target.value })}
                      placeholder="예: 0, 24px"
                      className={inputCls}
                    />
                  </label>
                  {(mode === "url" || mode === "html") && (
                    <p className="text-muted/70  dark:text-muted text-[10px] leading-relaxed">
                      {mode === "url"
                        ? "일부 사이트는 보안설정(X-Frame-Options)으로 삽입이 차단될 수 있어요. 그 경우 팝업 안 ‘새 탭에서 열기’ 버튼으로 열립니다."
                        : "HTML은 샌드박스(iframe)로 격리 렌더돼 페이지 스타일/스크립트에 영향을 주지 않아요."}
                    </p>
                  )}
                  <p className="text-muted/40 text-[10px] leading-relaxed">
                    비운 항목은 씬 기본 팝업 설정 → 하드 기본값 순으로 적용돼요. (Environment → 팝업 기본값)
                  </p>
                </div>
              </div>
            );
          }
          if (newAction === "reset_camera") {
            return <p className="text-muted/60 text-[10px] py-1">값이 필요 없습니다 — 클릭 시 카메라가 초기 시점으로 복귀합니다.</p>;
          }
          if (newAction === "animate_object") {
            // value = "대상objectId|클립이름" — 대상 오브젝트 + 그 GLB의 클립 2단 선택
            const sep = newValue.indexOf("|");
            const targetId = sep >= 0 ? newValue.slice(0, sep) : newValue;
            const clip = sep >= 0 ? newValue.slice(sep + 1) : "";
            const targetOpts = objects.filter((o) => o.id !== obj?.id).map((o) => ({ value: o.id, label: o.name }));
            const targetObj = objects.find((o) => o.id === targetId);
            const targetGlbUrl = targetObj?.assetId ? assets.find((a) => a.id === targetObj.assetId)?.dracoUrl : null;
            return (
              <div className="space-y-1.5">
                <SelectBox
                  value={targetId}
                  onChange={(id) => setNewValue(`${id}|${clip}`)}
                  options={targetOpts}
                  placeholder="대상 오브젝트 선택..."
                />
                {targetId &&
                  (targetGlbUrl ? (
                    <GlbClipPicker url={targetGlbUrl} value={clip} onChange={(c) => setNewValue(`${targetId}|${c}`)} />
                  ) : (
                    <p className="text-muted/60 text-[10px] py-1">이 오브젝트엔 애니메이션(GLB)이 없습니다.</p>
                  ))}
              </div>
            );
          }
          if (newAction === "move_object") {
            // value = "대상objectId|dx,dy,dz|초" — 원래 저장 위치 기준 오프셋 + 이동 시간
            const [tid = "", offsetStr = "", durStr = ""] = newValue.split("|");
            const nums = offsetStr.split(",").map((s) => parseFloat(s));
            const off = {
              x: Number.isFinite(nums[0]) ? nums[0] : 0,
              y: Number.isFinite(nums[1]) ? nums[1] : 0,
              z: Number.isFinite(nums[2]) ? nums[2] : 0,
            };
            const durParsed = parseFloat(durStr);
            const dur = Number.isFinite(durParsed) ? durParsed : 1;
            const compose = (id: string, o: { x: number; y: number; z: number }, d: number) => `${id}|${o.x},${o.y},${o.z}|${d}`;
            // 자기 자신도 대상 가능 (클릭하면 스스로 움직이는 문/플랫폼 등)
            const targetOpts = objects.map((o) => ({ value: o.id, label: o.id === obj?.id ? `${o.name} (자신)` : o.name }));
            return (
              <div className="space-y-1.5">
                <SelectBox
                  value={tid}
                  onChange={(id) => setNewValue(compose(id, off, dur))}
                  options={targetOpts}
                  placeholder="대상 오브젝트 선택..."
                />
                {tid && (
                  <>
                    <XYZRow
                      label="이동량"
                      x={off.x}
                      y={off.y}
                      z={off.z}
                      onChangeX={(v) => setNewValue(compose(tid, { ...off, x: v }, dur))}
                      onChangeY={(v) => setNewValue(compose(tid, { ...off, y: v }, dur))}
                      onChangeZ={(v) => setNewValue(compose(tid, { ...off, z: v }, dur))}
                      onCommit={() => {}}
                      dragStep={0.1}
                    />
                    <LabeledNum
                      label="이동 시간(초)"
                      value={dur}
                      onChange={(v) => setNewValue(compose(tid, off, Math.max(0, v)))}
                      onCommit={() => {}}
                      min={0}
                      max={30}
                      precision={1}
                      dragStep={0.05}
                    />
                    <p className="text-muted/70  dark:text-muted text-[10px]">
                      누적이 아니라 항상 원래 위치 기준으로 이동합니다. (0,0,0) 이벤트를 하나 더 만들면 제자리로 돌아옵니다.
                    </p>
                  </>
                )}
              </div>
            );
          }
          if (newAction === "play_sound") {
            const audioAssets = assets.filter((a) => a.type === "audio");
            return (
              <div className="space-y-1.5">
                {audioAssets.length > 0 && (
                  <SelectBox
                    value={audioAssets.some((a) => a.dracoUrl === newValue) ? newValue : ""}
                    onChange={setNewValue}
                    options={audioAssets.map((a) => ({ value: a.dracoUrl, label: a.name, icon: <Music size={12} /> }))}
                    placeholder="업로드한 오디오 선택..."
                  />
                )}
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="또는 https://... (mp3/wav/ogg) 직접 입력"
                  className={TEXT_INPUT_CLASS}
                  onKeyDown={(e) => e.key === "Enter" && addEvent()}
                />
                <p className="text-muted/70  dark:text-muted text-[10px]">
                  트리거 발동 시 오디오를 재생합니다. Audio 탭에서 올린 파일을 고르거나 URL을 직접 넣을 수 있어요. 재생 버튼으로 미리듣기.
                </p>
              </div>
            );
          }
          if (newAction === "go_to_scene") {
            const opts = sceneList.filter((s) => s.id !== sceneId).map((s) => ({ value: s.id, label: s.name }));
            return opts.length > 0 ? (
              <SelectBox value={newValue} onChange={setNewValue} options={opts} placeholder="이동할 씬 선택..." />
            ) : (
              <p className="text-muted/60 text-[10px] py-1">이동할 다른 씬이 없습니다. 먼저 씬을 추가하세요.</p>
            );
          }
          if (OBJECT_TARGET_ACTIONS.has(newAction)) {
            // 씬의 모든 오브젝트를 대상으로 — 자기 자신 포함(클릭→자기 포커스/숨김 등이 흔한 케이스)
            const opts = objects.map((o) => ({
              value: o.id,
              label: o.id === obj?.id ? `${o.name} (이 오브젝트)` : o.name,
            }));
            const isDoorAction = newAction === "set_passable" || newAction === "set_solid" || newAction === "toggle_collision";
            return opts.length > 0 ? (
              <div className="space-y-1.5">
                <SelectBox value={newValue} onChange={setNewValue} options={opts} placeholder="대상 오브젝트 선택..." />
                {isDoorAction && (
                  <p className="text-muted/70  dark:text-muted text-[10px]">
                    대상의 <b>콜라이더만</b> 켜고/끕니다(모습은 그대로). 플레이 모드에서 통과 가능/불가가 바뀌어요 — 문·차단봉 등에 씁니다.
                    애니메이션(문 열림)은 별도 이벤트로 함께 거세요. 탐색 모드엔 영향 없음.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted/60 text-[10px] py-1">대상으로 지정할 오브젝트가 없습니다.</p>
            );
          }
          const glbUrl = newAction === "play_animation" && obj?.assetId ? assets.find((a) => a.id === obj.assetId)?.dracoUrl : null;
          return glbUrl ? (
            <GlbClipPicker url={glbUrl} value={newValue} onChange={setNewValue} />
          ) : (
            <>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={
                  newAction === "open_url"
                    ? "https://..."
                    : newAction === "emit_event"
                      ? "my_event_name"
                      : newAction === "play_animation"
                        ? "Armature|Walk"
                        : newAction === "game_win"
                          ? "예: 클리어! (비우면 기본 메시지)"
                          : newAction === "game_lose"
                            ? "예: 게임 오버 (비우면 기본 메시지)"
                            : "텍스트 또는 이미지/영상/YouTube URL"
                }
                className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === "Enter" && addEvent()}
              />
              {newAction === "play_animation" && (
                <p className="text-muted/70  dark:text-muted text-[10px] mt-1">GLB 오브젝트를 선택하면 클립 목록이 자동으로 표시됩니다.</p>
              )}
            </>
          );
        })()}
      </div>

      {/* 조건 게이트 (다중 AND/OR) + else 분기 — GAME_LOGIC.md */}
      <div className="border-t border-border/60 pt-2 space-y-2">
        {newConditions.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted/70  dark:text-muted tracking-wide">조건 — 참일 때만 발동</span>
              {newConditions.length > 1 && (
                <span className="text-[9px] text-muted/40">
                  앞 <b className="text-primary">AND</b>/<b className="text-amber-600">OR</b> 배지로 연결 (왼→오 순서)
                </span>
              )}
            </div>
            {variables.length === 0 ? (
              <p className="text-muted text-[10px] bg-surface border border-amber-500/40 rounded-xs px-2 py-1.5">
                먼저 게임 변수를 만드세요(빈 곳 클릭 → Environment → 게임 변수).
              </p>
            ) : (
              newConditions.map((c, i) => {
                const selVar = variables.find((v) => v.name === c.variable) ?? variables[0];
                const ctype = selVar?.type ?? "number";
                const inputCls = TEXT_INPUT_CLASS;
                const upd = (patch: Partial<EventCondition>) => setNewConditions((cs) => cs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="flex items-center gap-1">
                    {/* 연결어 배지 — 2번째 조건부터 행 앞에. 조건별 AND/OR(혼합 가능), 클릭해 전환 */}
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => upd({ logic: (c.logic ?? "and") === "and" ? "or" : "and" })}
                        title="직전 조건과 AND/OR로 연결 (클릭해 전환)"
                        className={`shrink-0 w-9 py-1.5 rounded-xs text-[9px] font-bold border transition-colors ${(c.logic ?? "and") === "and" ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25" : "bg-amber-500/15 text-amber-600 border-amber-500/40 hover:bg-amber-500/25"}`}
                      >
                        {(c.logic ?? "and") === "and" ? "AND" : "OR"}
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <SelectBox
                        value={c.variable || variables[0].name}
                        onChange={(name) => {
                          const nv = variables.find((v) => v.name === name);
                          const t = nv?.type;
                          const isNum = t === "number" || t === "timer";
                          // 타입 바뀌면 연산/값을 호환되게 리셋
                          const op: EventCondition["op"] = isNum ? ">=" : "==";
                          const value: EventCondition["value"] =
                            t === "boolean" ? true : isNum ? 0 : t === "enum" ? (nv?.options?.[0] ?? "") : t === "color" ? "#ffffff" : "";
                          upd({ variable: name, op, value });
                        }}
                        options={variables.map((v) => ({ value: v.name, label: `${v.name} (${VAR_TYPE_LABEL[v.type] ?? v.type})` }))}
                      />
                    </div>
                    <div className="w-[4.75rem] shrink-0">
                      <SelectBox
                        value={c.op}
                        onChange={(op) => upd({ op: op as EventCondition["op"] })}
                        options={
                          ctype === "boolean"
                            ? [
                                { value: "==", label: "== 같음" },
                                { value: "!=", label: "!= 다름" },
                              ]
                            : ctype === "string"
                              ? [
                                  { value: "==", label: "== 같음" },
                                  { value: "!=", label: "!= 다름" },
                                  { value: "contains", label: "⊃ 포함" },
                                ]
                              : ctype === "enum" || ctype === "color"
                                ? [
                                    { value: "==", label: "== 같음" },
                                    { value: "!=", label: "!= 다름" },
                                  ]
                                : [
                                    { value: ">=", label: "≥ 이상" },
                                    { value: ">", label: "> 초과" },
                                    { value: "==", label: "== 같음" },
                                    { value: "<=", label: "≤ 이하" },
                                    { value: "<", label: "< 미만" },
                                    { value: "!=", label: "!= 다름" },
                                  ]
                        }
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      {ctype === "boolean" ? (
                        <SelectBox
                          value={c.value === true ? "true" : "false"}
                          onChange={(v) => upd({ value: v === "true" })}
                          options={[
                            { value: "true", label: "참" },
                            { value: "false", label: "거짓" },
                          ]}
                        />
                      ) : ctype === "enum" ? (
                        <SelectBox
                          value={typeof c.value === "string" ? c.value : (selVar?.options?.[0] ?? "")}
                          onChange={(v) => upd({ value: v })}
                          options={
                            (selVar?.options ?? []).length
                              ? (selVar?.options ?? []).map((o) => ({ value: o, label: o }))
                              : [{ value: "", label: "(없음)" }]
                          }
                        />
                      ) : ctype === "color" ? (
                        <ColorPicker
                          value={typeof c.value === "string" && /^#/.test(c.value) ? c.value : "#ffffff"}
                          onChange={(hex) => upd({ value: hex })}
                        />
                      ) : ctype === "string" ? (
                        <input
                          type="text"
                          value={typeof c.value === "string" ? c.value : ""}
                          onChange={(e) => upd({ value: e.target.value })}
                          placeholder="텍스트"
                          className={inputCls}
                        />
                      ) : (
                        <input
                          type="number"
                          value={typeof c.value === "number" ? c.value : 0}
                          onChange={(e) => upd({ value: Number(e.target.value) })}
                          className={inputCls}
                        />
                      )}
                    </div>
                    <button
                      onClick={() => setNewConditions((cs) => cs.filter((_, j) => j !== i))}
                      title="조건 삭제"
                      className="shrink-0 p-1 rounded text-muted/70  dark:text-muted hover:text-red-500 hover:bg-red-500/10"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
            {variables.length > 0 && (
              <button
                onClick={() => setNewConditions((cs) => [...cs, defaultCondition(variables[0])])}
                className="text-[10px] text-primary hover:underline"
              >
                + 조건 하나 더
              </button>
            )}

            {/* else 분기 — 조건 거짓일 때 대신 실행할 액션 */}
            <div className="pt-1 border-t border-border/40">
              {newElse ? (
                <div className="bg-surface border border-border rounded-xs p-2 space-y-1.5 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted/70  dark:text-muted tracking-wide">아니면(else) 실행</span>
                    <button onClick={() => setNewElse(undefined)} className="text-[10px] text-muted/60 hover:text-foreground">
                      제거
                    </button>
                  </div>
                  <SelectBox
                    value={newElse.action}
                    onChange={(a) => setNewElse({ action: a as EventAction, value: "" })}
                    options={ELSE_ACTION_OPTIONS}
                  />
                  {(() => {
                    const inputCls = TEXT_INPUT_CLASS;
                    if (OBJECT_TARGET_ACTIONS.has(newElse.action)) {
                      return (
                        <SelectBox
                          value={newElse.value}
                          onChange={(v) => setNewElse({ ...newElse, value: v })}
                          options={objects.map((o) => ({ value: o.id, label: o.id === obj?.id ? `${o.name} (이 오브젝트)` : o.name }))}
                          placeholder="대상 오브젝트..."
                        />
                      );
                    }
                    if (newElse.action === "game_win" || newElse.action === "game_lose" || newElse.action === "reset_camera") {
                      return newElse.action === "reset_camera" ? (
                        <p className="text-[10px] text-muted/60">값 불필요</p>
                      ) : (
                        <input
                          value={newElse.value}
                          onChange={(e) => setNewElse({ ...newElse, value: e.target.value })}
                          placeholder="메시지(선택)"
                          className={inputCls}
                        />
                      );
                    }
                    return (
                      <input
                        value={newElse.value}
                        onChange={(e) => setNewElse({ ...newElse, value: e.target.value })}
                        placeholder={newElse.action === "set_variable" ? "score|add|1" : newElse.action === "open_url" ? "https://..." : "값"}
                        className={inputCls}
                      />
                    );
                  })()}
                  <p className="text-[10px] text-muted/70  dark:text-muted">
                    조건이 <b>거짓</b>이면 이 액션을 대신 실행합니다(예: 참이면 문 열기 / 아니면 &quot;열쇠 필요&quot; 팝업).
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => setNewElse({ action: "show_object", value: "" })}
                  className="text-[10px] text-muted/60 hover:text-primary mt-1"
                >
                  + 아니면(else) 액션
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setNewConditions([defaultCondition(variables[0])])}
            disabled={variables.length === 0}
            className="text-[10px] text-primary hover:underline disabled:text-muted/40 disabled:no-underline"
          >
            + 조건 추가{variables.length === 0 ? " (게임 변수 필요)" : newTrigger === "variable_changed" ? " (필수)" : " (선택)"}
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        <button onClick={addEvent} className="flex-1 py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white  text-[11px] transition-colors">
          {editingId ? "저장" : "추가"}
        </button>
        <button
          onClick={cancelEventForm}
          className="flex-1 py-1.5 rounded-xs bg-background hover:bg-surface text-foreground  text-[11px] transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );

  return (
    <GroupBox>
      <SectionHeader
        title="Events"
        hint="트리거(클릭·호버·근접 E·영역 진입)에 따라 동작(팝업·URL·씬 이동·애니메이션·이동·사운드 등)을 실행해요. 다가가면 뜨는 '대화 말풍선'도 여기서 설정합니다."
        isOpen={open}
        onToggle={onToggle}
        dot={obj.events.length > 0 || !!obj.dialogue}
      />
      {open && (
        <div className="px-3 pb-4 space-y-2">
          {/* 상호작용 근접 범위 오버라이드 — interact/approach 이벤트(또는 근접 대화)가 있을 때만 노출.
                이 범위는 interact(E)/approach에만 쓰이므로 관련 트리거가 없으면 의미가 없다. 비우면 씬 기본값. */}
          {(obj.events.some((e) => e.trigger === "interact" || e.trigger === "approach_enter" || e.trigger === "approach_exit") ||
            obj.dialogue?.show === "approach" ||
            obj.dialogue?.show === "interact") && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted/70  dark:text-muted block tracking-wide">상호작용 범위 (m)</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={obj.interactRange ?? ""}
                  placeholder={`씬 기본 (${environment.interactRange ?? 3})`}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updateObject(obj.id, { interactRange: v === "" ? undefined : Math.max(0.5, parseFloat(v)) });
                  }}
                  onBlur={pushHistory}
                  className="flex-1 border border-border rounded-xs px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-primary bg-muted/5 dark:bg-muted"
                />
                {obj.interactRange != null && (
                  <button
                    onClick={() => {
                      updateObject(obj.id, { interactRange: undefined });
                      pushHistory();
                    }}
                    className="text-[10px] text-muted/60 hover:text-danger transition-colors px-1.5 py-1 shrink-0"
                  >
                    기본값
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted/70  dark:text-muted">이 오브젝트의 E/approach 발동 거리. 비우면 씬 기본값을 씁니다.</p>
            </div>
          )}

          {/* 대화(말풍선) — 플레이 모드에서 오브젝트 위에 뜨는 순차 문장 */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted/70  dark:text-muted block tracking-wide">대화 말풍선</span>
            <textarea
              value={dlg.lines.join("\n")}
              onChange={(e) => setDlg({ lines: e.target.value.split("\n") })}
              onBlur={pushHistory}
              rows={3}
              placeholder={"한 줄에 문장 하나 (순서대로 표시)\n예: 안녕하세요!\n무엇을 도와드릴까요?"}
              className={`${TEXT_INPUT_CLASS} resize-y leading-relaxed`}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <span className="text-[10px] text-muted/70  dark:text-muted block mb-1 tracking-wide">표시 시점</span>
                <SelectBox
                  value={dlg.show}
                  onChange={(v) => {
                    setDlg({ show: v as DialogueConfig["show"] });
                    pushHistory();
                  }}
                  options={[
                    { value: "always", label: "항상" },
                    { value: "approach", label: "다가가면" },
                    { value: "interact", label: "E키로 열기" },
                  ]}
                />
              </div>
              <div>
                <span className="text-[10px] text-muted/70  dark:text-muted block mb-1 tracking-wide">넘기기</span>
                <SelectBox
                  value={dlg.advance}
                  onChange={(v) => {
                    setDlg({ advance: v as DialogueConfig["advance"] });
                    pushHistory();
                  }}
                  options={[
                    { value: "auto", label: "자동(타이머)" },
                    { value: "manual", label: "E키로 넘김" },
                  ]}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {dlg.advance === "auto" && (
                <LabeledNum
                  label="간격(초)"
                  value={dlg.autoSec ?? 2.5}
                  onChange={(v) => setDlg({ autoSec: v })}
                  onCommit={pushHistory}
                  min={0.5}
                  precision={1}
                  dragStep={0.5}
                />
              )}
              {/* 화자 — 공용 LabeledText (라벨 + 텍스트 입력) */}
              <LabeledText
                label="화자"
                value={dlg.speaker ?? ""}
                onChange={(v) => setDlg({ speaker: v })}
                onCommit={pushHistory}
                placeholder="이름(선택)"
              />
            </div>
            <label className="flex justify-between items-center gap-2 text-[10px] text-muted/70 pt-0.5">
              <span>타이핑 효과</span>
              <Toggle
                value={dlg.typing !== false}
                onChange={(v) => {
                  setDlg({ typing: v });
                  pushHistory();
                }}
              />
            </label>
            <label className="flex justify-between items-center gap-2 text-[10px] text-muted/70">
              <span>1회성 (한 번 다 보면 이 세션 동안 다시 안 뜸)</span>
              <Toggle
                value={dlg.once === true}
                onChange={(v) => {
                  setDlg({ once: v });
                  pushHistory();
                }}
              />
            </label>
            {obj.events.some((e) => e.trigger === "dialogue_end") && (
              <label className="flex items-center gap-1.5 text-[10px] text-muted/70">
                <span className="shrink-0">종료 버튼</span>
                <input
                  value={dlg.endButtonLabel ?? ""}
                  onChange={(e) => setDlg({ endButtonLabel: e.target.value })}
                  onBlur={pushHistory}
                  placeholder="확인 (기본)"
                  className={TEXT_INPUT_CLASS}
                />
              </label>
            )}
            {/* <p className="text-muted/70  dark:text-muted text-[10px]">
              플레이 모드 전용 · 오브젝트 바로 위 표시. 비워두면 안 뜸. 여러 문장이면 순서대로.
            </p> */}
          </div>

          <div className="h-px bg-border/60 my-1" />

          {obj.events.length === 0 && !showAddEvent && <p className="text-muted/60  text-[11px] py-1">이벤트 없음</p>}

          {obj.events.map((ev) => {
            // 편집은 팝업 모달로 열림 — 카드는 그대로 두고, 편집 중인 항목만 강조
            // 문장 꼬리(값 요약) — 대상/씬/오프셋을 사람이 읽는 형태로
            const valueSummary = ev.value
              ? ev.action === "go_to_scene"
                ? sceneName(ev.value)
                : ev.action === "animate_object"
                  ? `${objectName(ev.value.split("|")[0])} : ${ev.value.split("|")[1] ?? ""}`
                  : ev.action === "move_object"
                    ? `${objectName(ev.value.split("|")[0])} Δ(${ev.value.split("|")[1] ?? "0,0,0"}) ${ev.value.split("|")[2] ?? "1"}초`
                    : OBJECT_TARGET_ACTIONS.has(ev.action)
                      ? objectName(ev.value)
                      : ev.value
              : "";
            // 조건(단서) — 혼합 AND/OR(조건별 logic) 또는 레거시 단일 condition. 각 조건 앞에 연결어를 끼워 표시.
            const conds = ev.conditions && ev.conditions.length ? ev.conditions : ev.condition ? [ev.condition] : [];
            const condText = conds
              .map((c, i) => {
                const conn = i === 0 ? "" : (c.logic ?? ev.conditionLogic ?? "and") === "or" ? "또는 " : "그리고 ";
                return `${conn}${c.variable} ${c.op} ${c.value}`;
              })
              .join(" ");
            return (
              <div
                key={ev.id}
                className={`bg-surface border rounded-xs p-2.5 transition-colors ${editingId === ev.id ? "border-primary/60 ring-1 ring-primary/30" : "border-border/80"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* 문장: When ⟨트리거⟩ → ⟨액션⟩ 값 */}
                  <div className="min-w-0 flex-1 text-[11px] leading-relaxed">
                    <span className="text-muted/60 font-medium mr-1">When</span>
                    <span className="inline-block bg-primary/15 text-primary border border-primary/25 px-1.5 py-0.5 rounded-xs text-[10px] font-medium align-middle">
                      {TRIGGER_LABELS[ev.trigger]}
                    </span>
                    <span className="text-muted/40 mx-1 align-middle">→</span>
                    <span className="inline-block bg-background text-foreground border border-border px-1.5 py-0.5 rounded-xs text-[10px] font-medium align-middle">
                      {ACTION_LABELS[ev.action] ?? ev.action}
                    </span>
                    {valueSummary && <span className="text-muted/70 ml-1 align-middle break-all">{valueSummary}</span>}
                    {condText && <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400/90">단, {condText} 일 때만</div>}
                    {ev.elseAction && (
                      <div className="mt-0.5 text-[10px] text-muted/60">
                        아니면 → {ACTION_LABELS[ev.elseAction] ?? ev.elseAction}
                        {ev.elseValue ? ` ${ev.elseValue}` : ""}
                      </div>
                    )}
                  </div>
                  {/* 액션 버튼(미리보기/수정/삭제) — 동작 유지 */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        if (ev.action === "open_url" && ev.value) window.open(ev.value, "_blank");
                        else if (ev.action === "show_popup") onPreview({ content: ev.value || "(내용 없음)", config: ev.popup });
                        else if (ev.action === "emit_event") addToast(`이벤트 발송 테스트: "${ev.value}"`, "success");
                        else if (ev.action === "play_animation") addToast(`애니메이션 클립: "${ev.value}"`, "info");
                        else if (ev.action === "go_to_scene") addToast(`씬 이동: "${sceneName(ev.value)}" (플레이/뷰어에서 동작)`, "info");
                        else if (OBJECT_TARGET_ACTIONS.has(ev.action))
                          addToast(`${ACTION_LABELS[ev.action]}: "${objectName(ev.value)}" (뷰어에서 동작)`, "info");
                        else if (ev.action === "reset_camera") addToast("카메라 초기화 (탐색 모드 뷰어에서 동작)", "info");
                        else if (ev.action === "animate_object") {
                          const [tid, clip] = ev.value.split("|");
                          addToast(`애니메이션: "${objectName(tid)}" → "${clip ?? ""}" (뷰어에서 동작)`, "info");
                        } else if (ev.action === "move_object") {
                          const [tid, off, dur] = ev.value.split("|");
                          addToast(`이동: "${objectName(tid)}" Δ(${off || "0,0,0"}) ${dur || "1"}초 (뷰어에서 동작)`, "info");
                        } else if (ev.action === "play_sound" && ev.value) {
                          new Audio(ev.value).play().catch(() => addToast("오디오 재생 실패 — URL을 확인하세요", "error"));
                        }
                      }}
                      title="미리보기"
                      className="text-muted/70  dark:text-muted hover:text-primary w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                    >
                      <Play size={12} />
                    </button>
                    <button
                      onClick={() => startEdit(ev)}
                      title="수정"
                      className="text-muted/70  dark:text-muted hover:text-primary w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => removeEvent(ev.id)}
                      className="text-muted/40 hover:text-danger w-4 h-4 flex items-center justify-center rounded hover:bg-danger/10 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* '이벤트 추가' 버튼 — 폼은 좁은 패널 대신 팝업 모달로 열린다(아래 portal) */}
          <button
            onClick={() => {
              resetNewEvent();
              setShowAddEvent(true);
            }}
            className="w-full py-1.5 rounded-xs border border-dashed border-border bg-surface text-foreground hover:text-muted hover:bg-background  text-[11px] transition-all cursor-pointer"
          >
            이벤트 추가
          </button>

          {/* 이벤트 추가/수정 폼 — 공용 DraggablePopup(헤더 드래그·overlay 없음·✕/Esc 닫힘). 넓은 작업 공간 확보 */}
          {(showAddEvent || editingId) && (
            <DraggablePopup title={editingId ? "이벤트 수정" : "새 이벤트"} width={420} onClose={cancelEventForm}>
              {renderEventForm()}
            </DraggablePopup>
          )}
        </div>
      )}
    </GroupBox>
  );
}
