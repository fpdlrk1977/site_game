'use client';

import { Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

/** 섹션/필드 옆 안내 아이콘(ⓘ) — 호버 시 툴팁. 인스펙터 등에서 공통 사용. */
export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip content={text} wide className={`inline-flex items-center ${className ?? ''}`}>
      <Info size={12} className="text-foreground hover:text-primary transition-colors cursor-help" />
    </Tooltip>
  );
}
