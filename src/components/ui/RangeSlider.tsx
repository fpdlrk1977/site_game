'use client';

// 공통 커스텀 range 슬라이더 — 네이티브 <input type="range">가 아니라 div + 포인터 이벤트로 직접 구현.
// 트랙/채워진 부분/thumb를 완전히 제어(바이올렛 테마). 앞으로 range 입력은 이 컴포넌트를 사용한다.
//   value/onChange = 실시간 값. onCommit = 드래그 놓을 때(=undo 커밋용 pushHistory 등).
//   label(왼쪽) · showValue(오른쪽 값 표시, precision/unit) 옵션.

import { useRef, useCallback, type KeyboardEvent, type PointerEvent } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
  precision?: number;
  unit?: string;
  disabled?: boolean;
  className?: string;
}

export function RangeSlider({
  value, onChange, onCommit,
  min = 0, max = 1, step = 0.01,
  label, showValue = false, precision, unit = '',
  disabled = false, className,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);
  const snap = useCallback((v: number) => {
    if (step <= 0) return clamp(v);
    const s = Math.round((v - min) / step) * step + min;
    // 부동소수 오차 정리
    const decimals = (String(step).split('.')[1] ?? '').length;
    return clamp(Number(s.toFixed(decimals)));
  }, [min, step, clamp]);

  const ratio = max > min ? (clamp(value) - min) / (max - min) : 0;
  const pct = ratio * 100;

  const valueFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    const t = r.width > 0 ? (clientX - r.left) / r.width : 0;
    return snap(min + Math.min(1, Math.max(0, t)) * (max - min));
  }, [value, snap, min, max]);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    dragging.current = true;
    onChange(valueFromClientX(e.clientX));
    const move = (ev: globalThis.PointerEvent) => { if (dragging.current) onChange(valueFromClientX(ev.clientX)); };
    const up = () => {
      dragging.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onCommit?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let nv = value;
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowDown': nv = snap(value - step); break;
      case 'ArrowRight': case 'ArrowUp': nv = snap(value + step); break;
      case 'Home': nv = min; break;
      case 'End': nv = max; break;
      default: return;
    }
    e.preventDefault();
    onChange(nv);
    onCommit?.();
  };

  const display = precision != null ? clamp(value).toFixed(precision) : String(clamp(value));

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      {label && <span className="text-[10px] text-muted/60 shrink-0 select-none">{label}</span>}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamp(value)}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        className={`relative flex-1 h-4 flex items-center select-none touch-none group focus:outline-none ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}
      >
        {/* 트랙(배경) */}
        <div className="w-full h-1 rounded-full bg-border" />
        {/* 채워진 부분 */}
        <div className="absolute left-0 h-1 rounded-full bg-primary" style={{ width: `${pct}%` }} />
        {/* thumb */}
        <div
          className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary border-2 border-background shadow-sm transition-transform group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-primary/40"
          style={{ left: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className="text-[10px] text-muted tabular-nums w-9 text-right shrink-0 select-none">{display}{unit}</span>
      )}
    </div>
  );
}
