'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { createBrowserSupabase } from '@/lib/supabase';
import { MobileControls } from './MobileControls';
import { RichContent } from '@/components/ui/RichContent';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';

const ViewerCanvas = dynamic(
  () => import('./ViewerCanvas').then((m) => m.ViewerCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-sidebar">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-2xl mx-auto mb-3 animate-pulse">
            ⬡
          </div>
          <p className="text-muted text-sm">3D 공간 로딩 중...</p>
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
  hideBadge?: boolean;
}

export function ViewerClient({ scene, projectName, isOwner, projectId, hideBadge = false }: Props) {
  const [popup, setPopup] = useState<{ title: string; content: string } | null>(null);
  // 둘러보기 전용 씬은 걷기(플레이) 불가 — 항상 탐색으로만 동작
  const walkDisabled = scene.environment.disableWalk === true;
  // 씬별 기본 진입 모드 — 'play'면 접속하자마자 플레이 모드로 시작 (미설정/둘러보기전용 = 탐색)
  const [playMode, setPlayMode] = useState(scene.environment.defaultMode === 'play' && !walkDisabled);

  // 런타임 오브젝트 표시/숨김 오버라이드 (show/hide/toggle_object 액션) — objectId → visible
  const [visOverride, setVisOverride] = useState<Record<string, boolean>>({});
  // 오버라이드를 씬 데이터에 반영해 렌더 (모든 뷰어 경로가 object.visible을 존중하므로 이걸로 충분)
  const effectiveScene = useMemo(() => {
    if (Object.keys(visOverride).length === 0) return scene;
    return {
      ...scene,
      objects: scene.objects.map((o) => (o.id in visOverride ? { ...o, visible: visOverride[o.id] } : o)),
    };
  }, [scene, visOverride]);
  const [isTouch, setIsTouch] = useState(false);
  const supabase = useState(() => createBrowserSupabase())[0];
  const mobileInputRef = useRef({ fwd: 0, strafe: 0, jump: false });

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // 방문 이벤트 수집
  useEffect(() => {
    supabase.from('scene_events').insert({ scene_id: scene.sceneId, event_type: 'view' });
  }, [scene.sceneId, supabase]);

  const trackEvent = (eventType: string, objectId?: string, objectName?: string) => {
    supabase.from('scene_events').insert({
      scene_id: scene.sceneId,
      event_type: eventType,
      object_id: objectId,
      object_name: objectName,
    });
  };

  const handleObjectEvent = (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => {
    if (trigger === 'click') trackEvent('click', obj.id, obj.name);
    if (trigger === 'area_enter') trackEvent('area_enter', obj.id, obj.name);
    if (trigger === 'area_exit') trackEvent('area_exit', obj.id, obj.name);

    const matchingEvents = obj.events.filter((e) => e.trigger === trigger);
    for (const ev of matchingEvents) {
      if (ev.action === 'open_url' && ev.value) {
        // area_enter는 사용자 제스처가 아닌 물리 콜백이라 브라우저가 window.open을
        // 차단할 수 있다 — 차단되면 링크가 담긴 팝업으로 폴백
        const opened = window.open(ev.value, '_blank', 'noopener noreferrer');
        if (!opened) setPopup({ title: obj.name, content: ev.value });
      } else if (ev.action === 'show_popup') {
        setPopup({ title: obj.name, content: ev.value });
      } else if (ev.action === 'go_to_scene' && ev.value) {
        // 같은 뷰어 경로에서 대상 씬으로 이동 (독립 URL 기준)
        window.location.href = `/space/${ev.value}`;
      } else if (ev.action === 'show_object' && ev.value) {
        setVisOverride((v) => ({ ...v, [ev.value]: true }));
      } else if (ev.action === 'hide_object' && ev.value) {
        setVisOverride((v) => ({ ...v, [ev.value]: false }));
      } else if (ev.action === 'toggle_object' && ev.value) {
        setVisOverride((v) => {
          // 현재 표시 상태 = 오버라이드가 있으면 그 값, 없으면 원본 씬의 visible
          const cur = ev.value in v ? v[ev.value] : (scene.objects.find((o) => o.id === ev.value)?.visible ?? true);
          return { ...v, [ev.value]: !cur };
        });
      }
      // emit_event: EmbedClient 참고
    }
  };

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-canvas">
      <ViewerCanvas scene={effectiveScene} playMode={playMode} onObjectClick={handleObjectEvent} mobileInputRef={mobileInputRef} />

      {/* 상단 오버레이 */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {isOwner && (
            <button
              onClick={() => {
                if (window.opener) window.close();
                else window.location.href = `/editor/${projectId}`;
              }}
              className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-white/10 text-white text-xs px-3 py-1.5 rounded-xs hover:bg-black/70 transition-colors"
            >
              ← 에디터로
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="text-white/60 text-xs font-medium bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-xs">
            {projectName}
          </span>
          {/* 둘러보기 전용 씬은 플레이 토글 자체를 숨김 (캐릭터 소환 불가) */}
          {!walkDisabled && (
            <button
              onClick={() => setPlayMode((v) => !v)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xs border backdrop-blur-sm transition-all ${
                playMode
                  ? 'bg-primary/80 border-primary/50 text-white'
                  : 'bg-black/40 border-white/10 text-white/70 hover:bg-black/60'
              }`}
            >
              {playMode ? '⏹ 탐색 모드' : '▶ 플레이'}
            </button>
          )}
        </div>
      </div>

      {playMode && !isTouch && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm border border-white/10 rounded-xs px-4 py-2 text-white/50 text-xs flex items-center gap-3">
            <span>WASD 이동</span>
            <span className="text-white/20">|</span>
            <span>Space 점프</span>
            <span className="text-white/20">|</span>
            <span>마우스 드래그 시점</span>
          </div>
        </div>
      )}

      {playMode && isTouch && <MobileControls inputRef={mobileInputRef} />}

      {/* Park3D 배지 — Free 플랜만 표시 */}
      {!hideBadge && (
        <a
          href="https://park3d.io"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 text-white/50 hover:text-white/80 text-[10px] px-2.5 py-1.5 rounded-xs transition-colors"
        >
          <span className="text-sm leading-none">⬡</span>
          Powered by Park3D
        </a>
      )}

      {/* 팝업 모달 */}
      {popup && (
        <div className="absolute inset-0 flex items-center justify-center p-4 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPopup(null)}
          />
          <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-modal">
            <h3 className="text-lg font-bold text-foreground mb-3">{popup.title}</h3>
            <RichContent value={popup.content} />
            <button
              onClick={() => setPopup(null)}
              className="mt-5 w-full py-2.5 rounded-xs bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold text-sm hover:from-violet-500 hover:to-cyan-500 transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
