'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { ViewportToolbar } from './panels/ViewportToolbar';
import { EditorGnb, type GnbTab } from './panels/EditorGnb';
import { LeftPanel } from './panels/LeftPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { EditorOnboarding } from './EditorOnboarding';
import { ViewportStatusBar } from './canvas/ViewportStatusBar';
import { ViewportFloatingToolbar } from './canvas/ViewportFloatingToolbar';
import { ViewportOrientationGizmo } from './canvas/ViewportOrientationGizmo';
import { CommandPalette } from './panels/CommandPalette';
import { Toaster } from '@/components/ui/Toaster';
import type { ProjectSceneSchema } from '@/types/scene';

const EditorCanvas = dynamic(
  () => import('./canvas/EditorCanvas').then((m) => m.EditorCanvas),
  { ssr: false, loading: () => <div className="w-full h-full bg-surface flex items-center justify-center"><span className="text-muted text-sm">뷰포트 로딩 중...</span></div> },
);

interface Props {
  projectName: string;
  initialScene: ProjectSceneSchema;
}

export function EditorClient({ projectName, initialScene }: Props) {
  const {
    loadScene, undo, redo, deleteSelected, duplicateSelected, duplicateInPlace,
    setTransformMode, requestFocus, requestFocusAll, requestCameraView,
    groupSelected, ungroupSelected, requestSaveBookmark, requestRecallBookmark,
    copyObjectProperties, pasteObjectProperties,
  } = useSceneStore();
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
    loadScene(initialScene);
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
      if (e.shiftKey && e.code === 'KeyF') { requestFocusAll(); return; }
      if (e.code === 'KeyF') requestFocus();
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
  }, [undo, redo, deleteSelected, duplicateSelected, duplicateInPlace, setTransformMode, requestFocus, requestFocusAll, requestCameraView, groupSelected, ungroupSelected, requestSaveBookmark, requestRecallBookmark, copyObjectProperties, pasteObjectProperties]);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">🖥️</div>
          <h2 className="text-xl font-bold text-foreground mb-2">PC에서 이용해 주세요</h2>
          <p className="text-muted text-sm">에디터는 1280px 이상의 화면에서 지원됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-screen h-screen bg-sidebar overflow-hidden"
      style={{
        display: 'grid',
        gridTemplateColumns: `48px ${leftOpen ? '240px' : '0px'} 1fr 280px`,
        gridTemplateRows: '48px 1fr',
        transition: 'grid-template-columns 0.18s ease',
      }}
    >
      {/* 헤더 — 전체 열 */}
      <div style={{ gridColumn: '1 / -1', gridRow: '1' }}>
        <ViewportToolbar projectName={projectName} />
      </div>

      {/* GNB 레일 — 좌측 패널과 별개, 항상 표시 */}
      <div style={{ gridColumn: '1', gridRow: '2', overflow: 'hidden' }}>
        <EditorGnb tab={gnbTab} panelOpen={leftOpen} onTabClick={handleGnbTabClick} projectName={projectName} />
      </div>

      {/* 왼쪽 패널 (GNB 선택에 따라 Objects / Assets) */}
      <div style={{ gridColumn: '2', gridRow: '2', overflow: 'hidden' }}>
        <LeftPanel tab={gnbTab} />
      </div>

      {/* Viewport */}
      <div style={{ gridColumn: '3', gridRow: '2' }} className="relative overflow-hidden">
        <EditorCanvas />
        <ViewportFloatingToolbar />
        <ViewportOrientationGizmo />
        <ViewportStatusBar />

        {/* 왼쪽 패널 토글 버튼 (GNB 레일은 항상 유지) */}
        <button
          onClick={() => setLeftOpen((v) => !v)}
          title={leftOpen ? '왼쪽 패널 숨기기' : '왼쪽 패널 표시'}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-3.5 h-9 bg-surface border border-l-0 border-border rounded-r-md flex items-center justify-center text-muted hover:text-foreground hover:bg-background transition-all"
        >
          {leftOpen ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
        </button>
      </div>

      {/* Inspector */}
      <div style={{ gridColumn: '4', gridRow: '2', overflow: 'hidden' }}>
        <InspectorPanel />
      </div>

      <EditorOnboarding />
      <Toaster />
      {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} />}
    </div>
  );
}
