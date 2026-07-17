'use client';

// 공용 변형 기준점(앵커/피벗) 피커 — doc/PIVOT_MANIPULATION.md Layer 1.
//   각 축 3단(좌/중/우 · 하/중/상 · 앞/중/뒤) = 정규화 0..1(0=min·0.5=중심·1=max) → 조합으로 면·엣지·코너.
//   value 미설정 = 중심. 애니메이션·액추에이터에서도 재사용.
import type { Vector3 } from '@/types/scene';

const CENTER: Vector3 = { x: 0.5, y: 0.5, z: 0.5 };

// 각 축 3단 라벨(min/center/max)
const AXES: { key: 'x' | 'y' | 'z'; labels: [string, string, string] }[] = [
  { key: 'x', labels: ['좌', '중', '우'] },  // 0=−X · 0.5 · 1=+X
  { key: 'y', labels: ['하', '중', '상'] },  // 0=−Y · 0.5 · 1=+Y
  { key: 'z', labels: ['앞', '중', '뒤'] },  // 0=−Z · 0.5 · 1=+Z
];
const STEPS = [0, 0.5, 1] as const;

export function PivotPicker({ value, onChange }: { value?: Vector3; onChange: (p?: Vector3) => void }) {
  const p = value ?? CENTER;
  // 한 축 값 변경 → 전체가 중심이면 undefined(미설정)로 정리해 하위호환 유지.
  const setAxis = (axis: 'x' | 'y' | 'z', v: number) => {
    const next: Vector3 = { ...p, [axis]: v };
    onChange(next.x === 0.5 && next.y === 0.5 && next.z === 0.5 ? undefined : next);
  };
  const stepIdx = (v: number) => (v <= 0.25 ? 0 : v >= 0.75 ? 2 : 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-muted/70 dark:text-muted tracking-wide">기준점 (앵커)</span>
        {!isCenter(value) && (
          <button onClick={() => onChange(undefined)} className="text-[9px] text-muted/60 hover:text-foreground transition-colors">중심으로</button>
        )}
      </div>
      <div className="space-y-1">
        {AXES.map(({ key, labels }) => {
          const cur = stepIdx(p[key]);
          return (
            <div key={key} className="flex items-center gap-1">
              <span className="w-3 text-[9px] text-muted/60 uppercase">{key}</span>
              <div className="flex-1 grid grid-cols-3 gap-0.5">
                {labels.map((lb, i) => (
                  <button
                    key={i}
                    onClick={() => setAxis(key, STEPS[i])}
                    className={`py-1 rounded-xs text-[9px] transition-colors ${cur === i ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                  >
                    {lb}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted/60 mt-1">스케일이 이 점을 고정한 채 커집니다. 예: <b>하</b>로 두면 바닥 붙은 채 위로만.</p>
    </div>
  );
}

function isCenter(v?: Vector3) {
  return !v || (v.x === 0.5 && v.y === 0.5 && v.z === 0.5);
}
