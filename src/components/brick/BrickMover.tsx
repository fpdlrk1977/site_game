'use client';

// 키보드 이동 — **프로토타입과 에디터가 같이 쓰는 하나의 컴포넌트.** `<Canvas>` 안에 넣는다.
//
// 왜 있나: 넓게 지을 때 궤도 회전(우드래그)과 패닝(가운데드래그)만으로 이동하면 손이 아프다.
// 카메라가 **보는 지점(OrbitControls.target)까지 같이 옮겨야** 궤도 중심이 따라와서
// 이동 뒤에도 회전이 자연스럽다 — 카메라만 옮기면 멀리 있는 옛 중심을 계속 맴돈다.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useBrickStore } from '@/store/brickStore';

export function BrickMover() {
  const keys = useRef(new Set<string>());

  useEffect(() => {
    // ⚠️ 입력창에서 타이핑할 때 카메라가 움직이면 안 된다(색 hex 입력에 'w'·'a'·'s'·'d'가 들어간다).
    //    contentEditable까지 보는 이유는 앞으로 붙을 편집 UI 대비.
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    };
    const down = (e: KeyboardEvent) => { if (!isTyping(e)) keys.current.add(e.code); };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear(); // 창을 벗어나면 눌린 채로 남지 않게
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());

  useFrame(({ camera, controls }, dt) => {
    // 걷는 중엔 `BrickWalker`가 카메라를 몬다 — 둘이 같이 밀면 서로 싸운다
    if (useBrickStore.getState().walking) return;
    const k = keys.current;
    const ctrl = controls as { target?: THREE.Vector3; update?: () => void } | null;
    if (!ctrl?.target) return;

    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const u = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (f === 0 && r === 0 && u === 0) return;

    // 수평 기준 전방/우측 (위아래를 봐도 평면 위를 걷듯 움직이게)
    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0;
    if (fwd.current.lengthSq() < 1e-6) fwd.current.set(0, 0, -1);
    fwd.current.normalize();
    // 오른쪽 = fwd × up. 부호를 뒤집으면 A/D가 반대로 간다(실제로 그랬다)
    right.current.set(-fwd.current.z, 0, fwd.current.x);

    // 줌아웃할수록 빠르게 — 가까이서 다듬을 땐 느리고 멀리서 훑을 땐 빠르다
    const speed = Math.max(6, camera.position.distanceTo(ctrl.target) * 0.9) * (k.has('ShiftLeft') ? 3 : 1);
    move.current.set(0, 0, 0)
      .addScaledVector(fwd.current, f)
      .addScaledVector(right.current, r);
    if (move.current.lengthSq() > 0) move.current.normalize();
    move.current.y = u;
    move.current.multiplyScalar(speed * dt);

    camera.position.add(move.current);
    ctrl.target.add(move.current);
    ctrl.update?.();
  });

  return null;
}
