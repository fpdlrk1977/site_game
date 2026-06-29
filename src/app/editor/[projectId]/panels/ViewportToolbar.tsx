'use client';

import Link from 'next/link';
import { useSceneStore } from '@/store/sceneStore';
import { createBrowserSupabase } from '@/lib/supabase';
import type { PrimitiveShape, ProjectSceneSchema } from '@/types/scene';

interface Props {
  projectName: string;
}

const SHAPES: { shape: PrimitiveShape; label: string; icon: string }[] = [
  { shape: 'box', label: '박스', icon: '⬛' },
  { shape: 'sphere', label: '구체', icon: '⬤' },
  { shape: 'cylinder', label: '원기둥', icon: '⬭' },
  { shape: 'plane', label: '평면', icon: '▬' },
];

export function ViewportToolbar({ projectName }: Props) {
  const {
    transformMode, transformSpace, isModified,
    snapEnabled, snapTranslate,
    setTransformMode, setTransformSpace, setSnap,
    addObject, undo, redo,
    projectId, sceneId, objects, assets, environment, markSaved,
  } = useSceneStore();

  const SNAP_STEPS = [0.25, 0.5, 1, 2];

  const handleSave = async () => {
    if (!sceneId) return;
    const supabase = createBrowserSupabase();
    const sceneData: ProjectSceneSchema = {
      projectId: projectId ?? '',
      sceneId,
      version: 1,
      environment,
      assets,
      objects,
    };

    await supabase
      .from('scenes')
      .update({ scene_data: sceneData })
      .eq('id', sceneId);

    // 썸네일 캡처 — canvas.toDataURL은 preserveDrawingBuffer: true 필요
    if (projectId) {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (canvas) {
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const { error } = await supabase.storage
            .from('thumbnails')
            .upload(`${projectId}.jpg`, blob, { contentType: 'image/jpeg', upsert: true });
          if (!error) {
            const { data: { publicUrl } } = supabase.storage
              .from('thumbnails')
              .getPublicUrl(`${projectId}.jpg`);
            await supabase
              .from('projects')
              .update({ thumbnail_url: publicUrl })
              .eq('id', projectId);
          }
        } catch {
          // 썸네일 실패는 저장을 막지 않음
        }
      }
    }

    markSaved();
  };

  const MODE_BTNS = [
    { mode: 'translate' as const, label: 'W', title: '이동 (W)' },
    { mode: 'rotate' as const, label: 'E', title: '회전 (E)' },
    { mode: 'scale' as const, label: 'R', title: '스케일 (R)' },
  ];

  return (
    <header className="flex items-center gap-2 px-3 h-full bg-zinc-900 border-b border-zinc-800 select-none">
      {/* 뒤로 */}
      <Link
        href="/dashboard"
        className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-800 transition-colors flex items-center gap-1 shrink-0"
      >
        ← 대시보드
      </Link>
      <span className="text-zinc-600 text-sm">|</span>
      <span className="text-sm font-medium text-zinc-300 shrink-0 max-w-[120px] truncate">{projectName}</span>

      <div className="flex-1" />

      {/* Transform 모드 */}
      <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 gap-0.5">
        {MODE_BTNS.map(({ mode, label, title }) => (
          <button
            key={mode}
            title={title}
            onClick={() => setTransformMode(mode)}
            className={`w-7 h-7 rounded-md text-xs font-mono font-bold transition-all ${
              transformMode === mode
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* World / Local */}
      <button
        onClick={() => setTransformSpace(transformSpace === 'world' ? 'local' : 'world')}
        className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors font-medium"
      >
        {transformSpace === 'world' ? 'World' : 'Local'}
      </button>

      <div className="w-px h-5 bg-zinc-700" />

      {/* 스냅 */}
      <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5">
        <button
          title="스냅 켜기/끄기"
          onClick={() => setSnap(!snapEnabled)}
          className={`px-2 h-7 rounded-md text-xs font-semibold transition-all ${
            snapEnabled ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
          }`}
        >
          ⊞
        </button>
        {SNAP_STEPS.map((step) => (
          <button
            key={step}
            onClick={() => setSnap(true, step)}
            className={`px-1.5 h-7 rounded-md text-[10px] font-mono transition-all ${
              snapEnabled && snapTranslate === step
                ? 'bg-zinc-600 text-white'
                : 'text-zinc-500 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {step}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-zinc-700" />

      {/* 오브젝트 추가 */}
      <div className="flex items-center gap-0.5">
        {SHAPES.map(({ shape, label, icon }) => (
          <button
            key={shape}
            title={label + ' 추가'}
            onClick={() => addObject(shape)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-xs"
          >
            <span className="text-base leading-none">{icon}</span>
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-zinc-700" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5">
        <button
          title="실행 취소 (Ctrl+Z)"
          onClick={undo}
          className="w-7 h-7 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all text-sm"
        >
          ↩
        </button>
        <button
          title="다시 실행 (Ctrl+Y)"
          onClick={redo}
          className="w-7 h-7 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all text-sm"
        >
          ↪
        </button>
      </div>

      {/* 저장 */}
      <button
        id="save-btn"
        onClick={handleSave}
        disabled={!isModified}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          isModified
            ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-cyan-500 hover:-translate-y-0.5'
            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
        }`}
      >
        저장{isModified ? ' *' : ''}
      </button>

      {/* 미리보기 */}
      {sceneId && (
        <a
          href={`/space/${sceneId}`}
          target="_blank"
          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          미리보기 ↗
        </a>
      )}
    </header>
  );
}
