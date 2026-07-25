'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MousePointerClick, Gamepad2, Rocket, Users2, Play, Heart, Repeat2, Check, ArrowRight, ChevronDown } from 'lucide-react';
import { SiteShell } from '@/components/ui/SiteShell';
import { Reveal, CountUp } from '@/components/ui/Reveal';
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
];
const PLANS = [
  { name: 'Free', amt: '$0', per: '/forever', feats: ['3 projects', '30 objects / scene', 'Share link'], pro: false },
  { name: 'Pro', amt: '$12', per: '/mo', feats: ['20 projects', 'Custom domain', 'Embed · analytics', 'Remove watermark'], pro: true },
  { name: 'Business', amt: 'Custom', per: '', feats: ['Unlimited projects', 'Team · real-time collab', 'Priority support'], pro: false },
];

export function LandingClient({ loggedIn }: { loggedIn: boolean }) {
  const primaryHref = loggedIn ? '/dashboard' : '/signup';
  const primaryLabel = loggedIn ? 'Go to dashboard' : 'Start building free';

  const nav = (
    <div className="max-w-[1240px] mx-auto px-7 h-full flex items-center gap-7">
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem]">
        <span className="w-[28px] h-[28px] rounded-xs grid place-items-center text-white text-[.85rem]" style={{ background: GRAD }}>⬡</span>
        Park3D
      </Link>
      <div className="hidden md:flex gap-6 text-sm text-foreground/70">
        <a className="hover:text-foreground transition-colors" href="#features">Features</a>
        <Link className="hover:text-foreground transition-colors" href="/community">Gallery</Link>
        <Link className="hover:text-foreground transition-colors" href="/pricing">Pricing</Link>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {!loggedIn && <Link href="/login" className="text-sm text-foreground/70 hover:text-foreground transition-colors">Log in</Link>}
        <Link href={primaryHref} className="px-4 py-2 rounded-xs text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: GRAD }}>{loggedIn ? 'Dashboard' : 'Sign up'}</Link>
      </div>
    </div>
  );

  return (
    <SiteShell nav={nav} ambient={false}>
      <style>{`
        @keyframes p3marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes p3bounce { 0%,100% { transform: translateY(0); opacity:.6 } 50% { transform: translateY(6px); opacity:1 } }
        .p3-track { display:flex; gap:1rem; width:max-content; animation: p3marquee 46s linear infinite; }
        .p3-mq:hover .p3-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce){ .p3-track{ animation:none } .p3-cue{ animation:none } }
      `}</style>

      {/* ── HERO — full-bleed interactive dark stage ── */}
      <section className="relative w-full overflow-hidden" style={{ minHeight: 'calc(100dvh - 56px)', background: 'radial-gradient(130% 90% at 50% -10%, #221a45 0%, #0d0a1a 45%, #08070e 100%)' }}>
        <div className="absolute inset-0">
          <HeroScene />
        </div>
        {/* readability scrim */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(70% 55% at 50% 46%, transparent 40%, rgba(8,7,14,.72) 100%)' }} />
        <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, var(--background))' }} />

        {/* content overlay (pointer-events-none so the 3D reacts to cursor everywhere) */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-7 pointer-events-none" style={{ minHeight: 'calc(100dvh - 56px)' }}>
          <span className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xs text-[.78rem] font-medium mb-8 text-white/85 border border-white/15 bg-white/5 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#39d0ea', boxShadow: '0 0 10px #39d0ea' }} />
            No-code 3D web builder
          </span>
          <h1 className="font-bold tracking-[-0.04em] text-white leading-[0.98]" style={{ fontSize: 'clamp(3rem,8.5vw,6.2rem)', textWrap: 'balance' }}>
            Build 3D worlds,<br />
            <span style={{ background: 'linear-gradient(100deg,#a99bff,#5ee0f4)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>ship them to the web.</span>
          </h1>
          <p className="text-white/65 text-[1.15rem] leading-relaxed max-w-[560px] mx-auto mt-7 mb-9">
            Design interactive 3D spaces, games, and sites with drag-and-drop — then publish in one click. All in your browser.
          </p>
          <div className="pointer-events-auto flex gap-3 justify-center flex-wrap">
            <Link href={primaryHref} className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xs text-[.95rem] font-semibold text-white shadow-lg shadow-violet-900/40 transition-transform hover:-translate-y-0.5" style={{ background: GRAD }}>{primaryLabel} <ArrowRight size={17} /></Link>
            <Link href="/community" className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xs text-[.95rem] font-semibold text-white border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/15 transition-colors"><Play size={15} /> Explore gallery</Link>
          </div>
          <div className="mt-5 text-[.8rem] text-white/45">No credit card · Your first scene in 30 seconds</div>
        </div>

        <div className="p3-cue absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-white/40" style={{ animation: 'p3bounce 2s ease-in-out infinite' }}><ChevronDown size={22} /></div>
      </section>

      {/* ── STATS ── */}
      <section className="relative w-full border-b border-border/60">
        <div className="max-w-[1100px] mx-auto px-7 py-14 grid grid-cols-3 gap-6 text-center">
          {[
            { n: <><CountUp to={12} decimals={0} />k+</>, l: '3D spaces created' },
            { n: <><CountUp to={60} />fps</>, l: 'Real-time in the browser' },
            { n: <><CountUp to={190} suffix="+" /></>, l: 'Countries reached' },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 90}>
              <div className="text-[2.2rem] font-bold tracking-tight">{s.n}</div>
              <div className="text-[.84rem] text-muted mt-1">{s.l}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FEATURES — bento ── */}
      <section id="features" className="w-full py-24">
        <div className="max-w-[1240px] mx-auto px-7">
          <Reveal>
            <div className="text-center max-w-[640px] mx-auto mb-14">
              <span className="text-[.7rem] tracking-[.18em] uppercase text-primary font-semibold">Why Park3D</span>
              <h2 className="font-bold tracking-tight mt-3" style={{ fontSize: 'clamp(1.9rem,3.6vw,2.9rem)' }}>Everything you need to ship in 3D</h2>
              <p className="text-muted mt-4 text-[1.02rem]">No Blender, no code. Build in the browser and share instantly.</p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 md:auto-rows-[minmax(0,1fr)] gap-4">
            {/* big tile */}
            <Reveal className="md:col-span-2 md:row-span-2">
              <div className="group relative h-full min-h-[300px] rounded-xs overflow-hidden border border-border p-8 flex flex-col justify-end"
                style={{ background: 'linear-gradient(160deg, rgba(124,108,255,.16), rgba(57,208,234,.06)), var(--surface)' }}>
                <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full blur-3xl opacity-60" style={{ background: 'radial-gradient(circle, rgba(124,108,255,.4), transparent 65%)' }} />
                <div className="relative w-12 h-12 rounded-xs grid place-items-center mb-auto text-primary" style={{ background: 'rgba(124,108,255,.14)', border: '1px solid rgba(124,108,255,.28)' }}><MousePointerClick size={22} /></div>
                <h3 className="relative text-[1.35rem] font-semibold mt-6">Drag, drop, done</h3>
                <p className="relative text-muted text-[.95rem] leading-relaxed mt-2 max-w-[440px]">Drop shapes and assets, set materials and lighting with a click. Real-world scale, floor-snap, and physics colliders are handled for you.</p>
              </div>
            </Reveal>

            {[
              { icon: Gamepad2, t: 'Physics & game logic', d: 'Gravity, collisions, events — no code.' },
              { icon: Rocket, t: 'One-click publish', d: 'Link, custom domain, or embed anywhere.' },
              { icon: Users2, t: 'Real-time collab', d: 'Build together, live cursors and all.' },
            ].map(({ icon: Icon, t, d }, i) => (
              <Reveal key={t} delay={i * 80} className={i === 2 ? 'md:col-span-1' : ''}>
                <div className="group h-full min-h-[140px] rounded-xs border border-border bg-surface p-6 transition-colors hover:border-primary/40">
                  <div className="w-11 h-11 rounded-xs grid place-items-center mb-4 text-primary transition-transform group-hover:scale-105" style={{ background: 'rgba(124,108,255,.10)', border: '1px solid rgba(124,108,255,.22)' }}><Icon size={20} /></div>
                  <h3 className="text-[1.05rem] font-semibold">{t}</h3>
                  <p className="text-muted text-[.88rem] leading-relaxed mt-1.5">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── GALLERY MARQUEE — full-bleed ── */}
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
        <div className="p3-mq w-full overflow-hidden">
          <div className="p3-track px-7">
            {[...GALLERY, ...GALLERY].map((g, i) => (
              <Link key={i} href="/community" className="group w-[300px] shrink-0 rounded-xs overflow-hidden border border-border bg-surface transition-transform hover:-translate-y-1">
                <div className="aspect-[16/10] relative" style={{ background: thumbGradient(g.t) }}>
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 18%, rgba(255,255,255,.16), transparent 55%)' }} />
                </div>
                <div className="px-4 py-3 flex items-center gap-2">
                  <span className="w-[18px] h-[18px] rounded-full" style={{ background: GRAD }} />
                  <span className="text-[.88rem] font-semibold group-hover:text-primary transition-colors">{g.t}</span>
                  <span className="text-[.76rem] text-muted ml-auto">{g.u}</span>
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
            <div className="text-center max-w-[620px] mx-auto mb-12">
              <span className="text-[.7rem] tracking-[.18em] uppercase text-primary font-semibold">Pricing</span>
              <h2 className="font-bold tracking-tight mt-3" style={{ fontSize: 'clamp(1.9rem,3.4vw,2.7rem)' }}>Start free, scale when you need</h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-4 max-w-[920px] mx-auto items-start">
            {PLANS.map((p, i) => (
              <Reveal key={p.name} delay={i * 90}>
                <div className="bg-surface border rounded-xs p-7 relative h-full" style={p.pro ? { borderColor: 'transparent', boxShadow: '0 0 0 1.5px #6a4dff' } : { borderColor: 'var(--border)' }}>
                  {p.pro && <span className="absolute -top-2.5 left-6 text-white text-[.66rem] font-bold px-2.5 py-1 rounded-xs" style={{ background: GRAD }}>Popular</span>}
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-[1.9rem] font-bold tracking-tight mt-2 mb-0.5">{p.amt}<small className="text-[.85rem] text-muted font-medium">{p.per}</small></div>
                  <ul className="list-none mt-5 p-0 text-[.86rem] text-muted space-y-2.5">
                    {p.feats.map((f) => <li key={f} className="flex items-center gap-2"><Check size={15} className="text-[#16a34a] shrink-0" strokeWidth={2.2} />{f}</li>)}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="text-center mt-9"><Link href="/pricing" className="text-sm text-muted hover:text-foreground transition-colors inline-flex items-center gap-1">Compare all plans <ArrowRight size={14} /></Link></div>
        </div>
      </section>

      {/* ── FINAL CTA — full-bleed dark ── */}
      <section className="w-full">
        <div className="relative w-full overflow-hidden text-center px-8 py-28" style={{ background: 'radial-gradient(120% 120% at 50% 0%, #221a45, #0c0a18)' }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(50% 60% at 50% 0%, rgba(124,108,255,.3), transparent 70%)' }} />
          <Reveal className="relative">
            <h2 className="font-bold tracking-tight text-white" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>Start building your first 3D space</h2>
            <p className="text-white/60 max-w-[460px] mx-auto mt-4 mb-8">Sign up in 30 seconds. No code, right in your browser.</p>
            <Link href={primaryHref} className="inline-flex items-center gap-1.5 px-7 py-3.5 rounded-xs font-semibold text-white shadow-lg shadow-violet-900/50 transition-transform hover:-translate-y-0.5" style={{ background: GRAD }}>{primaryLabel} <ArrowRight size={17} /></Link>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="w-full py-12 border-t border-border text-muted/70 text-[.85rem]">
        <div className="max-w-[1240px] mx-auto px-7 flex justify-between flex-wrap gap-5 items-center">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-foreground">
            <span className="w-[26px] h-[26px] rounded-xs grid place-items-center text-white text-[.8rem]" style={{ background: GRAD }}>⬡</span> Park3D
          </Link>
          <div className="flex gap-6">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <Link href="/community" className="hover:text-foreground transition-colors">Gallery</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          </div>
          <div>© 2026 Park3D</div>
        </div>
      </footer>
    </SiteShell>
  );
}
