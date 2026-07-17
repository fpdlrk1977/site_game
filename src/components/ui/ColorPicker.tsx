"use client";

// 공통 컬러픽커 — 브라우저 기본 input[type=color]을 대체하는 자체 픽커(피그마식).
// 트리거([스와치][hex] 필드형) + 팝오버(SV 사각형 + Hue 슬라이더 + 표현 드롭다운[HEX/RGB/HSL] + 저장 팔레트 + 스포이드).
// allowGradient면 Solid/Gradient 토글 + 그라데이션 바(정지점 편집·선형/라디얼·각도)도 제공.
// 위치/바깥클릭/Esc 닫기는 공통 useDropdown 재사용. 저장 팔레트는 sceneStore.colorAssets 연동.
//
// 드롭인 사용:
//   <ColorPicker value={hex} onChange={(hex) => update(hex)} onCommit={pushHistory} />
//   (그라데이션) + allowGradient gradient={mat.gradient} onGradientChange={(g)=>update({gradient:g})}
import { useEffect, useRef, useState, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { Pipette, Plus, ChevronDown, Trash2, X } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { useColorPickerStore } from "@/store/colorPickerStore";
import { normalizeHex, hexToHsv, hsvToHex, hexToRgb, rgbToHex, hexToHsl, hslToHex, type HSV } from "@/lib/color";
import type { GradientFill } from "@/types/scene";
import type { DropdownPlacement } from "@/hooks/useDropdown";

type Mode = "hex" | "rgb" | "hsl";
const MODES: Mode[] = ["hex", "rgb", "hsl"];

interface Props {
  value: string;
  onChange: (hex: string) => void;
  /** 한 조작(드래그/입력/스와치)이 끝날 때 1회 — 보통 pushHistory 연결 */
  onCommit?: () => void;
  className?: string; // 트리거 필드 크기/스타일 추가 (기본 w-full)
  disabled?: boolean;
  title?: string;
  /** 트리거에 hex 텍스트도 함께 표시 (기본 true) */
  showHex?: boolean;
  /** 저장 팔레트(colorAssets) 표시 (기본 true) */
  palette?: boolean;
  /** 팝업이 열리는 위치. 기본 'bottom-start'(왼쪽+하단). */
  placement?: DropdownPlacement;
  /** 그라데이션 편집 허용(프리미티브 재질 등). onGradientChange 필요. */
  allowGradient?: boolean;
  gradient?: GradientFill | null;
  onGradientChange?: (g: GradientFill | null) => void;
}

// EyeDropper API (크로미엄) 타입
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

// 그라데이션 숫자 컨트롤(라벨+입력) — Angle/Spread/Offset 공용
function GradNum({
  label,
  value,
  step,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (n: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-muted">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        onBlur={onCommit}
        className="w-12 bg-background border border-border rounded-xs px-1 py-0.5 text-[11px] text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    </label>
  );
}

// 정지점 램프 → CSS 그라데이션 문자열(프리뷰/트리거용)
function cssGradient(g: GradientFill): string {
  const parts = [...g.stops]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => `${s.color} ${Math.round(s.pos * 100)}%`)
    .join(", ");
  return g.type === "radial" ? `radial-gradient(circle, ${parts})` : `linear-gradient(to right, ${parts})`;
}
// pos 위치의 보간 색(정지점 추가 시 자연스러운 색)
function colorAt(stops: { color: string; pos: number }[], pos: number): string {
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  if (pos <= s[0].pos) return s[0].color;
  if (pos >= s[s.length - 1].pos) return s[s.length - 1].color;
  for (let i = 0; i < s.length - 1; i++) {
    if (pos >= s[i].pos && pos <= s[i + 1].pos) {
      const t = (pos - s[i].pos) / (s[i + 1].pos - s[i].pos || 1);
      const a = hexToRgb(s[i].color) ?? { r: 0, g: 0, b: 0 };
      const b = hexToRgb(s[i + 1].color) ?? { r: 0, g: 0, b: 0 };
      return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
    }
  }
  return s[0].color;
}

export function ColorPicker({
  value,
  onChange,
  onCommit,
  className,
  disabled,
  title,
  showHex = true,
  palette = true,
  placement,
  allowGradient = false,
  gradient,
  onGradientChange,
}: Props) {
  // 전역 단일 팝업 — 화면에 픽커는 하나만. 이 fieldId가 active일 때만 팝업 렌더. 위치는 스토어 공유(전환 시 자리 유지).
  const fieldId = useId();
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isActive = useColorPickerStore((s) => s.activeFieldId === fieldId);
  const panelPos = useColorPickerStore((s) => (s.activeFieldId === fieldId ? s.panelPos : null)) ?? { x: 0, y: 0 };
  const open = isActive;
  const close = useCallback(() => {
    if (useColorPickerStore.getState().activeFieldId === fieldId) useColorPickerStore.getState().close();
  }, [fieldId]);
  // 트리거 rect + placement로 초기 위치 계산
  const computePos = (r: DOMRect) => {
    const PW = 232,
      PH = 380;
    const vw = window.innerWidth,
      vh = window.innerHeight;
    // placement 미지정 = 자동: 트리거가 화면 우측(우측 패널)이면 왼쪽으로(패널 밖), 아니면 아래+왼쪽정렬.
    const plc = placement ?? (r.left > vw * 0.55 ? "left" : "bottom-start");
    let x: number, y: number;
    if (plc === "right" || plc === "left") {
      x = plc === "right" ? r.right + 6 : r.left - PW - 6;
      y = r.top;
    } else {
      const alignEnd = plc === "bottom-end" || plc === "top-end";
      x = alignEnd ? r.right - PW : r.left;
      const wantAbove = plc.startsWith("top");
      const above = wantAbove ? r.top > PH + 8 : vh - r.bottom < PH + 8 && r.top > vh - r.bottom;
      y = above ? r.top - PH - 4 : r.bottom + 4;
    }
    return { x: Math.max(8, Math.min(x, vw - PW - 8)), y: Math.max(8, Math.min(y, vh - PH - 8)) };
  };
  const toggle = () => {
    const st = useColorPickerStore.getState();
    if (st.activeFieldId === fieldId) {
      st.close();
      return;
    }
    if (st.activeFieldId)
      st.switchTo(fieldId); // 이미 다른 픽커 열림 → 자리 유지, 내용만 교체
    else {
      const r = triggerRef.current?.getBoundingClientRect();
      st.openAt(fieldId, r ? computePos(r) : { x: 100, y: 100 });
    }
  };
  // 헤더 드래그 이동
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const onHeaderDown = (e: React.MouseEvent) => {
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    dragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    setDragging(true);
  };
  const onDragMove = (e: React.MouseEvent) => {
    if (dragRef.current) useColorPickerStore.getState().setPanelPos({ x: e.clientX - dragRef.current.ox, y: e.clientY - dragRef.current.oy });
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };
  // Esc 닫기 (바깥클릭은 안 닫힘)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, close]);
  // 언마운트 시 이 필드가 active면 팝업 닫기(오브젝트 전환 등으로 트리거가 사라질 때)
  useEffect(
    () => () => {
      if (useColorPickerStore.getState().activeFieldId === fieldId) useColorPickerStore.getState().close();
    },
    [fieldId],
  );

  const colorAssets = useSceneStore((s) => s.colorAssets);
  const addColorAsset = useSceneStore((s) => s.addColorAsset);
  const removeColorAsset = useSceneStore((s) => s.removeColorAsset);

  const gradMode = !!(allowGradient && gradient && gradient.stops.length >= 1);
  const stops = gradient?.stops ?? [];
  const [selStop, setSelStop] = useState(0);
  const selIdx = gradMode ? Math.min(selStop, Math.max(0, stops.length - 1)) : 0;

  const norm = normalizeHex(value) ?? "#000000";
  // 현재 편집 대상 색 — solid면 value, gradient면 선택된 정지점 색.
  const srcColor = gradMode ? (normalizeHex(stops[selIdx]?.color ?? "#000000") ?? "#000000") : norm;

  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(srcColor) ?? { h: 0, s: 0, v: 0 });
  const [hexText, setHexText] = useState(srcColor);
  const [mode, setMode] = useState<Mode>("hex");
  const [modeOpen, setModeOpen] = useState(false);
  const draggingRef = useRef(false);
  const editingRef = useRef(false); // hex 입력 포커스 중 — 외부 동기화가 타이핑을 재포맷(커서 튐) 못 하게
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // 편집 대상 색 변경(외부/정지점 전환) → 내부 HSV 동기화(드래그·hex 편집 중 아닐 때, 실제 색이 다를 때만)
  useEffect(() => {
    if (draggingRef.current || editingRef.current) return;
    const n = normalizeHex(srcColor);
    if (!n) return;
    setHexText(n);
    if (hsvToHex(hsv.h, hsv.s, hsv.v) !== n) {
      const h = hexToHsv(n);
      if (h) setHsv(h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcColor]);

  const commit = useCallback(() => {
    onCommit?.();
  }, [onCommit]);

  // 색 반영 — solid면 onChange, gradient면 선택 정지점 색 갱신.
  const applyColor = useCallback(
    (hex: string, doCommit = false) => {
      if (gradMode && gradient) {
        onGradientChange?.({ ...gradient, stops: stops.map((s, i) => (i === selIdx ? { ...s, color: hex } : s)) });
      } else {
        onChange(hex);
      }
      if (doCommit) onCommit?.();
    },
    [gradMode, gradient, stops, selIdx, onGradientChange, onChange, onCommit],
  );

  const emit = useCallback(
    (next: HSV) => {
      setHsv(next);
      const hex = hsvToHex(next.h, next.s, next.v);
      setHexText(hex);
      applyColor(hex, false);
    },
    [applyColor],
  );

  const applySV = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
      emit({ h: hsv.h, s, v });
    },
    [emit, hsv.h],
  );

  const applyHue = useCallback(
    (clientX: number) => {
      const el = hueRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 360;
      emit({ h, s: hsv.s, v: hsv.v });
    },
    [emit, hsv.s, hsv.v],
  );

  // 드래그 공통 — pointerdown 시 window 리스너로 커서가 영역을 벗어나도 추적, up에서 commit
  const startDrag = (apply: (x: number, y: number) => void, e: React.PointerEvent) => {
    draggingRef.current = true;
    apply(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => apply(ev.clientX, ev.clientY);
    const up = () => {
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const setFromHex = (hex: string, doCommit = false) => {
    const n = normalizeHex(hex);
    if (!n) return false;
    const h = hexToHsv(n);
    if (!h) return false;
    setHsv(h);
    setHexText(n);
    applyColor(n, doCommit);
    return true;
  };

  // hex 입력 — 타이핑 중엔 사용자가 친 텍스트 유지, 유효하면 실시간 반영(재포맷 안 함). blur/Enter에서 확정.
  const onHexInput = (v: string) => {
    setHexText(v);
    const n = normalizeHex(v);
    if (n) {
      const h = hexToHsv(n);
      if (h) {
        setHsv(h);
        applyColor(n, false);
      }
    }
  };
  const commitHexText = () => {
    if (!setFromHex(hexText, true)) setHexText(hsvToHex(hsv.h, hsv.s, hsv.v));
  };

  const curHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const rgb = hexToRgb(curHex) ?? { r: 0, g: 0, b: 0 };
  const hsl = hexToHsl(curHex) ?? { h: 0, s: 0, l: 0 };

  const applyRgb = (part: "r" | "g" | "b", raw: string) => {
    const val = Math.max(0, Math.min(255, Math.round(Number(raw) || 0)));
    const next = { ...rgb, [part]: val };
    setFromHex(rgbToHex(next.r, next.g, next.b));
  };
  const applyHsl = (part: "h" | "s" | "l", raw: string) => {
    const num = Number(raw) || 0;
    const next = { ...hsl };
    if (part === "h") next.h = Math.max(0, Math.min(360, num));
    else next[part] = Math.max(0, Math.min(100, num)) / 100;
    setFromHex(hslToHex(next.h, next.s, next.l));
  };

  const eyedropper = async () => {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!Ctor) return;
    try {
      setFromHex((await new Ctor().open()).sRGBHex, true);
    } catch {
      /* 취소 */
    }
  };

  // ── 그라데이션 편집 ──
  const enableGradient = () => {
    onGradientChange?.({
      type: "linear",
      angle: 90,
      stops: [
        { color: norm, pos: 0 },
        { color: "#000000", pos: 1 },
      ],
    });
    setSelStop(0);
    commit();
  };
  const disableGradient = () => {
    onGradientChange?.(null);
    commit();
  };
  const posFromX = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const addStopAt = (clientX: number) => {
    if (!gradient) return;
    const pos = posFromX(clientX);
    const next = { ...gradient, stops: [...stops, { color: colorAt(stops, pos), pos }] };
    onGradientChange?.(next);
    setSelStop(next.stops.length - 1);
    commit();
  };
  const startStopDrag = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    setSelStop(idx); // 선택 → srcColor 변경 → SV/Hue thumb가 이 정지점 색으로 이동(위치 드래그는 색 불변이라 동기화 안 막음)
    const g0 = gradient!;
    const move = (ev: PointerEvent) => {
      const pos = posFromX(ev.clientX);
      onGradientChange?.({ ...g0, stops: g0.stops.map((s, i) => (i === idx ? { ...s, pos } : s)) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const removeStop = () => {
    if (!gradient || stops.length <= 2) return;
    onGradientChange?.({ ...gradient, stops: stops.filter((_, i) => i !== selIdx) });
    setSelStop(0);
    commit();
  };

  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
  const numCls =
    "w-full bg-background border border-border rounded-xs px-1 py-1 text-[11px] text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none";
  const triggerSwatch = gradMode && gradient ? { backgroundImage: cssGradient(gradient) } : { backgroundColor: norm };

  return (
    <>
      {/* 트리거 — [스와치 버튼(→팝오버)] + [직접 입력 가능한 hex] */}
      <div
        ref={triggerRef}
        className={`inline-flex items-center gap-1.5 bg-muted/5 dark:bg-muted/10 border border-border/30 rounded-xs px-1.5 py-1 ${disabled ? "opacity-50" : ""} ${className ?? "w-full"}`}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!disabled) toggle();
          }}
          title={title ?? "Open color picker"}
          className="w-4 h-4 rounded-[2px] border border-border shrink-0 disabled:cursor-not-allowed"
          style={triggerSwatch}
        />
        {showHex && (
          <input
            value={gradMode ? "Gradient" : hexText}
            disabled={disabled || gradMode}
            onFocus={() => {
              editingRef.current = true;
            }}
            onChange={(e) => onHexInput(e.target.value)}
            onBlur={() => {
              editingRef.current = false;
              commitHexText();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitHexText();
                e.currentTarget.blur();
              }
            }}
            spellCheck={false}
            className="w-full min-w-0 bg-transparent text-[11px] text-foreground focus:outline-none disabled:cursor-not-allowed"
          />
        )}
      </div>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", left: panelPos.x, top: panelPos.y, zIndex: 9999 }}
            className="w-56 bg-surface border border-border rounded-sm shadow-dropdown select-none"
          >
            {/* 드래그 헤더 + 닫기(X) */}
            <div onMouseDown={onHeaderDown} className="flex items-center justify-between px-2.5 py-1.5 border-b border-border cursor-move">
              <span className="text-[10px] font-semibold text-muted tracking-wide">Color</span>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={close}
                className="text-muted hover:text-foreground transition-colors"
                title="Close"
              >
                <X size={13} />
              </button>
            </div>
            <div className="p-2.5">
              {/* Solid / Gradient 토글 */}
              {allowGradient && (
                <div className="flex rounded-xs overflow-hidden border border-border mb-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (gradMode) disableGradient();
                    }}
                    className={`flex-1 py-1 text-[10px] transition-colors ${!gradMode ? "bg-primary text-white" : "bg-background text-muted hover:text-foreground"}`}
                  >
                    Solid
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!gradMode) enableGradient();
                    }}
                    className={`flex-1 py-1 text-[10px] transition-colors ${gradMode ? "bg-primary text-white" : "bg-background text-muted hover:text-foreground"}`}
                  >
                    Gradient
                  </button>
                </div>
              )}

              {/* 그라데이션 바 + 타입/각도 */}
              {gradMode && gradient && (
                <div className="mb-2.5 space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex rounded-xs overflow-hidden border border-border">
                      {(["linear", "radial"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            onGradientChange?.({ ...gradient, type: t });
                            commit();
                          }}
                          className={`px-2 py-1 text-[10px] transition-colors ${gradient.type === t ? "bg-primary text-white" : "bg-background text-muted hover:text-foreground"}`}
                        >
                          {t === "linear" ? "Linear" : "Radial"}
                        </button>
                      ))}
                    </div>
                    {/* radial 투영 방식 — Facing(구·기본)/Surface(면)/Axis(고정) */}
                    {gradient.type === "radial" && (
                      <div className="flex rounded-xs overflow-hidden border border-border">
                        {(["facing", "surface", "axis"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              onGradientChange?.({ ...gradient, radialMode: m });
                              commit();
                            }}
                            title={
                              m === "facing"
                                ? "카메라 바라보는 쪽 원형(구에 자연스러움)"
                                : m === "surface"
                                  ? "면마다 중앙 원형(패널·벽)"
                                  : "로컬 축 고정"
                            }
                            className={`px-2 py-1 text-[10px] capitalize transition-colors ${(gradient.radialMode ?? "facing") === m ? "bg-primary text-white" : "bg-background text-muted hover:text-foreground"}`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* 수치 컨트롤 — linear=Angle, radial=Spread+Angle(방향)+Offset */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {gradient.type === "linear" ? (
                      <GradNum
                        label="Angle"
                        value={Math.round(gradient.angle ?? 0)}
                        onChange={(n) => onGradientChange?.({ ...gradient, angle: n })}
                        onCommit={commit}
                      />
                    ) : (
                      <>
                        <GradNum
                          label="Spread"
                          value={gradient.scale ?? 1}
                          step={0.1}
                          onChange={(n) => onGradientChange?.({ ...gradient, scale: n || 1 })}
                          onCommit={commit}
                        />
                        <GradNum
                          label="Angle"
                          value={Math.round(gradient.angle ?? 0)}
                          onChange={(n) => onGradientChange?.({ ...gradient, angle: n })}
                          onCommit={commit}
                        />
                        <GradNum
                          label="Offset"
                          value={gradient.offset ?? 0}
                          step={0.05}
                          onChange={(n) => onGradientChange?.({ ...gradient, offset: n })}
                          onCommit={commit}
                        />
                      </>
                    )}
                  </div>
                  {/* 그라데이션 바 — 클릭=정지점 추가, 핸들 드래그=위치 이동, 클릭=선택 */}
                  <div className="relative pt-1 pb-0.5">
                    <div
                      ref={barRef}
                      onPointerDown={(e) => addStopAt(e.clientX)}
                      className="h-5 rounded-xs border border-border cursor-copy"
                      style={{ backgroundImage: cssGradient({ ...gradient, type: "linear" }) }}
                      title="Click to add a stop"
                    />
                    {stops.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onPointerDown={(e) => startStopDrag(i, e)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelStop(i);
                        }}
                        title={`${s.color}`}
                        className={`absolute top-0.5 w-3.5 h-6 -translate-x-1/2 rounded-sm border-2 shadow ${i === selIdx ? "border-primary z-10" : "border-white"}`}
                        style={{ left: `${s.pos * 100}%`, backgroundColor: s.color }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted">
                      Stop {selIdx + 1}/{stops.length}
                    </span>
                    <button
                      type="button"
                      onClick={removeStop}
                      disabled={stops.length <= 2}
                      title="Remove selected stop"
                      className="inline-flex items-center gap-0.5 text-[10px] text-muted hover:text-danger transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                </div>
              )}

              {/* SV 사각형 */}
              <div
                ref={svRef}
                onPointerDown={(e) => startDrag(applySV, e)}
                className="relative w-full h-32 rounded-xs cursor-crosshair"
                style={{
                  backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                  // 검정(명도) 겹을 위에 → 좌하단이 실제로 검게 보이고 클릭값(s=0,v=0=검정)과 일치.
                  backgroundImage: "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))",
                }}
              >
                <span
                  className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
                  style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: curHex }}
                />
              </div>

              {/* Hue 슬라이더 */}
              <div
                ref={hueRef}
                onPointerDown={(e) => startDrag((x) => applyHue(x), e)}
                className="relative w-full h-3 rounded-full mt-2.5 cursor-pointer"
                style={{ backgroundImage: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
              >
                <span
                  className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
                  style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
                />
              </div>

              {/* 표현 드롭다운 + 값 입력 + 스포이드 */}
              <div className="flex items-start gap-1.5 mt-2.5">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setModeOpen((o) => !o)}
                    className="inline-flex items-center gap-0.5 h-[26px] px-1.5 bg-background border border-border rounded-xs text-[10px] text-foreground hover:bg-surface transition-colors"
                  >
                    {mode.toUpperCase()}
                    <ChevronDown size={11} className={`text-muted transition-transform ${modeOpen ? "rotate-180" : ""}`} />
                  </button>
                  {modeOpen && (
                    <div className="absolute left-0 top-full mt-0.5 z-10 bg-surface border border-border rounded-xs shadow-dropdown py-0.5 min-w-[52px]">
                      {MODES.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setMode(m);
                            setModeOpen(false);
                          }}
                          className={`block w-full text-left px-2 py-1 text-[10px] hover:bg-background transition-colors ${m === mode ? "text-foreground" : "text-muted"}`}
                        >
                          {m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 flex items-center gap-1">
                  {mode === "hex" && (
                    <input
                      value={hexText}
                      onFocus={() => {
                        editingRef.current = true;
                      }}
                      onChange={(e) => onHexInput(e.target.value)}
                      onBlur={() => {
                        editingRef.current = false;
                        commitHexText();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitHexText();
                        }
                      }}
                      spellCheck={false}
                      className="w-full bg-background border border-border rounded-xs px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}
                  {mode === "rgb" &&
                    (["r", "g", "b"] as const).map((p) => (
                      <input
                        key={p}
                        type="number"
                        min={0}
                        max={255}
                        value={rgb[p]}
                        onChange={(e) => applyRgb(p, e.target.value)}
                        onBlur={commit}
                        className={numCls}
                      />
                    ))}
                  {mode === "hsl" && (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={360}
                        value={Math.round(hsl.h)}
                        onChange={(e) => applyHsl("h", e.target.value)}
                        onBlur={commit}
                        className={numCls}
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(hsl.s * 100)}
                        onChange={(e) => applyHsl("s", e.target.value)}
                        onBlur={commit}
                        className={numCls}
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(hsl.l * 100)}
                        onChange={(e) => applyHsl("l", e.target.value)}
                        onBlur={commit}
                        className={numCls}
                      />
                    </>
                  )}
                </div>

                {hasEyeDropper && (
                  <button
                    type="button"
                    onClick={eyedropper}
                    title="Pick a color from the screen"
                    className="w-[26px] h-[26px] shrink-0 flex items-center justify-center rounded-xs bg-background border border-border text-muted hover:text-foreground transition-colors"
                  >
                    <Pipette size={13} />
                  </button>
                )}
              </div>

              {/* 저장 팔레트 */}
              {palette && (
                <div className="mt-2.5 pt-2.5 border-t border-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-muted tracking-wide">Saved</span>
                    <button
                      type="button"
                      onClick={() => addColorAsset("", curHex)}
                      title="Save the current color to the palette"
                      className="inline-flex items-center gap-0.5 text-[10px] text-muted hover:text-foreground transition-colors"
                    >
                      <Plus size={11} /> Save
                    </button>
                  </div>
                  {colorAssets.length > 0 ? (
                    <div className="grid grid-cols-8 gap-1">
                      {colorAssets.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setFromHex(c.color, true)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            removeColorAsset(c.id);
                          }}
                          title={`${c.name || c.color} — right-click to remove`}
                          className="aspect-square rounded-xs border border-border hover:ring-1 hover:ring-primary transition-all"
                          style={{ backgroundColor: c.color }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted/50">No saved colors yet. Click Save to add one.</p>
                  )}
                </div>
              )}
            </div>
            {/* 드래그 중에만 뜨는 투명 캡처 레이어(overlay 아님 — 이동 종료 시 사라짐) */}
            {dragging && <div className="fixed inset-0 z-[60] cursor-move" onMouseMove={onDragMove} onMouseUp={endDrag} onMouseLeave={endDrag} />}
          </div>,
          document.body,
        )}
    </>
  );
}
