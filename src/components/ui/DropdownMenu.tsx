'use client';

// 공통 버튼-액션 드롭다운 — 트리거 버튼에 붙는 팝업 메뉴. useDropdown(위치·클램프·바깥클릭/Esc) 위에
// createPortal + 패널 컨테이너를 감싼다. 트리거 외형과 메뉴 내용은 호출부가 자유롭게 구성(값 선택은 SelectBox).
//   사용:
//   <DropdownMenu
//     trigger={({ open, toggle, ref }) => <button ref={ref} onClick={toggle}>…<ChevronDown className={open?'rotate-180':''}/></button>}
//     panelClassName="w-52 py-1"        // 화면별 패널 폭/여백 등
//   >{({ close }) => <>…항목들, 선택 시 close()…</>}</DropdownMenu>
import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';
import { useDropdown, type DropdownPlacement } from '@/hooks/useDropdown';

interface TriggerArgs<T extends HTMLElement> {
  open: boolean;
  toggle: () => void;
  close: () => void;
  ref: RefObject<T | null>;
}

export function DropdownMenu<T extends HTMLElement = HTMLButtonElement>({
  trigger,
  children,
  placement = 'bottom',
  panelClassName = '',
}: {
  trigger: (args: TriggerArgs<T>) => ReactNode;
  children: ReactNode | ((args: { close: () => void }) => ReactNode);
  /** useDropdown의 전체 배치 옵션을 그대로 노출(bottom-end = 트리거 우측 정렬 등). */
  placement?: DropdownPlacement;
  /** 패널 폭/여백 등 화면별 스타일. 배경/테두리/그림자는 공통 기본값이 담당(중복 지정 불필요). */
  panelClassName?: string;
}) {
  const { open, toggle, close, triggerRef, panelRef, panelStyle } = useDropdown<T>({ placement });
  return (
    <>
      {trigger({ open, toggle, close, ref: triggerRef })}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className={`bg-surface border border-border rounded-xs shadow-dropdown overflow-hidden ${panelClassName}`}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>,
        document.body,
      )}
    </>
  );
}
