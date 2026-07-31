'use client';

// 브릭 색 고르개 — **브릭 전용, 자체 완결.**
//
// ★ 구 `ColorPicker`(600줄+)는 되살리지 않았다. 씬 `colorAssets`·그라데이션·스포이드·
//   전역 싱글턴 팝업이 얽혀 있었고, 브릭에 필요한 건 **"색 하나 고르기"** 뿐이다.
//
// ★ 팝업(포털)이 아니라 **패널 안에서 펼쳐진다**. 도구 패널이 이미 사이드에 고정돼 있어
//   띄울 이유가 없고, 팝업이면 바깥클릭·위치계산·z-index가 따라붙는다.
//
// 저장 포맷은 손댈 것이 없다 — 청크 팔레트가 `[재질, r, g, b]`로 **임의 RGB를 이미 담는다**.
// 같은 색은 팔레트에 한 번만 들어가므로 색을 많이 써도 용량이 안 는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { hexToHsv, hsvToHex, normalizeHex } from '@/lib/color';

const SV_H = 96;

/** 포인터를 요소 안 0~1 좌표로 (밖으로 나가도 가장자리에 붙는다 — 드래그가 끊기지 않게) */
function ratio(el: HTMLElement, e: PointerEvent | React.PointerEvent): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  };
}

interface Props {
  value: string;
  /** 드래그 중에도 계속 — 브릭 색이 실시간으로 바뀐다 */
  onChange: (hex: string) => void;
  /**
   * 손을 뗐을 때 한 번 — **최근 색은 여기서만 쌓인다.**
   * 드래그 중 색마다 쌓으면 최근 목록이 중간 색으로 도배된다.
   */
  onCommit: (hex: string) => void;
}

export function BrickColorPicker({ value, onChange, onCommit }: Props) {
  const init = hexToHsv(value) ?? { h: 0, s: 0, v: 1 };
  const [h, setH] = useState(init.h);
  const [s, setS] = useState(init.s);
  const [v, setV] = useState(init.v);
  const [text, setText] = useState(value);

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  /** 드래그 중인 대상 — window 리스너로 받아야 요소 밖으로 나가도 안 끊긴다 */
  const dragRef = useRef<'sv' | 'hue' | null>(null);

  const hex = hsvToHex(h, s, v);

  /**
   * 조작할 때 **그 자리에서** 색을 내보낸다.
   *
   * ★ 예전엔 `useEffect([hex])`로 내보냈는데, 그러면 ①고르개를 여는 순간 현재 색이 한 번 더 적용되고
   *   ②렌더 결과를 보고 부모 상태를 바꾸는 모양이 된다(React 규칙 위반으로 lint가 잡는다).
   *   조작은 이벤트에서 일어나므로 이벤트에서 내보내는 게 맞다.
   */
  const apply = useCallback((kind: 'sv' | 'hue', e: PointerEvent | React.PointerEvent) => {
    const el = kind === 'sv' ? svRef.current : hueRef.current;
    if (!el) return;
    const r = ratio(el, e);
    let nh = h, ns = s, nv = v;
    if (kind === 'sv') { ns = r.x; nv = 1 - r.y; setS(ns); setV(nv); }
    else { nh = r.x * 360; setH(nh); }
    const next = hsvToHex(nh, ns, nv);
    setText(next);
    onChange(next);
  }, [h, s, v, onChange]);

  // 손을 뗄 때 최근 색으로 남긴다.
  //   최신 hex를 ref로 읽는다(리스너를 색이 바뀔 때마다 다시 붙이지 않으려고).
  //   ★ ref 갱신은 **렌더 중이 아니라 effect에서** 한다 — 렌더 중 ref 쓰기는 React 규칙 위반이다.
  const hexRef = useRef(hex);
  useEffect(() => { hexRef.current = hex; }, [hex]);
  useEffect(() => {
    const move = (e: PointerEvent) => { if (dragRef.current) apply(dragRef.current, e); };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      onCommit(hexRef.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [apply, onCommit]);

  const commitText = (raw: string) => {
    const norm = normalizeHex(raw);
    if (!norm) { setText(hex); return; } // 잘못된 값이면 조용히 되돌린다
    const hsv = hexToHsv(norm);
    if (hsv) { setH(hsv.h); setS(hsv.s); setV(hsv.v); }
    setText(norm);
    onChange(norm);
    onCommit(norm);
  };

  return (
    <div className="mb-2 rounded-xs border border-border bg-background p-2">
      {/* 채도(→) · 명도(↑) */}
      <div
        ref={svRef}
        onPointerDown={(e) => { dragRef.current = 'sv'; apply('sv', e); }}
        className="relative w-full rounded-xs cursor-crosshair touch-none"
        style={{ height: SV_H, background: `hsl(${h} 100% 50%)` }}
      >
        <div className="absolute inset-0 rounded-xs" style={{ background: 'linear-gradient(to right, #fff, transparent)' }} />
        <div className="absolute inset-0 rounded-xs" style={{ background: 'linear-gradient(to top, #000, transparent)' }} />
        <div
          className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow pointer-events-none"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
        />
      </div>

      {/* 색상 */}
      <div
        ref={hueRef}
        onPointerDown={(e) => { dragRef.current = 'hue'; apply('hue', e); }}
        className="relative w-full h-3 mt-2 rounded-xs cursor-crosshair touch-none"
        style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
      >
        <div
          className="absolute top-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow pointer-events-none"
          style={{ left: `${(h / 360) * 100}%` }}
        />
      </div>

      {/* HEX */}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="w-5 h-5 shrink-0 rounded-xs border border-border" style={{ background: hex }} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commitText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value); }}
          spellCheck={false}
          className="flex-1 min-w-0 bg-surface border border-border rounded-xs px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}
