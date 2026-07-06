'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 렌더러 톤매핑을 LinearToneMapping으로 고정한다 (색 정확도 우선).
 *
 * R3F 기본값은 ACESFilmicToneMapping인데, ACES는 영화적 룩을 위해 채도를 낮추고
 * 중간톤을 들어올려 사용자가 지정한 진한 색이 밝고 파스텔톤으로 밀린다.
 * 실제 조명 조건에서 픽셀을 측정해 비교한 결과(저장색 대비 유클리드 거리 Δ):
 *   none(Δ~10) ≈ linear(Δ~10)  <  aces(Δ~20)  <  neutral(Δ~28)
 * Linear는 `exposure * color`라 in-gamut 색을 (노출 1에서) 거의 그대로 렌더하면서도
 * NoToneMapping과 달리 **노출(exposure) 조절이 유효**하다 — 노코드 에디터의
 * "고른 색이 화면 색"이라는 기대에 가장 부합한다.
 *
 * 트레이드오프: 값이 1.0을 넘는 밝은 영역은 부드러운 롤오프 없이 하드클립된다.
 * 기본 조명 리그에선 diffuse가 1을 넘지 않아 안전하고, 밝은 HDR/강한 광을 쓰면
 * 씬별 노출 슬라이더로 낮춰 클리핑을 억제할 수 있다.
 *
 * toneMapping 값 자체는 Canvas의 gl prop에서 init 시 이미 Linear로 지정하므로
 * 여기서 재설정해도 no-op(재컴파일 없음)이고, exposure(uniform)만 씬 설정에 따라
 * 반응적으로 갱신한다 — exposure는 셰이더 재컴파일이 필요 없는 uniform이라 저렴하다.
 */
export function SceneToneMapping({ exposure = 1 }: { exposure?: number }) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const prevMapping = gl.toneMapping;
    const prevExposure = gl.toneMappingExposure;
    // three.js 렌더러 필드를 직접 설정하는 표준 명령형 API — 의도적 변경 (DefaultEnvironment와 동일 패턴)
    /* eslint-disable react-hooks/immutability */
    gl.toneMapping = THREE.LinearToneMapping;
    gl.toneMappingExposure = exposure;
    return () => {
      gl.toneMapping = prevMapping;
      gl.toneMappingExposure = prevExposure;
    };
    /* eslint-enable react-hooks/immutability */
  }, [gl, exposure]);

  return null;
}
