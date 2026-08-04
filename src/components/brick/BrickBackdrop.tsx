'use client';

// 배경(Environment) — 하늘 · 먼 땅 · 산 링 · 구름. 기준: doc/BRICK_PLAN.md §16
//
// ★★ **사용자는 Scene(브릭)만 편집·저장한다. 배경은 에디터가 항상 그린다.**
//    저장 대상이 아니므로 여기를 아무리 고쳐도 **지어 둔 월드는 안 바뀐다.**
//
// ★ 왜 필요한가: 지금까지는 안개가 46m에서 잠겨 **그 너머가 아예 없었다.** 카메라를 조금만 돌려도
//   "땅이 뚝 끊긴 가장자리"가 보였다. 배경이 그 끝을 가려 준다.
//
// ★★ 참고 구조도와 **한 군데만 다르게** 간다:
//    마인크래프트는 청크를 한 덩어리 메시로 합쳐 512m를 진짜 블록으로 채운다. 우리는 브릭을
//    하나하나 그리므로(색·무늬·회전이 브릭마다 자유로운 대가) 512m를 채우면 **바닥만 26만 개**다.
//    → 진짜 브릭은 가까이만, **중간 거리는 판 한 장**으로 때우고 안개가 이음매를 가린다.
//
// ★ 모든 배경 메시는 **레이캐스트에서 뺀다**(`raycast={() => null}`).
//   안 빼면 먼 땅 판을 클릭해 500m 밖에 브릭을 놓으려 든다.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CLOUD_TILE, CLOUD_Y, FAR_GROUND_COLOR, FAR_GROUND_INNER, FAR_GROUND_Y,
  MOUNTAIN_H, MOUNTAIN_R, MOUNTAIN_RINGS, MOUNTAIN_SEGMENTS,
  buildCloudAlpha, mountainColorAt, mountainTone, ridgeStep, skyColorAt,
} from '@/lib/brick/backdrop';

/** 먼 땅 고리의 바깥 반지름(m) — 가장 먼 산보다 넉넉히 밖까지 */
const FAR_GROUND_SIZE = MOUNTAIN_RINGS[MOUNTAIN_RINGS.length - 1].r * 2.5;
/** 구름 판의 크기(m) */
const CLOUD_SIZE = 6000;

// ── 하늘 ─────────────────────────────────────────────────────────────────

/**
 * 하늘 그라데이션 — **배경 텍스처**로 넣는다(메시가 아니다).
 *
 * ★ 큰 구를 띄우는 방법도 있지만 그러면 카메라 far·안개·클리핑을 전부 신경 써야 한다.
 *   배경 텍스처는 **깊이가 없어서** 그 셋 어디에도 안 걸린다.
 */
function useSkyTexture(): THREE.Texture {
  return useMemo(() => {
    const H = 128;
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < H; y++) {
      // 등장방형(equirect)은 v=0이 아래다 → 위로 갈수록 t가 커진다
      ctx.fillStyle = skyColorAt(1 - y / (H - 1));
      ctx.fillRect(0, y, 1, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

// ── 산 링 ────────────────────────────────────────────────────────────────

/**
 * 산 지오메트리 — **여러 겹의 고리**를 한 덩어리로 굽는다(draw call 1개).
 *
 * ★★ **각진 계단 실루엣**이 핵심이다(사용자 요청 — 브릭 월드와 어울리게).
 *   구간마다 높이를 **하나로 고정**하고, 구간끼리 정점을 **공유하지 않는다.**
 *   공유하면 three가 높이를 부드럽게 이어 버려서 다시 둥근 언덕이 된다.
 *
 * ★ 명암은 **정점 색에 구워 넣는다** — 씬에 방향광이 없어서(D-1) 그냥 두면 초록 덩어리로 보인다.
 */
function mountainGeometry(): THREE.BufferGeometry {
  const ROWS = 8; // 세로 분할 — 색(풀→바위→눈)이 변할 만큼만
  const SEG = MOUNTAIN_SEGMENTS;

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();

  for (const ring of MOUNTAIN_RINGS) {
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const top = ridgeStep(i, ring.phase) * ring.h; // 이 구간의 높이 — 구간 안에서 상수
      const tone = mountainTone((a0 + a1) / 2);
      const base = pos.length / 3;

      for (let j = 0; j <= ROWS; j++) {
        const v = j / ROWS;
        c.set(mountainColorAt(v * (top / ring.h)));
        c.multiplyScalar(tone);
        for (const a of [a0, a1]) {
          pos.push(Math.cos(a) * ring.r, v * top, Math.sin(a) * ring.r);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let j = 0; j < ROWS; j++) {
        const p = base + j * 2;
        idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ── 구름 ─────────────────────────────────────────────────────────────────

function useCloudTexture(): THREE.Texture {
  return useMemo(() => {
    const S = 128;
    const alpha = buildCloudAlpha(S);
    const data = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255;
      data[i * 4 + 3] = alpha[i];
    }
    const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(CLOUD_SIZE / CLOUD_TILE, CLOUD_SIZE / CLOUD_TILE);
    tex.colorSpace = THREE.SRGBColorSpace;
    // ★ **각진 가장자리를 지키려면 Nearest다.** 기본(Linear)이면 확대될 때 흐려져
    //   마인크래프트 같은 네모 구름이 아니라 뭉개진 얼룩이 된다(브릭 무늬가 NearestFilter인 것과 같은 이유).
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

// ── 조립 ─────────────────────────────────────────────────────────────────

export function BrickBackdrop() {
  const skyTex = useSkyTexture();
  const cloudTex = useCloudTexture();
  const mountains = useMemo(() => mountainGeometry(), []);

  /** 산·먼 땅은 카메라를 따라다닌다 — **무한 월드라 끝에 도달하면 안 된다** */
  const follow = useRef<THREE.Group>(null);
  /** 구름은 **무늬 한 칸 단위로만** 옮긴다. 그냥 따라오게 하면 무늬가 카메라에 붙어 안 흐른다 */
  const clouds = useRef<THREE.Group>(null);
  /** 무늬를 흘리려면 텍스처를 매 프레임 건드려야 한다 — **ref를 통해서만** 손댄다(훅 반환값 직접 수정 금지) */
  const cloudMesh = useRef<THREE.Mesh>(null);

  useFrame(({ camera }, dt) => {
    if (follow.current) {
      follow.current.position.x = camera.position.x;
      follow.current.position.z = camera.position.z;
    }
    if (clouds.current) {
      clouds.current.position.x = Math.round(camera.position.x / CLOUD_TILE) * CLOUD_TILE;
      clouds.current.position.z = Math.round(camera.position.z / CLOUD_TILE) * CLOUD_TILE;
    }
    // 천천히 흐른다 — 빠르면 어지럽고, 아예 멈춰 있으면 그림처럼 보인다
    const map = (cloudMesh.current?.material as THREE.MeshBasicMaterial | undefined)?.map;
    if (map) map.offset.x += dt * 0.0035;
  });

  return (
    <>
      <primitive attach="background" object={skyTex} />

      <group ref={follow}>
        {/* 먼 땅 — 진짜 브릭이 끝나는 자리부터 산까지를 메운다. 색은 잔디 평균에 맞췄다.
            ★★ **가운데가 뚫린 고리다.** 통짜 판으로 깔았더니 지면 높이의 판이 **파낸 구덩이를 덮어**
            "바닥이 안 파인다"로 보였다(사용자 보고). 안쪽 구멍은 진짜 지형이 깔리는 범위보다
            작아서, 겹치는 자리는 진짜 지형이 위에 있어 안 보인다 — 빈 틈도 안 생긴다. */}
        <mesh
          position={[0, FAR_GROUND_Y, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
          renderOrder={-2}
        >
          <ringGeometry args={[FAR_GROUND_INNER, FAR_GROUND_SIZE, 96, 1]} />
          <meshBasicMaterial color={FAR_GROUND_COLOR} side={THREE.DoubleSide} fog />
        </mesh>

        {/* 산 링 — 명암은 정점 색에 구워져 있다.
            ⚠️ **양면으로 그린다.** 안쪽에서 보니 `BackSide`면 될 것 같지만, 그건 삼각형을 어느 순서로
            엮었느냐에 달려 있어서 틀리면 **산이 통째로 안 보인다**(실제로 그랬다). 메시 하나뿐이라
            양면 비용은 무시할 수 있고, 밖에서 봐도 안 사라진다. */}
        <mesh raycast={() => null} renderOrder={-1} geometry={mountains}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} fog />
        </mesh>
      </group>

      {/* 구름 — 지을 수 있는 높이(89m)보다 한참 위라 브릭과 안 겹친다 */}
      <group ref={clouds}>
        <mesh ref={cloudMesh} position={[0, CLOUD_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[CLOUD_SIZE, CLOUD_SIZE]} />
          <meshBasicMaterial
            map={cloudTex}
            transparent
            opacity={0.85}
            depthWrite={false}
            side={THREE.DoubleSide}
            fog
          />
        </mesh>
      </group>
    </>
  );
}

export { MOUNTAIN_H, MOUNTAIN_R };
