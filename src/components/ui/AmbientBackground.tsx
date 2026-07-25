/**
 * 절제된 앰비언트 배경 — 큰 블러 blob 대신 미세 그리드 + 상단 소프트 글로우 하나.
 * (Linear/Vercel 톤: 배경은 조용히, 콘텐츠가 주인공.) 다크 최적화.
 */
export function AmbientBackground({ fixed = true }: { fixed?: boolean }) {
  return (
    <div aria-hidden className={`pointer-events-none ${fixed ? 'fixed' : 'absolute'} inset-0 z-0 overflow-hidden`}>
      {/* 미세 그리드 — 상단에서 은은히 페이드 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)',
          backgroundSize: '56px 56px',
          WebkitMaskImage: 'radial-gradient(ellipse 78% 55% at 50% -5%, #000 30%, transparent 72%)',
          maskImage: 'radial-gradient(ellipse 78% 55% at 50% -5%, #000 30%, transparent 72%)',
        }}
      />
      {/* 상단 소프트 글로우 하나 */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -top-48 w-[920px] h-[520px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(106,77,255,.20), transparent 66%)', filter: 'blur(30px)' }}
      />
    </div>
  );
}
