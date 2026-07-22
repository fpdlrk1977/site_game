'use client';

// Game Logic 드래그 팝업 — Environment 타이틀의 Logic 버튼으로 연다.
//   드래그 이동 · 외부 클릭/Esc 닫기(트리거 버튼은 제외). 예전 좌패널 Logic 탭을 대체한다.
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Cpu } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { GameVariablesSection } from './inspector/GameVariablesSection';
import { HudSection } from './inspector/HudSection';
import { SceneLogicSection } from './inspector/SceneLogicSection';

export function LogicPopup() {
  const open = useSceneStore((s) => s.logicOpen);
  const setOpen = useSceneStore((s) => s.setLogicOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth / 2 - 150) : 400,
    y: 80,
  }));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);

  // Esc + 바깥 클릭 닫기. 단 Logic 트리거 버튼([data-logic-trigger]) 클릭은 제외(닫혔다 곧바로 다시 열림 방지).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (t.closest('[data-logic-trigger]')) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, { capture: true } as EventListenerOptions);
    };
  }, [open, setOpen]);

  if (!open || typeof document === 'undefined') return null;

  const onHeaderDown = (e: React.MouseEvent) => {
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    dragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    setDragging(true);
  };
  const onDragMove = (e: React.MouseEvent) => {
    if (dragRef.current) setPos({ x: e.clientX - dragRef.current.ox, y: e.clientY - dragRef.current.oy });
  };
  const endDrag = () => { dragRef.current = null; setDragging(false); };

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 70 }}
      className="w-[300px] max-h-[80vh] flex flex-col bg-surface border border-border rounded-sm shadow-dropdown select-none"
    >
      {/* 드래그 헤더 */}
      <div onMouseDown={onHeaderDown} className="flex items-center justify-between px-3 py-2 border-b border-border cursor-move shrink-0">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <Cpu size={13} className="text-foreground" /> Game Logic
        </span>
        <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)} className="text-muted hover:text-foreground transition-colors" title="Close">
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-2 space-y-1">
        <GameVariablesSection />
        <SceneLogicSection />
        <HudSection />
      </div>
      {/* 드래그 중 투명 캡처 레이어 */}
      {dragging && <div className="fixed inset-0 z-[60] cursor-move" onMouseMove={onDragMove} onMouseUp={endDrag} onMouseLeave={endDrag} />}
    </div>,
    document.body,
  );
}
