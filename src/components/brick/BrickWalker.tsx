'use client';

// 걷기 모드 — 기준: doc/BRICK_PLAN.md §6. `<Canvas>` 안에 넣는다.
//
// ★ 이 파일은 **배선만** 한다. 충돌·중력·계단은 전부 `lib/brick/walk.ts`의 순수 함수가 푼다
//   (그래야 "벽에 낀다·바닥을 뚫는다" 같은 것을 화면 없이 테스트로 잠글 수 있다).
//
// 조작: **WASD 이동 · Shift 빠르게 · 드래그로 둘러보기.** 점프는 없다(§6 "안 하는 것").

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EYE_H, spawnAt, walk, type Solid, type WalkState } from '@/lib/brick/walk';
import { useBrickStore } from '@/store/brickStore';

/** 걷는 속도(m/s). 사람이 걷는 속도보다 조금 빠르게 — 격자가 0.5m라 답답해진다 */
const SPEED = 4.2;
const RUN = 2.2;
/** 마우스 감도(라디안/픽셀) */
const LOOK = 0.0032;
/** 바로 위·아래를 보면 뒤집힌다 — 살짝 못 미치게 막는다 */
const PITCH_MAX = Math.PI / 2 - 0.05;

export function BrickWalker() {
  const walking = useBrickStore((s) => s.walking);
  const world = useBrickStore((s) => s.world);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const state = useRef<WalkState | null>(null);
  const keys = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: 0 });
  const dragging = useRef(false);

  /** 그 칸이 막혔는가 — 월드에 그대로 물어본다 */
  const solid = useMemo<Solid>(() => (x, y, z) => world.at(x, y, z) !== undefined, [world]);

  // ── 들어가기 / 나가기 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!walking) { state.current = null; return; }
    // 지정된 자리가 있으면 거기서(방 만들기), 없으면 지금 카메라 아래 지면에 선다
    const at = useBrickStore.getState().walkSpawn;
    state.current = at
      ? spawnAt(solid, at[0], at[2], at[1] + 4)
      : spawnAt(solid, camera.position.x, camera.position.z, camera.position.y + 4);
    // 보던 **방향(좌우)** 은 이어받되 **위아래는 수평으로 리셋**한다.
    //
    // ★ 궤도 카메라는 거의 항상 비스듬히 내려다보고 있다. 그 각도를 그대로 물려받으면
    //   걷기에 들어선 첫 화면이 **발밑 바닥**이라 "어디 있는지 모르겠다"가 된다(실제로 그랬다).
    //   서 있는 사람은 수평을 본다.
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    look.current.yaw = Math.atan2(-dir.x, -dir.z);
    look.current.pitch = 0;
  }, [walking, solid, camera]);

  // ── 입력 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!walking) return;
    // ★ 정리(cleanup)에서 `keys.current`를 그대로 쓰면 그때는 **다른 객체일 수 있다** —
    //   여기서 잡아 둔 것을 쓴다(그래야 "걷기를 껐는데 키가 눌린 채 남는" 일이 안 생긴다).
    const held = keys.current;
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => { if (!isTyping(e)) held.add(e.code); };
    const up = (e: KeyboardEvent) => held.delete(e.code);
    const blur = () => { held.clear(); dragging.current = false; };

    const el = gl.domElement;
    // ★ 걷기 중엔 **좌드래그가 둘러보기**다(짓지 않으므로 좌버튼이 비어 있다).
    //   포인터 락은 쓰지 않는다 — 빠져나오는 법을 모르면 갇힌 느낌이 든다.
    const pDown = (e: PointerEvent) => { if (e.button === 0) { dragging.current = true; el.setPointerCapture(e.pointerId); } };
    const pUp = (e: PointerEvent) => { dragging.current = false; el.releasePointerCapture?.(e.pointerId); };
    const pMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      look.current.yaw -= e.movementX * LOOK;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - e.movementY * LOOK, -PITCH_MAX, PITCH_MAX);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    el.addEventListener('pointerdown', pDown);
    el.addEventListener('pointerup', pUp);
    el.addEventListener('pointermove', pMove);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', pDown);
      el.removeEventListener('pointerup', pUp);
      el.removeEventListener('pointermove', pMove);
      held.clear();
    };
  }, [walking, gl]);

  useFrame((_, dt) => {
    const s = state.current;
    if (!walking || !s) return;

    const k = keys.current;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);

    // 보는 방향 기준 이동 — 위아래를 봐도 **평면 위를** 걷는다
    const { yaw } = look.current;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    let mx = -sin * f + cos * r;
    let mz = -cos * f - sin * r;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; } // 대각선이 더 빠르면 안 된다

    const speed = SPEED * (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : 1);
    const next = walk(solid, s, speed, mx, mz, dt);

    // 바닥 밑으로 떨어졌으면 지면으로 되돌린다 (§6 "낙사 없음")
    state.current = next.y < -40 ? spawnAt(solid, next.x, next.z, 30) : next;

    const p = state.current;
    camera.position.set(p.x, p.y + EYE_H, p.z);
    camera.quaternion.setFromEuler(new THREE.Euler(look.current.pitch, look.current.yaw, 0, 'YXZ'));
  });

  return null;
}
