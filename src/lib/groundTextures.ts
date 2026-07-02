import * as THREE from 'three';

// ── Value noise ─────────────────────────────────────────────────────────────
const _h = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
function vn(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const [fx, fy] = [s(xf), s(yf)];
  return (
    _h(xi, yi) * (1 - fx) * (1 - fy) +
    _h(xi + 1, yi) * fx * (1 - fy) +
    _h(xi, yi + 1) * (1 - fx) * fy +
    _h(xi + 1, yi + 1) * fx * fy
  );
}
function fbm(x: number, y: number, oct = 4): number {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * vn(x * f, y * f); a *= 0.5; f *= 2; }
  return v;
}

// ── Deterministic RNG ───────────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}

// ── Normal map from luminance ───────────────────────────────────────────────
function buildNormalMap(src: Uint8ClampedArray, w: number, h: number, strength = 5): THREE.CanvasTexture {
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(w, h);

  const lum = (x: number, y: number) => {
    const xi = Math.max(0, Math.min(w - 1, x));
    const yi = Math.max(0, Math.min(h - 1, y));
    const i = (yi * w + xi) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        (lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1)) -
        (lum(x - 1, y - 1) + 2 * lum(x - 1, y) + lum(x - 1, y + 1));
      const dy =
        (lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1)) -
        (lum(x - 1, y - 1) + 2 * lum(x, y - 1) + lum(x + 1, y - 1));
      const nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const i = (y * w + x) * 4;
      img.data[i] =     ((nx / len) * 0.5 + 0.5) * 255 | 0;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255 | 0;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255 | 0;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeTex(canvas: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

// ── Return type ─────────────────────────────────────────────────────────────
export interface GroundTexSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughness: number;
  metalness: number;
}

// ── Grass ────────────────────────────────────────────────────────────────────
function buildGrass(S: number): GroundTexSet {
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);

  // Base: layered green noise
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n  = fbm(x / S * 9, y / S * 9, 5);
      const n2 = vn(x / S * 30, y / S * 30) * 0.3;
      const v  = n * 0.7 + n2 * 0.3;
      const i  = (y * S + x) * 4;
      img.data[i]     = (22  + v * 28)  | 0;
      img.data[i + 1] = (72  + v * 65)  | 0;
      img.data[i + 2] = (8   + v * 18)  | 0;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Grass blades — curved strokes at varied angles and greens
  const r = makeRng(31415);
  ctx.save();
  for (let i = 0; i < 12000; i++) {
    const x = r() * S, y = r() * S;
    const len   = 2 + r() * 8;
    const angle = -Math.PI / 2 + (r() - 0.5) * 1.5;
    const gv    = 68 + r() * 95;
    const dead  = r() < 0.09; // dry/dead grass
    ctx.globalAlpha = 0.55 + r() * 0.45;
    ctx.strokeStyle = dead
      ? `rgb(${gv * 1.15 | 0},${gv * 0.82 | 0},${12})`
      : `rgb(${gv * 0.32 | 0},${gv | 0},${gv * 0.08 | 0})`;
    ctx.lineWidth = 0.3 + r() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(angle + 0.35) * len * 0.55,
      y + Math.sin(angle + 0.35) * len * 0.55,
      x + Math.cos(angle) * len,
      y + Math.sin(angle) * len,
    );
    ctx.stroke();
  }
  ctx.restore();

  const raw = ctx.getImageData(0, 0, S, S).data;
  const REPEAT = 48;
  const map = makeTex(canvas, REPEAT);
  const normalMap = buildNormalMap(raw, S, S, 3.5);
  normalMap.repeat.set(REPEAT, REPEAT);
  return { map, normalMap, roughness: 0.92, metalness: 0 };
}

// ── Dirt ─────────────────────────────────────────────────────────────────────
function buildDirt(S: number): GroundTexSet {
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n  = fbm(x / S * 10, y / S * 10, 5);
      const n2 = vn(x / S * 22, y / S * 22);
      const n3 = vn(x / S * 5, y / S * 5) * 0.4;
      const v  = n * 0.5 + n2 * 0.3 + n3 * 0.2;
      const i  = (y * S + x) * 4;
      img.data[i]     = (88  + v * 58) | 0;
      img.data[i + 1] = (53  + v * 32) | 0;
      img.data[i + 2] = (18  + v * 16) | 0;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Pebbles
  const r = makeRng(27182);
  for (let i = 0; i < 280; i++) {
    const px = r() * S, py = r() * S;
    const rad = 0.8 + r() * 3.5;
    const gv  = 75 + r() * 65;
    ctx.fillStyle = `rgba(${gv | 0},${gv * 0.88 | 0},${gv * 0.75 | 0},${0.7 + r() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(px, py, rad, rad * (0.65 + r() * 0.35), r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Leaf/organic patches
  for (let i = 0; i < 80; i++) {
    const px = r() * S, py = r() * S;
    const size = 3 + r() * 8;
    ctx.globalAlpha = 0.25 + r() * 0.3;
    ctx.fillStyle = `rgb(${35 + r() * 30 | 0},${55 + r() * 30 | 0},${10})`;
    ctx.beginPath();
    ctx.ellipse(px, py, size, size * 0.5, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const raw = ctx.getImageData(0, 0, S, S).data;
  const REPEAT = 32;
  const map = makeTex(canvas, REPEAT);
  const normalMap = buildNormalMap(raw, S, S, 4.5);
  normalMap.repeat.set(REPEAT, REPEAT);
  return { map, normalMap, roughness: 0.97, metalness: 0 };
}

// ── Sand ─────────────────────────────────────────────────────────────────────
function buildSand(S: number): GroundTexSet {
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n      = fbm(x / S * 11, y / S * 11, 4);
      // Wind ripple pattern
      const ripple = Math.sin((x / S * 140) + (y / S * 18) + n * 9) * 0.07
                   + Math.sin((x / S * 60)  - (y / S * 8)  + n * 5) * 0.04;
      const v = n * 0.6 + ripple + 0.38;
      const i = (y * S + x) * 4;
      img.data[i]     = Math.min(255, (190 + v * 52) | 0);
      img.data[i + 1] = Math.min(255, (162 + v * 46) | 0);
      img.data[i + 2] = Math.min(255, (98  + v * 36) | 0);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Fine grain specks
  const r = makeRng(16180);
  for (let i = 0; i < 500; i++) {
    const px = r() * S, py = r() * S;
    const v  = 120 + r() * 80;
    ctx.fillStyle = `rgba(${v|0},${v*0.88|0},${v*0.6|0},0.5)`;
    ctx.fillRect(px, py, 1, 1);
  }

  const raw = ctx.getImageData(0, 0, S, S).data;
  const REPEAT = 40;
  const map = makeTex(canvas, REPEAT);
  const normalMap = buildNormalMap(raw, S, S, 5.5);
  normalMap.repeat.set(REPEAT, REPEAT);
  return { map, normalMap, roughness: 0.86, metalness: 0 };
}

// ── Stone (cobblestone) ──────────────────────────────────────────────────────
function buildStone(S: number): GroundTexSet {
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  // Mortar background
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, S, S);

  const r = makeRng(57721);
  const ROWS = 10, COLS = 14;
  const CW = S / COLS, CH = S / ROWS;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const offset = (row % 2) * CW * 0.5;
      const cx = (col + 0.5) * CW + offset + (r() - 0.5) * CW * 0.18;
      const cy = (row + 0.5) * CH + (r() - 0.5) * CH * 0.18;
      const sw = CW * (0.68 + r() * 0.14) - 3;
      const sh = CH * (0.68 + r() * 0.14) - 3;
      const gvBase = 78 + r() * 72;
      const warm = r() < 0.3; // some stones slightly warm/cool
      const rv = warm ? gvBase * (0.95 + r() * 0.08) : gvBase * (0.82 + r() * 0.12);
      const gv = gvBase * (0.88 + r() * 0.08);
      const bv = warm ? gvBase * (0.72 + r() * 0.10) : gvBase * (0.90 + r() * 0.08);

      const rad = Math.min(sw, sh) * 0.18;
      ctx.fillStyle = `rgb(${rv|0},${gv|0},${bv|0})`;
      ctx.beginPath();
      ctx.moveTo(cx - sw / 2 + rad, cy - sh / 2);
      ctx.lineTo(cx + sw / 2 - rad, cy - sh / 2);
      ctx.arcTo(cx + sw / 2, cy - sh / 2, cx + sw / 2, cy - sh / 2 + rad, rad);
      ctx.lineTo(cx + sw / 2, cy + sh / 2 - rad);
      ctx.arcTo(cx + sw / 2, cy + sh / 2, cx + sw / 2 - rad, cy + sh / 2, rad);
      ctx.lineTo(cx - sw / 2 + rad, cy + sh / 2);
      ctx.arcTo(cx - sw / 2, cy + sh / 2, cx - sw / 2, cy + sh / 2 - rad, rad);
      ctx.lineTo(cx - sw / 2, cy - sh / 2 + rad);
      ctx.arcTo(cx - sw / 2, cy - sh / 2, cx - sw / 2 + rad, cy - sh / 2, rad);
      ctx.closePath();
      ctx.fill();

      // Top-light bevel
      const grad = ctx.createLinearGradient(cx, cy - sh / 2, cx, cy + sh / 2);
      grad.addColorStop(0,   'rgba(255,255,255,0.20)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0.05)');
      grad.addColorStop(1,   'rgba(0,0,0,0.22)');
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  const raw = ctx.getImageData(0, 0, S, S).data;
  const REPEAT = 22;
  const map = makeTex(canvas, REPEAT);
  const normalMap = buildNormalMap(raw, S, S, 7);
  normalMap.repeat.set(REPEAT, REPEAT);
  return { map, normalMap, roughness: 0.80, metalness: 0.06 };
}

// ── Cache & export ───────────────────────────────────────────────────────────
const _cache = new Map<string, GroundTexSet>();

export function getGroundTexture(type: string): GroundTexSet {
  if (_cache.has(type)) return _cache.get(type)!;
  const S = 512;
  let result: GroundTexSet;
  switch (type) {
    case 'grass': result = buildGrass(S); break;
    case 'dirt':  result = buildDirt(S);  break;
    case 'sand':  result = buildSand(S);  break;
    case 'stone': result = buildStone(S); break;
    default:      result = buildGrass(S);
  }
  _cache.set(type, result);
  return result;
}
