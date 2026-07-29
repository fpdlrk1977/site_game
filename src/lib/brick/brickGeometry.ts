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
export function brickGeometry(part: BrickPart, withStuds: boolean, studStyle: StudStyle = 'round'): THREE.BufferGeometry {
  const key = `${part.id}:${withStuds ? 's' : 'n'}:${studStyle}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const w = part.sx * CELL_X;
  const h = part.h * CELL_Y;
  const d = part.sz * CELL_Z;

  // 돌기 없음 = 상자 하나로 끝. 스터드 컬링도 무의미해진다.
  //   none: 모따기로 경계를 보이게(108삼각형) · line: 민짜 상자(12) + 셰이더 외곽선
  if (studStyle === 'none' || studStyle === 'line') {
    const g: THREE.BufferGeometry = studStyle === 'none'
      ? new RoundedBoxGeometry(w, h, d, 1, BEVEL)
      : new THREE.BoxGeometry(w, h, d);
    g.computeBoundingSphere();
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
