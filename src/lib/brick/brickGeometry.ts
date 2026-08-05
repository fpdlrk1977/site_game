// 브릭 메시 생성 — 기준: doc/BRICK_SYSTEM.md §4.2
//
// ★ 폴리곤 예산이 이 프로젝트 최대 리스크다. 브릭은 큐브(12삼각형)의 3~17배다.
//   그래서 파츠마다 **스터드 有/無 두 변형**을 만들어 두고, 위가 완전히 덮인 브릭은
//   無 변형을 쓴다(스터드 컬링). 쌓아올린 구조물은 대부분의 스터드가 가려진다.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BRICK_CELLS_Y, CELL_X, CELL_Y, CELL_Z } from './grid';
import type { BrickPart } from './parts';

/**
 * 무늬 한 장이 덮는 **월드 크기**. 가로는 한 칸, 세로는 브릭 한 장 높이.
 *
 * ★ 이게 없으면 `BoxGeometry`의 UV가 면 크기와 무관하게 늘 0~1이라
 *   **파츠가 커질수록 무늬도 같이 늘어난다** — 1×1과 1×2를 나란히 놓으면 벽돌 줄눈 간격이 2배 차이 났다.
 *   마인크래프트가 이 문제를 안 겪는 건 블록이 전부 1칸이라 "면 하나 = 한 장"이 곧 "0.5m마다 한 장"이기 때문.
 */
const TEX_TILE_XZ = CELL_X;
const TEX_TILE_Y = BRICK_CELLS_Y * CELL_Y;

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

/**
 * 무늬 전용 UV(`aTexUV`) — **칸 수에 비례해 반복**시킨다.
 *
 * ★ 왜 기본 `uv`를 안 쓰고 속성을 하나 더 두는가:
 *   경계선 셰이더가 `vUv`로 **면 가장자리까지의 거리**를 재고 있다(`min(vUv.x, 1-vUv.x)…`).
 *   거기에 타일링을 넣으면 **타일마다 선이 그어져** 브릭이 잘게 쪼개져 보인다.
 *   → 무늬는 `aTexUV`, 경계선은 `uv`. 서로 간섭하지 않는다.
 *
 * ★ **법선의 지배축으로 평면 투영**한다. 그래서 상자·모따기 상자·쐐기(경사)·돌기가
 *   전부 한 함수로 처리된다 — 파츠마다 UV를 손으로 적으면 반드시 어긋난다.
 *   (쐐기는 원래 `uv` 자체가 없었다 → 경사면 무늬가 이제야 제대로 나온다.)
 *
 * ★ 세로는 **위쪽 기준**이다: 브릭은 딱 한 장, 플레이트(⅓ 높이)는 **위쪽 ⅓**만 보인다.
 *   아래 기준으로 잡으면 잔디 옆면의 풀 띠가 밑으로 밀린다(`BRICK_PITFALLS.md` T-2).
 *   가로는 파츠가 늘 정수 칸이라 딱 떨어져서 기준점이 필요 없다.
 */
function addTexUV(g: THREE.BufferGeometry, w: number, h: number, d: number): void {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let v = 0; v < p.count; v++) {
    const nx = Math.abs(n.getX(v)), ny = Math.abs(n.getY(v)), nz = Math.abs(n.getZ(v));
    let u: number, t: number;
    if (ny >= nx && ny >= nz) {
      // 윗면·밑면 — 바닥 평면(XZ)에 투영. 두 방향 모두 칸 수만큼 반복
      u = (p.getX(v) + w / 2) / TEX_TILE_XZ;
      t = (p.getZ(v) + d / 2) / TEX_TILE_XZ;
    } else {
      // 옆면 — 가로는 그 면의 길이 방향, 세로는 높이(위쪽 기준)
      u = nx >= nz
        ? (p.getZ(v) + d / 2) / TEX_TILE_XZ
        : (p.getX(v) + w / 2) / TEX_TILE_XZ;
      t = 1 - (h / 2 - p.getY(v)) / TEX_TILE_Y;
    }
    uv[v * 2] = u;
    uv[v * 2 + 1] = t;
  }
  g.setAttribute('aTexUV', new THREE.Float32BufferAttribute(uv, 2));
}

export function brickGeometry(part: BrickPart, withStuds: boolean, studStyle: StudStyle = 'round'): THREE.BufferGeometry {
  const key = `${part.id}:${withStuds ? 's' : 'n'}:${studStyle}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const w = part.sx * CELL_X;
  const h = part.h * CELL_Y;
  const d = part.sz * CELL_Z;

  // 가는 파츠(기둥·봉·패널) — **칸은 그대로 차지하고 그리는 크기만 얇다.**
  //
  // ★★ 조명·무늬는 **칸 크기(w,h,d)** 로 계산한다 — 그리는 크기로 넣으면 안 된다.
  //   ① 무늬: `aTexUV`는 "0.5m마다 한 장"이 규약이라, 얇은 크기로 나누면 그 파츠만 무늬가 확대된다
  //   ② 조명: 꼭짓점 가중치가 **칸의 여덟 모서리** 기준이라야 이웃 브릭과 밝기가 이어진다.
  //      얇은 크기로 정규화하면 봉 하나가 제 혼자 밝기 범위를 다 쓴다.
  if (part.shape === 'thin') {
    const t = part.thin ?? {};
    const tw = t.x ?? w, th = t.y ?? h, td = t.z ?? d;
    // ★ 모따기는 **다른 파츠와 똑같이** 적용한다(2026-08-05 사용자 신고 — 가는 파츠만 모서리가 날카로웠다).
    //   ⚠️ 깎는 폭은 **그리는 크기** 기준으로 조인다. `RoundedBoxGeometry`는 반지름이
    //     가장 얇은 축의 절반을 넘으면 메시가 뒤집히는데, 패널은 0.1m라 브릭 기준 폭(0.03)이 그 절반에 육박한다.
    const g: THREE.BufferGeometry = studStyle === 'none'
      ? new RoundedBoxGeometry(tw, th, td, 1, Math.min(BEVEL, Math.min(tw, th, td) * 0.25))
      : new THREE.BoxGeometry(tw, th, td);
    g.computeBoundingSphere();
    addCornerWeights(g, w, h, d); // ← 칸 크기
    addTexUV(g, w, h, d);         // ← 칸 크기
    cache.set(key, g);
    return g;
  }

  // 지형(바닥) 블록은 돌기가 없다 — 브릭이 아니라 파낼 땅이므로 어떤 스타일이든 민짜 상자.
  if (part.id === 'terrain') {
    const g = new THREE.BoxGeometry(w, h, d);
    g.computeBoundingSphere();
    addCornerWeights(g, w, h, d); // 부드러운 조명 재료
    addTexUV(g, w, h, d);         // 무늬 타일링
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
    addTexUV(g, w, h, d);         // 무늬 타일링
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
  addTexUV(merged, w, h, d);         // 무늬 타일링 — 돌기까지 함께 덮는다
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
