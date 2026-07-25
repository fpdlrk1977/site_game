/**
 * 공용 스켈레톤 프리미티브 & 전체 화면 로더.
 * 라우트 이동 시 loading.tsx에서 사용해 빈 화면 대신 골격/스피너를 보여준다.
 */

/** 회색 블록 (animate-pulse). 크기·모양은 className으로 지정. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xs bg-foreground/[0.08] dark:bg-foreground/[0.06] ${className}`}
    />
  );
}

/** 회전 스피너 */
export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <div
      className="animate-spin rounded-full border-2 border-foreground/15 border-t-primary"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

/** 전체 화면 중앙 스피너 (라우트 전역 fallback) */
export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <Spinner size={32} />
      {label && <p className="text-sm text-muted">{label}</p>}
    </div>
  );
}
