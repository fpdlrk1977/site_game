'use client';

// 브릭 씬의 카메라 내비게이션 — **에디터·프로토타입·뷰어가 같이 쓰는 하나의 설정.**
//
// ★ 왜 컴포넌트로 뽑았나: 같은 설정이 세 파일에 복붙돼 있다가 **실제로 갈라졌다**(2026-07-31).
//   에디터만 오브젝트 시대 설정(우버튼=패닝, target.y 클램프)을 들고 있어서
//   `/test/brick`에서 되던 조작이 에디터에선 다르게 움직였다. 사용자가 그걸 먼저 발견했다.
//   → 내비게이션을 바꿀 일이 생기면 **이 파일만** 고친다.
//
// 조작 규약
//   · **좌버튼은 orbit이 아니다** — 브릭 놓기/지우기가 쓴다(`BrickBuilder`가 캔버스 DOM에서 직접 받는다)
//   · 우드래그 = 회전 · 가운데 드래그(휠 클릭) = 패닝 · 휠 = 줌
//
// 일부러 **안** 넣은 것들 (전부 오브젝트 시대의 잔재)
//   · `target.y ≥ 0` 클램프 — 바닥 **평면**이 있던 시절의 방어. 지금은 지형을 파고 구덩이 안을
//     들여다봐야 하므로 오히려 방해가 된다.
//   · `minPolarAngle` — 바로 위에서 내려다보는 시점을 막을 이유가 없다(바닥 깔 때 필요하다)
//   · `screenSpacePanning={false}` · `zoomSpeed={2}`
//   · `enableDamping` — 관성이 남으면 칸을 겨눌 때 미끄러진다

import { forwardRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useBrickStore } from '@/store/brickStore';

interface Props {
  /**
   * `build`(기본) = 짓는 화면 — **좌버튼을 브릭에 내준다.**
   * `view` = 게시 뷰어 — 짓지 않으므로 **좌드래그로 돈다**(방문자가 기대하는 동작).
   *   이건 드리프트가 아니라 **의도한 차이**다.
   */
  mode?: 'build' | 'view';
  /** 시작 시선(뷰어의 startView). 미지정이면 원점 */
  target?: [number, number, number];
}

export const BrickOrbit = forwardRef<OrbitControlsImpl, Props>(function BrickOrbit(
  { mode = 'build', target },
  ref,
) {
  const walking = useBrickStore((s) => s.walking);
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      target={target}
      // ★ 걷는 중엔 궤도 카메라를 끈다 — 켜 두면 `BrickWalker`가 매 프레임 세운 카메라를
      //   OrbitControls가 도로 제 궤도로 끌어당겨 **시점이 덜덜 떨린다.**
      enabled={!walking}
      enableDamping={false}
      /** 지평선 바로 위까지 — 더 내려가면 바닥 아래에서 올려다보게 된다 */
      maxPolarAngle={Math.PI / 2 - 0.02}
      minDistance={1}
      maxDistance={200}
      mouseButtons={{
        LEFT: mode === 'view' ? THREE.MOUSE.ROTATE : undefined,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
    />
  );
});
