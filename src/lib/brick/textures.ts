// 브릭 무늬(재료) — **한 장의 아틀라스**에 전부 담는다.
//
// ★★ 왜 한 장인가: 재료마다 다른 텍스처를 쓰면 재질이 갈려 **draw call이 재료 수만큼 늘어난다.**
//    한 장에 모아 두고 "몇 번 칸을 쓸지"만 인스턴스 속성으로 넘기면 **draw call이 안 늘어난다.**
//
// ★ **컬러 픽셀 아트**다 (16×16 논리 픽셀).
//   처음엔 흑백 명암으로 만들고 "색은 팔레트에서 곱한다"로 갔는데, 그러면 **마인크래프트 룩이 안 나온다** —
//   잔디는 초록 명암, 벽돌은 빨강 벽돌 + 회색 줄눈, 나무는 갈색 결처럼 **재료마다 고유한 색 관계**가 있고
//   흑백 한 채널로는 그걸 못 담는다. 밋밋한 잡티로만 보였다(사용자 피드백).
//   → 재료가 **자기 색을 갖는다.** 팔레트 색은 그 위에 곱해지는 **틴트**로 쓴다(기본 흰색 = 원래 색).
//
// ★ 절차적으로 굽는다 — 이미지 파일이 없으니 에셋 파이프라인·라이선스가 안 붙고,
//   숫자를 고치면 즉시 반영된다. 아틀라스는 **내부 구현**이라 나중에 이미지로 갈아끼워도
//   저장된 데이터(칸 번호)는 안 깨진다.

import * as THREE from 'three';

/** 아틀라스 격자 — 4×4 = 16칸(지금 8칸 사용, 나머지는 여유) */
export const TEX_COLS = 4;
export const TEX_ROWS = 4;
/** 논리 해상도 — 마인크래프트와 같은 16×16 픽셀 아트 */
const ART = 16;
/** 칸 하나의 실제 픽셀. 논리 픽셀 하나 = 4×4 (총 256×256) */
const TILE_PX = ART * 4;

export interface BrickTexture {
  /** **저장되는 값.** 순서를 바꾸면 기존 저장물의 무늬가 뒤바뀐다 — 뒤에만 추가할 것 */
  id: number;
  label: string;
}

/** ⚠️ **순서 = 저장 값**이다. 중간에 끼워 넣지 말 것 */
export const BRICK_TEXTURES: BrickTexture[] = [
  { id: 0, label: '민짜' },
  { id: 1, label: '잔디' },
  { id: 2, label: '흙' },
  { id: 3, label: '돌' },
  { id: 4, label: '자갈' },
  { id: 5, label: '나무' },
  { id: 6, label: '벽돌' },
  { id: 7, label: '모래' },
];

export const MAX_TEXTURE_ID = TEX_COLS * TEX_ROWS - 1;

// 지형이 쓰는 무늬 — 숫자를 코드에 흩뿌리지 않는다
export const TEX_GRASS = 1;
export const TEX_DIRT = 2;
export const TEX_STONE = 3;

/** 결정적 난수 — 세션마다 무늬가 달라지면 스크린샷 비교가 안 된다 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 재료 하나의 **16×16 색 격자**를 만든다.
 *
 * 픽셀 아트라 명암 단계를 3~4개로 **또렷하게** 나눈다 — 단계를 잘게 쪼개면
 * 멀리서 뭉개져 그냥 단색으로 보인다(마인크래프트가 단계를 적게 쓰는 이유).
 */
export function buildArt(id: number): string[] {
  const px: string[] = new Array(ART * ART);
  const r = rng(9001 + id * 7919);
  const pick = (shades: string[]) => shades[Math.floor(r() * shades.length)];
  const set = (x: number, y: number, c: string) => { px[y * ART + x] = c; };

  switch (id) {
    case 1: { // 잔디 — 초록 명암 + 위쪽에 밝은 결
      const g = ['#5d8c3a', '#6b9c42', '#537f33', '#74a84a'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(g));
      for (let i = 0; i < 26; i++) { // 풀잎 — 세로 두 칸
        const x = Math.floor(r() * ART), y = Math.floor(r() * (ART - 1));
        set(x, y, '#84bb55'); set(x, y + 1, '#6b9c42');
      }
      break;
    }
    case 2: { // 흙 — 갈색 잡티
      const d = ['#6b5233', '#7a5d3b', '#5e482c', '#846449'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(d));
      for (let i = 0; i < 18; i++) set(Math.floor(r() * ART), Math.floor(r() * ART), '#4d3a24'); // 작은 돌
      break;
    }
    case 3: { // 돌 — 회색 + 잔금
      const s = ['#7e7e83', '#8a8a8f', '#747479', '#93939a'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(s));
      let cx = Math.floor(r() * ART), cy = Math.floor(r() * ART);
      for (let i = 0; i < 22; i++) { // 갈라진 틈
        set((cx + ART) % ART, (cy + ART) % ART, '#63636a');
        cx += r() < 0.5 ? 1 : 0; cy += r() < 0.6 ? 1 : -1;
      }
      break;
    }
    case 4: { // 자갈 — 덩어리진 돌 + 어두운 줄눈
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, '#5a5a60'); // 줄눈
      const blob = ['#8f8f96', '#9c9ca3', '#82828a', '#a8a8b0'];
      for (let i = 0; i < 12; i++) {
        const bx = Math.floor(r() * ART), by = Math.floor(r() * ART);
        const w = 2 + Math.floor(r() * 3), h = 2 + Math.floor(r() * 3);
        const c = pick(blob);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          set((bx + x) % ART, (by + y) % ART, r() < 0.75 ? c : pick(blob));
        }
      }
      break;
    }
    case 5: { // 나무 — 가로 널 + 결
      const w1 = ['#a97b4f', '#b48557', '#9d7146'];
      for (let y = 0; y < ART; y++) {
        const board = Math.floor(y / 4);
        const base = w1[board % w1.length];
        for (let x = 0; x < ART; x++) set(x, y, r() < 0.22 ? '#93683f' : base);
        if (y % 4 === 3) for (let x = 0; x < ART; x++) set(x, y, '#6f4f2f'); // 널 사이 홈
      }
      for (let i = 0; i < 10; i++) { // 옹이
        const x = Math.floor(r() * ART), y = Math.floor(r() * ART);
        if (y % 4 !== 3) set(x, y, '#7d5936');
      }
      break;
    }
    case 6: { // 벽돌 — 빨간 벽돌 + 회색 줄눈(엇갈린 층)
      const b = ['#b4553f', '#c25f47', '#a44c38'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(b));
      const MORTAR = '#c9c2b8';
      for (let y = 3; y < ART; y += 4) for (let x = 0; x < ART; x++) set(x, y, MORTAR); // 가로 줄눈
      for (let row = 0; row < 4; row++) {
        const shift = row % 2 === 0 ? 0 : 4;
        for (let k = 0; k < 2; k++) {
          const x = (shift + k * 8) % ART;
          for (let y = row * 4; y < row * 4 + 3; y++) set(x, y, MORTAR); // 세로 줄눈
        }
      }
      break;
    }
    case 7: { // 모래 — 밝은 노랑 잔알갱이
      const s = ['#ded2a6', '#e6dcb4', '#d3c699'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(s));
      for (let i = 0; i < 14; i++) set(Math.floor(r() * ART), Math.floor(r() * ART), '#c4b788');
      break;
    }
    default: // 0 = 민짜 — 흰색(= 색 그대로)
      for (let i = 0; i < ART * ART; i++) px[i] = '#ffffff';
  }
  return px;
}

let cached: THREE.CanvasTexture | null = null;

/**
 * 아틀라스 텍스처 — **한 번만 굽고 계속 쓴다.**
 *
 * ⚠️ 밉맵을 안 만든다. 4×4 아틀라스에서 밉맵을 켜면 상위 레벨에서 **옆 칸이 번져 섞인다**
 *   (칸 사이 여백을 두거나 텍스처 배열을 써야 하는데, 지금 규모엔 과하다).
 *   대신 멀리서 약간 지글거릴 수 있다 — 안개가 46m에서 잠기므로 실사용에선 잘 안 보인다.
 */
export function getBrickAtlas(): THREE.CanvasTexture {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TEX_COLS * TILE_PX;
  canvas.height = TEX_ROWS * TILE_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const S = TILE_PX / ART; // 논리 픽셀 한 칸의 실제 크기
  for (const t of BRICK_TEXTURES) {
    const ox = (t.id % TEX_COLS) * TILE_PX;
    const oy = Math.floor(t.id / TEX_COLS) * TILE_PX;
    const art = buildArt(t.id);
    for (let y = 0; y < ART; y++) {
      for (let x = 0; x < ART; x++) {
        ctx.fillStyle = art[y * ART + x];
        ctx.fillRect(ox + x * S, oy + y * S, S, S);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  // ★★ **반드시 꺼야 한다.** three는 `flipY = true`가 기본이라(GL 텍스처 원점이 좌하단)
  //   캔버스 **맨 윗줄이 v=1**이 된다. 그런데 아틀라스 좌표는 `v = (행 + f) / 행수`로
  //   **안 뒤집힌 기준**으로 계산한다 → 0~3번 칸이 3행을, 4~7번 칸이 2행을 샘플링해서
  //   **안 그린 빈 영역(흰색)** 이 나왔다. 화면엔 "무늬가 아예 안 먹는 것"으로 보인다.
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; // 픽셀 아트가 또렷하게
  tex.minFilter = THREE.LinearFilter;  // 밉맵 없음(위 주석)
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
