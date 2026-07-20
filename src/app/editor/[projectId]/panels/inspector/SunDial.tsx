'use client';

// 태양 위치 다이얼 — 원형 패드에서 방위(각도)+고도(중심=머리 위, 가장자리=지평선)를 한 번에 잡는다.
//   XYZ 좌표의 막막함을 없애고 "어느 방향에서 얼마나 높이" 를 직관적으로. directionalPosition과 상호 변환.
import { useRef } from 'react';
import type { Vector3 } from '@/types/scene';

const SIZE = 128;
const C = SIZE / 2;
const RAD = C - 12; // 지평선(가장자리) 반경

export function SunDial({ position, onChange, onCommit }: {
  position: Vector3;
  onChange: (p: Vector3) => void; // 실시간
  onCommit: () => void;           // 놓을 때 pushHistory
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // 방향 크기(태양 거리)는 보존하고 방향만 바꾼다.
  const mag = Math.hypot(position.x, position.y, position.z) || 12;
  const dy = Math.max(-1, Math.min(1, position.y / mag));
  const el = Math.asin(dy);                 // 고도 0..π/2
  const az = Math.atan2(position.x, position.z); // 방위(+z=위쪽 기준)
  const r = 1 - el / (Math.PI / 2);          // 0=중심(머리 위) .. 1=가장자리(지평선)
  const dotX = C + Math.sin(az) * r * RAD;
  const dotY = C - Math.cos(az) * r * RAD;

  const apply = (clientX: number, clientY: number, commit: boolean) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const px = clientX - box.left - C;
    const py = clientY - box.top - C;
    const rr = Math.min(1, Math.hypot(px, py) / RAD); // 0..1
    const ang = Math.atan2(px, -py);                  // 방위
    const elev = (1 - rr) * (Math.PI / 2);            // 고도
    const ce = Math.cos(elev);
    onChange({ x: Math.sin(ang) * ce * mag, y: Math.sin(elev) * mag, z: Math.cos(ang) * ce * mag });
    if (commit) onCommit();
  };

  return (
    <div>
      <span className="text-[10px] text-muted/70 dark:text-muted block mb-1">Sun direction · drag</span>
      <div
        ref={ref}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); apply(e.clientX, e.clientY, false); }}
        onPointerMove={(e) => { if (dragging.current) apply(e.clientX, e.clientY, false); }}
        onPointerUp={(e) => { if (dragging.current) { dragging.current = false; apply(e.clientX, e.clientY, true); } }}
        style={{ width: SIZE, height: SIZE, touchAction: 'none' }}
        className="relative mx-auto rounded-full border border-border bg-background/60 cursor-pointer select-none"
      >
        {/* 고도 링(중심=머리 위) */}
        <div className="absolute rounded-full border border-border/40 pointer-events-none" style={{ left: C - RAD, top: C - RAD, width: RAD * 2, height: RAD * 2 }} />
        <div className="absolute rounded-full border border-border/30 pointer-events-none" style={{ left: C - RAD * 0.5, top: C - RAD * 0.5, width: RAD, height: RAD }} />
        {/* 방위 십자 + 라벨 */}
        <div className="absolute bg-border/40 pointer-events-none" style={{ left: C - 0.5, top: 4, width: 1, height: SIZE - 8 }} />
        <div className="absolute bg-border/40 pointer-events-none" style={{ top: C - 0.5, left: 4, height: 1, width: SIZE - 8 }} />
        <span className="absolute text-[8px] text-muted/50 pointer-events-none" style={{ left: C - 3, top: 1 }}>N</span>
        <span className="absolute text-[8px] text-muted/50 pointer-events-none" style={{ right: 2, top: C - 5 }}>E</span>
        {/* 태양 dot */}
        <div className="absolute rounded-full pointer-events-none" style={{ left: dotX - 6, top: dotY - 6, width: 12, height: 12, background: '#f59e0b', boxShadow: '0 0 0 2px rgba(255,255,255,0.9), 0 0 6px rgba(245,158,11,0.8)' }} />
      </div>
      <p className="text-[9px] text-muted/50 mt-1 text-center">중심 = 머리 위(정오) · 가장자리 = 지평선 · 각도 = 방향</p>
    </div>
  );
}
