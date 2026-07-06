import * as THREE from 'three';

/**
 * GLB URL → 모델 로컬 좌표계 바운딩박스 캐시.
 *
 * `GlbObject`가 렌더 시 `Box3().setFromObject(clone)`로 계산한 로컬 bbox(에디터의
 * position/rotation/scale이 적용되기 전, 모델 자체 좌표계)를 여기에 저장한다.
 * 인스펙터의 "바닥에 놓기" 버튼이 이 값을 읽어 오브젝트의 회전·스케일을 적용한 뒤
 * 실제 밑면(min.y)을 바닥(y=0)에 맞춘다 — GLB를 다시 로드하지 않고 계산할 수 있다.
 */
export const glbLocalBboxCache = new Map<string, THREE.Box3>();
