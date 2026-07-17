import * as THREE from 'three';
import type { ActuatorConfig } from '@/types/scene';

// 관절(액추에이터) 런타임 수학 — doc/PIVOT_MANIPULATION.md §6.
//   경첩(hinge) 기준으로 한 축을 min~max 범위에서 구동. 시각(ViewerObject)과 플레이 콜라이더가 공유.
//   경첩 고정은 computeMotion의 피벗 보정과 동일한 쿼터니언 방식(회전 전후 경첩 월드위치 일치 → 원점 보정).

const DEG2RAD = Math.PI / 180;
const _baseQuat = new THREE.Quaternion();
const _axisQuat = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _euler = new THREE.Euler();
const _hs = new THREE.Vector3(); // 경첩 스케일드 로컬 오프셋
const _hb = new THREE.Vector3(); // 경첩 월드(회전 전) / slide 방향
const _ha = new THREE.Vector3(); // 경첩 월드(회전 후)

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 구동값(0..1) 산출 — manual/oscillate는 여기서, variable/event(5b)는 호출부가 override. */
export function computeDriveValue(act: ActuatorConfig, t: number): number {
  if (act.drive === 'oscillate') {
    const spd = act.speed ?? 1;
    if (act.loop === 'forward') return (((t * spd * 0.2) % 1) + 1) % 1; // 0→1 반복
    return (Math.sin(t * spd) + 1) / 2; // pingpong(기본)
  }
  return clamp01(act.value ?? 0); // manual/variable/event 기본
}

/**
 * 베이스 변환(pos/rot(라디안)/scl)에 관절 델타를 적용해 out에 쓴다.
 * hingeLocal = 경첩의 지오메트리-로컬 점(anchorLocalPoint 결과, 스케일 전). null이면 원점 기준.
 * driveValue = 0..1 (min→max).
 */
export function computeActuator(
  act: ActuatorConfig,
  hingeLocal: THREE.Vector3 | null,
  basePos: [number, number, number],
  baseRot: [number, number, number], // radians
  baseScl: [number, number, number],
  driveValue: number,
  out: { pos: THREE.Vector3; quat: THREE.Quaternion; scl: THREE.Vector3 },
): void {
  const dv = clamp01(driveValue);
  _euler.set(baseRot[0], baseRot[1], baseRot[2], 'XYZ');
  _baseQuat.setFromEuler(_euler);
  out.scl.set(baseScl[0], baseScl[1], baseScl[2]);
  out.pos.set(basePos[0], basePos[1], basePos[2]);
  _axis.set(act.axis === 'x' ? 1 : 0, act.axis === 'y' ? 1 : 0, act.axis === 'z' ? 1 : 0);

  if (act.kind === 'slide') {
    const d = lerp(act.min, act.max, dv);
    _hb.copy(_axis).applyQuaternion(_baseQuat).multiplyScalar(d); // 오브젝트 회전 반영한 이동
    out.pos.add(_hb);
    out.quat.copy(_baseQuat);
    return;
  }

  // rotate — 로컬 축 기준 회전(post-multiply → 눕히거나 기운 물체도 축 기준으로 깔끔히)
  const angle = lerp(act.min, act.max, dv) * DEG2RAD;
  _axisQuat.setFromAxisAngle(_axis, angle);
  out.quat.copy(_baseQuat).multiply(_axisQuat);

  // 경첩 고정 — 경첩 월드오프셋이 회전 전후 같도록 원점 보정.
  if (hingeLocal) {
    _hs.set(hingeLocal.x * baseScl[0], hingeLocal.y * baseScl[1], hingeLocal.z * baseScl[2]);
    _hb.copy(_hs).applyQuaternion(_baseQuat); // 회전 전 경첩 위치
    _ha.copy(_hs).applyQuaternion(out.quat);  // 회전 후 경첩 위치
    out.pos.add(_hb).sub(_ha);
  }
}
