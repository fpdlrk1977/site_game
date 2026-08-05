'use client';

// 놓일 자리 표시 — **표면에 눕힌 접촉면**만 그린다.
//
// ★ 왜 떠 있는 상자를 안 그리는가 (2026-07-30, 사용자 확인으로 원인 확정):
//   브릭 높이는 0.6m, 셀은 0.5m다. 카메라가 45°로 기울면 0.6m 떠 있는 상자의 윗면은
//   화면에서 0.6m 밀려 보인다 — **한 칸보다 크다.** 그래서 "격자에 맞춰 클릭했는데
//   한 칸 어긋난다"는 느낌이 생겼다. 배치는 맞았고 **보이는 것이 틀렸다.**
//   (수직에서 내려다보면 시차가 0이라 정확했다 — 그게 결정적 단서였다.)
//
//   마인크래프트의 검은 외곽선도 "놓일 자리"가 아니라 **지금 겨누는 블록 표면**에 그려진다.
//   표면과 **같은 평면**이라 시차가 원리적으로 0이고, 커서가 그 위에 정확히 얹힌다.
//
// 크기·방향은 접촉면의 가로세로가 그대로 알려주므로 상자가 없어도 읽힌다.

import { useMemo } from 'react';
import * as THREE from 'three';
import { CELL_X, CELL_Y, CELL_Z } from '@/lib/brick/grid';
import { extentOf, type BrickPart } from '@/lib/brick/parts';
import type { FacePlacement } from '@/lib/brick/placement';
import type { Rot } from '@/lib/brick/grid';

interface Props {
  spot: FacePlacement | null;
  /** 놓을 것의 **바깥 상자** — 파츠 하나일 수도, 소품(브릭 묶음)일 수도 있다(§22) */
  part: BrickPart;
  rot: Rot;
  valid: boolean;
}

const CELL = [CELL_X, CELL_Y, CELL_Z] as const;
/** 표면에서 살짝 띄운다 — 같은 평면이면 z-파이팅으로 얼룩진다 */
const LIFT = 0.006;

/**
 * 표면 위 사각형 네 모서리(월드).
 * `lo`/`size`는 면 축을 뺀 두 축의 시작 칸·칸수다. 면 축은 표면 좌표 하나로 눕는다.
 */
function quadOn(
  ax: 0 | 1 | 2, dir: 1 | -1, surfaceCell: number,
  lo: [number, number, number], size: [number, number, number],
): Float32Array {
  const at = surfaceCell * CELL[ax] + dir * LIFT;
  const [u, v] = ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
  const u0 = lo[u] * CELL[u], u1 = (lo[u] + size[u]) * CELL[u];
  const v0 = lo[v] * CELL[v], v1 = (lo[v] + size[v]) * CELL[v];

  const pts = new Float32Array(12);
  const quad: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  quad.forEach(([uu, vv], i) => {
    pts[i * 3 + ax] = at;
    pts[i * 3 + u] = uu;
    pts[i * 3 + v] = vv;
  });
  return pts;
}

/** 브릭이 상대 표면에 닿는 면 */
function contactCorners(spot: FacePlacement, part: BrickPart, rot: Rot): Float32Array {
  const e = extentOf(part, rot);
  const ext: [number, number, number] = [e.ex, e.ey, e.ez];
  const a: [number, number, number] = [spot.anchor.x, spot.anchor.y, spot.anchor.z];
  const ax = spot.face.axis;
  // 바깥 면을 겨눴으면 브릭의 아래쪽이, 안쪽이면 위쪽이 닿는다
  const surface = spot.face.dir > 0 ? a[ax] : a[ax] + ext[ax];
  return quadOn(ax, spot.face.dir, surface, a, ext);
}

/** **겨눈 칸** 하나 — "여기 옆에 놓인다"를 보여주는 기준점 */
function aimedCorners(spot: FacePlacement): Float32Array {
  const ax = spot.face.axis;
  const surface = spot.face.dir > 0 ? spot.cell[ax] + 1 : spot.cell[ax];
  return quadOn(ax, spot.face.dir, surface, spot.cell, [1, 1, 1]);
}

function quadGeos(pts: Float32Array): { outline: THREE.BufferGeometry; fill: THREE.BufferGeometry } {
  const attr = new THREE.BufferAttribute(pts, 3);
  const outline = new THREE.BufferGeometry();
  outline.setAttribute('position', attr);
  const fill = new THREE.BufferGeometry();
  fill.setAttribute('position', attr);
  fill.setIndex([0, 1, 2, 0, 2, 3]);
  return { outline, fill };
}

export function PlacementMarker({ spot, part, rot, valid }: Props) {
  const geos = useMemo(() => (spot ? {
    brick: quadGeos(contactCorners(spot, part, rot)),
    aimed: quadGeos(aimedCorners(spot)),
  } : null), [spot, part, rot]);

  if (!geos) return null;
  const color = valid ? '#000000' : '#e02424';
  return (
    <group raycast={() => null}>
      {/* 겨눈 칸 — 이 칸 옆에 브릭이 놓인다. 진하게 칠해 기준점이 눈에 보이게 */}
      <mesh geometry={geos.aimed.fill}>
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* 놓일 브릭이 표면에 닿는 면 */}
      <mesh geometry={geos.brick.fill}>
        <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineLoop geometry={geos.brick.outline}>
        <lineBasicMaterial color={color} transparent opacity={0.85} />
      </lineLoop>
    </group>
  );
}
