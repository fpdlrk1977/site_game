'use client';

import { useRef, useEffect } from 'react';

export interface MobileMoveInput {
  fwd: number;
  strafe: number;
  jump: boolean;
}

interface Props {
  inputRef: React.MutableRefObject<MobileMoveInput>;
}

const RADIUS = 36; // px, 스틱 최대 이동 반경

export function MobileControls({ inputRef }: Props) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeTouchId = useRef<number | null>(null);
  const originRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const base = baseRef.current;
    if (!base) return;

    const setKnob = (dx: number, dy: number) => {
      if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const applyVector = (dx: number, dy: number) => {
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(dist, RADIUS);
      const nx = dist > 0 ? (dx / dist) * clamped : 0;
      const ny = dist > 0 ? (dy / dist) * clamped : 0;
      setKnob(nx, ny);

      if (clamped / RADIUS < 0.12) {
        inputRef.current.fwd = 0;
        inputRef.current.strafe = 0;
        return;
      }
      // 위로 드래그(ny < 0) = 전진
      inputRef.current.fwd = -ny / RADIUS;
      inputRef.current.strafe = nx / RADIUS;
    };

    const reset = () => {
      activeTouchId.current = null;
      setKnob(0, 0);
      inputRef.current.fwd = 0;
      inputRef.current.strafe = 0;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (activeTouchId.current !== null) return;
      const t = e.changedTouches[0];
      activeTouchId.current = t.identifier;
      const rect = base.getBoundingClientRect();
      originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (activeTouchId.current === null) return;
      const t = Array.from(e.changedTouches).find((t) => t.identifier === activeTouchId.current);
      if (!t) return;
      applyVector(t.clientX - originRef.current.x, t.clientY - originRef.current.y);
    };
    const onTouchEnd = (e: TouchEvent) => {
      const ended = Array.from(e.changedTouches).some((t) => t.identifier === activeTouchId.current);
      if (ended) reset();
    };

    base.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      base.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [inputRef]);

  return (
    <>
      {/* 이동 조이스틱 */}
      <div
        ref={baseRef}
        className="absolute bottom-8 left-8 w-28 h-28 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm"
        style={{ touchAction: 'none' }}
      >
        <div
          ref={knobRef}
          className="absolute top-1/2 left-1/2 w-12 h-12 -ml-6 -mt-6 rounded-full bg-white/40 border border-white/30"
          style={{ transition: 'transform 0.05s linear' }}
        />
      </div>

      {/* 점프 버튼 — onTouchStart은 React 기본이 passive라 preventDefault 불가.
          스크롤 방지는 touchAction: 'none' CSS로 처리 */}
      <button
        onTouchStart={() => { inputRef.current.jump = true; }}
        className="absolute bottom-12 right-8 w-16 h-16 rounded-full bg-white/15 border border-white/25 backdrop-blur-sm text-white text-xs font-semibold active:bg-white/30"
        style={{ touchAction: 'none' }}
      >
        점프
      </button>
    </>
  );
}
