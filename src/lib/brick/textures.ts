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

/** 논리 해상도 — 마인크래프트와 같은 16×16 픽셀 아트 */
const ART = 16;

/**
 * ★ **그림의 `y = 0` 줄이 면의 위쪽이다.**
 *
 * 지금까지 그림이 전부 잡티·가로줄이라 위아래가 없었다. 잔디 옆면부터는 **위아래가 생긴다**
 * (풀 띠가 위에 있어야 한다) → 규약을 못 박아 두고, 셰이더가 `v`를 뒤집어 맞춘다
 * (`BrickInstances.tsx`의 `flipArtV`). 그림을 그리는 쪽은 이 규약만 지키면 된다.
 */
export const GRASS_BAND = 3;
/** 칸 하나의 실제 픽셀. 논리 픽셀 하나 = 4×4 (총 256×256) */
const TILE_PX = ART * 4;

// ── ★ 재료(저장값) ≠ 아틀라스 칸(내부) ────────────────────────────────────
//
// 처음엔 둘이 같은 숫자였다(재료 3번 = 아틀라스 3번 칸). 그런데 **면마다 다른 그림**이
// 필요해지면서 그 1:1이 깨졌다 — 잔디 하나가 윗면(잔디)·옆면(흙+풀 띠)·밑면(흙) **세 칸**을 쓴다.
//
//   재료 id  = 사용자가 고르는 것 · **저장되는 값** · append-only
//   아틀라스 = 그림 한 장이 놓인 칸 · **내부 구현** · 마음대로 재배치해도 저장물 안 깨짐
//
// 이 분리 덕에 재료를 늘려도 저장 포맷은 그대로다. 반대로 **합쳐 두면**
// 원목(마구리에 나이테)·화로(앞면만 다름) 같은 걸 넣는 순간 저장값이 흔들린다.

/** 그림 한 장. **아틀라스 칸 번호는 `ART_ORDER`의 위치**로 정해진다 */
export type ArtId =
  | 'plain' | 'grass' | 'dirt' | 'stone' | 'gravel' | 'wood' | 'brick' | 'sand'
  | 'grass_side'
  | 'glass' | 'leaves' | 'log_side' | 'log_top' | 'stone_brick' | 'water';

/**
 * 아틀라스에 굽는 순서 = 칸 번호. **저장값이 아니라서 바꿔도 안전**하지만,
 * 순서를 바꾸면 난수 씨앗이 바뀌어 **그림 모양이 달라진다**(칸 번호로 씨를 만든다).
 * 그래서 기존 8종은 자리를 지키고 새 그림은 **뒤에 붙인다** — 룩 회귀를 막기 위함.
 */
export const ART_ORDER: ArtId[] = [
  'plain', 'grass', 'dirt', 'stone', 'gravel', 'wood', 'brick', 'sand',
  'grass_side',
  'glass', 'leaves', 'log_side', 'log_top', 'stone_brick', 'water',
];

/** 그림 → 아틀라스 칸 번호 */
export function artSlot(art: ArtId): number {
  return ART_ORDER.indexOf(art);
}

/**
 * 그림 수 → 아틀라스 격자 한 변. **정사각 + 2의 거듭제곱으로 올림.**
 *
 *   15장 → 4 (=16칸) · 17장 → 8 (=64칸) · 65장 → 16 (=256칸)
 *
 * ★ 왜 2의 거듭제곱인가: 5×4 같은 **비-2제곱(NPOT)** 텍스처는 WebGL2에서 동작은 하지만
 *   필터링·래핑에 잔가시가 있는 영역이다. 얻는 게 메모리 몇백 KB뿐이라 굳이 밟지 않는다.
 */
export function atlasGridFor(artCount: number): number {
  return 1 << Math.ceil(Math.log2(Math.max(1, Math.ceil(Math.sqrt(artCount)))));
}

/**
 * 아틀라스 격자 — **숫자를 박지 않고 그림 수에서 자동으로 정한다.**
 *
 * ★ **결정 기록과 판단 기준은 `doc/BRICK_SYSTEM.md §8.6`에 있다.**
 *   이 값을 손으로 고정하고 싶어지면 **거기부터 읽고** 조건이 맞는지 따져 볼 것.
 *
 * ★ 자동으로 둔 이유: 칸이 모자라면 그림을 못 늘린다. 늘릴 때마다 상수를 고치는 건
 *   **터질 걸 알면서 놔두는 것**이라 천장 자체를 없앴다. 지금(15장)은 계산 결과가 4×4라 **기존과 동일**하다.
 *
 * ★ 칸이 늘어나는 순간은 **화면에 안 보인다**:
 *   - 그림 모양 — 난수 씨앗이 **칸 번호**에서 나오고 번호는 안 바뀐다 → 그대로
 *   - 저장 — 저장값은 **재료 id**라 칸 배치와 무관
 *   - 셰이더 — 이 상수를 그대로 받아 쓴다(하드코딩 없음)
 *   - 늘어나는 건 VRAM뿐: 4×4 = 256KB → 8×8 = 1MB
 */
const ATLAS_GRID = atlasGridFor(ART_ORDER.length);
export const TEX_COLS = ATLAS_GRID;
export const TEX_ROWS = ATLAS_GRID;

export interface BrickTexture {
  /** **저장되는 값.** 순서를 바꾸면 기존 저장물의 무늬가 뒤바뀐다 — 뒤에만 추가할 것 */
  id: number;
  label: string;
  /** 윗면 그림 */
  top: ArtId;
  /** 옆면 — 생략하면 윗면과 같다 */
  side?: ArtId;
  /** 밑면 — 생략하면 옆면과 같다 */
  bottom?: ArtId;
}

/** ⚠️ **순서 = 저장 값**이다. 중간에 끼워 넣지 말 것 */
export const BRICK_TEXTURES: BrickTexture[] = [
  { id: 0, label: '민짜', top: 'plain' },
  // ★ 잔디만 세 면이 다르다 — 마인크래프트와 같다.
  //   이게 없으면 **땅을 파도 단면에 잔디**가 나온다(잔디가 흙 위에 얹힌 한 겹이라는 게 안 보인다).
  { id: 1, label: '잔디', top: 'grass', side: 'grass_side', bottom: 'dirt' },
  { id: 2, label: '흙', top: 'dirt' },
  { id: 3, label: '돌', top: 'stone' },
  { id: 4, label: '자갈', top: 'gravel' },
  { id: 5, label: '나무', top: 'wood' },
  { id: 6, label: '벽돌', top: 'brick' },
  { id: 7, label: '모래', top: 'sand' },
  // ── 티어 1 (2026-08-02) — `BRICK_PLAN.md` §15 ────────────────────────────
  { id: 8, label: '유리', top: 'glass' },
  { id: 9, label: '나뭇잎', top: 'leaves' },
  // ★ 원목도 면이 갈린다 — **마구리(나이테)는 위아래, 껍질은 옆**. 면별 무늬가 없으면 못 만든다.
  //   기존 '나무'는 가공한 **널(planks)** 이라 별개다(마인크래프트도 원목과 널이 다른 블록).
  { id: 10, label: '원목', top: 'log_top', side: 'log_side', bottom: 'log_top' },
  { id: 11, label: '돌벽돌', top: 'stone_brick' },
  { id: 12, label: '물', top: 'water' },
];

/** 아틀라스가 담을 수 있는 칸 수 — 넘으면 그림이 잘린다(테스트가 지킨다) */
export const ATLAS_CAPACITY = TEX_COLS * TEX_ROWS;

// 지형이 쓰는 재료 — 숫자를 코드에 흩뿌리지 않는다
export const TEX_GRASS = 1;
export const TEX_DIRT = 2;
export const TEX_STONE = 3;

/**
 * 재료 id → **면별 아틀라스 칸** `[윗면, 옆면, 밑면]`.
 *
 * 렌더가 인스턴스마다 이 셋을 넘기고, 셰이더가 **월드 법선**으로 하나를 고른다.
 * (uniform 배열 + 동적 인덱싱 대신 이 방식을 쓴 이유: 인스턴스 속성이 이미 있는 길이라
 *  배선이 한 줄이고, GLSL 버전에 따른 동적 인덱싱 제약을 아예 안 만난다.)
 */
export function faceSlots(texId: number): [number, number, number] {
  const t = BRICK_TEXTURES[texId];
  if (!t) return [0, 0, 0]; // 모르는 재료 = 민짜 (저장물이 앞서가도 안 깨지게)
  const top = artSlot(t.top);
  const side = t.side ? artSlot(t.side) : top;
  const bottom = t.bottom ? artSlot(t.bottom) : side;
  return [top, side, bottom];
}

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
export function buildArt(art: ArtId): string[] {
  const px: string[] = new Array(ART * ART);
  // 씨앗은 **칸 번호**로 만든다 — 기존 8종의 자리를 지키는 한 그림이 그대로 재현된다
  const r = rng(9001 + artSlot(art) * 7919);
  const pick = (shades: string[]) => shades[Math.floor(r() * shades.length)];
  const set = (x: number, y: number, c: string) => { px[y * ART + x] = c; };

  switch (art) {
    case 'grass': { // 잔디 — 초록 명암 + 위쪽에 밝은 결
      const g = ['#5d8c3a', '#6b9c42', '#537f33', '#74a84a'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(g));
      for (let i = 0; i < 26; i++) { // 풀잎 — 세로 두 칸
        const x = Math.floor(r() * ART), y = Math.floor(r() * (ART - 1));
        set(x, y, '#84bb55'); set(x, y + 1, '#6b9c42');
      }
      break;
    }
    case 'dirt': { // 흙 — 갈색 잡티
      const d = ['#6b5233', '#7a5d3b', '#5e482c', '#846449'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(d));
      for (let i = 0; i < 18; i++) set(Math.floor(r() * ART), Math.floor(r() * ART), '#4d3a24'); // 작은 돌
      break;
    }
    case 'stone': { // 돌 — 회색 + 잔금
      const s = ['#7e7e83', '#8a8a8f', '#747479', '#93939a'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(s));
      let cx = Math.floor(r() * ART), cy = Math.floor(r() * ART);
      for (let i = 0; i < 22; i++) { // 갈라진 틈
        set((cx + ART) % ART, (cy + ART) % ART, '#63636a');
        cx += r() < 0.5 ? 1 : 0; cy += r() < 0.6 ? 1 : -1;
      }
      break;
    }
    case 'gravel': { // 자갈 — 덩어리진 돌 + 어두운 줄눈
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
    case 'wood': { // 나무 — 가로 널 + 결
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
    case 'brick': { // 벽돌 — 빨간 벽돌 + 회색 줄눈(엇갈린 층)
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
    case 'sand': { // 모래 — 밝은 노랑 잔알갱이
      const s = ['#ded2a6', '#e6dcb4', '#d3c699'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(s));
      for (let i = 0; i < 14; i++) set(Math.floor(r() * ART), Math.floor(r() * ART), '#c4b788');
      break;
    }
    case 'grass_side': { // 잔디 옆면 — **흙 위에 풀이 얹힌 단면**
      // 흙과 잔디의 팔레트를 그대로 쓴다 — 윗면·밑면과 이어져 보여야 하므로 새 색을 만들지 않는다
      const d = ['#6b5233', '#7a5d3b', '#5e482c', '#846449'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(d));
      for (let i = 0; i < 12; i++) set(Math.floor(r() * ART), Math.floor(r() * ART), '#4d3a24');

      // 풀 띠 — **가장자리를 들쭉날쭉하게.** 자로 그은 직선이면 스티커를 붙여 놓은 것처럼 보인다
      // (마인크래프트도 이 경계를 일부러 흐트러뜨린다).
      const g = ['#5d8c3a', '#6b9c42', '#537f33', '#74a84a'];
      for (let x = 0; x < ART; x++) {
        const h = GRASS_BAND + Math.floor(r() * 3); // 3~5칸
        for (let y = 0; y < h; y++) set(x, y, pick(g));
      }
      break;
    }
    case 'glass': { // 유리 — 창틀 + 반사光. **반투명 재질과 함께 쓰라고 만든 그림**
      const pane = '#eaf6fa';
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pane);
      const frame = '#b3d2dc', inner = '#d2e7ee';
      for (let i = 0; i < ART; i++) {
        set(i, 0, frame); set(i, ART - 1, frame); set(0, i, frame); set(ART - 1, i, frame);
      }
      for (let i = 1; i < ART - 1; i++) {
        set(i, 1, inner); set(i, ART - 2, inner); set(1, i, inner); set(ART - 2, i, inner);
      }
      for (let k = 0; k < 6; k++) { // 대각선 반사 — 유리로 읽히게 하는 결정적 요소
        set(3 + k, 11 - k, '#ffffff'); set(4 + k, 11 - k, '#ffffff');
      }
      break;
    }
    case 'leaves': { // 나뭇잎 — 잔디보다 짙고, 틈이 뚫려 성기다
      const g = ['#3f6f2b', '#4b8134', '#356024', '#57933b'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(g));
      for (let i = 0; i < 34; i++) set(Math.floor(r() * ART), Math.floor(r() * ART), '#24401a'); // 잎 사이 틈
      for (let i = 0; i < 16; i++) set(Math.floor(r() * ART), Math.floor(r() * ART), '#6aa847'); // 밝은 잎끝
      break;
    }
    case 'log_side': { // 원목 껍질 — **세로** 결
      const b = ['#6b4f2f', '#5c4327', '#775837'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, b[(x >> 1) % b.length]);
      for (let i = 0; i < 20; i++) { // 갈라진 골
        const x = Math.floor(r() * ART), y0 = Math.floor(r() * (ART - 4));
        const len = 3 + Math.floor(r() * 6);
        for (let y = y0; y < Math.min(ART, y0 + len); y++) set(x, y, '#463320');
      }
      for (let i = 0; i < 10; i++) { // 도드라진 결
        const x = Math.floor(r() * ART), y = Math.floor(r() * ART);
        set(x, y, '#8a683f');
      }
      break;
    }
    case 'log_top': { // 원목 마구리 — 나이테 + 바깥 껍질 테
      const light = '#b58c57', mid = '#a67c48', bark = '#5c4327';
      const c = (ART - 1) / 2;
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) {
        const dist = Math.hypot(x - c, y - c);
        set(x, y, dist > 7.1 ? bark : Math.floor(dist / 1.6) % 2 ? mid : light);
      }
      set(Math.round(c), Math.round(c), '#7a5732'); // 심재
      break;
    }
    case 'stone_brick': { // 돌벽돌 — 반듯하게 자른 돌. '돌'(자연석)과 달리 줄눈이 곧다
      const s = ['#8d8d88', '#82827d', '#979792'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(s));
      const M = '#5f5f5b';
      for (let i = 0; i < ART; i++) { set(i, 7, M); set(i, ART - 1, M); set(7, i, M); set(ART - 1, i, M); }
      break;
    }
    case 'water': { // 물 — 잔물결. **반투명 재질과 함께**
      const w = ['#3f74b0', '#4a82c0', '#35659a'];
      for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) set(x, y, pick(w));
      for (let k = 0; k < 5; k++) { // 가로로 흐르는 물결
        const y0 = 1 + k * 3;
        for (let x = 0; x < ART; x++) {
          const y = y0 + (Math.sin((x + k * 3) * 0.7) > 0.3 ? 1 : 0);
          if (y < ART) set(x, y, '#78aede');
        }
      }
      break;
    }
    default: // 민짜 — 흰색(= 색 그대로)
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
  // ★ **재료가 아니라 그림 단위로 굽는다.** 잔디처럼 한 재료가 칸 여러 개를 쓰기 때문에
  //   `BRICK_TEXTURES`를 돌면 옆면 그림이 아예 안 구워진다(화면엔 흰 면으로 나온다).
  for (let slot = 0; slot < ART_ORDER.length; slot++) {
    const ox = (slot % TEX_COLS) * TILE_PX;
    const oy = Math.floor(slot / TEX_COLS) * TILE_PX;
    const art = buildArt(ART_ORDER[slot]);
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
