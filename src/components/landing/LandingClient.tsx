'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { MousePointerClick, Gamepad2, Rocket, Users2, Play, Heart, Repeat2, Check, ArrowRight, ChevronDown, Boxes, Gauge, Globe } from 'lucide-react';
import { SiteShell } from '@/components/ui/SiteShell';
import { SiteFooter } from '@/components/ui/SiteFooter';
import { Reveal, CountUp } from '@/components/ui/Reveal';
import { EditorArt, PhysicsArt, PublishArt, CollabArt, CtaArt } from './FeatureArt';
import { PricingCards } from '@/app/pricing/PricingCards';
import type { PlanTier } from '@/store/userStore';
import { thumbGradient } from '@/lib/thumbGradient';

const HeroScene = dynamic(() => import('./HeroScene'), {
  ssr: false,
  loading: () => <div className="w-full h-full" />,
});

const GRAD = 'linear-gradient(120deg,#8b78ff,#39d0ea)';

const GALLERY = [
  { t: 'Mini Room', u: '@yuna' }, { t: 'Neon Arcade', u: '@vlad' }, { t: 'Glass Product', u: '@min' },
  { t: 'Playground', u: '@tiger' }, { t: 'Portfolio', u: '@sol' }, { t: 'Café Interior', u: '@dan' },
  { t: 'Game Level', u: '@rin' }, { t: 'Product Hero', u: '@lee' },
  { t: 'Showroom', u: '@ari' }, { t: 'Sky Gallery', u: '@noa' },
];
/** 배지/워터마크를 타고 온 방문자에게 보여 줄 첫 문장 — 이미 결과물을 본 사람이다 */
const REFERRAL_COPY: Record<string, string> = {
  badge: 'You just visited a space someone built here.',
  embed: 'That 3D scene you just saw was built here.',
};

export function LandingClient({ loggedIn, currentTier = null, referral = null }: {
  loggedIn: boolean;
  currentTier?: PlanTier | null;
  referral?: 'badge' | 'embed' | null;
}) {
  const primaryHref = loggedIn ? '/dashboard' : '/signup';
  const primaryLabel = loggedIn ? 'Go to dashboard' : 'Start building free';
  const referralLine = referral ? REFERRAL_COPY[referral] : null;
  // 히어로 오브젝트를 한 번이라도 클릭하면 안내 힌트를 감춘다
  const [heroPicked, setHeroPicked] = useState(false);

  // 상단바는 스크롤 위치와 무관하게 항상 같은(밝은) 유리 바 — 히어로 위에서도 색이 바뀌지 않는다
  const linkCls = 'text-foreground/70 hover:text-foreground transition-colors';

  const nav = (
    <div className="max-w-[1240px] mx-auto px-7 h-full flex items-center gap-7">
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem]">
        <span className="w-[28px] h-[28px] rounded-xs grid place-items-center text-white text-[.85rem]" style={{ background: GRAD }}>⬡</span>
        Park3D
      </Link>
      <div className="hidden md:flex gap-6 text-sm">
        <a className={linkCls} href="#features">Features</a>
        <Link className={linkCls} href="/community">Gallery</Link>
        <Link className={linkCls} href="/pricing">Pricing</Link>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {!loggedIn && <Link href="/login" className={`text-sm ${linkCls}`}>Log in</Link>}
        <Link href={primaryHref} className="px-4 py-2 rounded-xs text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: GRAD }}>{loggedIn ? 'Dashboard' : 'Sign up'}</Link>
      </div>
    </div>
  );

  return (
    <SiteShell
      nav={nav}
      ambient={false}
      overlayNav
      navClassName="border-b border-border bg-background/70 backdrop-blur-xl"
    >
      <style>{`
        @keyframes p3bounce { 0%,100% { transform: translateY(0); opacity:.6 } 50% { transform: translateY(6px); opacity:1 } }
        @media (prefers-reduced-motion: reduce){ .p3-cue{ animation:none } }
      `}</style>

      {/* ── HERO — full-bleed interactive dark stage ── */}
      {/* 상단바가 오버레이라 히어로가 화면 전체 높이를 쓰고, 콘텐츠는 상단바 높이만큼 아래로 */}
      <section className="relative w-full overflow-hidden flex flex-col" style={{ minHeight: '100dvh', background: '#08070e' }}>
        <div className="absolute inset-0">
          <HeroScene onPick={() => setHeroPicked(true)} />
        </div>
        {/* readability scrim — 배경이 검정 단색이라 텍스트 대비용 비네트만 남긴다(하단 흰색 페이드 제거) */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(70% 55% at 50% 46%, transparent 40%, rgba(8,7,14,.72) 100%)' }} />

        {/* content overlay (pointer-events-none so the 3D reacts to cursor everywhere) */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-7 pt-[86px] pb-16 pointer-events-none">
          <span className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xs text-[.78rem] font-medium mb-8 text-white/85 border border-white/15 bg-white/5 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#39d0ea', boxShadow: '0 0 10px #39d0ea' }} />
            {referralLine ?? 'No-code 3D web builder'}
          </span>
          <h1 className="font-bold tracking-[-0.04em] text-white leading-[0.98]" style={{ fontSize: 'clamp(3rem,8.5vw,6.2rem)', textWrap: 'balance' }}>
            Build 3D worlds,<br />
            <span style={{ background: 'linear-gradient(100deg,#a99bff,#5ee0f4)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>ship them to the web.</span>
          </h1>
          <p className="text-white/65 text-[1.15rem] leading-relaxed max-w-[560px] mx-auto mt-7 mb-9">
            Design interactive 3D spaces, games, and sites with drag-and-drop — then publish in one click. All in your browser.
          </p>
          <div className="pointer-events-auto flex gap-3 justify-center flex-wrap">
            <Link href={primaryHref} className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xs text-[.95rem] font-semibold text-white shadow-lg shadow-violet-900/40 transition-opacity hover:opacity-90" style={{ background: GRAD }}>{primaryLabel} <ArrowRight size={17} /></Link>
            <Link href="/community" className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xs text-[.95rem] font-semibold text-white border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/15 transition-colors"><Play size={15} /> Explore gallery</Link>
          </div>
          <div className="mt-5 text-[.8rem] text-white/45">No credit card · Your first scene in 30 seconds</div>
          <div
            className="mt-7 inline-flex items-center gap-2 px-3 py-1.5 rounded-xs text-[.76rem] text-white/70 border border-white/10 bg-white/5 backdrop-blur-md transition-opacity duration-500"
            style={{ opacity: heroPicked ? 0 : 1 }}
          >
            <MousePointerClick size={13} />
            Click the shapes to recolor them
          </div>
        </div>

        <div className="p3-cue absolute bottom-[124px] left-1/2 -translate-x-1/2 z-10 text-white/35" style={{ animation: 'p3bounce 2s ease-in-out infinite' }}><ChevronDown size={22} /></div>

        {/* 통계 바 — 별도 섹션이 아니라 히어로 하단에 붙여 경계가 끊기지 않게 */}
        <div className="relative z-10 border-t border-white/10 bg-white/[0.03] backdrop-blur-sm">
          <div className="max-w-[1100px] mx-auto px-7 py-9 grid grid-cols-3 divide-x divide-white/10 text-center">
            {[
              { icon: Boxes, n: <><CountUp to={12} decimals={0} />k+</>, l: '3D spaces created' },
              { icon: Gauge, n: <><CountUp to={60} />fps</>, l: 'Real-time in the browser' },
              { icon: Globe, n: <><CountUp to={190} suffix="+" /></>, l: 'Countries reached' },
            ].map(({ icon: Icon, n, l }, i) => (
              <div key={i} className="px-3 flex flex-col items-center">
                <Icon size={60} className="text-white/30 mb-4" />
                <div className="text-[2rem] font-bold tracking-tight text-white">{n}</div>
                <div className="text-[.84rem] text-white/45 mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES — bento ── */}
      <section id="features" className="relative w-full py-24 overflow-hidden">
        {/* 배경 그리드 라인 — 가운데로 갈수록 옅어지게 마스크 */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[.35]"
          style={{
            backgroundImage:
              'linear-gradient(to right, color-mix(in srgb, var(--foreground) 9%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 9%, transparent) 1px, transparent 1px)',
            backgroundSize: '68px 68px',
            maskImage: 'radial-gradient(70% 60% at 50% 45%, transparent 30%, #000 100%)',
            WebkitMaskImage: 'radial-gradient(70% 60% at 50% 45%, transparent 30%, #000 100%)',
          }}
        />
        <div className="relative max-w-[1240px] mx-auto px-7">
          <Reveal>
            {/* 제목은 폭 제한 없이 한 줄로, 본문만 가독성 폭 제한 */}
            <div className="text-center w-full mb-14">
              <span className="text-[.7rem] tracking-[.18em] uppercase text-primary font-semibold">Why Park3D</span>
              <h2 className="font-bold tracking-tight mt-3" style={{ fontSize: 'clamp(1.9rem,3.6vw,2.9rem)' }}>Everything you need to ship in 3D</h2>
              <p className="text-muted mt-4 text-[1.02rem] max-w-[640px] mx-auto">No Blender, no code. Build in the browser and share instantly.</p>
            </div>
          </Reveal>

          {/* 같은 크기 카드 4개 · 2단(2×2) */}
          <div className="grid md:grid-cols-2 md:auto-rows-[minmax(0,1fr)] gap-6">
            {[
              { icon: MousePointerClick, t: 'Drag, drop, done', d: 'Drop shapes and assets, then set materials and lighting with a click. Real-world scale, floor-snap and colliders are handled for you.', art: EditorArt },
              { icon: Gamepad2, t: 'Physics & game logic', d: 'Gravity, collisions, triggers and variables. Wire up doors, buttons and scoring without writing a line of code.', art: PhysicsArt },
              { icon: Rocket, t: 'One-click publish', d: 'Ship to a share link, your own custom domain, or embed the scene straight into an existing website.', art: PublishArt },
              { icon: Users2, t: 'Real-time collab', d: 'Invite your team and build in the same scene together — live cursors, selections and instant sync.', art: CollabArt },
            ].map(({ icon: Icon, t, d, art: Art }, i) => (
              <Reveal key={t} delay={i * 80}>
                <div className="group h-full rounded-xs border border-border bg-surface overflow-hidden transition-colors hover:border-primary/60 flex flex-col">
                  {/* 일러스트 스트립 — 아이콘 배지는 좌측 상단 */}
                  <div className="relative h-[210px] shrink-0 border-b border-border/60 text-foreground"
                    style={{ background: 'linear-gradient(150deg, rgba(124,108,255,.10), rgba(57,208,234,.05))' }}>
                    <Art className="absolute inset-0 w-full h-full" />
                    <span className="absolute top-5 left-5 w-11 h-11 rounded-xs grid place-items-center text-primary backdrop-blur-sm" style={{ background: 'rgba(124,108,255,.14)', border: '1px solid rgba(124,108,255,.28)' }}><Icon size={20} /></span>
                  </div>
                  <div className="p-8">
                    <h3 className="text-[1.35rem] font-semibold">{t}</h3>
                    <p className="text-muted text-[1.02rem] leading-relaxed mt-3">{d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── GALLERY — static grid (9 = 3×3) ── */}
      <section className="w-full py-20 border-y border-border/60" style={{ background: 'var(--sidebar)' }}>
        <div className="max-w-[1240px] mx-auto px-7 flex items-end justify-between gap-4 flex-wrap mb-8">
          <Reveal>
            <div>
              <span className="text-[.7rem] tracking-[.18em] uppercase text-primary font-semibold">Community gallery</span>
              <h2 className="text-[2rem] font-bold tracking-tight mt-2.5">Worlds built by the community</h2>
            </div>
          </Reveal>
          <Reveal><Link href="/community" className="text-sm text-muted hover:text-foreground transition-colors inline-flex items-center gap-1">View all <ArrowRight size={14} /></Link></Reveal>
        </div>
        <div className="max-w-[1240px] mx-auto px-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {GALLERY.slice(0, 9).map((g, i) => (
              <Link key={i} href="/community" className="group rounded-xs overflow-hidden border border-border bg-surface transition-colors hover:border-primary/60">
                <div className="aspect-[16/10] relative" style={{ background: thumbGradient(g.t) }}>
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 18%, rgba(255,255,255,.16), transparent 55%)' }} />
                </div>
                <div className="px-5 py-4 flex items-center gap-3 min-w-0 border-t border-border/60">
                  <span className="w-[26px] h-[26px] rounded-full shrink-0" style={{ background: GRAD }} />
                  <span className="text-[1.05rem] font-semibold truncate group-hover:text-primary transition-colors">{g.t}</span>
                  <span className="text-[.9rem] text-muted ml-auto shrink-0">{g.u}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING teaser ── */}
      <section className="w-full py-24">
        <div className="max-w-[1240px] mx-auto px-7">
          <Reveal>
            <div className="text-center w-full mb-12">
              <span className="text-[.7rem] tracking-[.18em] uppercase text-primary font-semibold">Pricing</span>
              <h2 className="font-bold tracking-tight mt-3" style={{ fontSize: 'clamp(1.9rem,3.4vw,2.7rem)' }}>Start free, scale when you need</h2>
            </div>
          </Reveal>
          {/* /pricing과 같은 카드를 그대로 사용 — 가격·기능이 한 곳(pricingData)에서만 관리된다. 비교표는 /pricing에만 */}
          <Reveal>
            <PricingCards currentTier={currentTier} loggedIn={loggedIn} showComparison={false} />
          </Reveal>
          <div className="text-center mt-9"><Link href="/pricing" className="text-sm text-muted hover:text-foreground transition-colors inline-flex items-center gap-1">Compare all plans <ArrowRight size={14} /></Link></div>
        </div>
      </section>

      {/* ── FINAL CTA — full-bleed dark ── */}
      <section className="w-full">
        <div className="relative w-full overflow-hidden text-center px-8 py-32" style={{ background: 'radial-gradient(120% 120% at 50% 0%, #221a45, #0c0a18)' }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(50% 60% at 50% 0%, rgba(124,108,255,.3), transparent 70%)' }} />
          {/* 원근 지평선 + 떠 있는 도형 실루엣 */}
          <CtaArt className="absolute inset-0 w-full h-full" />
          <Reveal className="relative">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xs text-[.76rem] font-medium mb-7 text-white/80 border border-white/15 bg-white/5 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#39d0ea', boxShadow: '0 0 10px #39d0ea' }} />
              Free to start
            </span>
            <h2 className="font-bold tracking-tight text-white" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>Start building your first 3D space</h2>
            <p className="text-white/60 max-w-[460px] mx-auto mt-4 mb-9">Sign up in 30 seconds. No code, right in your browser.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href={primaryHref} className="inline-flex items-center gap-1.5 px-7 py-3.5 rounded-xs font-semibold text-white shadow-lg shadow-violet-900/50 transition-opacity hover:opacity-90" style={{ background: GRAD }}>{primaryLabel} <ArrowRight size={17} /></Link>
              <Link href="/community" className="inline-flex items-center gap-1.5 px-7 py-3.5 rounded-xs font-semibold text-white border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/15 transition-colors"><Play size={15} /> See what others built</Link>
            </div>
            <div className="mt-6 flex items-center justify-center gap-x-6 gap-y-2 flex-wrap text-[.82rem] text-white/45">
              <span className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.2} /> No credit card</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.2} /> Publish in one click</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.2} /> Works in any browser</span>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </SiteShell>
  );
}
