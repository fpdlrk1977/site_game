// 청크 직렬화 — 기준: doc/BRICK_SYSTEM.md §3.2, §3.5
//
// 저장 단위는 **청크 하나**다. 비어 있지 않은 청크만 저장하므로(희소 저장)
// 무한 맵의 빈 공간은 비용이 0이다.
//
// ★ 셀 배열이 아니라 **브릭 레코드 리스트**를 저장한다.
//   브릭은 여러 셀에 걸치므로(2×4 = 24셀) 셀마다 적으면 24배 낭비다.
//   그래서 마인크래프트식 RLE(셀 배열 전제)는 쓰지 않는다 — 레코드엔 안 맞는다.
//
// ★ 청크 소유권은 **앵커 셀** 기준이다. 브릭이 경계를 넘어가도 앵커가 있는 청크가 갖는다.
//   → 한 청크만 그리면 이웃에서 넘어온 브릭이 빠지므로, 렌더할 땐 이웃 청크도 함께 읽어야 한다(P2).

import {
  CHUNK_X, CHUNK_Y, CHUNK_Z,
  chunkOriginX, chunkOriginY, chunkOriginZ,
  type Rot,
} from './grid';
import { PARTS, type MatClass, type PartId } from './parts';
import { ROT_COUNT } from './rotation';
import type { Brick } from './world';

const MAGIC = 0x42524b; // 'BRK'

/**
 * 저장 버전.
 *   v1 — 팔레트 엔트리 4바이트 `[matClass, r, g, b]`
 *   v2 — 팔레트 엔트리 **5바이트** `[matClass, r, g, b, tex]` (무늬/재료 추가)
 *
 * ★ 무늬를 **브릭 레코드가 아니라 팔레트에** 넣은 이유: 무늬는 색·재질과 거의 항상 함께 다닌다
 *   (잔디 무늬 = 녹색). 팔레트는 조합당 한 번만 적히므로 **브릭이 많아도 저장이 안 커진다.**
 *   브릭 레코드에 1바이트를 더했다면 청크당 최대 8천 바이트가 늘었다.
 *
 * ⚠️ v1도 계속 읽는다 — 이미 저장된 월드가 있다. 읽기 분기를 지우지 말 것.
 */
const VERSION = 2;
const PALETTE_REC_V1 = 4;
const PALETTE_REC = 5;

/** 저장 인덱스 ↔ PartId. **순서를 바꾸면 기존 저장물이 깨진다** — 뒤에만 추가할 것 */
const PART_ORDER: PartId[] = [
  // ↓ 여기까지가 v1 저장물의 인덱스 0~4 — **절대 순서를 바꾸지 말 것**
  'b1x1', 'b1x2', 'b2x2', 'b2x4', 'terrain',
  // ↓ 이후 추가분은 뒤에만 붙인다
  'b1x3', 'b1x4', 'b1x6', 'b1x8', 'b2x3', 'b2x6', 'b2x8',
  'p1x1', 'p1x2', 'p2x2', 'p2x4', 'p2x6',
  's1x2', 's2x2', 'si1x2',
];
const PART_INDEX = new Map<PartId, number>(PART_ORDER.map((p, i) => [p, i]));

/** 저장 인덱스 ↔ 재질군. 같은 규칙(뒤에만 추가) */
const MAT_ORDER: MatClass[] = ['opaque', 'transparent', 'emissive'];
const MAT_INDEX = new Map<MatClass, number>(MAT_ORDER.map((m, i) => [m, i]));

if (PART_ORDER.length !== Object.keys(PARTS).length) {
  throw new Error('serialize: PART_ORDER가 파츠 카탈로그와 어긋남 — 새 파츠는 PART_ORDER 뒤에 추가할 것');
}

/** 브릭 하나의 바이트 수: partId·rot·x·y·z(각 1) + matIdx(2) */
const REC = 7;

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

/** 저장에 필요한 브릭 정보(월드 좌표) */
export interface BrickData {
  part: PartId;
  x: number; y: number; z: number;
  rot: Rot;
  color: string;
  mat: MatClass;
  /** 무늬(재료) 칸 번호 — 0 = 민짜. v1 저장물엔 없어서 0으로 읽힌다 */
  tex?: number;
}

/**
 * 청크 하나를 바이너리로. 좌표는 **청크 상대**로 줄여 1바이트씩만 쓴다.
 *
 * 레이아웃
 *   magic(3) version(1) paletteCount(2) brickCount(2)
 *   palette: [matClass(1), r(1), g(1), b(1)] × paletteCount
 *   bricks : [partIdx(1), rot(1), x(1), y(1), z(1), matIdx(2)] × brickCount
 */
export function encodeChunk(bricks: BrickData[], cx: number, cy: number, cz: number): Uint8Array {
  const ox = chunkOriginX(cx), oy = chunkOriginY(cy), oz = chunkOriginZ(cz);

  // 팔레트 — 같은 (재질군, 색) 조합은 한 번만 적는다. 색을 많이 써도 레코드는 안 커진다.
  const palette: number[] = [];
  const paletteIdx = new Map<string, number>();
  const matIdxOf = (mat: MatClass, color: string, tex: number): number => {
    const key = `${mat}|${color.toLowerCase()}|${tex}`;
    const hit = paletteIdx.get(key);
    if (hit !== undefined) return hit;
    const [r, g, b] = parseHex(color);
    const idx = paletteIdx.size;
    paletteIdx.set(key, idx);
    palette.push(MAT_INDEX.get(mat) ?? 0, r, g, b, tex & 255);
    return idx;
  };

  const recs: number[] = [];
  for (const b of bricks) {
    const lx = b.x - ox, ly = b.y - oy, lz = b.z - oz;
    if (lx < 0 || lx >= CHUNK_X || ly < 0 || ly >= CHUNK_Y || lz < 0 || lz >= CHUNK_Z) {
      throw new Error(`encodeChunk: 앵커가 청크 밖 (${b.x},${b.y},${b.z}) → chunk(${cx},${cy},${cz})`);
    }
    const pi = PART_INDEX.get(b.part);
    if (pi === undefined) throw new Error(`encodeChunk: 모르는 파츠 ${b.part}`);
    const mi = matIdxOf(b.mat, b.color, b.tex ?? 0);
    recs.push(pi, b.rot, lx, ly, lz, mi & 255, (mi >> 8) & 255);
  }

  const paletteCount = paletteIdx.size;
  const out = new Uint8Array(8 + paletteCount * PALETTE_REC + bricks.length * REC);
  const dv = new DataView(out.buffer);
  out[0] = (MAGIC >> 16) & 255; out[1] = (MAGIC >> 8) & 255; out[2] = MAGIC & 255;
  out[3] = VERSION;
  dv.setUint16(4, paletteCount, true);
  dv.setUint16(6, bricks.length, true);
  out.set(palette, 8);
  out.set(recs, 8 + paletteCount * PALETTE_REC);
  return out;
}

/** 바이너리 → 브릭들(월드 좌표 복원) */
export function decodeChunk(data: Uint8Array, cx: number, cy: number, cz: number): BrickData[] {
  if (data.length < 8) throw new Error('decodeChunk: 데이터가 너무 짧음');
  if (data[0] !== ((MAGIC >> 16) & 255) || data[1] !== ((MAGIC >> 8) & 255) || data[2] !== (MAGIC & 255)) {
    throw new Error('decodeChunk: BRK 서명이 아님');
  }
  const ver = data[3];
  // ⚠️ v1도 계속 읽는다 — 이미 저장된 월드가 있다. 다른 점은 **팔레트 엔트리 크기**뿐이다.
  if (ver !== 1 && ver !== VERSION) throw new Error(`decodeChunk: 모르는 버전 ${ver}`);
  const palRec = ver === 1 ? PALETTE_REC_V1 : PALETTE_REC;

  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const paletteCount = dv.getUint16(4, true);
  const brickCount = dv.getUint16(6, true);

  const colors: string[] = [];
  const mats: MatClass[] = [];
  const texes: number[] = [];
  for (let i = 0; i < paletteCount; i++) {
    const o = 8 + i * palRec;
    mats.push(MAT_ORDER[data[o]] ?? 'opaque');
    colors.push(toHex(data[o + 1], data[o + 2], data[o + 3]));
    texes.push(ver === 1 ? 0 : data[o + 4]); // v1 = 무늬 개념이 없다 → 민짜
  }

  const ox = chunkOriginX(cx), oy = chunkOriginY(cy), oz = chunkOriginZ(cz);
  const base = 8 + paletteCount * palRec;
  const out: BrickData[] = [];
  for (let i = 0; i < brickCount; i++) {
    const o = base + i * REC;
    const mi = data[o + 5] | (data[o + 6] << 8);
    // 방향은 1바이트를 통째로 쓴다. 예전엔 `& 3`으로 잘라 **Y축 4방향만** 읽었다 —
    // 세우기(24방향)가 들어오면서 그 마스크가 곧 데이터 손실이 된다.
    // 범위 밖(손상된 파일)은 0으로 떨어뜨린다 — 모르는 값을 접어 넣으면 엉뚱한 방향이 된다.
    const rot = data[o + 1];
    out.push({
      part: PART_ORDER[data[o]] ?? PART_ORDER[0],
      rot: (rot < ROT_COUNT ? rot : 0) as Rot,
      x: ox + data[o + 2],
      y: oy + data[o + 3],
      z: oz + data[o + 4],
      color: colors[mi] ?? '#ffffff',
      mat: mats[mi] ?? 'opaque',
      tex: texes[mi] ?? 0,
    });
  }
  return out;
}

/** Brick(런타임) → BrickData(저장용). id·파생 상태는 저장하지 않는다 */
export function toBrickData(b: Brick): BrickData {
  return { part: b.part, x: b.x, y: b.y, z: b.z, rot: b.rot, color: b.color, mat: b.mat, tex: b.tex };
}

// ── base64 (localStorage용 — DB는 bytea로 그대로 넣는다) ──────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
