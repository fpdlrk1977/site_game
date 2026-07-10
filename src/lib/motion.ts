import * as THREE from 'three';
import type { MotionConfig } from '@/types/scene';

// spin 회전 합성용 스크래치 (프레임당 할당 방지)
const _baseQuat = new THREE.Quaternion();
const _spinQuat = new THREE.Quaternion();
const _spinAxis = new THREE.Vector3();
const _baseEuler = new THREE.Euler();
const _pivV = new THREE.Vector3();
const _pivA = new THREE.Vector3();
const _pivB = new THREE.Vector3();

// wander(유동) 로밍 상태 — 인스턴스별로 하나씩 보관
export interface WanderState {
  cur: THREE.Vector3;
  target: THREE.Vector3 | null;
}
export function makeWanderState(): WanderState {
  return { cur: new THREE.Vector3(), target: null };
}

/**
 * 베이스 변환(pos/rot(라디안)/scl)에 모션 델타를 적용해 out에 쓴다.
 * 시각(MotionGroup)과 플레이 콜라이더(kinematic 구동)가 동일 로직을 공유한다.
 */
export function computeMotion(
  motion: MotionConfig,
  basePos: [number, number, number],
  baseRot: [number, number, number],
  baseScl: [number, number, number],
  t: number,
  dt: number,
  wander: WanderState,
  out: { pos: THREE.Vector3; rot: THREE.Euler; scl: THREE.Vector3; quat: THREE.Quaternion },
  // 회전 피벗(오브젝트 로컬 형상 중심, 스케일 적용 전). 지정하면 원점이 아니라 이 중심을 축으로 회전한다.
  // (그룹은 원점=자식 위치 평균이라 형상 중심과 어긋나 spin이 wobble → 중심 피벗으로 제자리 회전)
  pivot?: [number, number, number] | null,
): void {
  const spd = motion.speed ?? 1;
  let px = basePos[0], py = basePos[1], pz = basePos[2];
  let s = 1;
  let spinAngle: number | null = null; // null이면 회전 델타 없음(baseRot 유지)

  switch (motion.type) {
    case 'float':
      py += Math.sin(t * spd) * (motion.amplitude ?? 0.5);
      break;
    case 'spin':
      spinAngle = t * spd;
      break;
    case 'pulse':
      s = 1 + Math.sin(t * spd * 2) * (motion.amplitude ?? 0.2);
      break;
    case 'orbit': {
      const r = motion.radius ?? 2;
      px += Math.cos(t * spd) * r;
      pz += Math.sin(t * spd) * r;
      break;
    }
    case 'wander': {
      const r = Math.max(0.5, motion.radius ?? 3);
      const rand = () => Math.random() * 2 - 1;
      if (!wander.target) wander.target = new THREE.Vector3(rand() * r, rand() * r * 0.3, rand() * r);
      const dtc = Math.min(dt, 0.05);
      wander.cur.lerp(wander.target, 1 - Math.pow(0.5, dtc * spd * 0.6));
      if (wander.cur.distanceTo(wander.target) < r * 0.08) {
        wander.target.set(rand() * r, rand() * r * 0.3, rand() * r);
      }
      px += wander.cur.x;
      py += wander.cur.y;
      pz += wander.cur.z;
      break;
    }
  }

  out.pos.set(px, py, pz);
  // 회전은 '쿼터니언'을 최종 출력으로 삼는다(out.quat). 소비처(시각 g.quaternion / 콜라이더 setNextKinematicRotation)가
  // 이 쿼터니언을 그대로 써서 오일러 왕복(quat→euler→quat)을 없앤다 → 기울인 물체·특정 각도에서의 미세 wobble/짐벌 제거.
  _baseEuler.set(baseRot[0], baseRot[1], baseRot[2], 'XYZ');
  _baseQuat.setFromEuler(_baseEuler); // 기본 회전(스핀 전) — 피벗 보정에도 사용
  if (spinAngle !== null) {
    // 기본 회전(baseRot) 이후 '오브젝트 로컬 축' 기준으로 회전(post-multiply) → 눕히거나 기울인 물체도 축 기준으로 깔끔히 돈다.
    const ax = motion.axis ?? 'y';
    _spinAxis.set(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0);
    _spinQuat.setFromAxisAngle(_spinAxis, spinAngle);
    out.quat.copy(_baseQuat).multiply(_spinQuat);
  } else {
    out.quat.copy(_baseQuat);
  }
  out.rot.copy(_baseEuler); // 하위호환용(현재 소비처는 out.quat 사용).

  // 피벗 보정 — 원점이 아니라 형상 중심(pivot)을 축으로 회전. 회전이 바뀐 만큼만 위치를 보정하므로
  // 순수 이동 모션(float/orbit/wander, 회전 불변)엔 영향이 없다.
  if (pivot && (pivot[0] !== 0 || pivot[1] !== 0 || pivot[2] !== 0)) {
    _pivV.set(pivot[0] * baseScl[0], pivot[1] * baseScl[1], pivot[2] * baseScl[2]);
    _pivA.copy(_pivV).applyQuaternion(_baseQuat); // 기본 회전으로 본 중심
    _pivB.copy(_pivV).applyQuaternion(out.quat);   // 최종 회전으로 본 중심
    out.pos.add(_pivA).sub(_pivB);                 // 중심이 제자리에 남도록 원점 위치 보정
  }

  out.scl.set(baseScl[0] * s, baseScl[1] * s, baseScl[2] * s);
}
