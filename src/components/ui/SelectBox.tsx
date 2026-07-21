"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useDropdown, type DropdownPlacement } from "@/hooks/useDropdown";
import { useListNav } from "@/hooks/useListNav";

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
  /** 트리거의 배경/테두리/크기 등 외형 클래스. 지정 시 기본 외형을 완전히 대체한다. */
  className?: string;
  /** 컨테이너 폭에 꽉 채울지(기본 true), 내용 크기만큼만 차지할지(false, 예: 툴바 칩 버튼) */
  fullWidth?: boolean;
  gray?: boolean;
  /** 옵션 아이콘 크기(px). 개별 아이콘이 자체 크기를 지정해도 이 크기로 강제된다. 기본 16 */
  iconSize?: number;
  disabled?: boolean;
  /** 드롭다운이 열리는 위치. 기본 'bottom-start'(왼쪽+하단). */
  placement?: DropdownPlacement;
}

const DEFAULT_TRIGGER_CLASS = "bg-surface border border-border/80 rounded-xs px-2 py-[5px] text-xs dark:bg-sidebar!";
const ICON_WRAPPER_CLASS =
  "shrink-0 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>img]:w-full [&>img]:h-full [&>img]:object-cover";

export function SelectBox({
  value,
  options,
  onChange,
  placeholder = "선택",
  className,
  fullWidth = true,
  iconSize = 16,
  disabled,
  gray = false,
  placement = "bottom-start",
}: Props) {
  const { open, openMenu, close, triggerRef, panelRef, panelStyle } = useDropdown<HTMLButtonElement>({ placement });
  const [highlight, setHighlight] = useListNav(options.length, open);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const openDropdown = () => {
    setHighlight(Math.max(0, selectedIndex));
    openMenu();
  };

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    if (opt.value !== value) onChange(opt.value);
    close();
    triggerRef.current?.focus();
  };

  // 하이라이트가 바뀌면(키보드 이동) 스크롤 위치를 따라간다
  useEffect(() => {
    if (!open) return;
    (panelRef.current?.children[highlight] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [highlight, open, panelRef]);

  // Enter/Space 선택, Tab 닫기 (↑↓ 순환 이동은 useListNav, Esc/바깥클릭 닫기는 useDropdown이 처리)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        commit(highlight);
      }
      if (e.key === "Tab") close();
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
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
          if (open) close();
          else openDropdown();
        }}
        onKeyDown={(e) => {
          if (disabled || open) return;
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openDropdown();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${fullWidth ? "w-full flex" : "inline-flex"} items-center gap-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${className ?? DEFAULT_TRIGGER_CLASS} ${gray ? "bg-muted/5!" : ""}`}
      >
        {selected?.icon && (
          <span className={ICON_WRAPPER_CLASS} style={{ width: iconSize, height: iconSize }}>
            {selected.icon}
          </span>
        )}
        <span className={`flex-1 text-left truncate text-[11px] ${selected ? "" : "text-muted/60"}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={12} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{ ...panelStyle, maxWidth: 320 }}
            className="max-h-60 overflow-y-auto bg-sidebar border border-border rounded-xs shadow-2xl shadow-black/30 py-1"
          >
            {options.map((opt, idx) => (
              <div
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(idx);
                }}
                className={`flex items-center gap-1.5 px-2 py-1.5 text-xs cursor-pointer ${
                  idx === highlight ? "bg-primary/15 text-foreground" : "text-foreground/80 hover:bg-background/60"
                }`}
              >
                {opt.icon && (
                  <span className={ICON_WRAPPER_CLASS} style={{ width: iconSize, height: iconSize }}>
                    {opt.icon}
                  </span>
                )}
                <span className="flex-1 truncate text-[11px]">{opt.label}</span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
