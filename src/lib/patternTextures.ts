// 절차적 흑백 패턴 텍스처 — 이미지 없이 맵을 테스트/사용할 수 있게 내장 프리셋 제공.
//   같은 패턴(높이 필드)을 'gray'(흑백)로 굽거나 'normal'(노멀맵)로 변환해 쓴다.
//   Roughness/Metalness/AO/Displacement = gray, Normal = normal 자동 선택(로더가 슬롯별로 mode 지정).
//   URL 스킴 `pattern:<id>` 로 material.*Url 에 저장(에셋/스토리지 불필요, scene JSON 비대화 없음).
import * as THREE from 'three';

export type PatternId = 'checker' | 'dots' | 'noise' | 'brick' | 'stripes' | 'cells';

export const PATTERN_PRESETS: { id: PatternId; label: string }[] = [
  { id: 'checker', label: 'Checker' },
  { id: 'dots', label: 'Dots' },
  { id: 'noise', label: 'Noise' },
  { id: 'brick', label: 'Brick' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'cells', label: 'Cells' },
];

const SIZE = 256;

// 값 노이즈(부드러운 랜덤) — 격자 해시 + 스무스 보간
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(t: number): number { return t * t * (3 - 2 * t); }
function valueNoise(u: number, v: number, freq: number): number {
  const x = u * freq, y = v * freq;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  const sx = smooth(xf), sy = smooth(yf);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// 각 패턴의 높이(0..1) — u,v ∈ [0,1)
function heightAt(id: PatternId, u: number, v: number): number {
  switch (id) {
    case 'checker': {
      const n = 8;
      return ((Math.floor(u * n) + Math.floor(v * n)) % 2 === 0) ? 1 : 0;
    }
    case 'dots': {
      const n = 6;
      const fx = (u * n) % 1 - 0.5, fy = (v * n) % 1 - 0.5;
      const d = Math.sqrt(fx * fx + fy * fy);
      return d < 0.32 ? 1 : 0.15; // 볼록한 점
    }
    case 'noise': {
      // 여러 옥타브 합성(그런지)
      let h = 0, amp = 0.6, f = 4;
      for (let o = 0; o < 4; o++) { h += valueNoise(u, v, f) * amp; amp *= 0.5; f *= 2; }
      return Math.max(0, Math.min(1, h));
    }
    case 'brick': {
      const rows = 6;
      const row = Math.floor(v * rows);
      const offset = row % 2 === 0 ? 0 : 0.5;
      const cols = 3;
      const bx = (u * cols + offset) % 1;
      const by = (v * rows) % 1;
      const mortar = 0.08;
      const inBrick = bx > mortar && bx < 1 - mortar && by > mortar && by < 1 - mortar;
      return inBrick ? 1 : 0; // 벽돌=높음, 줄눈=낮음
    }
    case 'stripes': {
      const n = 10;
      return (Math.floor(v * n) % 2 === 0) ? 1 : 0.1;
    }
    case 'cells': {
      // 격자점 최근접 거리(보로노이) → 셀 경계는 어둡게
      const n = 5;
      const gx = u * n, gy = v * n;
      const cx = Math.floor(gx), cy = Math.floor(gy);
      let best = 1e9;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const px = cx + ox + hash(cx + ox, cy + oy);
        const py = cy + oy + hash(cx + ox + 5.2, cy + oy + 1.3);
        const dx = gx - px, dy = gy - py;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) best = d;
      }
      return Math.min(1, best); // 셀 중심=밝음, 경계=어두움
    }
  }
}

const canvasCache = new Map<string, HTMLCanvasElement>();

function buildCanvas(id: PatternId, mode: 'gray' | 'normal'): HTMLCanvasElement {
  const key = `${id}:${mode}`;
  const cached = canvasCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  const at = (px: number, py: number) => heightAt(id, ((px % SIZE) + SIZE) % SIZE / SIZE, ((py % SIZE) + SIZE) % SIZE / SIZE);
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const i = (py * SIZE + px) * 4;
      if (mode === 'gray') {
        const h = Math.round(heightAt(id, px / SIZE, py / SIZE) * 255);
        d[i] = d[i + 1] = d[i + 2] = h; d[i + 3] = 255;
      } else {
        // 노멀맵 — 높이 기울기(sobel 근사)로 접선공간 법선 계산 → RGB 인코딩
        const s = 2.5; // 요철 강도
        const dx = (at(px + 1, py) - at(px - 1, py)) * s;
        const dy = (at(px, py + 1) - at(px, py - 1)) * s;
        let nx = -dx, ny = -dy, nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;
        d[i] = Math.round((nx * 0.5 + 0.5) * 255);
        d[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        d[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  canvasCache.set(key, canvas);
  return canvas;
}

// 캔버스는 캐시(픽셀 생성 1회), 텍스처는 사용처마다 새로(repeat가 인스턴스마다 독립).
export function makePatternTexture(id: PatternId, mode: 'gray' | 'normal'): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (!PATTERN_PRESETS.some((p) => p.id === id)) return null;
  const tex = new THREE.CanvasTexture(buildCanvas(id, mode));
  tex.colorSpace = THREE.NoColorSpace; // 데이터·노멀 둘 다 비색상
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.channel = 0;
  tex.needsUpdate = true;
  return tex;
}

export const PATTERN_PREFIX = 'pattern:';
export function isPatternUrl(url: string | undefined): url is string {
  return !!url && url.startsWith(PATTERN_PREFIX);
}
export function patternIdOf(url: string): PatternId {
  return url.slice(PATTERN_PREFIX.length) as PatternId;
}
