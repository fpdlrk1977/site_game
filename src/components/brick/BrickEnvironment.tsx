'use client';

// 브릭 씬의 배경·조명 — **에디터·뷰어가 같이 쓰는 하나의 룩.** `<Canvas>` 안에 넣는다.
//
// ★ 조명은 **평평한 환경광 하나뿐**이다 — 마인크래프트와 같은 모델.
//   입체감은 전부 **구운 값**이 만든다(하늘빛 전파 × 면 방향 고정 배율, `world.FACE_TONE`).
//   방향광을 쓰면 그 위에 **움직이는 음영**이 겹쳐서, 블록을 쌓으면 옆 블록에 그림자가 지고
//   카메라를 돌릴 때마다 어떤 면은 직사광선처럼 번쩍인다. 마크엔 태양 방향이 없다.
//   → **방향광·그림자 맵은 넣지 않는다.** (그림자 패스는 실측에서 프레임의 절반인 10.3ms였다)
//
// ★ 배경·안개 색이 룩을 좌우한다 — 실시간 그림자를 끈 뒤로는 특히.
//   어두운 배경에 안개를 멀리 두면 먼 지형이 검게 사그라들어 "카메라 주변만 밝은 스포트라이트"처럼
//   보인다. 낮 하늘 톤 + 지평선과 같은 색의 안개가 자연스러운 원경을 만든다.

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BrickBackdrop } from './BrickBackdrop';
import { CAMERA_FAR, FOG_FAR, FOG_NEAR, SKY_HORIZON } from '@/lib/brick/backdrop';

/** 안개 색 — **하늘의 지평선 색과 같아야** 먼 것이 하드컷 없이 잠긴다 */
export const BRICK_SKY = SKY_HORIZON;
/**
 * 안개 시작·끝(m).
 *
 * ★ 예전엔 `[18, 46]`이었다 — 안개가 장식이 아니라 **가리개**였기 때문이다.
 *   땅이 카메라 주변 48m만 깔리므로 그 **잘린 가장자리를 안개로 덮고** 있었다.
 *   이제 배경(`BrickBackdrop`)이 그 너머를 채우므로 안개를 제 역할(원근감)로 돌려놓는다.
 *
 * ⚠️ **배경 없이 이 숫자만 늘리면 땅 끝이 그대로 드러난다.** 둘은 한 쌍이다.
 */
export const BRICK_FOG: [number, number] = [FOG_NEAR, FOG_FAR];
/**
 * 환경광 세기 — 유일한 광원. **`π`가 정답이다.**
 *
 * ★ three는 환경광을 **`intensity / π`** 로 쓴다(`irradiance × BRDF_Lambert`, 램버트에 `1/π`가 들어 있다).
 *   그래서 `π`여야 **알베도가 1:1로 나온다** — 고른 색이 화면에 그 색 그대로, 흰 브릭이 진짜 흰색(255).
 *   그 위에서 면 배율·AO가 **깎기만** 하므로 잘리는 값도 없다(톤매핑이 Linear라 1.0 초과는 잘린다).
 *
 * ⚠️ **π보다 낮추면 그늘이 안 보인다** — 값이 잘려서가 아니라 **바닥이 어두워져서**다.
 *   어두운 색 위에서는 같은 배율이라도 절대 차이가 작아 눈에 안 띈다. 실측:
 *
 *     환경광 1.0 → 갈색 바닥 61/255, 밑동 그늘 46 (차이 15 — 안 보인다)
 *     환경광 π   → 갈색 바닥 107,     밑동 그늘 88 (차이 19 — 밝은 바닥이라 잘 보인다)
 *
 *   (검증법: 흰색이 화면에서 255로 나오면 맞다. 1.0일 땐 153이었다.)
 */
export const BRICK_AMBIENT = Math.PI;

/**
 * 카메라 far를 **여기서** 늘린다 — 산이 1km 밖에 있어서 기본값(2000)으론 아슬아슬하다.
 *
 * ★ 각 `<Canvas camera={{...}}>`에 손으로 적지 않는 이유: 지금 캔버스가 셋(프로토타입·에디터·뷰어)이라
 *   **반드시 갈라진다.** 실제로 배경·조명이 그렇게 갈라져 있었다(프로토타입만 옛 환경광 1.6).
 */
function CameraRange() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const prev = camera.far;
    /* eslint-disable react-hooks/immutability */
    camera.far = CAMERA_FAR;
    camera.updateProjectionMatrix();
    return () => {
      camera.far = prev;
      camera.updateProjectionMatrix();
    };
    /* eslint-enable react-hooks/immutability */
  }, [camera]);
  return null;
}

export function BrickEnvironment() {
  return (
    <>
      {/* 배경이 하늘(그라데이션)까지 맡는다 — 단색 `<color attach="background">`를 대신한다 */}
      <fog attach="fog" args={[BRICK_SKY, BRICK_FOG[0], BRICK_FOG[1]]} />
      <ambientLight intensity={BRICK_AMBIENT} />
      <CameraRange />
      <BrickBackdrop />
    </>
  );
}
