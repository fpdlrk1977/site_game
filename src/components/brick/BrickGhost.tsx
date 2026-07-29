'use client';

// 배치 고스트 — 놓일 자리를 미리 보여준다. 빨강이면 그 자리에 못 놓는다.

import { useMemo } from 'react';
import * as THREE from 'three';
import { brickGeometry, type StudStyle } from '@/lib/brick/brickGeometry';
import { anchorCenterWorld, type Anchor } from '@/lib/brick/placement';
import { PARTS, type PartId } from '@/lib/brick/parts';
import type { Rot } from '@/lib/brick/grid';

interface Props {
  anchor: Anchor | null;
  part: PartId;
  rot: Rot;
  valid: boolean;
  studStyle?: StudStyle;
}

export function BrickGhost({ anchor, part, rot, valid, studStyle = 'line' }: Props) {
  const geo = useMemo(() => brickGeometry(PARTS[part], true, studStyle), [part, studStyle]);
  if (!anchor) return null;
  const [x, y, z] = anchorCenterWorld(anchor, part, rot);
  return (
    <mesh
      geometry={geo}
      position={[x, y, z]}
      rotation={[0, (rot * Math.PI) / 2, 0]}
      raycast={() => null}
    >
      <meshBasicMaterial
        color={valid ? '#4ade80' : '#f05252'}
        transparent
        opacity={0.45}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
