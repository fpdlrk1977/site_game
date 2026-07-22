// 절차적 Matcap 생성 — 외부 이미지 없이 '구에 조명을 비춘 이미지'를 픽셀마다 계산해 만든다.
//   Matcap = 정면에서 본 라이팅된 구. 셰이더가 뷰공간 법선(x,y)으로 이 텍스처를 샘플 → 방향별 음영.
//   구 법선 N=(u,v,z)로 확산/반사/프레넬을 실제 계산하므로 절차적이어도 '진짜' matcap 룩이 나온다.
//   프리셋별 텍스처는 캐시(같은 프리셋은 1회만 생성).
import * as THREE from 'three';

export type MatcapPreset = 'studio' | 'chrome' | 'gold' | 'clay' | 'pearl';

export const MATCAP_PRESETS: { id: MatcapPreset; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'gold', label: 'Gold' },
  { id: 'clay', label: 'Clay' },
  { id: 'pearl', label: 'Pearl' },
];

type RGB = [number, number, number];
interface Params {
  base: RGB;          // 확산 베이스 색
  light: RGB;         // 조명 방향(정규화 전)
  ambient: number;    // 주변광(0~1)
  diff: number;       // 확산 강도
  shininess: number;  // 스페큘러 집중도
  spec: number;       // 스페큘러 강도
  specCol: RGB;       // 스페큘러 색
  rim: number;        // 가장자리(프레넬) 강도
  rimCol: RGB;
  rimPow: number;
  env?: { top: RGB; horizon: RGB; bottom: RGB }; // 금속 반사 그라데이션(반사 벡터 y 기준)
  envMix?: number;    // env 혼합 비율(0~1)
  irid?: boolean;     // 무지개빛(pearl)
}

const PRESETS: Record<MatcapPreset, Params> = {
  studio: {
    base: [0.55, 0.57, 0.62], light: [-0.5, 0.85, 0.7], ambient: 0.28, diff: 0.72,
    shininess: 40, spec: 0.85, specCol: [1, 1, 1], rim: 0.16, rimCol: [0.82, 0.88, 1], rimPow: 3,
  },
  chrome: {
    base: [1, 1, 1], light: [-0.4, 0.8, 0.6], ambient: 0, diff: 0.08,
    shininess: 220, spec: 1, specCol: [1, 1, 1], rim: 0.1, rimCol: [1, 1, 1], rimPow: 4,
    env: { top: [0.95, 0.97, 1], horizon: [0.34, 0.38, 0.46], bottom: [0.06, 0.07, 0.1] }, envMix: 1,
  },
  gold: {
    base: [1, 0.82, 0.42], light: [-0.4, 0.8, 0.6], ambient: 0.05, diff: 0.2,
    shininess: 120, spec: 0.85, specCol: [1, 0.96, 0.82], rim: 0.12, rimCol: [1, 0.9, 0.6], rimPow: 3,
    env: { top: [1, 0.92, 0.62], horizon: [0.72, 0.48, 0.14], bottom: [0.2, 0.12, 0.03] }, envMix: 1,
  },
  clay: {
    base: [0.82, 0.5, 0.42], light: [-0.45, 0.8, 0.65], ambient: 0.42, diff: 0.62,
    shininess: 4, spec: 0.05, specCol: [1, 0.95, 0.9], rim: 0.1, rimCol: [1, 0.85, 0.75], rimPow: 2,
  },
  pearl: {
    base: [0.75, 0.75, 0.82], light: [-0.5, 0.85, 0.7], ambient: 0.3, diff: 0.55,
    shininess: 60, spec: 0.7, specCol: [1, 1, 1], rim: 0.35, rimCol: [0.7, 0.8, 1], rimPow: 2.5, irid: true,
  },
};

function norm3(v: RGB): RGB {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function clamp01(x: number) { return x < 0 ? 0 : x > 1 ? 1 : x; }
// 선형 → sRGB 근사(감마 2.2). 계산은 선형광, 저장은 sRGB 바이트.
function toSRGB(x: number) { return Math.round(clamp01(Math.pow(clamp01(x), 1 / 2.2)) * 255); }

// 무지개빛(pearl) — 값 t로 부드러운 색상환.
function iridColor(t: number): RGB {
  const a = t * Math.PI * 2;
  return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.cos(a - 2.094), 0.5 + 0.5 * Math.cos(a - 4.188)];
}

function buildMatcap(preset: MatcapPreset, size = 256): THREE.CanvasTexture {
  const p = PRESETS[preset];
  const L = norm3(p.light);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const envMix = p.envMix ?? 0;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let u = (px / (size - 1)) * 2 - 1;
      let v = -((py / (size - 1)) * 2 - 1); // y 뒤집기(조명 위쪽이 위)
      const r2 = u * u + v * v;
      let nz: number;
      if (r2 <= 1) {
        nz = Math.sqrt(1 - r2);
      } else {
        // 원반 밖 — 가장자리(z=0)로 투영해 이음새 없이 채움
        const r = Math.sqrt(r2); u /= r; v /= r; nz = 0;
      }
      const N: RGB = [u, v, nz];
      // 확산
      const nl = Math.max(0, N[0] * L[0] + N[1] * L[1] + N[2] * L[2]);
      // 스페큘러(Blinn-Phong, V=(0,0,1))
      const hx = L[0], hy = L[1], hz = L[2] + 1;
      const hl = Math.hypot(hx, hy, hz) || 1;
      const nh = Math.max(0, (N[0] * hx + N[1] * hy + N[2] * hz) / hl);
      const specT = Math.pow(nh, p.shininess) * p.spec;
      // 프레넬(가장자리)
      const fres = Math.pow(1 - nz, p.rimPow) * p.rim;

      let baseCol = p.base;
      if (p.irid) {
        // pearl — 법선 방향으로 색상환을 살짝 흘림
        const t = 0.55 + N[1] * 0.25 + N[0] * 0.12;
        const ir = iridColor(t);
        baseCol = [0.5 + baseCol[0] * 0.5 * ir[0] * 2, baseCol[1] * ir[1], baseCol[2] * ir[2] + 0.15] as RGB;
      }

      let r = p.ambient * baseCol[0] + p.diff * nl * baseCol[0] + specT * p.specCol[0] + fres * p.rimCol[0];
      let g = p.ambient * baseCol[1] + p.diff * nl * baseCol[1] + specT * p.specCol[1] + fres * p.rimCol[1];
      let b = p.ambient * baseCol[2] + p.diff * nl * baseCol[2] + specT * p.specCol[2] + fres * p.rimCol[2];

      if (p.env && envMix > 0) {
        // 금속 반사 — 반사 벡터 R의 y로 top/horizon/bottom 그라데이션 샘플
        const ry = 2 * N[2] * N[1] - 0; // R.y = 2*(N·V)*N.y - V.y, V=(0,0,1) → 2*N.z*N.y
        const ty = clamp01(ry * 0.5 + 0.5);
        let er: number, eg: number, eb: number;
        if (ty > 0.5) {
          const k = (ty - 0.5) * 2;
          er = p.env.horizon[0] + (p.env.top[0] - p.env.horizon[0]) * k;
          eg = p.env.horizon[1] + (p.env.top[1] - p.env.horizon[1]) * k;
          eb = p.env.horizon[2] + (p.env.top[2] - p.env.horizon[2]) * k;
        } else {
          const k = ty * 2;
          er = p.env.bottom[0] + (p.env.horizon[0] - p.env.bottom[0]) * k;
          eg = p.env.bottom[1] + (p.env.horizon[1] - p.env.bottom[1]) * k;
          eb = p.env.bottom[2] + (p.env.horizon[2] - p.env.bottom[2]) * k;
        }
        r = r * (1 - envMix) + (er + specT * p.specCol[0]) * envMix;
        g = g * (1 - envMix) + (eg + specT * p.specCol[1]) * envMix;
        b = b * (1 - envMix) + (eb + specT * p.specCol[2]) * envMix;
      }

      const i = (py * size + px) * 4;
      d[i] = toSRGB(r); d[i + 1] = toSRGB(g); d[i + 2] = toSRGB(b); d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const cache = new Map<MatcapPreset, THREE.CanvasTexture>();

export function getMatcapTexture(preset: MatcapPreset): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = PRESETS[preset] ? preset : 'studio';
  let t = cache.get(key);
  if (!t) { t = buildMatcap(key); cache.set(key, t); }
  return t;
}
