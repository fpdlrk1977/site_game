'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';

const ViewerCanvas = dynamic(
  () => import('@/app/space/[sceneId]/ViewerCanvas').then((m) => m.ViewerCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 animate-pulse" />
      </div>
    ),
  },
);

interface Props {
  scene: ProjectSceneSchema;
}

export function EmbedClient({ scene }: Props) {
  const [playMode, setPlayMode] = useState(false);

  const handleObjectEvent = (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => {
    const events = obj.events.filter((e) => e.trigger === trigger);
    for (const ev of events) {
      if (ev.action === 'open_url' && ev.value) {
        window.open(ev.value, '_blank', 'noopener noreferrer');
      } else if (ev.action === 'show_popup') {
        // 임베드 모드에서는 팝업 대신 postMessage로 전달
        if (window.parent !== window) {
          window.parent.postMessage({
            type: 'park3d:popup',
            sceneId: scene.sceneId,
            objectId: obj.id,
            objectName: obj.name,
            value: ev.value,
          }, '*');
        }
      } else if (ev.action === 'emit_event') {
        // Event Bridge — 부모 페이지로 커스텀 이벤트 전송
        if (window.parent !== window) {
          window.parent.postMessage({
            type: 'park3d:event',
            sceneId: scene.sceneId,
            objectId: obj.id,
            objectName: obj.name,
            trigger,
            value: ev.value,
          }, '*');
        }
      }
    }
  };

  return (
    <div className="w-full relative overflow-hidden bg-zinc-950" style={{ height: '100vh' }}>
      <ViewerCanvas scene={scene} playMode={playMode} onObjectClick={handleObjectEvent} />

      {/* 플레이 토글 — 우하단 미니 버튼 */}
      <button
        onClick={() => setPlayMode((v) => !v)}
        className={`absolute bottom-3 right-3 flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border backdrop-blur-sm transition-all ${
          playMode
            ? 'bg-violet-600/80 border-violet-500/50 text-white'
            : 'bg-black/40 border-white/10 text-white/60 hover:bg-black/60'
        }`}
      >
        {playMode ? '⏹' : '▶'}
      </button>

      {/* Park3D 워터마크 */}
      <div className="absolute bottom-3 left-3 pointer-events-none">
        <div className="flex items-center gap-1 bg-black/30 backdrop-blur-sm text-white/30 text-[9px] px-2 py-1 rounded-md">
          <span className="text-xs leading-none">⬡</span>
          Park3D
        </div>
      </div>
    </div>
  );
}
