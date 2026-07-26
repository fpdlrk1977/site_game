'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** 뷰포트 진입 시 fade-up 하는 스크롤 리빌 래퍼. reduced-motion이면 즉시 표시. */
export function Reveal({ children, delay = 0, y = 26, className = '' }: {
  children: ReactNode; delay?: number; y?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true); return;
    }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${y}px)`,
        transition: `opacity .7s cubic-bezier(.22,.61,.28,1) ${delay}ms, transform .8s cubic-bezier(.22,.61,.28,1) ${delay}ms`,
        // will-change를 계속 걸어두면 요소마다 합성 레이어가 남아 스크롤이 무거워진다 → 등장 전에만
        willChange: shown ? undefined : 'opacity, transform',
      }}>
      {children}
    </div>
  );
}

/** 뷰포트 진입 시 target까지 카운트업하는 숫자. suffix/prefix 지원. */
export function CountUp({ to, suffix = '', prefix = '', duration = 1400, decimals = 0 }: {
  to: number; suffix?: string; prefix?: string; duration?: number; decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(to); return;
    }
    let raf = 0; let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { raf = requestAnimationFrame(step); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);

  return <span ref={ref} className="tabular-nums">{prefix}{val.toFixed(decimals)}{suffix}</span>;
}
