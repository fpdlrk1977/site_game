'use client';

import { useState, useEffect } from 'react';

/**
 * ↑↓ 키로 0..length-1 범위를 순환 이동하는 하이라이트 인덱스.
 * 마지막 항목에서 ↓ → 첫 항목으로, 첫 항목에서 ↑ → 마지막 항목으로 순환한다.
 * active가 true인 동안만 키 입력을 수신한다 (열린 드롭다운/메뉴에서 사용).
 */
export function useListNav(length: number, active: boolean) {
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!active || length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % length);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + length) % length);
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [active, length]);

  return [highlight, setHighlight] as const;
}
