'use client';

import { useState } from 'react';
import { shortDay, type DailyPoint } from '@/lib/analytics';

/**
 * 일자별 방문/상호작용 누적 막대.
 *
 * 2계열이라 범례를 항상 두고(색만으로 구분하지 않음), 세그먼트 사이에 2px 표면 간격을 준다.
 * 값은 호버 툴팁 + 아래 표에서 숫자로 확인되므로 막대 위에 숫자를 찍지 않는다(전 포인트 라벨 금지).
 */
export function DailyChart({ data }: { data: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.views + d.interactions));
  const H = 168; // 플롯 높이(px)

  const active = hover !== null ? data[hover] : null;

  // x축 라벨은 처음/중간/끝만 — 30·90일에서 전부 찍으면 겹친다
  const labelAt = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <div>
      {/* 범례 — 계열이 2개이므로 항상 표시 */}
      <div className="flex items-center gap-4 mb-4 text-[.75rem] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: 'var(--primary)' }} /> Views
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: 'var(--accent)' }} /> Interactions
        </span>
        <span className="ml-auto tabular-nums">
          {active ? (
            <span className="text-foreground">
              {active.day} · Views {active.views.toLocaleString()} · Interactions {active.interactions.toLocaleString()}
            </span>
          ) : (
            `Peak ${max.toLocaleString()}/day`
          )}
        </span>
      </div>

      <div className="relative" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {/* 눈금선 — 흐리게(데이터보다 뒤로) */}
        {[0, 0.5, 1].map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-border" style={{ top: `${t * 100}%` }} />
        ))}

        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d, i) => {
            const total = d.views + d.interactions;
            const vh = (d.views / max) * H;
            const ih = (d.interactions / max) * H;
            const on = hover === i;
            return (
              <div
                key={d.day}
                className="relative flex-1 h-full flex flex-col justify-end cursor-default"
                onMouseEnter={() => setHover(i)}
              >
                {/* 호버 하이라이트(열 전체가 히트 영역 — 막대보다 넓게) */}
                {on && <span className="absolute inset-0 bg-foreground/[0.05] rounded-[3px]" />}
                {ih > 0 && (
                  <span
                    className="relative w-full rounded-t-[4px]"
                    style={{ height: Math.max(2, ih), background: 'var(--accent)', marginBottom: 2, opacity: on || hover === null ? 1 : 0.55 }}
                  />
                )}
                {vh > 0 && (
                  <span
                    className="relative w-full"
                    style={{
                      height: Math.max(2, vh),
                      background: 'var(--primary)',
                      borderRadius: ih > 0 ? '0 0 2px 2px' : '4px 4px 2px 2px',
                      opacity: on || hover === null ? 1 : 0.55,
                    }}
                  />
                )}
                {total === 0 && <span className="relative w-full h-[2px] bg-border" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-[2px] mt-2">
        {data.map((d, i) => (
          <span key={d.day} className="flex-1 text-center text-[.65rem] text-muted/70 tabular-nums truncate">
            {labelAt.has(i) ? shortDay(d.day) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
