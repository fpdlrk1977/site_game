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
/**
 * 브릭 경계선의 진하기(0 = 없음).
 *
 * ★ 환경광을 `π`로 올려 씬이 밝아지자 선만 상대적으로 도드라졌다 — 0.45는 그 전 밝기에 맞춘 값이었다.
 *   선은 **브릭의 경계를 알려 주는 보조선**이지 그림이 아니다. 그늘(AO)이 제 몫을 하는 지금은 옅어도 된다.
 */
const EDGE_DARKEN = 0.14;

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
      diffuseColor.rgb *= 1.0 - ${EDGE_DARKEN.toFixed(2)} * (1.0 - line) * fade;
    }`,
  );
}

/**
 * 구운 빛 — 마인크래프트식. 실시간 그림자를 대신한다.
 *
 * ★ **정점 단위(부드러운 조명)** — 면마다 값 하나였을 땐 면 전체가 통짜라 벽 모서리·구덩이가
 *   계단처럼 각져 보였다. 이제 브릭의 **꼭짓점 여덟 개** 밝기를 인스턴스 속성으로 넘기고,
 *   지오메트리가 들고 있는 **삼선형 가중치**(`aSelA`/`aSelB`)로 정점마다 섞는다.
 *   래스터라이저가 면 안을 보간하므로 그라데이션과 모서리 어두움이 자연히 생긴다.
 *
 * ★ 인스턴싱은 그대로다 — 지오메트리는 공유하고, **인스턴스마다 vec4 두 개**(=8값)만 더 넘긴다.
 *   면 단위(6값)일 때와 속성 개수가 같아 GPU 예산도 그대로다.
 */
/**
 * ⚠️ **진단 스위치 — 평소엔 반드시 `false`.**
 * 켜면 브릭 색을 무시하고 **구운 밝기를 흑백으로** 그린다. "그늘이 안 보인다"가
 * ①값이 안 오는 것인지 ②색에 묻혀 안 보이는 것인지를 한 장으로 가른다.
 */
const DEBUG_BAKED_LIGHT = false;

/**
 * 그늘이 **어두운 자리에 얼마나 바짝 붙는가**. 1 = 직선(면 전체에 퍼짐) · 클수록 접촉부에 몰린다.
 *
 * ⚠️ **`world.ts`의 `AO_STRENGTH`와 한 쌍이다.** 여기서 곡선이 어두운 값을 조금 들어올리므로
 *   CPU 쪽 AO는 그만큼 세게 잡아 두었다. **하나만 바꾸면 접촉 그늘이 무너진다.**
 */
const SHADE_CURVE = 1.6;


function injectBakedLight(shader: {
  vertexShader: string; fragmentShader: string;
}): void {
  shader.vertexShader = `
    attribute vec4 aCornerA;  // 인스턴스: 꼭짓점 0~3 밝기 (로컬 슬롯)
    attribute vec4 aCornerB;  // 인스턴스: 꼭짓점 4~7
    attribute vec4 aSelA;     // 지오메트리: 이 정점의 꼭짓점 가중치 0~3
    attribute vec4 aSelB;     // 지오메트리: 4~7
    varying vec2 vBaked;      // x = 하늘빛×AO(보간됨) · y = 면 배율(면마다 상수)
  ` + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    {
      // 하늘빛 — 꼭짓점 여덟 값을 정점 위치로 섞는다. 래스터라이저가 면 안을 보간해 부드러워진다.
      float sky = dot(aCornerA, aSelA) + dot(aCornerB, aSelB);

      // 면 방향 배율 — **월드 법선**으로 판정해야 한다.
      //   브릭은 Y축으로 90°씩 도는데 x면(0.6)과 z면(0.8)의 배율이 달라서,
      //   로컬 법선을 쓰면 회전한 브릭의 옆면 밝기가 뒤바뀐다.
      #ifdef USE_INSTANCING
        vec3 wn = normalize(mat3(instanceMatrix) * normal);
      #else
        vec3 wn = normal;
      #endif
      // ★ 배율 폭이 곧 입체감이다 — 그리고 **면마다 상수라 모서리에서 딱 끊긴다**(보간 없음).
      //   그늘(AO)은 파츠 크기만큼 번지는 반면 이건 안 번지므로, "명암을 또렷하게"의 정답은 이쪽이다.
      //   넓힘: 앞뒤 0.8→0.72 · 좌우 0.6→0.5 · 밑면 0.5→0.35 (윗면은 1.0 유지 = 바닥 밝기 불변)
      float tone =
          wn.y >  0.5 ? 1.0
        : wn.y < -0.5 ? 0.35
        : abs(wn.x) > abs(wn.z) ? 0.5
        : 0.72;

      // 배율은 **면마다 상수**라 보간하면 안 되고, 하늘빛·AO만 정점 사이에서 섞여야 한다.
      // → 둘을 따로 넘겨서 프래그먼트가 **하늘빛에만** 곡선을 씌운다(아래 SHADE_CURVE).
      vBaked = vec2(sky, tone);
    }`,
  );

  shader.fragmentShader = `varying vec2 vBaked;
    float bakedLight() {
      // ★ **접촉부에 바짝 붙은 진한 띠**를 만드는 곳.
      //   정점 사이는 래스터라이저가 **직선**으로 섞는다 → 그대로 쓰면 어두운 꼭짓점에서 밝은 꼭짓점까지
      //   면 전체에 걸쳐 완만하게 밝아져서 **"blur를 먹인 것처럼"** 보인다(사용자 피드백, 두 번).
      //   부족분(1-빛)에 지수를 씌우면 **어두운 자리는 그대로 어둡고 조금만 떨어져도 빠르게 회복**한다.
      //     예) 접촉 0.40 → 0.56 · 반 칸 밖 0.70 → 0.85 · 한 칸 밖 1.0 → 1.0
      float sky = clamp(vBaked.x, 0.0, 1.0);
      return (1.0 - pow(1.0 - sky, ${SHADE_CURVE.toFixed(2)})) * vBaked.y;
    }
` + shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    ${DEBUG_BAKED_LIGHT
      ? 'diffuseColor.rgb = vec3(bakedLight());' // ⚠️ 진단용 — 구운 값을 흑백으로 그대로 본다
      : 'diffuseColor.rgb *= bakedLight();'}`,
  );
}

/**
 * ★ 거칠기가 룩을 좌우한다 — **구운 빛을 쓰기 때문**이다.
 *   반사광(specular)은 **보는 방향에 따라 변하므로** 카메라를 돌리면 어떤 면은 번쩍이고
 *   어떤 면은 죽는다. 구운 값은 고정인데 그 위에 움직이는 하이라이트가 겹치면
 *   "빛이 한쪽만 직사광선처럼 쬔다"는 느낌이 된다(사용자 피드백).
 *   → 브릭은 플라스틱다운 옅은 광택만, **흙·돌은 완전 무광**.
 */
function materialFor(mat: MatClass, edges: boolean, matte: boolean): THREE.MeshStandardMaterial {
  const key = `${mat}|${edges ? 'e' : '-'}|${matte ? 'm' : '-'}`;
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
    // 지형(흙·돌)은 무광, 브릭은 ABS 플라스틱다운 옅은 광택
    m = new THREE.MeshStandardMaterial({ roughness: matte ? 0.98 : 0.72, metalness: 0 });
  }
  if (mat !== 'emissive') {
    m.onBeforeCompile = (shader) => {
      injectBakedLight(shader);
      if (edges) injectEdgeLines(shader);
    };
  }
  materialCache.set(key, m);
  return m;
}

/**
 * 오브젝트 로컬 꼭짓점 → 월드 꼭짓점 인덱스 (`i + 2j + 4k`, i=+x·j=+y·k=+z).
 *
 * 회전은 Y축 90° 단위뿐이므로 부호만 돌면 된다: `wx = sx·cos + sz·sin`, `wz = −sx·sin + sz·cos`.
 * 손으로 적으면 틀리기 쉬워(FACE_MAP과 어긋나면 **밝기만 조용히 뒤집힌다**) 계산해서 만든다.
 */
const CORNER_MAP: number[][] = [0, 1, 2, 3].map((rot) => {
  const c = [1, 0, -1, 0][rot], s = [0, 1, 0, -1][rot];
  return Array.from({ length: 8 }, (_, local) => {
    const sx = local & 1 ? 1 : -1, sy = local & 2 ? 1 : -1, sz = local & 4 ? 1 : -1;
    const wx = sx * c + sz * s;
    const wz = -sx * s + sz * c;
    return (wx > 0 ? 1 : 0) + (sy > 0 ? 2 : 0) + (wz > 0 ? 4 : 0);
  });
});

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

function BrickGroup({ group, world, studStyle, onHover }: {
  group: Group; world: BrickWorld; studStyle: StudStyle;
  onHover?: Props['onHover'];
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

  // 그룹 키가 이미 part별이라 지형 전용 재질을 써도 드로우콜이 늘지 않는다
  const material = materialFor(group.mat, studStyle === 'line', group.part === 'terrain');

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const n = group.ids.length;
    const cornerA = new Float32Array(n * 4);
    const cornerB = new Float32Array(n * 4);
    const corner = new Float32Array(8);

    group.ids.forEach((brickId, i) => {
      const b = world.bricks.get(brickId);
      if (!b) return;
      const [wx, wy, wz] = anchorCenterWorld(b, b.part, b.rot);
      _p.set(wx, wy, wz);
      _q.setFromAxisAngle(_up, (b.rot * Math.PI) / 2);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(b.color));

      // 꼭짓점 밝기 — 월드 기준으로 구한 뒤 회전에 맞춰 로컬 슬롯에 담는다
      world.cornerLight(b, corner);
      const map = CORNER_MAP[b.rot];
      for (let c = 0; c < 4; c++) cornerA[i * 4 + c] = corner[map[c]];
      for (let c = 0; c < 4; c++) cornerB[i * 4 + c] = corner[map[c + 4]];
    });

    geo.setAttribute('aCornerA', new THREE.InstancedBufferAttribute(cornerA, 4));
    geo.setAttribute('aCornerB', new THREE.InstancedBufferAttribute(cornerB, 4));

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
      // 놓기·지우기는 여기서 처리하지 않는다 — 페이지가 캔버스 pointerdown에서 받는다.
      // 브릭이 할 일은 **어느 브릭의 어느 지점인지** 알려주는 것뿐이다.
    />
  );
}

/** 리전 하나 — `rev`가 그대로면 useMemo가 유지돼 인스턴스 버퍼를 다시 쓰지 않는다 */
function Region({ world, regionKey, rev, studStyle, onHover, onGroups }: {
  world: BrickWorld; regionKey: number; rev: number; studStyle: StudStyle;
  onHover?: Props['onHover'];
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
        <BrickGroup key={g.key} group={g} world={world} studStyle={studStyle} onHover={onHover} />
      ))}
    </>
  );
}

export function BrickInstances({ world, version, onHover, onStats, studStyle = 'line' }: Props) {
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
          onGroups={onGroups}
        />
      ))}
    </>
  );
}
