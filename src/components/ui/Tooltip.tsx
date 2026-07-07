'use client';

import { type ReactNode, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  content: string;
  children: ReactNode;
  className?: string;
  /** 긴 안내문용 — 한 줄 고정 대신 줄바꿈 + 최대폭 */
  wide?: boolean;
}

export function Tooltip({ content, children, className, wide = false }: Props) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'fixed', top: -9999, left: -9999, opacity: 0,
  });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !triggerRef.current || !tipRef.current) return;
    const tr = triggerRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;

    // 위 공간이 부족하면 아래로
    const below = tr.top < tip.height + 12;
    // 가운데 정렬 후 좌우 경계 클램프
    let x = tr.left + tr.width / 2 - tip.width / 2;
    x = Math.max(8, Math.min(x, vw - tip.width - 8));
    const y = below ? tr.bottom + 6 : tr.top - tip.height - 6;

    setStyle({ position: 'fixed', left: x, top: y, opacity: 1, zIndex: 9999 });
  }, [visible]);

  const hide = () => {
    setVisible(false);
    setStyle({ position: 'fixed', top: -9999, left: -9999, opacity: 0 });
  };

  return (
    <div
      ref={triggerRef}
      className={className}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={hide}
    >
      {children}
      {visible && typeof document !== 'undefined' && createPortal(
        <div
          ref={tipRef}
          style={style}
          className={`px-2.5 py-1.5 bg-foreground text-background text-[11px] font-medium rounded-xs pointer-events-none shadow-xl shadow-black/20 transition-opacity duration-100 ${
            wide ? 'max-w-[240px] whitespace-normal leading-snug text-left' : 'whitespace-nowrap'
          }`}
        >
          {content}
        </div>,
        document.body,
      )}
    </div>
  );
}
