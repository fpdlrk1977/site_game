import * as THREE from 'three';

/**
 * 프리미티브 지오메트리 키(shape+geom 서명) → 로컬 좌표계 바운딩박스 캐시.
 *
 * `EditorObjectInstance`가 렌더 시 계산한 `primGeom`(정규화된 지오메트리, 오브젝트 TRS 적용 전)의
 * 실제 bbox를 여기에 저장한다. `objectBBox.localBBox`가 이 값을 읽어 프리미티브의 실제 크기를
 * 반영한다 — 예전엔 모든 프리미티브를 단위 큐브(1×1×1)로 가정해 돌출/로프트/평면처럼 한 축이
 * 얇은 형상에서 드래그 선택 아웃라인·정렬·바닥 스냅의 높이/두께가 과대 계산되던 문제를 해결.
 * (box/구체/원기둥은 bbox가 원래 1×1×1이라 무변화.) 캐시 미스 시 localBBox가 단위 큐브로 폴백.
 */
export const primLocalBboxCache = new Map<string, THREE.Box3>();
