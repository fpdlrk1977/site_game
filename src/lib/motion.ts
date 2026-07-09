import * as THREE from 'three';
import type { MotionConfig } from '@/types/scene';

// spin 회전 합성용 스크래치 (프레임당 할당 방지)
const _baseQuat = new THREE.Quaternion();
const _spinQuat = new THREE.Quaternion();
const _spinAxis = new THREE.Vector3();
const _baseEuler = new THREE.Euler();

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
  out: { pos: THREE.Vector3; rot: THREE.Euler; scl: THREE.Vector3 },
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
  if (spinAngle !== null) {
    // 기본 회전(baseRot) 이후 '오브젝트 로컬 축' 기준으로 회전(post-multiply) → 눕히거나 기울인
    // 물체도 축 기준으로 깔끔히 돈다(오일러 성분을 직접 더하면 baseRot≠0일 때 세차운동/wobble 발생).
    const ax = motion.axis ?? 'y';
    _baseEuler.set(baseRot[0], baseRot[1], baseRot[2], 'XYZ');
    _baseQuat.setFromEuler(_baseEuler);
    _spinAxis.set(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0);
    _spinQuat.setFromAxisAngle(_spinAxis, spinAngle);
    _baseQuat.multiply(_spinQuat);
    out.rot.setFromQuaternion(_baseQuat);
  } else {
    out.rot.set(baseRot[0], baseRot[1], baseRot[2]);
  }
  out.scl.set(baseScl[0] * s, baseScl[1] * s, baseScl[2] * s);
}
