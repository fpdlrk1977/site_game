'use client';

import { type ReactNode } from 'react';

interface Props {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className }: Props) {
  return (
    <div className={`relative group/tip ${className ?? ''}`}>
      {children}
      <div
        className={`
          absolute ${side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}
          left-1/2 -translate-x-1/2
          px-2.5 py-1
          bg-zinc-950 border border-zinc-800
          text-[11px] font-medium text-zinc-200
          rounded-lg whitespace-nowrap
          opacity-0 group-hover/tip:opacity-100
          transition-opacity duration-100
          pointer-events-none z-[100]
          shadow-xl shadow-black/60
        `}
      >
        {content}
      </div>
    </div>
  );
}
