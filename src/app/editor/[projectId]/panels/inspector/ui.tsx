"use client";

// 인스펙터/Environment 패널 공용 UI 프리미티브.
// InspectorPanel.tsx가 비대해져(3800줄+) 섹션별 컴포넌트로 분리하는 리팩터의 1단계 —
// 여러 섹션이 공유하는 입력/토글/헤더/박스를 여기로 추출한다. 동작 무변경(순수 이동).

import { useState, useEffect, useRef, type ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, ChevronRight } from "lucide-react";
import { InfoHint } from "@/components/ui/InfoHint";
import { useLiveTransformStore } from "@/store/liveTransformStore";
import type { ObjectNodeSchema } from "@/types/scene";

export function evalMath(expr: string): number | null {
  const s = expr.replace(/[^0-9+\-*/.()\s]/g, "").trim();
  if (!s) return null;
  try {
    const result = Function(`'use strict'; return (${s})`)() as unknown;
    if (typeof result === "number" && isFinite(result)) return result;
  } catch {
    /* ignore */
  }
  return null;
}

// 지정한 소수 자릿수까지만 표시, 정수면 소수점 생략
export const fmt = (v: number, precision = 1) => {
  const s = v.toFixed(precision);
  return Number(s) === Math.trunc(Number(s)) ? String(Math.trunc(Number(s))) : s;
};

// ── 드래그 스크럽 숫자 입력 ─────────────────────────────────────
export function NumInput({
  value,
  onChange,
  onCommit,
  dragStep = 0.1,
  precision = 1,
  min,
  max,
  prefix,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  dragStep?: number;
  precision?: number;
  min?: number;
  max?: number;
  prefix?: boolean;
}) {
  const [local, setLocal] = useState(fmt(value, precision));
  const isFocused = useRef(false);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ x: 0, val: 0 });
  // 화살표 키로 눌러 값이 바뀐 뒤, 키를 뗄 때 한 번만 커밋(홀드 반복=undo 1회).
  const pendingKeyCommit = useRef(false);
  // RAF ref: throttles Zustand store updates to once-per-frame to avoid
  // "Maximum update depth exceeded" when pointermove fires faster than React
  // can process SyncLane renders (especially with DevTools open).
  const rafRef = useRef<{ id: number; val: number } | null>(null);

  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  const round = (n: number) => {
    const mult = 10 ** precision;
    return Math.round(n * mult) / mult;
  };

  useEffect(() => {
    if (!isFocused.current) setLocal(fmt(value, precision));
  }, [value, precision]);

  const onDragDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    dragOrigin.current = { x: e.clientX, val: value };
    document.body.style.cursor = "ew-resize";
    e.preventDefault();
  };

  const onDragMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragOrigin.current.x;
    const newVal = clamp(round(dragOrigin.current.val + dx * dragStep));
    setLocal(fmt(newVal, precision));
    if (rafRef.current) cancelAnimationFrame(rafRef.current.id);
    rafRef.current = {
      val: newVal,
      id: requestAnimationFrame(() => {
        onChange(newVal);
        rafRef.current = null;
      }),
    };
  };

  const onDragUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current.id);
      onChange(rafRef.current.val);
      rafRef.current = null;
    }
    onCommit();
  };

  // 화살표 ↑/↓ = dragStep 만큼 증감(Shift=×10, Alt=÷10). 텍스트 캐럿 이동/스크롤은 막는다.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = dragStep * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
    const cur = (() => {
      const n = parseFloat(local);
      return isNaN(n) ? value : n;
    })();
    const newVal = clamp(round(cur + (e.key === "ArrowUp" ? step : -step)));
    if (newVal === cur) return;
    setLocal(fmt(newVal, precision));
    onChange(newVal);
    pendingKeyCommit.current = true;
  };
  const onKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    if (pendingKeyCommit.current) {
      pendingKeyCommit.current = false;
      onCommit();
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={local}
        onFocus={() => {
          isFocused.current = true;
        }}
        onChange={(e) => {
          setLocal(e.target.value);
          const n = parseFloat(e.target.value);
          // 타이핑 중에도 min/max를 넘는 값이 스토어로 흘러가지 않도록 클램프
          // (표시값은 그대로 두고 blur 시점에 정리)
          if (!isNaN(n)) onChange(clamp(n));
        }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          isFocused.current = false;
          let n = parseFloat(local);
          if (isNaN(n)) n = evalMath(local) ?? NaN;
          if (!isNaN(n)) {
            const c = clamp(round(n));
            onChange(c);
            setLocal(fmt(c, precision));
          } else setLocal(fmt(value, precision));
          onCommit();
        }}
        className={`w-full border border-border rounded-xs pr-5 py-1  text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary tabular-nums bg-muted/5 dark:bg-muted/10 ${prefix ? "pl-6" : "pl-2"}`}
      />
      <span
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground cursor-ew-resize select-none transition-colors"
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <ArrowLeftRight size={10} />
      </span>
    </div>
  );
}

// ── 라벨 + 드래그 스크럽 숫자 입력 (단일 값, range 슬라이더 대체) ──
export function LabeledNum({
  label,
  value,
  onChange,
  onCommit,
  min,
  max,
  precision = 1,
  dragStep = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  min?: number;
  max?: number;
  precision?: number;
  dragStep?: number;
}) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">{label}</span>
      <NumInput value={value} onChange={onChange} onCommit={onCommit} min={min} max={max} precision={precision} dragStep={dragStep} prefix={false} />
    </div>
  );
}

// ── 라벨 + 텍스트 입력 (LabeledNum의 텍스트 버전, 드래그 아이콘 없음) ──
//   onChange=실시간, onCommit=blur(=pushHistory 등). 공용 인풋 스타일이라 매번 className 안 넣어도 됨.
export const TEXT_INPUT_CLASS = 'w-full border border-border rounded-xs px-2 py-1 text-[11px] text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-primary bg-muted/5 dark:bg-muted/10';
export function LabeledText({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  placeholder?: string;
}) {
  return (
    <div>
      {label && <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">{label}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        placeholder={placeholder}
        className={TEXT_INPUT_CLASS}
      />
    </div>
  );
}

// ── XYZ 행 ─────────────────────────────────────────────────────
export function XYZRow({
  label,
  labelExtra,
  x,
  y,
  z,
  onChangeX,
  onChangeY,
  onChangeZ,
  onCommit,
  dragStep = 0.1,
  min,
  max,
}: {
  label: string;
  labelExtra?: ReactNode;
  x: number;
  y: number;
  z: number;
  onChangeX: (v: number) => void;
  onChangeY: (v: number) => void;
  onChangeZ: (v: number) => void;
  onCommit: () => void;
  dragStep?: number;
  // 세 축 공통 하한/상한(음수 방지 등). 미지정=제한 없음.
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-muted/50 tracking-wide">{label}</span>
        {labelExtra}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { axis: "X", val: x, change: onChangeX },
          { axis: "Y", val: y, change: onChangeY },
          { axis: "Z", val: z, change: onChangeZ },
        ].map(({ axis, val, change }) => (
          <div key={axis} className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted/70 pointer-events-none z-10">{axis}</span>
            <NumInput value={val} onChange={change} onCommit={onCommit} dragStep={dragStep} min={min} max={max} prefix={true} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Transform 입력부 (position/rotation/scale) ─────────────────
// 라이브 채널을 구독해 기즈모 드래그 '중'에도 수치가 실시간 갱신된다.
// 이 서브트리만 라이브 값에 구독 → InspectorPanel 전체가 아니라 이 9개 입력만 리렌더(성능 격리).
export function LiveTransformRows({
  obj,
  setPos,
  setRot,
  setScl,
  onCommit,
}: {
  obj: ObjectNodeSchema;
  setPos: (axis: "x" | "y" | "z", v: number) => void;
  setRot: (axis: "x" | "y" | "z", v: number) => void;
  setScl: (axis: "x" | "y" | "z", v: number) => void;
  onCommit: () => void;
}) {
  // 드래그 중(live.id === obj.id)이면 라이브 값, 아니면 저장된 obj 값. 다른 오브젝트 조작 중이면 null → 리렌더 안 함.
  const live = useLiveTransformStore((s) => (s.live && s.live.id === obj.id ? s.live : null));
  const pos = live?.position ?? obj.position;
  const rot = live?.rotation ?? obj.rotation;
  const scl = live?.scale ?? obj.scale;
  return (
    <>
      <XYZRow
        label="Position"
        x={pos.x}
        y={pos.y}
        z={pos.z}
        onChangeX={(v) => setPos("x", v)}
        onChangeY={(v) => setPos("y", v)}
        onChangeZ={(v) => setPos("z", v)}
        onCommit={onCommit}
        dragStep={0.1}
      />
      <XYZRow
        label="Rotation °"
        x={rot.x}
        y={rot.y}
        z={rot.z}
        onChangeX={(v) => setRot("x", v)}
        onChangeY={(v) => setRot("y", v)}
        onChangeZ={(v) => setRot("z", v)}
        onCommit={onCommit}
        dragStep={1}
      />
      <XYZRow
        label="Scale"
        x={scl.x}
        y={scl.y}
        z={scl.z}
        onChangeX={(v) => setScl("x", v)}
        onChangeY={(v) => setScl("y", v)}
        onChangeZ={(v) => setScl("z", v)}
        onCommit={onCommit}
        dragStep={0.05}
        min={0.001}
      />
    </>
  );
}

// ── 섹션 헤더 (접기/펼치기 지원) ──────────────────────────────
export function SectionHeader({
  title,
  icon,
  hint,
  isOpen,
  onToggle,
  dot,
}: {
  title: string;
  icon?: ReactNode;
  hint?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  // 점진적 공개: 접힌 섹션에 설정값이 있으면 액센트 점으로 표시(값이 숨지 않도록)
  dot?: boolean;
}) {
  const collapsible = onToggle !== undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const prevOpen = useRef(isOpen);
  // 접힌 섹션을 펼치면(닫힘→열림) 스크롤 컨테이너에서 그 섹션이 보이도록 스크롤.
  //   - 섹션이 컨테이너에 다 들어가면 아래 끝까지 드러나게(헤더는 유지)
  //   - 컨테이너보다 크면 헤더를 상단에 붙여(그만큼만 내려) 최대한 드러냄
  useEffect(() => {
    if (isOpen && !prevOpen.current && rootRef.current) {
      const header = rootRef.current;
      const section = header.parentElement; // GroupBox(헤더+본문)
      // 스크롤 가능한 조상 찾기
      let container: HTMLElement | null = header.parentElement;
      while (container) {
        const oy = getComputedStyle(container).overflowY;
        if ((oy === "auto" || oy === "scroll") && container.scrollHeight > container.clientHeight) break;
        container = container.parentElement;
      }
      if (container && section) {
        requestAnimationFrame(() => {
          const c = container!.getBoundingClientRect();
          const s = section.getBoundingClientRect();
          const h = header.getBoundingClientRect();
          if (s.bottom > c.bottom) {
            const alignBottom = s.bottom - c.bottom;   // 섹션 끝을 컨테이너 끝에 맞춤
            const alignHeaderTop = h.top - c.top - 4;  // 헤더를 상단에 붙임(과도 방지 캡)
            const delta = Math.min(alignBottom, Math.max(0, alignHeaderTop));
            if (delta > 1) container!.scrollBy({ top: delta, behavior: "smooth" });
          }
        });
      }
    }
    prevOpen.current = isOpen;
  }, [isOpen]);
  return (
    <div
      ref={rootRef}
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-3 text-[11px] font-semibold text-muted tracking-wide bg-surface/40 select-none ${collapsible ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
    >
      {icon && <span className="opacity-60 flex items-center">{icon}</span>}
      <span className="flex-1 text-foreground flex items-center gap-1.5">
        {title}
        {hint && <InfoHint text={hint} />}
      </span>
      {dot && collapsible && !isOpen && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="설정값 있음" />}
      {collapsible && <span className="text-muted/50">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────
export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`relative w-7.5 h-4 rounded-full transition-colors cursor-pointer shrink-0 ${value ? "bg-primary" : "bg-muted/5"}`}
    >
      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${value ? "left-4" : "left-0.5"}`} />
    </div>
  );
}

// 주의: 원본이 className을 받지만 적용하지 않았다(무시). 리팩터 동작 보존 위해 그대로 무시.
export function GroupBox({ children }: { children: ReactNode; className?: string }) {
  return <div className={`border-t border-border`}>{children}</div>;
}
