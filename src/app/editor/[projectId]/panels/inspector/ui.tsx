'use client';

// 인스펙터 공용 UI — **섹션 껍데기 둘뿐.**
//
// ★ 2026-07-31 축소: 구 오브젝트 시스템(2d)을 걷어내며 숫자 입력 계열을 전부 삭제했다.
//   NumInput(드래그 스크럽·수식 입력) · LabeledNum · LabeledText · XYZRow · LiveTransformRows ·
//   Toggle · LinkToggle · evalMath · fmt — 전부 **오브젝트 트랜스폼/재질 편집용**이었다.
//   브릭은 수치를 타이핑하는 편집이 아니라 격자에 놓는 편집이라 쓸 자리가 없다.
//
// 남은 건 `EnvironmentPanel`이 쓰는 껍데기 둘: `SectionHeader` · `GroupBox`.

import { useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { InfoHint } from '@/components/ui/InfoHint';

/** 섹션 헤더 — `onToggle`을 주면 접기/펼치기가 된다(안 주면 고정 헤더) */
export function SectionHeader({
  title,
  icon,
  hint,
  isOpen,
  onToggle,
  dot,
}: {
  title: string;
  icon?: ReactNode;
  hint?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  /** 점진적 공개: 접힌 섹션에 설정값이 있으면 액센트 점으로 표시(값이 숨지 않도록) */
  dot?: boolean;
}) {
  const collapsible = onToggle !== undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const prevOpen = useRef(isOpen);
  // 접힌 섹션을 펼치면(닫힘→열림) 스크롤 컨테이너에서 그 섹션이 보이도록 스크롤.
  //   - 섹션이 컨테이너에 다 들어가면 아래 끝까지 드러나게(헤더는 유지)
  //   - 컨테이너보다 크면 헤더를 상단에 붙여(그만큼만 내려) 최대한 드러냄
  useEffect(() => {
    if (isOpen && !prevOpen.current && rootRef.current) {
      const header = rootRef.current;
      const section = header.parentElement; // GroupBox(헤더+본문)
      let container: HTMLElement | null = header.parentElement;
      while (container) {
        const oy = getComputedStyle(container).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && container.scrollHeight > container.clientHeight) break;
        container = container.parentElement;
      }
      if (container && section) {
        requestAnimationFrame(() => {
          const c = container!.getBoundingClientRect();
          const s = section.getBoundingClientRect();
          const h = header.getBoundingClientRect();
          if (s.bottom > c.bottom) {
            const alignBottom = s.bottom - c.bottom;    // 섹션 끝을 컨테이너 끝에 맞춤
            const alignHeaderTop = h.top - c.top - 4;   // 헤더를 상단에 붙임(과도 방지 캡)
            const delta = Math.min(alignBottom, Math.max(0, alignHeaderTop));
            if (delta > 1) container!.scrollBy({ top: delta, behavior: 'smooth' });
          }
        });
      }
    }
    prevOpen.current = isOpen;
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-3.5 text-[11px] font-semibold text-muted tracking-wide bg-surface/40 select-none ${collapsible ? 'cursor-pointer hover:text-foreground transition-colors' : ''}`}
    >
      {/* 아이콘은 연한 회색 박스 안에 — 섹션 구분이 눈에 빨리 들어오게(라이트/다크 공통으로 은은하게) */}
      {icon && (
        <span className="flex items-center justify-center w-6 h-6 rounded-xs bg-foreground/[0.04] text-foreground shrink-0">
          {icon}
        </span>
      )}
      <span className="flex-1 text-foreground flex items-center gap-1.5">
        {title}
        {hint && <InfoHint text={hint} />}
      </span>
      {dot && collapsible && !isOpen && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="설정값 있음" />}
      {collapsible && <span className="text-muted/70">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>}
    </div>
  );
}

export function GroupBox({ children }: { children: ReactNode }) {
  return <div className="border-t border-border">{children}</div>;
}
