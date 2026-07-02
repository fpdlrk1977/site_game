'use client';

import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SelectBox({ value, options, onChange, placeholder = '선택', className = '', disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: -9999, left: -9999, opacity: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = () => setOpen(false);

  const openDropdown = () => {
    setHighlight(Math.max(0, selectedIndex));
    setOpen(true);
  };

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    if (opt.value !== value) onChange(opt.value);
    close();
    triggerRef.current?.focus();
  };

  // 트리거 하단(공간 부족 시 상단)에 위치, 스크롤/리사이즈 추적
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (!triggerRef.current) return;
      const tr = triggerRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const listH = listRef.current?.offsetHeight ?? 240;
      const below = tr.bottom + listH + 4 <= vh || tr.top < listH;
      setStyle({
        position: 'fixed',
        left: tr.left,
        width: tr.width,
        top: below ? tr.bottom + 4 : undefined,
        bottom: below ? undefined : vh - tr.top + 4,
        opacity: 1,
        zIndex: 9999,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener('mousedown', onDocDown);
    return () => window.removeEventListener('mousedown', onDocDown);
  }, [open]);

  // 키보드 탐색: ↑↓ 이동, Enter/Space 선택, Esc 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); triggerRef.current?.focus(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => {
          const next = Math.min(h + 1, options.length - 1);
          (listRef.current?.children[next] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => {
          const next = Math.max(h - 1, 0);
          (listRef.current?.children[next] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(highlight); }
      if (e.key === 'Tab') close();
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlight, options]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) close(); else openDropdown();
        }}
        onKeyDown={(e) => {
          if (disabled || open) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openDropdown();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center gap-1.5 bg-surface border border-border rounded-xs px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {selected?.icon && <span className="shrink-0 flex items-center">{selected.icon}</span>}
        <span className={`flex-1 text-left truncate ${selected ? '' : 'text-muted/60'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={12} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={listRef}
          role="listbox"
          style={style}
          className="max-h-60 overflow-y-auto bg-sidebar border border-border rounded-xs shadow-2xl shadow-black/30 py-1"
        >
          {options.map((opt, idx) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => { e.preventDefault(); commit(idx); }}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-xs cursor-pointer ${
                idx === highlight ? 'bg-primary/15 text-foreground' : 'text-foreground/80 hover:bg-background/60'
              }`}
            >
              {opt.icon && <span className="shrink-0 flex items-center">{opt.icon}</span>}
              <span className="flex-1 truncate">{opt.label}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
