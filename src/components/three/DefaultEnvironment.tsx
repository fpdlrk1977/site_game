'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three-stdlib';

/**
 * HDR 프리셋을 켜지 않아도 은은한 IBL(image-based lighting)을 제공한다.
 *
 * RoomEnvironment는 네트워크 요청 없이 절차적으로 생성되는 중립 스튜디오 환경이다.
 * 이걸 scene.environment로 넣으면 PBR 재질(metalness/roughness)이 반사·흡수할
 * 주변광이 생겨, 방향광 하나만 있을 때의 "납작하고 어두운" 느낌이 사라진다.
 * 배경(scene.background)은 건드리지 않고 반사/앰비언트 기여만 추가한다.
 *
 * HDR 프리셋이 켜진 경우(drei <Environment>가 scene.environment를 설정)에는
 * 렌더하지 않는다 — 호출부에서 조건부로 마운트할 것.
 */
export function DefaultEnvironment({ intensity = 0.35 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    // three-stdlib의 RoomEnvironment는 Scene을 반환하는 함수 (클래스 아님)
    const envTex = pmrem.fromScene(RoomEnvironment(), 0.04).texture;
    const prevEnv = scene.environment;
    const prevIntensity = scene.environmentIntensity;
    // three.js 씬 환경을 설정하는 표준 명령형 API — three 객체 필드 변경은 의도적
    /* eslint-disable react-hooks/immutability */
    scene.environment = envTex;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = prevEnv;
      scene.environmentIntensity = prevIntensity;
      envTex.dispose();
      pmrem.dispose();
    };
    /* eslint-enable react-hooks/immutability */
  }, [gl, scene, intensity]);

  return null;
}
