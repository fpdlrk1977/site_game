// 오브젝트 앵커(피벗) 변형 수학 — doc/PIVOT_MANIPULATION.md Layer 1.
//   앵커 = 정규화 0..1(0=min면·0.5=중심·1=max면). 실제 로컬 점 A = lerp(localBBox.min, localBBox.max, pivot).
//   스케일/회전이 바뀔 때 A(월드 위치)가 고정되도록 오브젝트 원점(position)을 보정한다.
//   animPivot.pivotOffset(회전 케이스)의 일반화.
import * as THREE from 'three';
import type { Vector3 } from '@/types/scene';

const DEG2RAD = Math.PI / 180;
const _min = new THREE.Vector3();
const _max = new THREE.Vector3();
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();

/** 정규화 앵커(0..1) → 지오메트리-로컬 점(스케일 전). localBBox는 자기 TRS 적용 전 bbox. */
export function anchorLocalPoint(localBBox: THREE.Box3, pivot: Vector3): THREE.Vector3 {
  _min.copy(localBBox.min);
  _max.copy(localBBox.max);
  return new THREE.Vector3(
    _min.x + (_max.x - _min.x) * pivot.x,
    _min.y + (_max.y - _min.y) * pivot.y,
    _min.z + (_max.z - _min.z) * pivot.z,
  );
}

/** 앵커가 중심(0.5,0.5,0.5)이고 bbox 중심=원점이면 보정 불필요 판정용(프리미티브 등). */
export function isCenterAnchor(pivot?: Vector3): boolean {
  return !pivot || (pivot.x === 0.5 && pivot.y === 0.5 && pivot.z === 0.5);
}

/**
 * 스케일 s0→s1(회전 R 고정) 시 앵커 A를 고정하기 위한 position 보정 Δ.
 *   월드 앵커오프셋 = R·(A ⊙ scale). 고정 → Δposition = R·(A ⊙ (s0 − s1)).
 * rotationDeg = 오브젝트 오일러(도). A = anchorLocalPoint 결과(지오메트리-로컬).
 */
export function scaleAnchorDelta(
  A: THREE.Vector3, rotationDeg: Vector3, s0: Vector3, s1: Vector3,
): Vector3 {
  _v0.set(A.x * (s0.x - s1.x), A.y * (s0.y - s1.y), A.z * (s0.z - s1.z));
  _euler.set(rotationDeg.x * DEG2RAD, rotationDeg.y * DEG2RAD, rotationDeg.z * DEG2RAD, 'XYZ');
  _q.setFromEuler(_euler);
  _v0.applyQuaternion(_q);
  return { x: _v0.x, y: _v0.y, z: _v0.z };
}

/**
 * 회전 R0→R1(스케일 s 고정) 시 앵커 A를 고정하기 위한 position 보정 Δ.
 *   Δposition = R0·(A⊙s) − R1·(A⊙s).  (animPivot.pivotOffset의 일반화 — Phase 3 회전 앵커용)
 */
export function rotateAnchorDelta(
  A: THREE.Vector3, scale: Vector3, rot0Deg: Vector3, rot1Deg: Vector3,
): Vector3 {
  const p = _v1.set(A.x * scale.x, A.y * scale.y, A.z * scale.z);
  _euler.set(rot0Deg.x * DEG2RAD, rot0Deg.y * DEG2RAD, rot0Deg.z * DEG2RAD, 'XYZ');
  _v0.copy(p).applyQuaternion(_q.setFromEuler(_euler));
  const ax = _v0.x, ay = _v0.y, az = _v0.z;
  _euler.set(rot1Deg.x * DEG2RAD, rot1Deg.y * DEG2RAD, rot1Deg.z * DEG2RAD, 'XYZ');
  _v0.copy(p).applyQuaternion(_q.setFromEuler(_euler));
  return { x: ax - _v0.x, y: ay - _v0.y, z: az - _v0.z };
}
