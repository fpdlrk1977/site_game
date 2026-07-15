'use client';

// 공통 컨텍스트(우클릭) 메뉴 — 포인터 위치에 fixed로 뜨고, 뷰포트 밖으로 나가면 되접는다.
// 바깥 클릭/스크롤/Esc로 닫힘(백드롭 없음 → 다른 대상 우클릭 시 그 메뉴로 자연 전환).
// 트리거(onContextMenu → 좌표 state)와 메뉴 항목(children)은 호출부가 소유. 위치·클램핑·닫기는 이 컴포넌트가 담당.
//   사용: {ctx && <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)}>...버튼들...</ContextMenu>}
import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from 'react';

export function ContextMenu({
  x,
  y,
  onClose,
  children,
  className = '',
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  className?: string; // 너비/텍스트 크기 등 호출부 커스터마이즈(예: 'w-44 text-[11px]')
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  // 렌더 후 실제 크기를 재 뷰포트 밖으로 나가면 되접는다(오른쪽 넘치면 왼쪽, 아래 넘치면 위로). 깜빡임 없음.
  useLayoutEffect(() => {
    let left = x;
    let top = y;
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      if (left + r.width > window.innerWidth - 4) left = x - r.width - 2;
      if (top + r.height > window.innerHeight - 4) top = window.innerHeight - r.height - 4;
    }
    setPos({ left: Math.max(4, left), top: Math.max(4, top) });
  }, [x, y]);

  // 바깥 클릭(mousedown)/스크롤/Esc로 닫기. 메뉴 내부 클릭은 data-ctx-menu 표식으로 무시.
  // mousedown이 다른 대상 우클릭(contextmenu)보다 먼저 발생 → 현재 메뉴 닫고 이어 새 메뉴가 열림.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-ctx-menu]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-ctx-menu
      style={{ position: 'fixed', left: pos.left, top: pos.top }}
      className={`bg-surface border border-border rounded-xs shadow-2xl shadow-black/30 z-[101] py-1 overflow-hidden ${className}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
