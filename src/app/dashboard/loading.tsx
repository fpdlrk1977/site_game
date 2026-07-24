import { Skeleton } from '@/components/ui/Skeleton';

/** 대시보드 로딩 스켈레톤 — 헤더 + 프로젝트 카드 그리드 골격. */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="relative border-b border-border/60 px-6 py-4 flex items-center justify-between bg-sidebar/80">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-xs" />
          <Skeleton className="w-24 h-5" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="w-32 h-4" />
          <Skeleton className="w-16 h-7" />
          <Skeleton className="w-7 h-7 rounded-full" />
        </div>
      </header>

      {/* 메인 */}
      <main className="relative max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-2">
            <Skeleton className="w-40 h-7" />
            <Skeleton className="w-28 h-4" />
          </div>
          <Skeleton className="w-32 h-10" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-surface overflow-hidden"
            >
              <Skeleton className="w-full aspect-video rounded-none" />
              <div className="p-4 space-y-2.5">
                <Skeleton className="w-3/4 h-4" />
                <Skeleton className="w-1/2 h-3" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
