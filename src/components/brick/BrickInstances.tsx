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
import { faceSlots, getBrickAtlas, TEX_COLS, TEX_ROWS } from '@/lib/brick/textures';
import { anchorCenterWorld } from '@/lib/brick/placement';
import { PARTS, type MatClass, type PartId } from '@/lib/brick/parts';
import { ROT_COUNT, rotMatrixVisual } from '@/lib/brick/rotation';
import { AO_WALL_RELIEF, SHADE_CURVE } from '@/lib/brick/shading';
import { RegionLightVolume, VOL_X, VOL_Y, VOL_Z } from '@/lib/brick/lightVolume';
import { CELL_X, CELL_Y, CELL_Z, REGION_X, REGION_Y, REGION_Z, Y_MIN, regionCoordOf } from '@/lib/brick/grid';
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

// ── 칸 단위 조명 볼륨 (BRICK_PLAN.md §18) ─────────────────────────────────
//
// ★★ 밝기를 **칸 모서리마다** 구워 3D 텍스처로 올리고, 프래그먼트가 월드 좌표로 찾아 쓴다.
//   예전엔 브릭의 꼭짓점 여덟 개를 인스턴스 속성으로 넘겨 정점 사이를 보간했는데,
//   그러면 조명 해상도가 **브릭 단위**라 `2×4` 브릭 면이 2m짜리 그라데이션이 됐다(D-9).
//
// ★ 리전마다 하나씩 둔다 — 이미 "바뀐 리전만 다시 그린다"는 구조가 있어서 그대로 얹힌다.

interface RegionLight {
  vol: RegionLightVolume;
  tex: THREE.Data3DTexture;
  /** 셰이더가 쓰는 볼륨 원점(셀 좌표) */
  origin: THREE.Vector3;
  rev: number;
}

const regionLights = new Map<number, RegionLight>();

/** 이 리전의 빛 볼륨을 최신 상태로 만들어 돌려준다. `rev`가 그대로면 다시 굽지 않는다 */
function lightFor(world: BrickWorld, regionKey: number, rev: number): RegionLight | null {
  const ids = world.regionBrickIds(regionKey);
  if (!ids || ids.size === 0) return null;

  let entry = regionLights.get(regionKey);
  if (!entry) {
    // 리전 원점은 그 안의 아무 브릭으로 역산한다(리전 키만으로는 좌표를 못 되돌린다)
    const first = world.bricks.get(ids.values().next().value as number);
    if (!first) return null;
    const rc = regionCoordOf(first.x, first.y, first.z);
    const ox = rc.rx * REGION_X, oy = rc.ry * REGION_Y + Y_MIN, oz = rc.rz * REGION_Z;
    const vol = new RegionLightVolume(ox, oy, oz);
    const tex = new THREE.Data3DTexture(vol.data, VOL_X, VOL_Y, VOL_Z);
    tex.format = THREE.RGFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
    // ⚠️ 폭이 2의 배수가 아니라 기본 정렬(4)로는 **줄이 밀린다.** 반드시 1.
    tex.unpackAlignment = 1;
    entry = { vol, tex, origin: new THREE.Vector3(ox, oy, oz), rev: -1 };
    regionLights.set(regionKey, entry);
  }

  if (entry.rev !== rev) {
    entry.vol.bake(world, ids);
    entry.tex.needsUpdate = true;
    entry.rev = rev;
  }
  return entry;
}

/** 사라진 리전의 볼륨을 버린다 — 안 버리면 걸어 다닌 만큼 메모리가 는다(B-0b와 같은 계열) */
function dropUnusedLights(live: Set<number>): void {
  for (const [key, e] of regionLights) {
    if (live.has(key)) continue;
    e.tex.dispose();
    regionLights.delete(key);
  }
}

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
// ★ 그늘 상수는 `lib/brick/shading.ts`에 모여 있다 — 세기와 곡선은 **함께** 맞춰야 하기 때문이다.


/**
 * 무늬(재료) — **아틀라스 한 장**에서 인스턴스마다 다른 칸을 뽑아 쓴다.
 *
 * ★ 재질이 갈리지 않으므로 **draw call이 안 늘어난다.** 재료마다 텍스처를 따로 두면
 *   재료 수만큼 메시가 쪼개진다(인스턴싱을 고른 이유와 같은 논리).
 *
 * ★ **면마다 다른 칸을 쓴다** — 인스턴스가 `(윗면, 옆면, 밑면)` 세 칸을 들고 오고
 *   정점 셰이더가 **월드 법선**으로 하나를 고른다. 잔디를 파면 단면이 흙으로 보이는 게 이것이다.
 *   회전한 브릭에서도 맞으려면 로컬 법선이 아니라 **월드 법선**이어야 한다(아래 `injectBakedLight`와 같은 이유).
 *   고르는 일을 정점에서 하는 이유: 면은 평평해서 법선이 면 전체에 상수라 프래그먼트에서 할 이유가 없다.
 *
 * ★ 고른 칸이 0(민짜)이면 샘플링을 건너뛴다. 색은 팔레트에서 오고 무늬 위에 곱해진다.
 *
 * ★ **크기는 `aTexUV`가 정한다** — 지오메트리가 굽는 무늬 전용 UV로, 칸 수만큼 반복된다.
 *   기본 `uv`는 면마다 0~1이라 **파츠가 커지면 무늬도 같이 늘어났다**(1×1과 1×2의 벽돌 줄눈이 2배 차이).
 *   경계선은 그 0~1이 있어야 면 가장자리를 찾으므로 `vUv`를 그대로 쓴다 — 그래서 UV가 두 벌이다.
 */
function injectTexture(shader: {
  vertexShader: string; fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}): void {
  shader.uniforms.uBrickAtlas = { value: getBrickAtlas() };

  shader.vertexShader = `#define USE_UV
    attribute vec3 aTile;   // 인스턴스: (윗면, 옆면, 밑면) 아틀라스 칸
    attribute vec2 aTexUV;  // 지오메트리: 칸 수에 비례한 무늬 좌표 (0~1이 아니다)
    varying float vTile;
    varying vec2 vTexUV;
  ` + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    {
      #ifdef USE_INSTANCING
        vec3 tn = normalize(mat3(instanceMatrix) * normal);
      #else
        vec3 tn = normal;
      #endif
      // 경사면은 법선의 y가 0.7쯤이라 **윗면 그림**을 쓴다 — 잔디 경사가 잔디로 보인다
      vTile = tn.y > 0.5 ? aTile.x : (tn.y < -0.5 ? aTile.z : aTile.y);
      vTexUV = aTexUV;
    }`,
  );

  shader.fragmentShader = `#define USE_UV
    uniform sampler2D uBrickAtlas;
    varying float vTile;
    varying vec2 vTexUV;
  ` + shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    if (vTile > 0.5) {
      float t = floor(vTile + 0.5);
      vec2 tile = vec2(mod(t, ${TEX_COLS}.0), floor(t / ${TEX_COLS}.0));
      // ★ fract가 **반복**을 만든다 — aTexUV는 2×4 브릭이면 0~4까지 간다.
      //   칸 경계에서 옆 칸이 새어 들어오지 않게 안쪽으로 살짝 물린다
      vec2 f = clamp(fract(vTexUV), 0.002, 0.998);
      // ★ 그림의 y=0 줄이 **면의 위쪽**이 되게 뒤집는다 (textures.ts의 규약).
      //   아틀라스는 flipY=false로 올라가 v=0이 캔버스 맨 윗줄인데, 상자 옆면의 v=0은 **아래쪽**이다.
      //   잡티 무늬만 있을 땐 위아래가 없어 안 드러났지만, 잔디 옆면의 풀 띠는 뒤집히면 바로 보인다.
      f.y = 1.0 - f.y;
      vec2 uv = (tile + f) / vec2(${TEX_COLS}.0, ${TEX_ROWS}.0);
      diffuseColor.rgb *= texture2D(uBrickAtlas, uv).rgb;
    }`,
  );
}

/**
 * **가려진 면 지우기** — 반투명 브릭을 붙여도 한 장처럼 보이게 한다.
 *
 * ★ 왜 필요한가: 브릭은 상자 6면을 통째로 그리고, "안 그리기" 판정은 **브릭 단위**뿐이다.
 *   그래서 유리 두 장을 붙이면 맞닿은 자리에 유리가 **한 겹 더** 남아 **띠**가 생기고,
 *   테두리 선까지 그어져 유리벽이 격자무늬가 된다(사용자 보고).
 *
 * ★ 지오메트리를 안 건드리고 **프래그먼트에서 버린다** — draw call·삼각형 수 무변경,
 *   인스턴스 속성 `float` 하나만 는다. (면 단위로 지오메트리를 다시 짜려면 인스턴싱을 포기해야 한다)
 *
 * ⚠️ **반투명 재질에만 건다.** 불투명에 걸면 ①유리 뒤 브릭에 구멍이 뚫리고
 *   ②`discard`가 early-Z를 무르게 해 브릭 대부분인 불투명 패스가 **오히려 느려진다.**
 */
function injectHiddenFaces(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = `
    attribute float aHide;  // 인스턴스: 가려진 면 6비트 (+x −x +y −y +z −z)
    varying float vHide;
  ` + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    {
      // 마스크는 **월드 축** 기준이라 법선도 월드로 옮겨야 한다(회전한 브릭에서 어긋나지 않게).
      #ifdef USE_INSTANCING
        vec3 hn = normalize(mat3(instanceMatrix) * normal);
      #else
        vec3 hn = normal;
      #endif
      // 축에 딱 붙은 면만 대상 — 경사의 대각면은 어느 비트에도 걸리지 않는다
      float face = -1.0;
      if (hn.x > 0.99) face = 0.0; else if (hn.x < -0.99) face = 1.0;
      else if (hn.y > 0.99) face = 2.0; else if (hn.y < -0.99) face = 3.0;
      else if (hn.z > 0.99) face = 4.0; else if (hn.z < -0.99) face = 5.0;
      vHide = face < 0.0 ? 0.0 : mod(floor(aHide / pow(2.0, face)), 2.0);
    }`,
  );

  shader.fragmentShader = `varying float vHide;
  ` + shader.fragmentShader.replace(
    '#include <clipping_planes_fragment>',
    `#include <clipping_planes_fragment>
    if (vHide > 0.5) discard;`,
  );
}

function injectBakedLight(shader: {
  vertexShader: string; fragmentShader: string;
}): void {
  shader.vertexShader = `
    uniform vec3 uVolOrigin;  // 이 리전 볼륨의 원점(셀 좌표)
    varying vec3 vLightUVW;   // 빛 볼륨 조회 좌표 — 월드 위치의 **선형** 함수라 보간해도 정확하다
    varying vec2 vFace;       // x = 면 배율 · y = 세로면 정도 (둘 다 면마다 상수)
  ` + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    {
      // ★★★ **칸 단위 조명** — 밝기를 브릭 꼭짓점이 아니라 **월드 좌표**로 찾는다.
      //   예전엔 브릭의 여덟 꼭짓점을 정점 가중치로 섞었는데, 그러면 조명 해상도가 브릭 단위라
      //   2x4 브릭 면이 2m짜리 그라데이션 한 장이 됐다. 이제 항상 한 칸(0.5m) 안에서 변한다.
      //   ⚠️ 이 블록은 템플릿 문자열 안이다. 주석에 백틱을 쓰면 문자열이 끊긴다(오늘 두 번 밟았다).
      #ifdef USE_INSTANCING
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      #else
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
      #endif
      // 월드(m) → 셀 → 볼륨 격자 → 텍스처 좌표.
      // ⚠️ **반 텍셀**을 더해 텍셀 중심을 겨눈다 — 빼먹으면 그늘이 통째로 반 칸 밀린다.
      //   lightVolume.ts의 volCoord/volUVW와 **같은 식**이어야 한다(테스트가 그쪽을 잠근다).
      vec3 g = vec3(wp.x / ${CELL_X}, wp.y / ${CELL_Y}, wp.z / ${CELL_Z}) - uVolOrigin;
      vLightUVW = (g + 0.5) / vec3(${VOL_X}.0, ${VOL_Y}.0, ${VOL_Z}.0);

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

      // 배율·세로면 정도는 **면마다 상수**라 정점에서 구해 넘긴다.
      // 밝기 자체는 프래그먼트가 볼륨에서 직접 읽는다(그래야 해상도가 칸 단위가 된다).
      vFace = vec2(tone, 1.0 - abs(wn.y));
    }`,
  );

  shader.fragmentShader = `
    uniform highp sampler3D uLightVol;
    varying vec3 vLightUVW;
    varying vec2 vFace;
    float bakedLight() {
      // ★★ **곡선은 그늘에만 씌운다.**
      //   정점 사이는 래스터라이저가 **직선**으로 섞으므로, 그대로 두면 접촉 그늘이 면 전체에
      //   완만히 퍼져 "blur를 먹인 것처럼" 보인다(사용자 피드백). 부족분에 지수를 씌우면
      //   어두운 자리는 그대로 어둡고 조금만 떨어져도 빠르게 회복한다.
      //
      // 🔴 한때 이 곡선을 **하늘빛까지** 먹였다. 그러면 나무 밑·실내가 계산상 0.87인데
      //    화면엔 0.99로 나와 **그늘이 통째로 사라진다**(실측). 하늘빛은 **그대로 쓰는 밝기**다.
      // ★★★ 밝기를 **볼륨에서 직접** 읽는다 — R=하늘빛, G=그늘. 조회 한 번에
      //   하드웨어가 이웃 칸끼리 선형 보간해 주므로 그라데이션이 **항상 한 칸(0.5m)** 안에서 끝난다.
      vec2 lv = texture(uLightVol, vLightUVW).rg;
      float sky = clamp(lv.r, 0.0, 1.0);
      float ao  = clamp(lv.g, 0.0, 1.0);

      // ★ **세로면에서는 그늘을 덜어낸다** — 꼭짓점 계산이 같은 평면의 이웃까지 가림막으로 세어
      //   평평한 벽 밑동을 한 단계 더 어둡게 만드는 것을 상쇄한다. **하늘빛이 아니라 그늘에만.**
      ao = mix(ao, 1.0, vFace.y * ${AO_WALL_RELIEF.toFixed(2)});

      return sky * (1.0 - pow(1.0 - ao, ${SHADE_CURVE.toFixed(2)})) * vFace.x;
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
/**
 * ⚠️ **재질을 리전마다 따로 만든다** — 빛 볼륨이 리전마다 다르기 때문이다.
 *
 * 공유 재질 하나에 메시별로 uniform을 갈아 끼우는 방법도 있지만, three는 **재질이 그대로면
 * uniform 업로드를 건너뛰므로** 앞 리전의 빛이 그대로 남는다(에러 없이 명암만 틀린다).
 * 복제해도 `onBeforeCompile`이 **같은 함수 참조**라 셰이더 프로그램은 재사용된다 — 컴파일은 한 번뿐.
 */
function materialFor(
  mat: MatClass, edges: boolean, matte: boolean, light: RegionLight | null,
): THREE.MeshStandardMaterial {
  const key = `${mat}|${edges ? 'e' : '-'}|${matte ? 'm' : '-'}|${light ? light.origin.toArray().join(',') : 'x'}`;
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
      // 발광 브릭은 스스로 빛나므로 하늘빛을 곱하지 않는다. 무늬는 발광에도 얹는다
      injectTexture(shader);
      if (edges) injectEdgeLines(shader);
    };
  } else {
    // 지형(흙·돌)은 무광, 브릭은 ABS 플라스틱다운 옅은 광택
    m = new THREE.MeshStandardMaterial({ roughness: matte ? 0.98 : 0.72, metalness: 0 });
  }
  if (mat !== 'emissive') {
    m.onBeforeCompile = (shader) => {
      // 빛 볼륨 — 이 재질이 맡은 리전의 것. 값 객체를 그대로 물려 두면 나중에 다시 구워도 따라온다
      shader.uniforms.uLightVol = { value: light ? light.tex : null };
      shader.uniforms.uVolOrigin = { value: light ? light.origin : new THREE.Vector3() };
      injectTexture(shader);
      injectBakedLight(shader);
      // 이음매 지우기는 **반투명에만** — 불투명에 걸면 유리 뒤가 뚫리고 early-Z도 무뎌진다
      if (mat === 'transparent') injectHiddenFaces(shader);
      if (edges) injectEdgeLines(shader);
    };
  }
  materialCache.set(key, m);
  return m;
}

// ★ 예전엔 여기 `CORNER_MAP`(로컬↔월드 꼭짓점 대응표)이 있었다. 브릭 꼭짓점 밝기를
//   인스턴스로 넘기던 시절, **회전한 브릭의 슬롯을 맞추려고** 필요했던 표다.
//   이제 셰이더가 **월드 좌표로** 빛 볼륨을 읽으므로 대응시킬 것이 없다 — 표째로 사라졌다.
//   (표 자체는 `rotation.cornerMap`에 남아 있고 테스트가 계속 지킨다)

/**
 * 회전 24가지를 three 행렬로 미리 만들어 둔다.
 *
 * ★ 예전엔 `setFromAxisAngle(Y, rot·90°)` 한 줄이었다 — Y축 회전밖에 없었으니 그걸로 충분했다.
 *   세우면 축이 섞이므로 **각도로는 표현이 안 된다.** 회전표를 그대로 행렬에 옮긴다
 *   (정수 ±1만 들어가서 부동소수 오차도 없다 — 각도로 만들면 cos 90°가 6e−17이 된다).
 */
const ROT_MATRICES: THREE.Matrix4[] = Array.from({ length: ROT_COUNT }, (_, rot) => {
  const r = rotMatrixVisual(rot);
  return new THREE.Matrix4().set(
    r[0], r[1], r[2], 0,
    r[3], r[4], r[5], 0,
    r[6], r[7], r[8], 0,
    0, 0, 0, 1,
  );
});

const ROT_QUATERNIONS: THREE.Quaternion[] =
  ROT_MATRICES.map((m) => new THREE.Quaternion().setFromRotationMatrix(m));

/**
 * 메시 **하나**를 그 방향으로 돌릴 때 쓴다(지우기 강조·고스트).
 * 인스턴스 렌더는 행렬을 직접 쓴다 — 쿼터니언을 거칠 이유가 없다.
 */
export function brickQuaternion(rot: number): THREE.Quaternion {
  return ROT_QUATERNIONS[((rot % ROT_COUNT) + ROT_COUNT) % ROT_COUNT];
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

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

function BrickGroup({ group, world, studStyle, light, onHover }: {
  group: Group; world: BrickWorld; studStyle: StudStyle; light: RegionLight | null;
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
  const material = materialFor(group.mat, studStyle === 'line', group.part === 'terrain', light);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const n = group.ids.length;
    const tiles = new Float32Array(n * 3); // 무늬 칸 (윗면, 옆면, 밑면) — 0 = 민짜
    const hide = new Float32Array(n);      // 가려진 면 6비트 — 반투명 이음매를 지운다

    group.ids.forEach((brickId, i) => {
      const b = world.bricks.get(brickId);
      if (!b) return;
      const [wx, wy, wz] = anchorCenterWorld(b, PARTS[b.part], b.rot);
      // 회전 행렬에 **중심 좌표만 얹는다** — 크기는 늘 1이라 compose를 거칠 이유가 없다.
      _m.copy(ROT_MATRICES[b.rot]);
      _m.setPosition(_p.set(wx, wy, wz));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(b.color));
      const [tTop, tSide, tBottom] = faceSlots(b.tex ?? 0);
      tiles[i * 3] = tTop; tiles[i * 3 + 1] = tSide; tiles[i * 3 + 2] = tBottom;
      hide[i] = world.faceHidden.get(brickId) ?? 0;
      // ★ 꼭짓점 밝기를 인스턴스로 넘기던 것은 없앴다 — 이제 셰이더가 **빛 볼륨**에서 직접 읽는다.
      //   그래야 조명 해상도가 브릭이 아니라 **칸**이 된다(BRICK_PLAN.md §18).
    });

    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 3));
    geo.setAttribute('aHide', new THREE.InstancedBufferAttribute(hide, 1));

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
  // ★ 빛 볼륨도 리전 리비전에 맞춰 다시 굽는다 — 그룹을 다시 만드는 그 시점이다
  const light = useMemo(() => lightFor(world, regionKey, rev), [world, regionKey, rev]);
  useLayoutEffect(() => { onGroups(regionKey, groups); }, [regionKey, groups, onGroups]);

  return (
    <>
      {groups.map((g) => (
        <BrickGroup key={g.key} group={g} world={world} studStyle={studStyle} light={light} onHover={onHover} />
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

  // 사라진 리전의 빛 볼륨을 버린다 — 안 버리면 걸어 다닌 만큼 메모리가 는다(B-0b)
  useLayoutEffect(() => { dropUnusedLights(new Set(regions.map((r) => r.key))); }, [regions]);

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
