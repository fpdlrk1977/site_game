'use client';

// 에디터 작업 팝업 공용 셸 — 펜/복셀 툴 팝업의 패턴을 컴포넌트화.
//  · 헤더를 잡고 드래그해 이동
//  · overlay(배경 딤) 없음 — 씬을 보며 작업. 바깥 클릭으로 닫히지 않음.
//  · ✕ 버튼 또는 Esc로만 닫힘
//  · body로 portal → 좁은 패널의 overflow-hidden을 벗어나 넓게 표시
// SelectBox 등 드롭다운은 zIndex 9999라 이 팝업(z-100) 위에 정상 표시된다.

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function DraggablePopup({
  title,
  icon,
  width = 420,
  onClose,
  children,
}: {
  title: string;
  icon?: ReactNode;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // null = 중앙
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const off = useRef<{ ox: number; oy: number } | null>(null);

  const onHeaderDown = (e: React.MouseEvent) => {
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    off.current = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    setPos({ x: r.left, y: r.top }); // 중앙정렬 → 절대좌표 전환(점프 방지)
    setDragging(true);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!off.current) return;
    setPos({ x: e.clientX - off.current.ox, y: e.clientY - off.current.oy });
  };
  const endDrag = () => { off.current = null; setDragging(false); };

  // Esc로 닫기 (capture로 먼저 가로채 에디터 단축키와 충돌 방지)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div
        ref={panelRef}
        className="fixed z-[100] bg-surface border border-border rounded-sm shadow-modal flex flex-col max-h-[88vh]"
        style={{
          width,
          maxWidth: '95vw',
          ...(pos ? { left: pos.x, top: pos.y } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }),
        }}
      >
        <div
          className="flex items-center justify-between px-3.5 py-2.5 border-b border-border cursor-move select-none shrink-0"
          onMouseDown={onHeaderDown}
        >
          <span className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">{icon}{title}</span>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            title="닫기 (Esc)"
            className="text-muted hover:text-foreground px-1 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto p-3">{children}</div>
      </div>
      {/* 드래그 중에만 뜨는 투명 캡처 레이어(overlay 아님) — 마우스 추적용 */}
      {dragging && <div className="fixed inset-0 z-[101] cursor-move" onMouseMove={onMove} onMouseUp={endDrag} />}
    </>,
    document.body,
  );
}
