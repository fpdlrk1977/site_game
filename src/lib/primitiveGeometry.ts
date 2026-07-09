// 프리미티브 지오메트리 단일 팩토리 — 에디터/뷰어/인스턴싱이 이 함수 하나를 공유한다.
// (기존엔 각 렌더 경로에 <boxGeometry> 등이 인라인 중복돼 있었음 → 확장 파라미터를 한 곳에서 처리)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PrimitiveShape, PrimitiveGeom } from '@/types/scene';

const HALF_DIAG = 0.5 * Math.SQRT2; // 한 변이 1인 정사각의 대각 절반(4각 lathe/cylinder 반경)

// 각뿔대(위/아래 넓이 다른 박스): 4각 실린더를 45° 회전해 축정렬 사각 단면으로.
// 반경 = 0.5√2 (대각 절반)이면 한 변이 1인 정사각. topScale로 윗면만 축소.
function makeFrustumBox(topScale: number): THREE.BufferGeometry {
  const t = Math.max(0, Math.min(1, topScale));
  const g = new THREE.CylinderGeometry(HALF_DIAG * t, HALF_DIAG, 1, 4);
  g.rotateY(Math.PI / 4); // 모서리가 대각선을 향하도록 → 평평한 면이 ±X/±Z 축에 정렬
  return g;
}

// 로프트(다단면): 아래→위 각 단면 배율(sections)로 사각 단면을 잇는다. 각뿔대의 N단면 일반화.
// LatheGeometry(4각) 프로파일 양끝을 축(반경 0)에 붙여 상·하 캡을 자동 생성 → 법선·캡·UV 안전.
function makeLoft(sections: number[] | undefined): THREE.BufferGeometry {
  const s = (sections && sections.length >= 2 ? sections : [1, 0.6]).map((v) => Math.max(0, Math.min(1, v)));
  const N = s.length;
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(0, -0.5)); // 아래 중심(캡)
  for (let i = 0; i < N; i++) {
    const y = -0.5 + i / (N - 1);
    pts.push(new THREE.Vector2(Math.max(1e-4, s[i] * HALF_DIAG), y)); // 각 단면 테두리(반경 0 회피)
  }
  pts.push(new THREE.Vector2(0, 0.5)); // 위 중심(캡)
  const g = new THREE.LatheGeometry(pts, 4);
  g.rotateY(Math.PI / 4);
  return g;
}

// 프리미티브 오브젝트의 지오메트리를 생성. 기본 크기는 기존 인라인 값과 동일(단위 박스·r0.5 구 등).
export function createPrimitiveGeometry(
  shape: PrimitiveShape | undefined,
  geom?: PrimitiveGeom,
): THREE.BufferGeometry {
  switch (shape) {
    case 'box': {
      const r = geom?.cornerRadius ?? 0;
      if (r > 0) {
        const radius = Math.min(Math.max(r, 0), 0.5); // 반변(0.5)까지 클램프
        const seg = Math.max(1, Math.round(geom?.cornerSegments ?? 4));
        return new RoundedBoxGeometry(1, 1, 1, seg, radius);
      }
      return new THREE.BoxGeometry(1, 1, 1);
    }
    case 'frustum':
      return makeFrustumBox(geom?.topScale ?? 0.5);
    case 'loft':
      return makeLoft(geom?.sections);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 32, 32);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case 'plane':
      return new THREE.PlaneGeometry(1, 1);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

// 인스턴싱/메모 캐시 키 — 같은 형태+파라미터면 같은 키(지오메트리 공유).
export function primitiveGeomKey(shape: PrimitiveShape | undefined, geom?: PrimitiveGeom): string {
  return `${shape ?? 'box'}|${geom?.cornerRadius ?? 0}|${geom?.cornerSegments ?? 4}|${geom?.topScale ?? 0.5}|${(geom?.sections ?? []).join(',')}`;
}
