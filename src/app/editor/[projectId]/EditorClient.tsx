'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSceneStore } from '@/store/sceneStore';
import { ViewportToolbar } from './panels/ViewportToolbar';
import { HierarchyPanel } from './panels/HierarchyPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { AssetBrowser } from './panels/AssetBrowser';
import { EditorOnboarding } from './EditorOnboarding';
import type { ProjectSceneSchema } from '@/types/scene';

const EditorCanvas = dynamic(
  () => import('./canvas/EditorCanvas').then((m) => m.EditorCanvas),
  { ssr: false, loading: () => <div className="w-full h-full bg-zinc-900 flex items-center justify-center"><span className="text-zinc-500 text-sm">뷰포트 로딩 중...</span></div> },
);

interface Props {
  projectName: string;
  initialScene: ProjectSceneSchema;
}

export function EditorClient({ projectName, initialScene }: Props) {
  const { loadScene, undo, redo, deleteSelected, duplicateSelected, setTransformMode, requestFocus } = useSceneStore();
  const [isMobile, setIsMobile] = useState(false);

  // 씬 초기 로드
  useEffect(() => {
    loadScene(initialScene);
  }, [initialScene, loadScene]);

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

      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); return; }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); document.getElementById('save-btn')?.click(); return; }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); duplicateSelected(); return; }

      if (isInput) return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'w' || e.key === 'W') setTransformMode('translate');
      if (e.key === 'e' || e.key === 'E') setTransformMode('rotate');
      if (e.key === 'r' || e.key === 'R') setTransformMode('scale');
      if (e.key === 'f' || e.key === 'F') requestFocus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, deleteSelected, duplicateSelected, setTransformMode, requestFocus]);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">🖥️</div>
          <h2 className="text-xl font-bold text-white mb-2">PC에서 이용해 주세요</h2>
          <p className="text-zinc-400 text-sm">에디터는 1280px 이상의 화면에서 지원됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-screen h-screen bg-zinc-950 overflow-hidden"
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr 280px',
        gridTemplateRows: '48px 1fr 180px',
      }}
    >
      {/* 상단 툴바 — 3열 전체 */}
      <div style={{ gridColumn: '1 / -1', gridRow: '1' }}>
        <ViewportToolbar projectName={projectName} />
      </div>

      {/* Hierarchy */}
      <div style={{ gridColumn: '1', gridRow: '2' }}>
        <HierarchyPanel />
      </div>

      {/* Viewport */}
      <div style={{ gridColumn: '2', gridRow: '2' }} className="relative overflow-hidden">
        <EditorCanvas />
      </div>

      {/* Inspector */}
      <div style={{ gridColumn: '3', gridRow: '2' }}>
        <InspectorPanel />
      </div>

      {/* Asset Browser — 3열 전체 */}
      <div style={{ gridColumn: '1 / -1', gridRow: '3' }}>
        <AssetBrowser />
      </div>

      {/* 신규 유저 온보딩 — 첫 방문 시에만 표시 */}
      <EditorOnboarding />
    </div>
  );
}
