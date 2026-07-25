// 썸네일 없을 때 프로젝트별 결정적 그라데이션 — 파스텔 대신 깊고 절제된 톤(세련됨).
const PALETTE = [
  'linear-gradient(150deg,#6d5ce0,#221b4d)', // violet
  'linear-gradient(150deg,#2b8aa6,#123540)', // teal
  'linear-gradient(150deg,#b05c86,#3a1e2f)', // rose (muted)
  'linear-gradient(150deg,#c19a54,#443216)', // amber (muted)
  'linear-gradient(150deg,#3aa88f,#123a33)', // emerald
  'linear-gradient(150deg,#5f6bd6,#20264f)', // indigo
];

export function thumbGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
