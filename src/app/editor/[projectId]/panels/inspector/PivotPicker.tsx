'use client';

// 변형 기준점(앵커/피벗) 피커 — doc/PIVOT_MANIPULATION.md Layer 1.
//   UI = 앞/뒤 사각형 2개, 각 네 꼭지점에 작은 버튼(총 8 코너). 왼쪽=앞(z=0)·오른쪽=뒤(z=1).
//   각 사각형: 가로=좌/우(X 0/1), 세로=하/상(Y 0/1).
//   ※ "중"(0.5=면/엣지 앵커)은 UI에서 감춤(스키마/수학은 그대로 유지 — 나중에 재노출 가능).
//   value 미설정 = 중심(선택 없음). 애니메이션·액추에이터에서도 재사용.
import type { CSSProperties } from 'react';
import type { Vector3 } from '@/types/scene';

// 한 사각형(z 고정)의 4꼭지점 [x, y] — 좌하/우하/좌상/우상
const CORNERS: [number, number][] = [[0, 1], [1, 1], [0, 0], [1, 0]];

export function PivotPicker({ value, onChange, hideHeader }: { value?: Vector3; onChange: (p?: Vector3) => void; hideHeader?: boolean }) {
  const isSel = (x: number, y: number, z: number) => !!value && value.x === x && value.y === y && value.z === z;

  const renderFace = (z: number, label: string) => (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16 border border-border rounded-xs bg-background/40">
        <span className="absolute inset-0 flex items-center justify-center text-[9px] text-muted/40 pointer-events-none select-none">{label}</span>
        {CORNERS.map(([x, y]) => {
          const sel = isSel(x, y, z);
          // 위치: 상(y=1)=top·하(y=0)=bottom / 좌(x=0)=left·우(x=1)=right, 버튼 절반(6px)만큼 코너에 얹기
          const style: CSSProperties = {
            [y === 1 ? 'top' : 'bottom']: -6,
            [x === 0 ? 'left' : 'right']: -6,
          };
          return (
            <button
              key={`${x}${y}`}
              onClick={() => onChange({ x, y, z })}
              title={`${x === 0 ? '좌' : '우'} · ${y === 0 ? '하' : '상'} · ${z === 0 ? '앞' : '뒤'}`}
              style={style}
              className={`absolute w-3 h-3 rounded-full border transition-colors ${sel ? 'bg-primary border-primary' : 'bg-surface border-border/80 hover:border-primary'}`}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      {!hideHeader && (
        <div className="mb-1">
          <span className="text-[10px] font-semibold text-muted/70 dark:text-muted tracking-wide">기준점 (앵커)</span>
        </div>
      )}
      <div className="flex items-center justify-center gap-8 py-2 px-1">
        {renderFace(0, '앞')}
        {renderFace(1, '뒤')}
      </div>
      <p className="text-[9px] text-muted/60 mt-1">선택한 꼭지점을 고정한 채 크기·회전이 일어납니다. 예: 하단 꼭지점 = 바닥에 붙은 채 위로.</p>
    </div>
  );
}
