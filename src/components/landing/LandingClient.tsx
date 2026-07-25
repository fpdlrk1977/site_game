'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MousePointerClick, Gamepad2, Rocket, Play, Heart, Repeat2, Check, ArrowRight } from 'lucide-react';
import { AmbientBackground } from '@/components/ui/AmbientBackground';
import { thumbGradient } from '@/lib/thumbGradient';

const HeroScene = dynamic(() => import('./HeroScene'), {
  ssr: false,
  loading: () => <div className="w-full h-full grid place-items-center text-muted text-sm">3D 로딩 중…</div>,
});

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

const FEATURES = [
  { icon: MousePointerClick, t: '드래그로 제작', d: '도형·에셋을 끌어다 놓고 재질·조명을 클릭으로. 실측 크기·바닥 스냅까지 알아서 맞춥니다.' },
  { icon: Gamepad2, t: '물리 · 게임 로직', d: '중력·충돌·애니메이션·이벤트를 노코드로. 걷고, 부딪히고, 상호작용하는 공간을 만듭니다.' },
  { icon: Rocket, t: '클릭 배포', d: '링크·커스텀 도메인·임베드로 어디든. 방문자는 설치 없이 브라우저에서 바로 봅니다.' },
];
const GALLERY = [
  { t: 'Mini Room', u: '@yuna', likes: '4.1k', remix: '382' },
  { t: 'Neon Arcade', u: '@vlad', likes: '2.3k', remix: '118' },
  { t: 'Glass Product', u: '@min', likes: '6.0k', remix: '511' },
  { t: 'Playground', u: '@tiger', likes: '980', remix: '44' },
];
const PLANS = [
  { name: 'Free', amt: '₩0', per: '/영구', feats: ['프로젝트 3개', '씬당 오브젝트 30', '공유 링크'], pro: false },
  { name: 'Pro', amt: '₩9,900', per: '/월', feats: ['프로젝트 20개', '커스텀 도메인', '임베드 · 방문 통계', '워터마크 제거'], pro: true },
  { name: 'Business', amt: '문의', per: '', feats: ['무제한 프로젝트', '팀 · 실시간 협업', '우선 지원'], pro: false },
];

export function LandingClient({ loggedIn }: { loggedIn: boolean }) {
  const primaryHref = loggedIn ? '/dashboard' : '/signup';
  const primaryLabel = loggedIn ? '대시보드로 이동' : '무료로 시작하기';

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-30 border-b border-border backdrop-blur-xl" style={{ background: 'rgba(14,13,19,.72)' }}>
        <div className="max-w-[1180px] mx-auto px-7 h-16 flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem]">
            <span className="w-[28px] h-[28px] rounded-xs grid place-items-center text-white text-[.85rem]" style={{ background: GRAD }}>⬡</span>
            Park3D
          </Link>
          <div className="hidden md:flex gap-6 text-sm text-muted">
            <a className="hover:text-foreground transition-colors" href="#features">기능</a>
            <Link className="hover:text-foreground transition-colors" href="/community">갤러리</Link>
            <Link className="hover:text-foreground transition-colors" href="/pricing">요금제</Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {!loggedIn && <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">로그인</Link>}
            <Link href={primaryHref} className="px-4 py-2 rounded-xs text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: GRAD }}>{primaryLabel}</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="relative pt-24 pb-12">
        <AmbientBackground fixed={false} />
        <div className="relative z-10 max-w-[820px] mx-auto px-7 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-xs text-[.76rem] font-medium mb-7 text-muted border border-border bg-surface">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#39d0ea', boxShadow: '0 0 8px #39d0ea' }} />
            노코드 3D 웹 빌더
          </span>
          <h1 className="font-bold tracking-[-0.03em] leading-[1.05]" style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', textWrap: 'balance' }}>
            코딩 없이,<br />
            <span style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>3D 웹을 만든다.</span>
          </h1>
          <p className="text-muted text-[1.08rem] leading-relaxed max-w-[560px] mx-auto mt-6 mb-8">
            드래그 앤 드롭으로 3D 공간·게임·인터랙티브 웹사이트를 만들고, 클릭 한 번으로 배포하세요.
          </p>
          <div className="flex gap-2.5 justify-center flex-wrap">
            <Link href={primaryHref} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xs text-[.92rem] font-semibold text-white transition-opacity hover:opacity-90" style={{ background: GRAD }}>{primaryLabel} <ArrowRight size={16} /></Link>
            <Link href="/community" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xs text-[.92rem] font-semibold border border-border text-foreground hover:bg-foreground/[0.04] transition-colors"><Play size={15} /> 갤러리 둘러보기</Link>
          </div>
          <div className="mt-4 text-[.8rem] text-muted/70">신용카드 불필요 · 30초면 첫 씬 완성</div>
        </div>

        {/* live 3D preview */}
        <div className="relative z-10 mt-16 max-w-[980px] mx-auto px-7">
          <div className="rounded-xs border border-border overflow-hidden" style={{ background: 'linear-gradient(180deg,var(--surface),#0f0e16)', boxShadow: 'var(--shadow-float)' }}>
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border">
              <i className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
              <i className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
              <i className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
              <span className="ml-2 text-[.76rem] text-muted/70 tabular-nums">park3d.app / my-first-space</span>
            </div>
            <div className="relative h-[420px]" style={{ background: 'radial-gradient(120% 90% at 50% 0%,rgba(106,77,255,.18),transparent 60%),#0a0910' }}>
              <HeroScene />
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="relative z-10 flex gap-12 justify-center flex-wrap mt-16">
          {[['12k+', '제작된 3D 공간'], ['60fps', '브라우저 실시간 렌더'], ['1‑클릭', '웹 배포 · 임베드']].map(([n, l]) => (
            <div key={l} className="text-center">
              <div className="text-[1.8rem] font-bold tracking-tight tabular-nums">{n}</div>
              <div className="text-[.82rem] text-muted mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      </header>

      {/* ── Features ── */}
      <section id="features" className="py-24 border-t border-border/60">
        <div className="max-w-[1180px] mx-auto px-7">
          <div className="text-center max-w-[620px] mx-auto mb-14">
            <span className="text-[.7rem] tracking-[.16em] uppercase text-primary font-semibold">왜 Park3D</span>
            <h2 className="font-bold tracking-tight mt-3" style={{ fontSize: 'clamp(1.7rem,3.2vw,2.4rem)' }}>전문 툴 없이도, 프로처럼</h2>
            <p className="text-muted mt-3.5">Blender도 코드도 필요 없습니다. 브라우저에서 만들고 바로 공유하세요.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, t, d }) => (
              <div key={t} className="bg-surface border border-border rounded-xs p-7 transition-colors hover:border-border/50">
                <div className="w-11 h-11 rounded-xs grid place-items-center mb-5 text-primary" style={{ background: 'rgba(124,108,255,.10)', border: '1px solid rgba(124,108,255,.22)' }}>
                  <Icon size={20} />
                </div>
                <h3 className="text-[1.08rem] font-semibold">{t}</h3>
                <p className="text-muted text-[.9rem] leading-relaxed mt-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Community gallery teaser ── */}
      <section className="pb-24">
        <div className="max-w-[1180px] mx-auto px-7">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-7">
            <div>
              <span className="text-[.7rem] tracking-[.16em] uppercase text-primary font-semibold">커뮤니티 갤러리</span>
              <h2 className="text-[1.8rem] font-bold tracking-tight mt-2.5">다른 사람들이 만든 세계</h2>
            </div>
            <Link href="/community" className="text-sm text-muted hover:text-foreground transition-colors inline-flex items-center gap-1">전체 보기 <ArrowRight size={14} /></Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {GALLERY.map((g) => (
              <Link key={g.t} href="/community" className="group bg-surface border border-border rounded-xs overflow-hidden block transition-all hover:border-border/50 hover:-translate-y-0.5">
                <div className="aspect-[4/3] relative" style={{ background: thumbGradient(g.t) }}>
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 18%, rgba(255,255,255,.14), transparent 52%)' }} />
                </div>
                <div className="px-3.5 py-3">
                  <div className="text-[.9rem] font-semibold group-hover:text-primary transition-colors">{g.t}</div>
                  <div className="flex items-center gap-2 mt-2 text-[.75rem] text-muted">
                    <span className="w-[18px] h-[18px] rounded-full" style={{ background: GRAD }} />{g.u}
                    <span className="ml-auto flex items-center gap-3 tabular-nums">
                      <span className="inline-flex items-center gap-1"><Heart size={12} /> {g.likes}</span>
                      <span className="inline-flex items-center gap-1"><Repeat2 size={12} /> {g.remix}</span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className="pb-24 border-t border-border/60 pt-24">
        <div className="max-w-[1180px] mx-auto px-7">
          <div className="text-center max-w-[620px] mx-auto mb-12">
            <span className="text-[.7rem] tracking-[.16em] uppercase text-primary font-semibold">요금제</span>
            <h2 className="font-bold tracking-tight mt-3" style={{ fontSize: 'clamp(1.7rem,3.2vw,2.4rem)' }}>무료로 시작, 필요할 때 확장</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 max-w-[920px] mx-auto items-start">
            {PLANS.map((p) => (
              <div key={p.name} className="bg-surface border rounded-xs p-7 relative" style={p.pro ? { borderColor: 'transparent', boxShadow: '0 0 0 1.5px #6a4dff' } : { borderColor: 'var(--border)' }}>
                {p.pro && <span className="absolute -top-2.5 left-6 text-white text-[.66rem] font-bold px-2.5 py-1 rounded-xs" style={{ background: GRAD }}>추천</span>}
                <div className="font-semibold">{p.name}</div>
                <div className="text-[1.9rem] font-bold tracking-tight mt-2 mb-0.5">{p.amt}<small className="text-[.85rem] text-muted font-medium">{p.per}</small></div>
                <ul className="list-none mt-5 p-0 text-[.86rem] text-muted space-y-2.5">
                  {p.feats.map((f) => <li key={f} className="flex items-center gap-2"><Check size={15} className="text-[#4ade80] shrink-0" strokeWidth={2.2} />{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="text-center mt-9">
            <Link href="/pricing" className="text-sm text-muted hover:text-foreground transition-colors inline-flex items-center gap-1">전체 요금제 비교 <ArrowRight size={14} /></Link>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <div className="max-w-[1180px] mx-auto px-7 pb-4">
        <div className="relative text-center rounded-xs overflow-hidden px-8 py-20 border border-border" style={{ background: 'linear-gradient(135deg, rgba(106,77,255,.14), rgba(57,208,234,.08)), var(--surface)' }}>
          <h2 className="font-bold tracking-tight" style={{ fontSize: 'clamp(1.7rem,3.4vw,2.4rem)' }}>지금, 첫 3D 공간을 만들어보세요</h2>
          <p className="text-muted max-w-[440px] mx-auto mt-3.5 mb-7">가입 30초. 코드 한 줄 없이 브라우저에서 바로 시작합니다.</p>
          <Link href={primaryHref} className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xs font-semibold text-white transition-opacity hover:opacity-90" style={{ background: GRAD }}>{primaryLabel} <ArrowRight size={16} /></Link>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="mt-20 py-12 border-t border-border text-muted/70 text-[.85rem]">
        <div className="max-w-[1180px] mx-auto px-7 flex justify-between flex-wrap gap-5 items-center">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-foreground">
            <span className="w-[26px] h-[26px] rounded-xs grid place-items-center text-white text-[.8rem]" style={{ background: GRAD }}>⬡</span> Park3D
          </Link>
          <div className="flex gap-6">
            <a href="#features" className="hover:text-foreground transition-colors">기능</a>
            <Link href="/community" className="hover:text-foreground transition-colors">갤러리</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">요금제</Link>
          </div>
          <div>© 2026 Park3D</div>
        </div>
      </footer>
    </div>
  );
}
