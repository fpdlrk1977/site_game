'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ProjectSceneSchema, ObjectNodeSchema } from '@/types/scene';

const ViewerCanvas = dynamic(
  () => import('./ViewerCanvas').then((m) => m.ViewerCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-2xl mx-auto mb-3 animate-pulse">
            ⬡
          </div>
          <p className="text-zinc-400 text-sm">3D 공간 로딩 중...</p>
        </div>
      </div>
    ),
  },
);

interface Props {
  scene: ProjectSceneSchema;
  projectName: string;
  isOwner: boolean;
  projectId: string;
}

export function ViewerClient({ scene, projectName, isOwner, projectId }: Props) {
  const [popup, setPopup] = useState<{ title: string; content: string } | null>(null);

  const handleObjectClick = (obj: ObjectNodeSchema) => {
    const clickEvent = obj.events.find((e) => e.trigger === 'click');
    if (!clickEvent) return;

    if (clickEvent.action === 'open_url') {
      window.open(clickEvent.value, '_blank', 'noopener noreferrer');
    } else if (clickEvent.action === 'show_popup') {
      setPopup({ title: obj.name, content: clickEvent.value });
    }
  };

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-zinc-950">
      {/* 3D 캔버스 */}
      <ViewerCanvas scene={scene} onObjectClick={handleObjectClick} />

      {/* 상단 오버레이 */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {isOwner && (
            <button
              onClick={() => {
                if (window.opener) window.close();
                else window.location.href = `/editor/${projectId}`;
              }}
              className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-white/10 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-black/70 transition-colors"
            >
              ← 에디터로
            </button>
          )}
        </div>
        <div className="text-white/60 text-xs font-medium bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-lg">
          {projectName}
        </div>
      </div>

      {/* Park3D 배지 (Free 플랜) */}
      <div className="absolute bottom-4 right-4 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 text-white/50 text-[10px] px-2.5 py-1.5 rounded-lg">
          <span className="text-sm leading-none">⬡</span>
          Powered by Park3D
        </div>
      </div>

      {/* 팝업 모달 */}
      {popup && (
        <div className="absolute inset-0 flex items-center justify-center p-4 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPopup(null)}
          />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-3">{popup.title}</h3>
            <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
              {popup.content}
            </p>
            <button
              onClick={() => setPopup(null)}
              className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold text-sm hover:from-violet-500 hover:to-cyan-500 transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
