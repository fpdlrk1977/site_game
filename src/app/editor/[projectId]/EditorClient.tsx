'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Monitor, Square } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { buildSceneData } from '@/lib/saveScene';
import { ViewportToolbar } from './panels/ViewportToolbar';
import { EditorGnb, type GnbTab } from './panels/EditorGnb';
import { LeftPanel } from './panels/LeftPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { TimelinePanel } from './panels/TimelinePanel';
import { EditorEmptyState } from './panels/EditorEmptyState';
import { EditorOnboarding } from './EditorOnboarding';
import { ViewportStatusBar } from './canvas/ViewportStatusBar';
import { ViewportFloatingToolbar } from './canvas/ViewportFloatingToolbar';
import { ViewportOrientationGizmo } from './canvas/ViewportOrientationGizmo';
import { CommandPalette } from './panels/CommandPalette';
import { PenToolModal } from './panels/PenToolModal';
import { VoxelToolModal } from './panels/VoxelToolModal';
import { BoundaryShapeModal } from './panels/BoundaryShapeModal';
import { Toaster } from '@/components/ui/Toaster';
import type { ProjectSceneSchema } from '@/types/scene';

const EditorCanvas = dynamic(
  () => import('./canvas/EditorCanvas').then((m) => m.EditorCanvas),
  { ssr: false, loading: () => <div className="w-full h-full bg-surface flex items-center justify-center"><span className="text-muted text-sm">뷰포트 로딩 중...</span></div> },
);

// 인에디터 플레이 — 편집 중 씬을 뷰어 스택으로 구동(popup을 자체 렌더하도록 standalone 사용).
const PlayViewer = dynamic(
  () => import('@/app/space/[sceneId]/ViewerClient').then((m) => m.ViewerClient),
  { ssr: false, loading: () => <div className="w-full h-full bg-canvas flex items-center justify-center"><span className="text-muted text-sm">플레이 로딩 중...</span></div> },
);

interface Props {
  projectName: string;
  initialScene: ProjectSceneSchema;
  initialVersion: number;
}

export function EditorClient({ projectName, initialScene, initialVersion }: Props) {
  const {
    loadScene, undo, redo, deleteSelected, duplicateSelected, duplicateInPlace,
    setTransformMode, requestFocus, requestFocusAll, requestFocusSelected, requestCameraView,
    groupSelected, ungroupSelected, requestSaveBookmark, requestRecallBookmark,
    copyObjectProperties, pasteObjectProperties,
    copySelection, pasteClipboard,
    editorPlaying, setEditorPlaying,
    animMode, selectedId, animClips,
  } = useSceneStore();

  // 하단 타임라인(고급 모드) 표시 여부 — 선택 오브젝트에 클립이 있고 타임라인 모드일 때.
  const timelineOpen = animMode === 'timeline'
    && !editorPlaying
    && animClips.some((c) => c.rootId === selectedId || c.tracks.some((t) => t.objectId === selectedId));

  // 플레이 시작 시점의 편집 상태를 스냅샷으로 굳혀 뷰어에 전달(항상 play 모드로 시작).
  const playScene = useMemo(() => {
    if (!editorPlaying) return null;
    const data = buildSceneData();
    return { ...data, environment: { ...data.environment, defaultMode: 'play' as const } };
  }, [editorPlaying]);
  const [isMobile, setIsMobile] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [gnbTab, setGnbTab] = useState<GnbTab>('objects');
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // GNB 탭 클릭: 같은 탭을 다시 누르면 패널 접기/펼치기, 다른 탭이면 전환 + 펼치기
  const handleGnbTabClick = (tab: GnbTab) => {
    if (tab === gnbTab && leftOpen) {
      setLeftOpen(false);
    } else {
      setGnbTab(tab);
      setLeftOpen(true);
    }
  };

  // 씬 로드 — sceneId가 같으면 재로드하지 않음 (initialScene prop 재생성 시 재로드 방지)
  // sceneId가 바뀌면(App Router가 param만 바꿔 컴포넌트를 재사용하는 씬 전환) 새 씬을 로드
  useEffect(() => {
    loadScene(initialScene, initialVersion);
    // initialScene 객체 자체는 의존성에서 제외 — 같은 씬의 prop 재생성으로 재로드되지 않도록
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadScene, initialScene.sceneId]);

  // 저장되지 않은 변경사항이 있으면 탭 닫기/새로고침 전에 경고
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useSceneStore.getState().isModified) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // 모바일 감지
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1280);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 전역 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 플레이 중엔 에디터 단축키(삭제·변환·undo 등) 비활성 — 뷰어 입력이 편집을 건드리지 않게
      if (useSceneStore.getState().editorPlaying) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';
      // e.key는 IME(한글)·Shift 조합에서 값이 달라지므로 물리 키 기반 e.code로 판정
      const ctrl = e.ctrlKey || e.metaKey; // macOS Cmd 지원

      // 인풋에서도 동작해야 하는 단축키
      if (ctrl && e.code === 'KeyS') { e.preventDefault(); document.getElementById('save-btn')?.click(); return; }
      if (ctrl && e.code === 'KeyK') { e.preventDefault(); setShowCommandPalette((v) => !v); return; }

      // 인풋에서는 브라우저 기본 동작 허용 (텍스트 undo/redo/copy/paste)
      if (isInput) return;

      if (ctrl && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (ctrl && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) { e.preventDefault(); redo(); return; }
      if (ctrl && e.code === 'KeyD') { e.preventDefault(); duplicateSelected(); return; }
      if (ctrl && !e.shiftKey && e.code === 'KeyC') { e.preventDefault(); copySelection(); return; }   // 오브젝트 복사(Ctrl+Shift+C=속성 복사와 구분)
      if (ctrl && !e.shiftKey && e.code === 'KeyV') { e.preventDefault(); pasteClipboard(); return; }   // 오브젝트 붙여넣기(항상 최상위)
      if (ctrl && e.shiftKey && e.code === 'KeyG') { e.preventDefault(); ungroupSelected(); return; }
      if (ctrl && e.code === 'KeyG') { e.preventDefault(); groupSelected(); return; }
      if (ctrl && e.shiftKey && e.code === 'KeyC') { e.preventDefault(); copyObjectProperties(); return; }
      if (ctrl && e.shiftKey && e.code === 'KeyV') { e.preventDefault(); pasteObjectProperties(); return; }

      // 이하 단일 키 단축키 — 브라우저 단축키(Ctrl+1 탭 전환, Ctrl+R 새로고침 등)와
      // 겹치지 않도록 modifier가 눌린 상태에서는 무시
      if (ctrl || e.altKey) return;

      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.code === 'KeyW') setTransformMode('translate');
      if (e.code === 'KeyE') setTransformMode('rotate');
      if (e.code === 'KeyR') setTransformMode('scale');
      if (e.shiftKey && e.code === 'KeyF') { requestFocusAll(); return; } // 전체 맞춤(모든 오브젝트가 화면에 꽉 차게)
      if (e.code === 'KeyF') requestFocusSelected(); // 선택물로 프레이밍(pivot 이동 + 거리 맞춤)
      if (e.shiftKey && e.code === 'KeyD') { e.preventDefault(); duplicateInPlace(); return; }
      if (e.code === 'Numpad7') { e.preventDefault(); requestCameraView('top'); return; }
      if (e.code === 'Numpad1') { e.preventDefault(); requestCameraView('front'); return; }
      if (e.code === 'Numpad3') { e.preventDefault(); requestCameraView('right'); return; }
      // Shift+숫자는 e.key가 '!' 등 특수문자가 되므로 e.code(Digit1~5)로 판정
      const digit = /^Digit([1-5])$/.exec(e.code);
      if (digit && !e.shiftKey) requestRecallBookmark(Number(digit[1]));
      if (digit && e.shiftKey) requestSaveBookmark(Number(digit[1]));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, deleteSelected, duplicateSelected, duplicateInPlace, setTransformMode, requestFocus, requestFocusAll, requestFocusSelected, requestCameraView, groupSelected, ungroupSelected, requestSaveBookmark, requestRecallBookmark, copyObjectProperties, pasteObjectProperties, copySelection, pasteClipboard]);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center p-6 text-center">
        <div>
          <Monitor size={48} className="mx-auto mb-4 text-muted" />
          <h2 className="text-xl font-bold text-foreground mb-2">PC에서 이용해 주세요</h2>
          <p className="text-muted text-sm">에디터는 1280px 이상의 화면에서 지원됩니다.</p>
        </div>
      </div>
    );
  }

  // ── Floating layout (Figma/Spline) — 캔버스 풀블리드 + 유리 패널이 그 위에 뜬다 ──
  // 패널 배치 상수(px): 가장자리 여백 12, 상단바 높이 44, 레일 48, 좌패널 240, 인스펙터 288.
  const railW = 48, leftW = 240, inspW = 288, edge = 12, gap = 8;
  const panelTop = edge + 44 + gap;          // 상단바 아래 = 64
  const leftPanelX = edge + railW + gap;      // 좌패널 시작 x = 68
  const overlayLeft = leftOpen ? leftPanelX + leftW + gap : leftPanelX; // 자유 캔버스 좌측 경계
  const overlayRight = edge + inspW + gap;    // 자유 캔버스 우측 경계 = 308
  const panelShell = 'rounded-sm bg-surface border border-border overflow-hidden';
  // 하단 타임라인이 열리면 사이드 패널/오버레이 바닥을 그만큼 올린다(전체폭 바닥 패널 공간 확보).
  const TIMELINE_H = 172;
  const bottomInset = timelineOpen ? TIMELINE_H + gap : 0;
  const panelBottom = edge + bottomInset;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-canvas">
      {/* Canvas — 모든 것 뒤에서 화면을 채움 */}
      <div className="absolute inset-0 z-0">
        <EditorCanvas />
      </div>

      {/* 빈 씬 코칭 — 오브젝트 0개일 때만 (자체적으로 숨김) */}
      <EditorEmptyState />

      {/* Viewport overlays — 떠있는 패널과 겹치지 않도록 '자유 캔버스' 사각형에 가둔다.
          자식 오버레이의 기존 top-3/right-3/bottom-3 좌표는 이 컨테이너 기준으로 그대로 동작. */}
      <div
        className="absolute z-10 pointer-events-none"
        style={{ top: panelTop - gap, bottom: panelBottom, left: overlayLeft, right: overlayRight, transition: 'left .18s ease, bottom .18s ease' }}
      >
        <ViewportFloatingToolbar />
        <ViewportOrientationGizmo />
        <ViewportStatusBar />
      </div>

      {/* Floating top bar */}
      <div className={`absolute top-3 left-3 right-3 h-11 z-40 ${panelShell}`}>
        <ViewportToolbar projectName={projectName} />
      </div>

      {/* Floating GNB rail */}
      <div className={`absolute left-3 w-12 z-30 ${panelShell}`} style={{ top: panelTop, bottom: panelBottom }}>
        <EditorGnb tab={gnbTab} panelOpen={leftOpen} onTabClick={handleGnbTabClick} projectName={projectName} />
      </div>

      {/* Floating left panel (Objects / Assets) */}
      {leftOpen && (
        <div className={`absolute w-60 z-30 ${panelShell}`} style={{ top: panelTop, bottom: panelBottom, left: leftPanelX }}>
          <LeftPanel tab={gnbTab} />
        </div>
      )}

      {/* Left panel toggle handle */}
      <button
        onClick={() => setLeftOpen((v) => !v)}
        title={leftOpen ? 'Hide panel' : 'Show panel'}
        className="absolute z-30 top-1/2 -translate-y-1/2 w-3.5 h-10 bg-surface border border-border rounded-r-sm flex items-center justify-center text-muted hover:text-foreground"
        style={{ left: leftOpen ? leftPanelX + leftW : leftPanelX, transition: 'left .18s ease' }}
      >
        {leftOpen ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
      </button>

      {/* Floating inspector */}
      <div className={`absolute right-3 w-72 z-30 ${panelShell}`} style={{ top: panelTop, bottom: panelBottom }}>
        <InspectorPanel />
      </div>

      {/* Floating bottom timeline (advanced mode) — 전체폭 바닥 패널 */}
      {timelineOpen && (
        <div className={`absolute left-3 right-3 z-30 ${panelShell}`} style={{ bottom: edge, height: TIMELINE_H }}>
          <TimelinePanel />
        </div>
      )}

      {/* 인에디터 플레이 — 편집 중 씬을 뷰어로 전체 오버레이 구동 */}
      {editorPlaying && playScene && (
        <div className="absolute inset-0 z-50 bg-canvas">
          <PlayViewer scene={playScene} isOwner hideBadge projectName={projectName} />
          <button
            onClick={() => setEditorPlaying(false)}
            title="플레이 종료 (편집으로 돌아가기)"
            className="absolute top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-surface/95 border border-border text-foreground text-xs font-semibold hover:bg-surface shadow-float"
          >
            <Square size={12} className="fill-current" /> 편집으로
          </button>
        </div>
      )}

      <EditorOnboarding />
      <Toaster />
      {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} />}
      <PenToolModal />
      <VoxelToolModal />
      <BoundaryShapeModal />
    </div>
  );
}
