'use client';

// 격자 배치 실시간 미리보기 — cols×rows 점을 간격 비율 반영해 박스에 맞춰 그린다.
// ArraySection(생성 전)·ClonerSection(생성 후 수정) 공용.
export function GridPreview({ cols, rows, spX, spZ }: { cols: number; rows: number; spX: number; spZ: number }) {
  const PV = 72, pad = 9;
  const gw = Math.max(1e-3, (cols - 1) * Math.abs(spX));
  const gh = Math.max(1e-3, (rows - 1) * Math.abs(spZ));
  const s = (PV - 2 * pad) / Math.max(gw, gh);
  const totalW = gw * s, totalH = gh * s;
  const ox = (PV - totalW) / 2, oy = (PV - totalH) / 2;
  const many = cols > 20 || rows > 20; // 점이 너무 많으면 영역만 표시(가벼움)
  return (
    <svg width={PV} height={PV} viewBox={`0 0 ${PV} ${PV}`} className="shrink-0 rounded-xs bg-background border border-border">
      {many ? (
        <rect x={ox} y={oy} width={Math.max(4, totalW)} height={Math.max(4, totalH)} fill="var(--color-primary)" fillOpacity={0.15} stroke="var(--color-primary)" strokeOpacity={0.6} strokeWidth={1} />
      ) : (
        Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((__, c) => (
            <circle key={`${r}-${c}`} cx={ox + c * Math.abs(spX) * s} cy={oy + r * Math.abs(spZ) * s} r={1.7} fill="var(--color-primary)" />
          )),
        )
      )}
    </svg>
  );
}
