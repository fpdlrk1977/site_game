import { Skeleton, Spinner } from '@/components/ui/Skeleton';

/** 에디터 로딩 스켈레톤 — 캔버스 + 좌/우 플로팅 패널 골격. */
export default function EditorLoading() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* 캔버스 영역 중앙 스피너 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <Spinner size={32} />
        <p className="text-sm text-muted">에디터 불러오는 중…</p>
      </div>

      {/* 좌측 패널 */}
      <div className="absolute left-3 top-3 bottom-3 w-60 rounded-lg border border-border bg-surface/80 p-3 space-y-3">
        <Skeleton className="w-32 h-5" />
        <div className="flex gap-2">
          <Skeleton className="flex-1 h-7" />
          <Skeleton className="flex-1 h-7" />
        </div>
        <Skeleton className="w-full h-7" />
        <div className="space-y-2 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-6" />
          ))}
        </div>
      </div>

      {/* 우측 인스펙터 */}
      <div className="absolute right-3 top-3 bottom-3 w-72 rounded-lg border border-border bg-surface/80 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="w-28 h-5" />
          <div className="flex gap-1">
            <Skeleton className="w-6 h-6" />
            <Skeleton className="w-6 h-6" />
            <Skeleton className="w-6 h-6" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 pt-1">
            <Skeleton className="w-20 h-4" />
            <Skeleton className="w-full h-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
