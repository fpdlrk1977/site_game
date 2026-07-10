// 프리미티브 지오메트리 단일 팩토리 — 에디터/뷰어/인스턴싱이 이 함수 하나를 공유한다.
// (기존엔 각 렌더 경로에 <boxGeometry> 등이 인라인 중복돼 있었음 → 확장 파라미터를 한 곳에서 처리)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PrimitiveShape, PrimitiveGeom } from '@/types/scene';

// 지오메트리를 원점 중심 + 최대 변 1로 정규화(프리미티브 단위 박스 관례에 맞춤 → bbox/바닥스냅/기즈모 일관).
function normalizeUnit(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const b = g.boundingBox;
  if (!b) return g;
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const maxDim = Math.max(sx, sy, sz, 1e-3);
  g.translate(-cx, -cy, -cz);
  g.scale(1 / maxDim, 1 / maxDim, 1 / maxDim);
  g.computeVertexNormals();
  return g;
}

// 펜 툴 프로파일 → 돌출(Extrude). 2D 단면을 두께만큼 밀어 세운 기둥(별 기둥 등). 세워지도록 돌출축을 Y로 회전.
function makeExtrude(profile: { x: number; y: number }[] | undefined, depth: number): THREE.BufferGeometry {
  if (!profile || profile.length < 3) return new THREE.BoxGeometry(1, 1, 1);
  const shape = new THREE.Shape(profile.map((p) => new THREE.Vector2(p.x, p.y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth), bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2); // XY 단면 + Z돌출 → XZ 단면 + Y(수직) 돌출(기둥처럼 서게)
  return normalizeUnit(g);
}

// 펜 툴 프로파일 → 회전체(Lathe). 반쪽 단면(x=축 거리, y=높이)을 Y축 기준 360° 회전(도자기·컵·와인잔).
// closed면 단면 폐곡선(첫점=끝점)을 축에서 떨어뜨려 회전 → 도넛·링.
function makeLathe(profile: { x: number; y: number }[] | undefined, closed: boolean): THREE.BufferGeometry {
  if (!profile || profile.length < 2) return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
  const pts = profile.map((p) => new THREE.Vector2(Math.max(0.0001, p.x), p.y));
  if (closed && pts.length >= 3) pts.push(pts[0].clone()); // 단면 폐곡선 닫기
  const g = new THREE.LatheGeometry(pts, 48);
  return normalizeUnit(g);
}

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
    case 'extrude':
      return makeExtrude(geom?.profile, geom?.extrudeDepth ?? 0.5);
    case 'lathe':
      return makeLathe(geom?.profile, geom?.profileClosed ?? false);
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
// profile 서명 — 점 개수 + 앞뒤 좌표(전체 JSON 대신 저렴하게). 편집이 드물어 충돌 위험 낮음.
export function profileSig(geom?: PrimitiveGeom): string {
  const p = geom?.profile;
  if (!p || p.length === 0) return '';
  const f = p[0], l = p[p.length - 1];
  return `${p.length}:${f.x.toFixed(3)},${f.y.toFixed(3)}:${l.x.toFixed(3)},${l.y.toFixed(3)}`;
}

export function primitiveGeomKey(shape: PrimitiveShape | undefined, geom?: PrimitiveGeom): string {
  return `${shape ?? 'box'}|${geom?.cornerRadius ?? 0}|${geom?.cornerSegments ?? 4}|${geom?.topScale ?? 0.5}|${(geom?.sections ?? []).join(',')}|${geom?.extrudeDepth ?? 0}|${geom?.profileClosed ? 'C' : 'O'}|${profileSig(geom)}`;
}
