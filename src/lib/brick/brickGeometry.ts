// 브릭 메시 생성 — 기준: doc/BRICK_SYSTEM.md §4.2
//
// ★ 폴리곤 예산이 이 프로젝트 최대 리스크다. 브릭은 큐브(12삼각형)의 3~17배다.
//   그래서 파츠마다 **스터드 有/無 두 변형**을 만들어 두고, 위가 완전히 덮인 브릭은
//   無 변형을 쓴다(스터드 컬링). 쌓아올린 구조물은 대부분의 스터드가 가려진다.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CELL_X, CELL_Y, CELL_Z } from './grid';
import type { BrickPart } from './parts';

// 실제 레고 비율 유지 (스터드 지름 4.8mm · 높이 1.8mm · 간격 8mm)
const STUD_R = (2.4 / 8) * CELL_X;
const STUD_H = (1.8 / 8) * CELL_X;
/** 스터드 원통 분할 수 — 저폴리. 8각이면 옆면 16삼각형 + 윗뚜껑 6 = 22 */
const STUD_SEG = 8;

/**
 * 돌기 모양 — 시각적 차별화 수단(기준: doc/BRICK_SYSTEM.md §8.5).
 *   round: 민짜 원기둥(레고와 동일) · ring: 가운데가 뚫린 링 · hex: 육각
 * ★ 저장 포맷엔 `partId`만 들어가고 메시는 코드에 있으므로, 나중에 바꿔도 기존 월드가 안 깨진다.
 */
export type StudStyle = 'round' | 'ring' | 'hex' | 'none' | 'line';

export const STUD_STYLES: { id: StudStyle; label: string; note: string }[] = [
  { id: 'round', label: '원형', note: '민짜 원기둥 — 레고와 동일 (돌기당 32삼각형)' },
  { id: 'ring', label: '링', note: '가운데가 뚫림 — 위에서 가장 확실히 구별 (48)' },
  { id: 'hex', label: '육각', note: '각진 단면 — 가까이서만 구별, 더 가볍다 (24)' },
  { id: 'none', label: '모따기', note: '돌기 제거 + 모따기 (108) — 가려져도 그대로라 밀집 구조에선 총량이 오히려 늘어난다' },
  { id: 'line', label: '라인', note: '돌기 제거 + 셰이더 외곽선 (12) — 가장 가볍고, 확대/축소해도 선 두께가 일정하다' },
];

/**
 * 모따기 폭. 돌기가 없으면 같은 색 벽이 한 덩어리로 보여 브릭 경계가 안 읽힌다.
 * 모따기는 장식이 아니라 **개별 부품을 구분해 보이게 하는 기능**이다.
 *
 * ⚠️ 비용: `RoundedBoxGeometry(seg=1)`는 **108삼각형**(민짜 상자 12의 9배)이고,
 *   돌기가 없으니 **가려진 브릭도 줄어들 데가 없다**(돌기형은 가려지면 12로 떨어진다).
 *   → 밀집 구조에선 원형 돌기보다 총 삼각형이 **더 많아진다**. 성능이 아니라 룩·IP를 위한 선택이다.
 */
const BEVEL = CELL_Y * 0.15;

/** 돌기 하나의 지오메트리 (원점 = 밑면 중심) */
function studGeometry(style: StudStyle): THREE.BufferGeometry {
  if (style === 'hex') {
    const g = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 6);
    g.translate(0, STUD_H / 2, 0);
    return g;
  }
  if (style === 'ring') {
    // 바깥벽 → 윗면(도넛) → 안쪽벽. 밑면은 브릭 안이라 안 만든다(보이지 않음).
    const rIn = STUD_R * 0.55;
    const g = new THREE.LatheGeometry(
      [
        new THREE.Vector2(STUD_R, 0),
        new THREE.Vector2(STUD_R, STUD_H),
        new THREE.Vector2(rIn, STUD_H),
        new THREE.Vector2(rIn, 0),
      ],
      STUD_SEG,
    );
    return g;
  }
  const g = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, STUD_SEG);
  g.translate(0, STUD_H / 2, 0);
  return g;
}

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * 파츠 메시. 원점은 AABB **중심** — 인스턴스 행렬이 중심 기준으로 놓기 때문.
 * withStuds=false면 박스만(12삼각형).
 */
/**
 * 쐐기(경사) — 삼각기둥. 단면은 **Z–Y 평면**의 직각삼각형이고 X로 밀어낸다.
 *
 * `slope`     : 높은 쪽이 **−Z**, +Z로 갈수록 낮아진다(지붕 경사)
 * `slopeInv`  : 그 반대로 **아랫면이 깎인** 모양(처마·계단 밑 마감)
 *
 * ★ 돌기(스터드)는 붙이지 않는다 — 비스듬한 면에 원기둥을 세우면 레고에도 없는 모양이 되고,
 *   폴리곤만 는다. 대신 **6면(삼각기둥) = 8삼각형**으로 아주 가볍다.
 */
function wedgeGeometry(w: number, h: number, d: number, inverted: boolean): THREE.BufferGeometry {
  const x0 = -w / 2, x1 = w / 2;
  const y0 = -h / 2, y1 = h / 2;
  const z0 = -d / 2, z1 = d / 2;

  // 단면(z,y) 삼각형 — 시계 반대 방향으로 잡아야 앞면이 밖을 본다
  //   slope    : (z0,y1) 높은 쪽 → (z1,y0) 낮은 쪽 → (z0,y0) 바닥 안쪽
  //   slopeInv : 위가 꽉 차고 **아래가 깎인다** — (z0,y1) → (z1,y1) → (z1,y0)
  const tri: [number, number][] = inverted
    ? [[z0, y1], [z1, y1], [z1, y0]]
    : [[z0, y1], [z1, y0], [z0, y0]];

  const pos: number[] = [];
  const nrm: number[] = [];
  const push = (ax: number, ay: number, az: number, nx: number, ny: number, nz: number) => {
    pos.push(ax, ay, az); nrm.push(nx, ny, nz);
  };
  /** 사각면 하나(반시계) */
  const quad = (
    a: [number, number, number], b: [number, number, number],
    c: [number, number, number], dd: [number, number, number],
  ) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c, a, c, dd]) push(p[0], p[1], p[2], nx, ny, nz);
  };

  // 양 옆(삼각형 두 장) — X 방향 법선
  for (const [sx, sign] of [[x0, -1], [x1, 1]] as const) {
    const t = sign > 0 ? tri : [...tri].reverse();
    for (const [tz, ty] of t) push(sx, ty, tz, sign, 0, 0);
  }
  // 옆면 세 장 — 삼각형의 각 변을 X로 밀어낸 사각형
  //   ★ 변을 **b→a 방향**으로 감는다. a→b로 감으면 세 면의 법선이 전부 **안쪽**을 향해
  //     뒷면 컬링에 잘려 **경사면이 텅 비어 보인다**(실제로 그랬다).
  for (let i = 0; i < 3; i++) {
    const [az, ay] = tri[i];
    const [bz, by] = tri[(i + 1) % 3];
    quad([x0, by, bz], [x1, by, bz], [x1, ay, az], [x0, ay, az]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * 정점마다 **여덟 꼭짓점에 대한 삼선형 가중치**를 붙인다 — 부드러운 조명의 절반.
 *
 * 렌더러는 브릭의 꼭짓점 여덟 개 밝기를 인스턴스 속성으로 넘기고, 셰이더가
 * `dot(가중치, 밝기)`로 그 정점의 밝기를 구한다. 래스터라이저가 면 안을 보간하므로
 * **면이 통짜로 같은 밝기이던 문제**가 사라진다.
 *
 * ★ 왜 "가장 가까운 꼭짓점 하나"(one-hot)가 아니라 가중치인가:
 *   상자 모서리 정점은 정확히 꼭짓점 위라 어느 쪽이든 같지만, **돌기·모따기·쐐기**의 정점은
 *   면 한가운데에 있다. one-hot이면 그런 정점이 엉뚱한 꼭짓점 값을 그대로 받아 얼룩진다.
 *   삼선형이면 상자 모서리에서는 자동으로 one-hot이 되고 나머지는 자연스럽게 섞인다.
 *
 * 순서는 `world.cornerLight`와 같아야 한다: `i + 2j + 4k` (i=+x, j=+y, k=+z).
 */
function addCornerWeights(g: THREE.BufferGeometry, w: number, h: number, d: number): void {
  const p = g.getAttribute('position');
  const a = new Float32Array(p.count * 4);
  const b = new Float32Array(p.count * 4);
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  for (let v = 0; v < p.count; v++) {
    const u = clamp01((p.getX(v) + w / 2) / w);
    const t = clamp01((p.getY(v) + h / 2) / h);
    const s = clamp01((p.getZ(v) + d / 2) / d);
    for (let k = 0; k < 2; k++) {
      const wk = k === 0 ? 1 - s : s;
      for (let j = 0; j < 2; j++) {
        const wj = (j === 0 ? 1 - t : t) * wk;
        for (let i = 0; i < 2; i++) {
          const idx = i + 2 * j + 4 * k;
          const val = (i === 0 ? 1 - u : u) * wj;
          if (idx < 4) a[v * 4 + idx] = val;
          else b[v * 4 + (idx - 4)] = val;
        }
      }
    }
  }
  g.setAttribute('aSelA', new THREE.Float32BufferAttribute(a, 4));
  g.setAttribute('aSelB', new THREE.Float32BufferAttribute(b, 4));
}

export function brickGeometry(part: BrickPart, withStuds: boolean, studStyle: StudStyle = 'round'): THREE.BufferGeometry {
  const key = `${part.id}:${withStuds ? 's' : 'n'}:${studStyle}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const w = part.sx * CELL_X;
  const h = part.h * CELL_Y;
  const d = part.sz * CELL_Z;

  // 경사 — 돌기·모따기 없이 쐐기 하나. 돌기 스타일과 무관하다
  if (part.shape === 'slope' || part.shape === 'slopeInv') {
    const g = wedgeGeometry(w, h, d, part.shape === 'slopeInv');
    addCornerWeights(g, w, h, d); // 부드러운 조명 재료
    cache.set(key, g);
    return g;
  }

  // 지형(바닥) 블록은 돌기가 없다 — 브릭이 아니라 파낼 땅이므로 어떤 스타일이든 민짜 상자.
  if (part.id === 'terrain') {
    const g = new THREE.BoxGeometry(w, h, d);
    g.computeBoundingSphere();
    addCornerWeights(g, w, h, d); // 부드러운 조명 재료
    cache.set(key, g);
    return g;
  }

  // 돌기 없음 = 상자 하나로 끝. 스터드 컬링도 무의미해진다.
  //   none: 모따기로 경계를 보이게(108삼각형) · line: 민짜 상자(12) + 셰이더 외곽선
  if (studStyle === 'none' || studStyle === 'line') {
    const g: THREE.BufferGeometry = studStyle === 'none'
      ? new RoundedBoxGeometry(w, h, d, 1, BEVEL)
      : new THREE.BoxGeometry(w, h, d);
    g.computeBoundingSphere();
    addCornerWeights(g, w, h, d); // 부드러운 조명 재료
    cache.set(key, g);
    return g;
  }

  const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(w, h, d)];

  if (withStuds) {
    for (let i = 0; i < part.sx; i++) {
      for (let j = 0; j < part.sz; j++) {
        const s = studGeometry(studStyle);
        s.translate(
          (i + 0.5) * CELL_X - w / 2,
          h / 2,
          (j + 0.5) * CELL_Z - d / 2,
        );
        parts.push(s);
      }
    }
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) throw new Error(`brickGeometry: merge 실패 (${key})`);
  merged.computeBoundingSphere();
  addCornerWeights(merged, w, h, d); // 부드러운 조명 재료
  cache.set(key, merged);
  return merged;
}

/** 삼각형 수 (통계 HUD용) */
export function triCount(geo: THREE.BufferGeometry): number {
  const idx = geo.getIndex();
  return (idx ? idx.count : geo.getAttribute('position').count) / 3;
}

export function disposeBrickGeometries(): void {
  cache.forEach((g) => g.dispose());
  cache.clear();
}
