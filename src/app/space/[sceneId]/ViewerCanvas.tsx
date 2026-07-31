'use client';

// 게시 뷰어 캔버스 — **브릭 전용, 읽기 전용.**
//
// 2026-07-31 전면 재작성: 472줄 → 이 크기. 구 오브젝트 시스템(2d)을 걷어내며
// 오브젝트 렌더·인스턴싱·물리/플레이 모드·이벤트·힌트 링·경계 벽·바닥·조명·후처리를 전부 삭제했다.
//
// ★ 에디터와 **같은 컴포넌트**(`BrickEnvironment` · `BrickScene`)를 쓴다 — 룩과 규칙이 갈라지지 않게.
//   차이는 `readOnly` 하나뿐: 방문자는 짓지 못하고 저장도 하지 않는다.
//
// ⚠️ 걷기(플레이 모드)는 **없다.** 캐릭터가 브릭 위에 서려면 청크 단위 콜라이더가 필요한데
//   아직 없다. 구 플레이 스택은 오브젝트 콜라이더 기반이라 브릭엔 하나도 쓸 수 없어 지웠다.

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { SceneToneMapping } from '@/components/three/SceneToneMapping';
import { BrickScene } from '@/components/brick/BrickScene';
import { BrickEnvironment } from '@/components/brick/BrickEnvironment';
import { BrickOrbit } from '@/components/brick/BrickOrbit';
import type { ProjectSceneSchema } from '@/types/scene';

const DEFAULT_POS: [number, number, number] = [13, 10, 13];

export function ViewerCanvas({ scene }: { scene: ProjectSceneSchema }) {
  const env = scene.environment;
  // 게시 시작 뷰 — 제작자가 에디터에서 "현재 시점으로 저장"한 값. 없으면 기본 시점.
  const sv = env.startView;
  const camPos: [number, number, number] = sv ? [sv.position.x, sv.position.y, sv.position.z] : DEFAULT_POS;
  const target: [number, number, number] = sv ? [sv.target.x, sv.target.y, sv.target.z] : [0, 0, 0];

  return (
    <Canvas
      // 그림자 맵 없음 — 브릭 조명은 굽는다(BrickEnvironment)
      camera={{ position: camPos, fov: sv?.fov ?? 60 }}
      dpr={[1, 2]}
      gl={{ toneMapping: THREE.LinearToneMapping }}
      style={{ width: '100%', height: '100%' }}
    >
      <SceneToneMapping exposure={env.toneMappingExposure ?? 1} />
      <BrickEnvironment />
      {/* 읽기 전용 — 짓기 상호작용도, 자동 저장도 걸지 않는다 */}
      <BrickScene sceneId={scene.sceneId} readOnly />
      {/* 뷰어는 짓지 않으므로 **좌드래그로 돈다** — 에디터와의 유일한 차이(의도) */}
      <BrickOrbit mode="view" target={target} />
    </Canvas>
  );
}
