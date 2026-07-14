'use client';

// 인라인 이름 편집 — 로컬 상태로 자유롭게 타이핑, blur/Enter에 커밋(빈값이면 원래대로 복원).
// prop 값이 바뀌면(다른 곳에서 rename) 동기화. 재질 에셋 등 "이름만 바꾸는" 곳 공용.

import { useState, useEffect } from 'react';

export function InlineEditName({ value, onCommit, className, placeholder, title }: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <input
      value={v}
      title={title}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const t = v.trim(); if (t && t !== value) onCommit(t); else setV(value); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        else if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur(); }
      }}
      className={className}
    />
  );
}
