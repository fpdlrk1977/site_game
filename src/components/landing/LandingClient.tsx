'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';

const HeroScene = dynamic(() => import('./HeroScene'), {
  ssr: false,
  loading: () => <div className="w-full h-full grid place-items-center text-muted text-sm">3D 로딩 중…</div>,
});

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

export function LandingClient({ loggedIn }: { loggedIn: boolean }) {
  const primaryHref = loggedIn ? '/dashboard' : '/signup';
  const primaryLabel = loggedIn ? '대시보드로 이동' : '무료로 시작하기';

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-30 border-b border-border backdrop-blur-xl"
        style={{ background: 'linear-gradient(180deg,rgba(14,13,19,.9),rgba(14,13,19,.6))' }}>
        <div className="max-w-[1180px] mx-auto px-7 h-16 flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.05rem]">
            <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white"
              style={{ background: GRAD, boxShadow: '0 6px 16px -4px rgba(106,77,255,.6)' }}>⬡</span>
            Park3D
          </Link>
          <div className="hidden md:flex gap-6 text-sm text-muted">
            <a className="hover:text-foreground transition-colors" href="#features">기능</a>
            <Link className="hover:text-foreground transition-colors" href="/community">갤러리</Link>
            <Link className="hover:text-foreground transition-colors" href="/pricing">요금제</Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {!loggedIn && <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">로그인</Link>}
            <Link href={primaryHref} className="px-5 py-2.5 rounded-xs text-sm font-semibold text-white transition-transform hover:-translate-y-px"
              style={{ background: GRAD, boxShadow: '0 8px 24px -8px rgba(106,77,255,.6)' }}>{primaryLabel}</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="relative pt-20 pb-10">
        {/* gradient mesh */}
        <div className="pointer-events-none absolute inset-x-0 top-[-10%] h-[820px] z-0">
          <span className="orb" style={{ width: 520, height: 520, background: '#6a4dff', left: '-4%', top: '-6%' }} />
          <span className="orb" style={{ width: 440, height: 440, background: '#39d0ea', right: '2%', top: '4%', opacity: .4, animationDelay: '-6s' }} />
          <span className="orb" style={{ width: 360, height: 360, background: '#c04aff', left: '38%', top: '24%', opacity: .35, animationDelay: '-11s' }} />
        </div>

        <div className="relative z-[2] max-w-[860px] mx-auto px-7 text-center">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[.78rem] font-semibold mb-6"
            style={{ background: 'rgba(139,120,255,.12)', border: '1px solid rgba(139,120,255,.28)', color: '#8b78ff' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#39d0ea', boxShadow: '0 0 8px #39d0ea' }} />
            노코드 3D 웹 빌더
          </span>
          <h1 className="font-bold tracking-tight leading-[1.04]" style={{ fontSize: 'clamp(2.4rem,6vw,4.2rem)', textWrap: 'balance' }}>
            코딩 없이,<br />
            <span style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>3D 웹을 만든다.</span>
          </h1>
          <p className="text-muted text-[1.12rem] max-w-[620px] mx-auto mt-6 mb-7">
            드래그 앤 드롭으로 3D 공간·게임·인터랙티브 웹사이트를 만들고, 클릭 한 번으로 배포하세요. 브라우저 안에서 전부.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href={primaryHref} className="px-5 py-3 rounded-xs text-[.92rem] font-semibold text-white transition-transform hover:-translate-y-px"
              style={{ background: GRAD, boxShadow: '0 8px 24px -8px rgba(106,77,255,.6)' }}>{primaryLabel} →</Link>
            <Link href="/community" className="px-5 py-3 rounded-xs text-[.92rem] font-semibold border border-border bg-white/[0.04] hover:bg-white/[0.08] transition-colors">▶ 갤러리 둘러보기</Link>
          </div>
          <div className="mt-4 text-[.82rem] text-muted/70">신용카드 불필요 · 30초면 첫 씬 완성</div>
        </div>

        {/* live 3D preview */}
        <div className="relative z-[2] mt-14 max-w-[1000px] mx-auto px-7">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#332f43', background: 'linear-gradient(180deg,#17161f,#0f0e16)', boxShadow: 'var(--shadow-float)' }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <i className="w-[11px] h-[11px] rounded-full bg-[#3a3648]" />
              <i className="w-[11px] h-[11px] rounded-full bg-[#3a3648]" />
              <i className="w-[11px] h-[11px] rounded-full bg-[#3a3648]" />
              <span className="ml-2.5 text-[.78rem] text-muted/70">park3d.app / my-first-space</span>
            </div>
            <div className="relative h-[420px]"
              style={{ background: 'radial-gradient(120% 90% at 50% 0%,rgba(106,77,255,.22),transparent 60%),radial-gradient(80% 80% at 80% 100%,rgba(57,208,234,.16),transparent 55%),#0a0910' }}>
              <HeroScene />
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="relative z-[2] flex gap-10 justify-center flex-wrap mt-16 text-muted">
          {[['12k+', '제작된 3D 공간'], ['60fps', '브라우저 실시간 렌더'], ['1‑클릭', '웹 배포 · 임베드']].map(([n, l]) => (
            <div key={l} className="text-center">
              <b className="block text-[1.9rem] text-foreground font-bold tracking-tight">{n}</b>
              <span className="text-[.82rem]">{l}</span>
            </div>
          ))}
        </div>
      </header>

      {/* ── Features ── */}
      <section id="features" className="py-20">
        <div className="max-w-[1180px] mx-auto px-7">
          <div className="text-center max-w-[640px] mx-auto mb-12">
            <span className="text-[.72rem] tracking-[.14em] uppercase text-primary font-bold">왜 Park3D</span>
            <h2 className="font-bold tracking-tight mt-3" style={{ fontSize: 'clamp(1.7rem,3.4vw,2.5rem)' }}>전문 툴 없이도, 프로처럼</h2>
            <p className="text-muted mt-3.5">Blender도 코드도 필요 없습니다. 브라우저에서 만들고 바로 공유하세요.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-[18px]">
            {[
              ['🎯', '드래그로 제작', '도형·에셋을 끌어다 놓고, 재질·조명을 클릭으로. 실측 크기·바닥 스냅까지 알아서.'],
              ['🎮', '물리 · 게임 로직', '중력·충돌·애니메이션·이벤트를 노코드로. 걷고, 부딪히고, 상호작용하는 공간.'],
              ['🚀', '클릭 배포', '링크·커스텀 도메인·임베드로 어디든. 방문자는 설치 없이 브라우저에서 바로.'],
            ].map(([ic, t, d]) => (
              <div key={t} className="bg-surface border border-border rounded-xl p-[26px] transition-transform hover:-translate-y-1" style={{ boxShadow: 'var(--shadow-card)' }}>
                <div className="w-[52px] h-[52px] rounded-[15px] grid place-items-center text-2xl mb-[18px]"
                  style={{ background: 'linear-gradient(145deg,rgba(139,120,255,.25),rgba(57,208,234,.15))', border: '1px solid #332f43' }}>{ic}</div>
                <h3 className="text-[1.12rem] font-bold">{t}</h3>
                <p className="text-muted text-[.92rem] mt-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Community gallery teaser ── */}
      <section className="pb-20">
        <div className="max-w-[1180px] mx-auto px-7">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <span className="text-[.72rem] tracking-[.14em] uppercase text-primary font-bold">커뮤니티 갤러리</span>
              <h2 className="text-[1.9rem] font-bold tracking-tight mt-2.5">다른 사람들이 만든 세계</h2>
            </div>
            <Link href="/community" className="text-sm text-muted hover:text-foreground transition-colors">전체 보기 →</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['Mini Room', '@yuna', '♡ 4.1k · ⇄ 382', 'linear-gradient(145deg,#f4a3c9,#c9689e)'],
              ['Neon Arcade', '@vlad', '♡ 2.3k · ⇄ 118', 'linear-gradient(145deg,#8b78ff,#4a2fd0)'],
              ['Glass Product', '@min', '♡ 6.0k · ⇄ 511', 'linear-gradient(145deg,#39d0ea,#1583b0)'],
              ['Playground', '@tiger', '♡ 980 · ⇄ 44', 'linear-gradient(145deg,#f2c14e,#d98a2b)'],
            ].map(([t, u, s, bg]) => (
              <Link key={t} href="/community" className="bg-surface border border-border rounded-lg overflow-hidden transition-transform hover:-translate-y-1 block">
                <div className="aspect-[4/3]" style={{ background: bg as string }} />
                <div className="px-3.5 py-3">
                  <div className="text-[.9rem] font-semibold">{t}</div>
                  <div className="flex items-center gap-2 mt-1.5 text-[.76rem] text-muted/70">
                    <span className="w-[18px] h-[18px] rounded-full" style={{ background: GRAD }} />{u}
                    <span className="ml-auto">{s}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className="pb-20">
        <div className="max-w-[1180px] mx-auto px-7">
          <div className="text-center max-w-[640px] mx-auto mb-11">
            <span className="text-[.72rem] tracking-[.14em] uppercase text-primary font-bold">요금제</span>
            <h2 className="font-bold tracking-tight mt-3" style={{ fontSize: 'clamp(1.7rem,3.4vw,2.5rem)' }}>무료로 시작, 필요할 때 확장</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 max-w-[940px] mx-auto">
            {[
              ['Free', '₩0', '/영구', ['프로젝트 3개', '씬당 오브젝트 30', '공유 링크'], false],
              ['Pro', '₩9,900', '/월', ['프로젝트 20개', '커스텀 도메인', '임베드 · 방문통계', '워터마크 제거'], true],
              ['Business', '문의', '', ['무제한 프로젝트', '팀 · 실시간 협업', '우선 지원'], false],
            ].map(([name, amt, per, feats, pro]) => (
              <div key={name as string} className="bg-surface border rounded-xl p-[26px] relative"
                style={pro ? { borderColor: 'transparent', boxShadow: '0 0 0 2px #6a4dff, var(--shadow-card)' } : { borderColor: 'var(--border)' }}>
                {pro && <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 text-white text-[.68rem] font-bold px-3 py-[3px] rounded-full" style={{ background: GRAD }}>추천</span>}
                <div className="font-bold">{name as string}</div>
                <div className="text-[2rem] font-bold tracking-tight mt-2 mb-0.5">{amt as string}<small className="text-[.85rem] text-muted font-medium">{per as string}</small></div>
                <ul className="list-none mt-4 p-0 text-[.86rem] text-muted space-y-2">
                  {(feats as string[]).map((f) => <li key={f} className="flex gap-2"><span className="text-[#4ade80] font-bold">✓</span>{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/pricing" className="text-sm text-muted hover:text-foreground transition-colors">전체 요금제 비교 →</Link>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <div className="max-w-[1180px] mx-auto px-7">
        <div className="relative text-center rounded-[28px] overflow-hidden px-8 py-[72px]"
          style={{ background: 'linear-gradient(135deg,rgba(106,77,255,.92),rgba(57,208,234,.78))' }}>
          <h2 className="text-white font-bold tracking-tight" style={{ fontSize: 'clamp(1.8rem,3.6vw,2.6rem)' }}>지금, 첫 3D 공간을 만들어보세요</h2>
          <p className="text-white/85 max-w-[480px] mx-auto mt-3.5 mb-6">가입 30초. 코드 한 줄 없이 브라우저에서 바로 시작합니다.</p>
          <Link href={primaryHref} className="inline-block px-6 py-3 rounded-xs font-semibold bg-white" style={{ color: '#6a4dff' }}>{primaryLabel} →</Link>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="mt-20 py-14 border-t border-border text-muted/70 text-[.85rem]">
        <div className="max-w-[1180px] mx-auto px-7 flex justify-between flex-wrap gap-5">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-foreground">
            <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white" style={{ background: GRAD }}>⬡</span> Park3D
          </Link>
          <div className="flex gap-6">
            <a href="#features">기능</a><Link href="/community">갤러리</Link><Link href="/pricing">요금제</Link>
          </div>
          <div>© 2026 Park3D — 노코드 3D 공간 제작</div>
        </div>
      </footer>

      <style jsx>{`
        .orb { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .55;
          animation: drift 18s ease-in-out infinite; }
        @keyframes drift {
          0%,100% { transform: translate(0,0); }
          33% { transform: translate(40px,30px); }
          66% { transform: translate(-30px,20px); }
        }
        @media (prefers-reduced-motion: reduce) { .orb { animation: none; } }
      `}</style>
    </div>
  );
}
