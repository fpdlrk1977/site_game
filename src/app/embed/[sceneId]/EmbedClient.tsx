'use client';

import { useMemo } from 'react';
import { ViewerClient } from '@/app/space/[sceneId]/ViewerClient';
import type { ProjectSceneSchema } from '@/types/scene';

interface Props {
  scene: ProjectSceneSchema;
}

// 임베드는 이제 ViewerClient(variant='embed')를 그대로 재사용한다.
// → 전체 액션(E1/E2/E3)·대화 말풍선·interact·카메라 포커스 등이 자동 지원되고,
//   show_popup/emit_event만 부모 페이지로 postMessage 브릿지한다(아래 onBridge).
export function EmbedClient({ scene }: Props) {
  // postMessage 수신 허용 오리진: URL 파라미터 > referrer > 와일드카드 순으로 한정
  const parentOrigin = useMemo(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('parentOrigin');
      if (param) return new URL(param).origin;
      if (document.referrer) return new URL(document.referrer).origin;
    } catch {}
    return '*';
  }, []);

  return (
    <ViewerClient
      scene={scene}
      variant="embed"
      onBridge={(msg) => {
        if (window.parent !== window) window.parent.postMessage(msg, parentOrigin);
      }}
    />
  );
}
