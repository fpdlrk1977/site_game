'use client';

import { useState, useRef, useEffect, type CSSProperties, type RefObject } from 'react';

interface UseDropdownResult<T extends HTMLElement> {
  open: boolean;
  openMenu: () => void;
  close: () => void;
  toggle: () => void;
  triggerRef: RefObject<T | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  /** 트리거 기준 fixed 위치(포탈 사용 전제) — 공간 부족 시 위로 뒤집히고, 뷰포트 밖으로 나가지 않게 클램프됨 */
  panelStyle: CSSProperties;
}

/**
 * 패널이 트리거에 붙는 위치.
 * - 'bottom'/'bottom-start'(기본): 아래 + 왼쪽 정렬(트리거 왼쪽 모서리에 맞춤). 공간 부족 시 위로 뒤집힘.
 * - 'bottom-end': 아래 + 오른쪽 정렬(트리거 오른쪽 모서리에 맞춤)
 * - 'top'/'top-start': 위 + 왼쪽 정렬 · 'top-end': 위 + 오른쪽 정렬
 * - 'right': 트리거 오른쪽 · 'left': 트리거 왼쪽 (상하는 뷰포트 안쪽으로 클램프)
 */
export type DropdownPlacement =
  | 'bottom' | 'bottom-start' | 'bottom-end'
  | 'top' | 'top-start' | 'top-end'
  | 'right' | 'left';

interface UseDropdownOptions {
  placement?: DropdownPlacement;
}

/**
 * 트리거에 붙는 팝업(드롭다운/셀렉트 등) 공통 동작을 제공하는 헤드리스 훅.
 * 위치 계산(portal 기준) + 바깥 클릭 닫기 + Esc 닫기만 담당하며,
 * 트리거/패널의 실제 마크업과 내용, 추가 키보드 동작(방향키 탐색 등)은 사용하는 쪽에서 구성한다.
 */
export function useDropdown<T extends HTMLElement = HTMLButtonElement>(
  { placement = 'bottom' }: UseDropdownOptions = {},
): UseDropdownResult<T> {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ position: 'fixed', top: -9999, left: -9999, opacity: 0 });
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  const openMenu = () => setOpen(true);
  const toggle = () => { if (open) close(); else openMenu(); };

  // 트리거 기준 위치 계산, 뷰포트 안쪽으로 클램프
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (!triggerRef.current) return;
      const tr = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const panelW = panelRef.current?.offsetWidth ?? tr.width;
      const panelH = panelRef.current?.offsetHeight ?? 240;

      // 좌/우 배치 — 트리거 옆에 상단 정렬(상하는 뷰포트 안쪽 클램프)
      if (placement === 'right' || placement === 'left') {
        const top = Math.max(8, Math.min(tr.top, vh - panelH - 8));
        const left = placement === 'right' ? tr.right + 6 : Math.max(8, tr.left - panelW - 6);
        setPanelStyle({ position: 'fixed', left, top, opacity: 1, zIndex: 9999 });
        return;
      }

      // 상/하 배치 — 원하는 방향 우선, 공간 부족하면 반대로 뒤집기
      const wantAbove = placement === 'top' || placement === 'top-start' || placement === 'top-end';
      const belowSpace = vh - tr.bottom;
      const aboveSpace = tr.top;
      let above = wantAbove;
      if (!above && belowSpace < panelH + 8 && aboveSpace > belowSpace) above = true;
      if (above && aboveSpace < panelH + 8 && belowSpace > aboveSpace) above = false;

      // 가로 정렬 — end=오른쪽 모서리 맞춤, 그 외=왼쪽 모서리 맞춤(기본)
      const alignEnd = placement === 'bottom-end' || placement === 'top-end';
      let left = alignEnd ? tr.right - panelW : tr.left;
      left = Math.max(8, Math.min(left, vw - panelW - 8));

      setPanelStyle({
        position: 'fixed',
        left,
        minWidth: tr.width,
        top: above ? undefined : tr.bottom + 4,
        bottom: above ? vh - tr.top + 4 : undefined,
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
  }, [open, placement]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener('mousedown', onDocDown);
    return () => window.removeEventListener('mousedown', onDocDown);
  }, [open]);

  // Esc 닫기 (닫은 뒤 포커스는 트리거로 복귀)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open]);

  return { open, openMenu, close, toggle, triggerRef, panelRef, panelStyle };
}
