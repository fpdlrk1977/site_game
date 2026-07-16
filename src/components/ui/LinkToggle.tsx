'use client';

// 두 수치를 함께 조절할지 잠그는 링크 토글(범용). 동기화 로직은 부모가 처리하고,
// 이 컴포넌트는 순수 on/off 아이콘 버튼만 담당한다(스케일 XY 잠금 등 어디서든 재사용).
import { Link2, Link2Off } from 'lucide-react';

export function LinkToggle({
  value,
  onChange,
  title,
  size = 12,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  title?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      title={title ?? (value ? '두 값 잠금 해제' : '두 값을 함께 조절')}
      className={`shrink-0 w-6 h-6 rounded-xs flex items-center justify-center border transition-colors opacity-70 ${
        value ? 'bg-primary/10 text-primary border-primary/50 opacity-100 hover:bg-primary/15' : 'bg-surface text-muted border-border/30 hover:text-foreground hover:bg-background'
      }`}
    >
      {value ? <Link2 size={size} /> : <Link2Off size={size} />}
    </button>
  );
}
