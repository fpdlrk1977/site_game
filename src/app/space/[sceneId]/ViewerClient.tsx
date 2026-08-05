'use client';

// 게시 뷰어 — **브릭을 보여주는 것이 전부.**
//
// 2026-07-31 전면 재작성: 1,093줄 → 이 크기. 구 오브젝트 시스템(2d)을 걷어내며
// 이벤트 런타임(클릭·호버·근접·interact)·팝업·대화·게임 변수·HUD·승패·타이머·스폰·
// 커스텀 스크립트·카메라 모드·플레이(걷기) 모드·모바일 컨트롤을 전부 삭제했다.
// 전부 **오브젝트에 매달린 기능**이라 브릭엔 붙일 자리가 없다.
//
// 남긴 것: **캔버스 · 조회수 기록 · 소유자용 에디터 링크 · Park3D 배지**(유입 경로).
//
// ⚠️ 임베드(`variant='embed'`)는 이제 배지 크기만 다르다. 부모 페이지로 쏘던 브릿지(`onBridge`)는
//   이벤트 시스템이 사라져 **보낼 것이 없다** — prop만 남겨 두면 거짓말이라 함께 지웠다.
//   (`emit_event`로 호스트 페이지와 연동하던 기능은 브릭에 맞는 형태로 다시 설계해야 한다.)

import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { createBrowserSupabase } from '@/lib/supabase';
import { platformUrl } from '@/lib/siteInfo';
import { useBrickStore } from '@/store/brickStore';
import type { ProjectSceneSchema } from '@/types/scene';

const ViewerCanvas = dynamic(() => import('./ViewerCanvas').then((m) => m.ViewerCanvas), {
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
});

interface Props {
  scene: ProjectSceneSchema;
  projectName?: string;
  isOwner?: boolean;
  projectId?: string;
  hideBadge?: boolean;
  /** 'standalone' = 독립 URL(/space) · 'embed' = 남의 페이지 안 iframe */
  variant?: 'standalone' | 'embed';
}

export function ViewerClient({
  scene,
  projectName = '',
  isOwner = false,
  projectId = '',
  hideBadge = false,
  variant = 'standalone',
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const walking = useBrickStore((s) => s.walking);
  const setWalking = useBrickStore((s) => s.setWalking);

  // 이 페이지를 벗어날 때 걷기를 끈다 — 모듈 상태라 다음에 연 화면까지 따라간다
  useEffect(() => () => setWalking(false), [setWalking]);

  // 조회수 — 이벤트 시스템이 사라져 Analytics가 읽는 **유일한** 이벤트가 됐다.
  //   ⚠️ insert 결과를 버리면 실패해도 아무도 모른다(실제로 상호작용 기록이 그렇게 통째로 유실됐다).
  useEffect(() => {
    supabase
      .from('scene_events')
      .insert({ scene_id: scene.sceneId, event_type: 'view' })
      .then(({ error }) => {
        if (error) console.warn('[park3d] analytics insert failed:', error.message);
      });
  }, [scene.sceneId, supabase]);

  return (
    // 🔴 `h-full`이면 **캔버스가 150px로 찌부러진다.** 전역 `body`가 `min-h-full flex flex-col`이라
    //    퍼센트 높이가 기댈 확정 높이가 없고, 플렉스 자식은 내용 높이(= 캔버스 기본값)로 접힌다.
    //    → 뷰포트 높이(`h-dvh`)로 잡는다. iframe 임베드에서도 그 iframe의 뷰포트라 맞다.
    //    (프로토타입은 처음부터 `h-dvh`라 멀쩡했고, 이쪽만 오래 접혀 있었다 — 게시 화면을
    //     한 번도 열어 보지 않아서 아무도 몰랐다. 2026-08-05 한 바퀴 돌다가 발견)
    <div className="relative w-full h-dvh bg-canvas">
      <ViewerCanvas scene={scene} />

      {/* ★ 걸어보기 — **방문자가 지어 둔 공간 안으로 들어간다.**
          이게 이 제품의 원래 그림이다(그전까지는 밖에서 돌려 보는 것뿐이었다).
          임베드에도 둔다 — 남의 페이지에 걸렸을 때가 오히려 체험 가치가 크다. */}
      <button
        onClick={() => setWalking(!walking)}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-white/10 text-white text-xs px-3.5 py-2 rounded-xs hover:bg-black/70 transition-colors"
      >
        {walking ? '▣ 걷기 끝내기' : '▶ 걸어서 둘러보기'}
      </button>
      {walking && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-white/70 text-[11px] bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-xs whitespace-nowrap">
          WASD 이동 · 드래그로 둘러보기 · Shift 빠르게
        </div>
      )}

      {variant === 'standalone' && (
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
          <span className="pointer-events-auto text-white/60 text-xs font-medium bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-xs">
            {projectName}
          </span>
        </div>
      )}

      {/* Park3D 배지 — ref 파라미터로 유입 출처를 구분한다(방문자 → 제작자 전환 경로).
          커스텀 도메인에서 서빙될 수 있으므로 링크는 반드시 platformUrl()로 만든다. */}
      {variant === 'standalone' && !hideBadge && (
        <a
          href={platformUrl('/', { ref: 'badge' })}
          target="_blank"
          rel="noopener noreferrer"
          title="Build your own 3D space with Park3D"
          className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 text-white/50 hover:text-white/80 text-[10px] px-2.5 py-1.5 rounded-xs transition-colors"
        >
          <span className="text-sm leading-none">⬡</span>
          Made with Park3D
        </a>
      )}

      {/* 임베드 워터마크 — 임베드는 남의 사이트에 걸리므로 유입 경로로서 가치가 가장 크다. */}
      {variant === 'embed' && (
        <a
          href={platformUrl('/', { ref: 'embed' })}
          target="_blank"
          rel="noopener noreferrer"
          title="Made with Park3D"
          className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/30 backdrop-blur-sm text-white/30 hover:text-white/70 text-[9px] px-2 py-1 rounded-xs transition-colors"
        >
          <span className="text-xs leading-none">⬡</span>
          Park3D
        </a>
      )}
    </div>
  );
}
