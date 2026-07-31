'use client';

// 임베드 — `ViewerClient(variant='embed')`를 그대로 재사용한다(뷰어와 갈라지지 않게).
//
// ⚠️ 2026-07-31: 부모 페이지로 쏘던 **postMessage 브릿지를 걷어냈다.**
//   보내던 내용이 `show_popup` / `emit_event`였는데, 오브젝트 이벤트 시스템이 사라져 **보낼 것이 없다.**
//   호스트 페이지 연동(`park3d:event` → 호스트가 자기 모달을 띄우던 흐름)은
//   브릭에서 무엇이 "이벤트"인지 정한 뒤 다시 설계한다.

import { ViewerClient } from '@/app/space/[sceneId]/ViewerClient';
import type { ProjectSceneSchema } from '@/types/scene';

export function EmbedClient({ scene }: { scene: ProjectSceneSchema }) {
  return <ViewerClient scene={scene} variant="embed" />;
}
