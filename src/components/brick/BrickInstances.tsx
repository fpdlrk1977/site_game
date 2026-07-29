'use client';

// 브릭 인스턴스 렌더 — 기준: doc/BRICK_SYSTEM.md §4.1
//
//   InstancedMesh 하나 = (**리전** × 파츠 × 스터드변형 × 재질군)
//   색은 이 안에서 인스턴스마다 자유 (setColorAt — draw call 안 늘어남)
//
// ★ 리전으로 쪼개는 이유 (12만 브릭 실측에서 확인):
//   three는 **오브젝트 단위**로 프러스텀 컬링한다. 월드 전체를 InstancedMesh 2개로 묶으면
//   화면 밖 지오메트리도 매 프레임 전부 처리된다(컬링이 사실상 0).
//   리전(32×25.6×32m)으로 나누면 안 보이는 리전이 통째로 빠진다.
//
// ★ 리비전으로 부분 갱신:
//   예전엔 브릭 하나 놓을 때마다 **보이는 인스턴스 전부**의 행렬을 다시 썼다(12만에서 16,808개).
//   이제 바뀐 리전만 다시 쓴다.
//
// 그리디 메싱을 안 쓰기 때문에 얻는 것: raycast가 instanceId를 그대로 준다
// → 복셀 DDA를 직접 구현할 필요가 없다.

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { brickGeometry, triCount, type StudStyle } from '@/lib/brick/brickGeometry';
import { anchorCenterWorld } from '@/lib/brick/placement';
import { PARTS, type MatClass, type PartId } from '@/lib/brick/parts';
import type { BrickWorld } from '@/lib/brick/world';

export interface BrickHit { brickId: number; point: THREE.Vector3 }

interface Props {
  world: BrickWorld;
  /** 변경 신호 — BrickWorld는 mutable이라 참조로는 감지가 안 된다 */
  version: number;
  onHover?: (hit: BrickHit | null) => void;
  onPlace?: (hit: BrickHit) => void;
  onRemove?: (hit: BrickHit) => void;
  onStats?: (s: { groups: number; instances: number; tris: number }) => void;
  /** 돌기 모양 — 바뀌면 지오메트리를 새로 굽는다 (BRICK_SYSTEM.md §8.5) */
  studStyle?: StudStyle;
}

interface Group {
  key: string;
  part: PartId;
  studs: boolean;
  mat: MatClass;
  /** instanceId → brickId */
  ids: number[];
}

// ── 재질 ──────────────────────────────────────────────────────────────
// 재질군이 나뉘는 이유는 셰이더·렌더 패스가 달라서다. 색은 인스턴스마다 자유.
// 리전마다 새로 만들지 않고 공유한다(재질은 리전과 무관).

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * 면 경계선 셰이더 — 돌기를 없앴을 때 브릭이 서로 구분되게 한다.
 *
 * ★ 확대/축소에 안 깨지는 이유: 선 두께를 UV가 아니라 **화면 미분(fwidth)** 으로 잡는다.
 *   - 확대해도 선이 굵어지지 않고, 축소해도 사라지지 않는다(항상 약 1.2픽셀)
 *   - `smoothstep`이라 계단 없이 부드럽게 그려진다(안티에일리어싱)
 *   - **멀어져서 브릭이 몇 픽셀이 되면 선을 지운다** — 안 그러면 선이 뭉쳐 벽 전체가 거뭇해진다(모아레)
 *
 * 지오메트리는 민짜 상자(12삼각형) 그대로다 — 선은 픽셀 단계에서만 그린다.
 */
function injectEdgeLines(shader: { vertexShader: string; fragmentShader: string }): void {
  // 텍스처가 없으면 three가 vUv를 안 만든다 → 직접 켠다
  shader.vertexShader = '#define USE_UV\n' + shader.vertexShader;
  shader.fragmentShader = '#define USE_UV\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    {
      // 상자 각 면의 UV는 0..1 → 면 가장자리까지의 거리
      float d = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      float w = fwidth(d);
      float line = smoothstep(0.0, w * 1.2, d);          // 0 = 선 위, 1 = 면 안쪽
      float fade = 1.0 - smoothstep(0.12, 0.30, w);      // 너무 멀면 선을 지운다
      diffuseColor.rgb *= 1.0 - 0.45 * (1.0 - line) * fade;
    }`,
  );
}

/**
 * 면 단위 하늘빛 — 마인크래프트식 **구운 빛**. 실시간 그림자를 대신한다.
 *
 * ★ 인스턴싱이라 정점마다 값을 줄 수 없다(지오메트리를 공유하므로).
 *   그래서 **인스턴스마다 6면의 밝기**를 넘기고, 정점 셰이더가 법선을 보고 고른다.
 *   → 면 안에서 부드럽게 번지는 그라데이션과 모서리 AO는 불가(마크의 'Fast' 룩).
 *
 * vec3 두 개로 나눈 이유: 정점 속성 하나는 최대 4성분(vec4)이라 6개를 한 번에 못 넣는다.
 */
function injectFaceLight(shader: {
  vertexShader: string; fragmentShader: string;
}): void {
  shader.vertexShader = `
    attribute vec3 aLightA;   // 오브젝트 로컬 +x, -x, +y
    attribute vec3 aLightB;   // 오브젝트 로컬 -y, +z, -z
    varying float vFaceLight;
  ` + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    {
      vec3 n = normal;
      vFaceLight =
          n.x >  0.5 ? aLightA.x
        : n.x < -0.5 ? aLightA.y
        : n.y >  0.5 ? aLightA.z
        : n.y < -0.5 ? aLightB.x
        : n.z >  0.5 ? aLightB.y
        :              aLightB.z;
    }`,
  );

  shader.fragmentShader = 'varying float vFaceLight;\n' + shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    diffuseColor.rgb *= vFaceLight;`,
  );
}

function materialFor(mat: MatClass, edges: boolean): THREE.MeshStandardMaterial {
  const key = `${mat}|${edges ? 'e' : '-'}`;
  const hit = materialCache.get(key);
  if (hit) return hit;

  let m: THREE.MeshStandardMaterial;
  if (mat === 'transparent') {
    m = new THREE.MeshStandardMaterial({
      roughness: 0.1, metalness: 0,
      transparent: true, opacity: 0.45, depthWrite: false,
    });
  } else if (mat === 'emissive') {
    m = new THREE.MeshStandardMaterial({
      roughness: 0.6, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 1,
    });
    // three의 instanceColor는 diffuse에만 곱해진다. 발광 브릭이 '자기 색으로' 빛나게
    // 하려면 emissive에도 곱해야 한다. USE_INSTANCING_COLOR 가드로 컴파일 순서와 무관하게 안전.
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_INSTANCING_COLOR
          totalEmissiveRadiance *= vColor;
        #endif`,
      );
      // 발광 브릭은 스스로 빛나므로 하늘빛을 곱하지 않는다
      if (edges) injectEdgeLines(shader);
    };
  } else {
    m = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 });
  }
  if (mat !== 'emissive') {
    m.onBeforeCompile = (shader) => {
      injectFaceLight(shader);
      if (edges) injectEdgeLines(shader);
    };
  }
  materialCache.set(key, m);
  return m;
}

/**
 * 오브젝트 로컬 면 → 월드 면 인덱스. 브릭은 Y축으로 0/90/180/270만 돈다.
 * 월드 순서 [+x, -x, +y, -y, +z, -z] · 로컬 슬롯 [+x, -x, +y, -y, +z, -z]
 */
const FACE_MAP: number[][] = [
  [0, 1, 2, 3, 4, 5], // rot 0
  [5, 4, 2, 3, 0, 1], // rot 90  (로컬 +x → 월드 -z)
  [1, 0, 2, 3, 5, 4], // rot 180
  [4, 5, 2, 3, 1, 0], // rot 270
];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

/** 리전 하나의 브릭들을 (파츠 × 스터드 × 재질군)으로 묶는다 */
function groupsOf(world: BrickWorld, regionKey: number, studStyle: StudStyle): Group[] {
  const ids = world.regionBrickIds(regionKey);
  if (!ids) return [];
  const map = new Map<string, Group>();
  for (const id of ids) {
    const b = world.bricks.get(id);
    if (!b) continue;
    // 돌기가 없으면 有/無로 나눌 이유가 없다 — 한 그룹으로 합쳐 draw call을 아낀다
    const noStuds = studStyle === 'none' || studStyle === 'line';
    const studs = noStuds ? false : !world.studless.has(id);
    const key = `${b.part}|${studs ? 's' : 'n'}|${b.mat}`;
    let g = map.get(key);
    if (!g) { g = { key, part: b.part, studs, mat: b.mat, ids: [] }; map.set(key, g); }
    g.ids.push(id);
  }
  // 반투명은 마지막에 그린다(정렬)
  return [...map.values()].sort((a, b) => Number(a.mat === 'transparent') - Number(b.mat === 'transparent'));
}

function BrickGroup({ group, world, studStyle, onHover, onPlace, onRemove }: {
  group: Group; world: BrickWorld; studStyle: StudStyle;
  onHover?: Props['onHover']; onPlace?: Props['onPlace']; onRemove?: Props['onRemove'];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  // 캐시된 지오메트리는 그룹끼리 **공유**된다. 거기에 인스턴스 속성을 붙이면 서로 덮어쓴다.
  // → 정점 버퍼는 그대로 쓰고 껍데기만 새로 만든다(메모리 낭비 없음).
  const geo = useMemo(() => {
    const base = brickGeometry(PARTS[group.part], group.studs, studStyle);
    const g = new THREE.BufferGeometry();
    g.setIndex(base.getIndex());
    for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.attributes[name]);
    g.boundingSphere = base.boundingSphere;
    g.boundingBox = base.boundingBox;
    return g;
  }, [group.part, group.studs, studStyle]);

  const material = materialFor(group.mat, studStyle === 'line');

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const n = group.ids.length;
    const lightA = new Float32Array(n * 3);
    const lightB = new Float32Array(n * 3);
    const face = new Float32Array(6);

    group.ids.forEach((brickId, i) => {
      const b = world.bricks.get(brickId);
      if (!b) return;
      const [wx, wy, wz] = anchorCenterWorld(b, b.part, b.rot);
      _p.set(wx, wy, wz);
      _q.setFromAxisAngle(_up, (b.rot * Math.PI) / 2);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(b.color));

      // 면 밝기 — 월드 기준으로 구한 뒤 회전에 맞춰 로컬 슬롯에 담는다
      world.faceLight(b, face);
      const map = FACE_MAP[b.rot];
      lightA[i * 3] = face[map[0]];
      lightA[i * 3 + 1] = face[map[1]];
      lightA[i * 3 + 2] = face[map[2]];
      lightB[i * 3] = face[map[3]];
      lightB[i * 3 + 1] = face[map[4]];
      lightB[i * 3 + 2] = face[map[5]];
    });

    geo.setAttribute('aLightA', new THREE.InstancedBufferAttribute(lightA, 3));
    geo.setAttribute('aLightB', new THREE.InstancedBufferAttribute(lightB, 3));

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // 컬링 판정에 쓰이므로 반드시 갱신해야 한다 — 안 하면 리전이 엉뚱하게 사라진다
    mesh.computeBoundingSphere();
  }, [group, world, geo]);

  const toHit = (e: ThreeEvent<PointerEvent | MouseEvent>): BrickHit | null => {
    if (e.instanceId === undefined) return null;
    const brickId = group.ids[e.instanceId];
    return brickId === undefined ? null : { brickId, point: e.point };
  };

  return (
    <instancedMesh
      ref={ref}
      args={[geo, material, group.ids.length]}
      castShadow
      receiveShadow
      onPointerMove={(e) => { e.stopPropagation(); onHover?.(toHit(e)); }}
      onPointerOut={() => onHover?.(null)}
      onClick={(e) => { e.stopPropagation(); const h = toHit(e); if (h) onPlace?.(h); }}
      onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); const h = toHit(e); if (h) onRemove?.(h); }}
    />
  );
}

/** 리전 하나 — `rev`가 그대로면 useMemo가 유지돼 인스턴스 버퍼를 다시 쓰지 않는다 */
function Region({ world, regionKey, rev, studStyle, onHover, onPlace, onRemove, onGroups }: {
  world: BrickWorld; regionKey: number; rev: number; studStyle: StudStyle;
  onHover?: Props['onHover']; onPlace?: Props['onPlace']; onRemove?: Props['onRemove'];
  onGroups: (key: number, groups: Group[]) => void;
}) {
  const groups = useMemo(
    () => groupsOf(world, regionKey, studStyle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, regionKey, rev, studStyle],
  );
  useLayoutEffect(() => { onGroups(regionKey, groups); }, [regionKey, groups, onGroups]);

  return (
    <>
      {groups.map((g) => (
        <BrickGroup key={g.key} group={g} world={world} studStyle={studStyle} onHover={onHover} onPlace={onPlace} onRemove={onRemove} />
      ))}
    </>
  );
}

export function BrickInstances({ world, version, onHover, onPlace, onRemove, onStats, studStyle = 'line' }: Props) {
  const regions = useMemo(
    () => world.regionSnapshot(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, version],
  );

  // 통계는 리전별 그룹을 모아서 낸다(리전이 바뀔 때만 갱신)
  const perRegion = useRef(new Map<number, Group[]>());
  const onGroups = useMemo(() => (key: number, groups: Group[]) => {
    perRegion.current.set(key, groups);
  }, []);

  useLayoutEffect(() => {
    if (!onStats) return;
    // 사라진 리전의 잔재를 버린다
    const live = new Set(regions.map((r) => r.key));
    for (const k of perRegion.current.keys()) if (!live.has(k)) perRegion.current.delete(k);

    let groupCount = 0, instances = 0, tris = 0;
    for (const groups of perRegion.current.values()) {
      for (const g of groups) {
        groupCount++;
        instances += g.ids.length;
        tris += triCount(brickGeometry(PARTS[g.part], g.studs, studStyle)) * g.ids.length;
      }
    }
    onStats({ groups: groupCount, instances, tris });
  }, [regions, version, onStats, studStyle]);

  return (
    <>
      {regions.map((r) => (
        <Region
          key={r.key}
          world={world}
          regionKey={r.key}
          rev={r.rev}
          studStyle={studStyle}
          onHover={onHover}
          onPlace={onPlace}
          onRemove={onRemove}
          onGroups={onGroups}
        />
      ))}
    </>
  );
}
