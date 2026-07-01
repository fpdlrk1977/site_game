'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Move, RotateCcw, Maximize2,
  Globe, Crosshair, Undo2, Redo2, Save,
  History, ExternalLink, Box, Layers,
  AlignCenter, Grid3x3,
} from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { useThemeStore } from '@/store/themeStore';
import { createBrowserSupabase } from '@/lib/supabase';
import { SceneSwitcher } from './SceneSwitcher';
import { VersionHistoryModal } from './VersionHistoryModal';
import type { PrimitiveShape, ProjectSceneSchema } from '@/types/scene';
import { SCENE_VERSION } from '@/types/scene';

interface Props {
  projectName: string;
}

// 인라인 툴팁 — 툴바 전용 경량 구현
function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-zinc-950 border border-zinc-800 text-[11px] font-medium text-zinc-200 rounded-lg whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity duration-100 pointer-events-none z-[100] shadow-xl shadow-black/60">
        {label}
      </div>
    </div>
  );
}

const SHAPES: { shape: PrimitiveShape; label: string; icon: string }[] = [
  { shape: 'box',      label: '박스 추가 (B)',   icon: '⬛' },
  { shape: 'sphere',   label: '구체 추가',        icon: '⬤' },
  { shape: 'cylinder', label: '원기둥 추가',      icon: '⬭' },
  { shape: 'plane',    label: '평면 추가',        icon: '▬' },
];

export function ViewportToolbar({ projectName }: Props) {
  const {
    transformMode, transformSpace, isModified,
    snapEnabled, snapTranslate, wireframeMode,
    setTransformMode, setTransformSpace, setSnap, toggleWireframe,
    addObject, undo, redo, alignSelected, selectedIds,
    projectId, sceneId, objects, assets, environment, markSaved,
  } = useSceneStore();
  const { addToast } = useToast();
  const { theme, toggleTheme } = useThemeStore();
  const [showHistory, setShowHistory] = useState(false);
  const [showAlign, setShowAlign] = useState(false);
  const canAlign = selectedIds.length >= 2;
  const alignRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAlign) return;
    const handler = (e: MouseEvent) => {
      if (alignRef.current && !alignRef.current.contains(e.target as Node)) setShowAlign(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAlign]);

  const SNAP_STEPS = [0.25, 0.5, 1, 2];

  const handleSave = async () => {
    if (!sceneId) return;
    const supabase = createBrowserSupabase();
    const sceneData: ProjectSceneSchema = {
      projectId: projectId ?? '',
      sceneId,
      version: SCENE_VERSION,
      environment,
      assets,
      objects,
    };

    const { error: saveErr } = await supabase
      .from('scenes')
      .update({ scene_data: sceneData })
      .eq('id', sceneId);

    if (saveErr) {
      addToast('씬 저장에 실패했습니다. 다시 시도해 주세요.', 'error');
      return;
    }

    await supabase.from('scene_versions').insert({ scene_id: sceneId, scene_data: sceneData });
    const { data: oldVersions } = await supabase
      .from('scene_versions')
      .select('id')
      .eq('scene_id', sceneId)
      .order('created_at', { ascending: false })
      .range(30, 9999);
    if (oldVersions && oldVersions.length > 0) {
      await supabase.from('scene_versions').delete().in('id', oldVersions.map((v) => v.id));
    }

    if (projectId) {
      const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement | null;
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
    addToast('저장되었습니다.', 'success');
  };

  const MODE_BTNS = [
    { mode: 'translate' as const, icon: <Move size={14} />,      title: '이동 (W)' },
    { mode: 'rotate'    as const, icon: <RotateCcw size={14} />, title: '회전 (E)' },
    { mode: 'scale'     as const, icon: <Maximize2 size={14} />, title: '스케일 (R)' },
  ];

  const SEP = <div className="w-px h-5 bg-zinc-800 shrink-0" />;

  return (
    <>
      <header className="flex items-center gap-2 px-3 h-full bg-zinc-900 border-b border-zinc-800/80 select-none overflow-hidden">

        {/* ── 왼쪽: 네비게이션 + 프로젝트/씬 정보 ─────────── */}
        <Tip label="대시보드로 이동">
          <Link
            href="/dashboard"
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all shrink-0"
          >
            <ArrowLeft size={15} />
          </Link>
        </Tip>

        {/* 앱 로고 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold shadow-md shadow-violet-500/30">
            ⬡
          </div>
          <span className="text-xs font-bold text-zinc-300 hidden xl:block">Park3D</span>
        </div>

        <div className="w-px h-4 bg-zinc-800 shrink-0" />

        {/* 프로젝트명 — 씬 선택기 */}
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          <span className="text-sm font-medium text-zinc-300 truncate max-w-[90px] hidden lg:block">{projectName}</span>
          <span className="text-zinc-600 text-xs hidden lg:block">—</span>
          <SceneSwitcher />
          {isModified && (
            <Tip label="저장되지 않은 변경사항">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
            </Tip>
          )}
        </div>

        <div className="flex-1" />

        {/* ── 오른쪽: 툴 그룹들 ─────────────────────────────── */}

        {/* Transform 모드 */}
        <div className="flex items-center bg-zinc-800/60 rounded-lg p-0.5 gap-0.5 shrink-0">
          {MODE_BTNS.map(({ mode, icon, title }) => (
            <Tip key={mode} label={title}>
              <button
                onClick={() => setTransformMode(mode)}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                  transformMode === mode
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {icon}
              </button>
            </Tip>
          ))}
        </div>

        {/* 좌표계 */}
        <Tip label={transformSpace === 'world' ? '월드 좌표계 (클릭 시 로컬)' : '로컬 좌표계 (클릭 시 월드)'}>
          <button
            onClick={() => setTransformSpace(transformSpace === 'world' ? 'local' : 'world')}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all text-xs font-medium shrink-0"
          >
            {transformSpace === 'world'
              ? <Globe size={12} />
              : <Crosshair size={12} />
            }
            <span className="hidden xl:block">{transformSpace === 'world' ? 'World' : 'Local'}</span>
          </button>
        </Tip>

        {SEP}

        {/* 스냅 */}
        <div className="flex items-center gap-0.5 bg-zinc-800/60 rounded-lg p-0.5 shrink-0">
          <Tip label={snapEnabled ? '스냅 끄기' : '스냅 켜기'}>
            <button
              onClick={() => setSnap(!snapEnabled)}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                snapEnabled
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              <Grid3x3 size={13} />
            </button>
          </Tip>
          {SNAP_STEPS.map((step) => (
            <Tip key={step} label={`스냅 간격: ${step}`}>
              <button
                onClick={() => setSnap(true, step)}
                className={`px-1.5 h-7 rounded-md text-[10px] font-mono transition-all ${
                  snapEnabled && snapTranslate === step
                    ? 'bg-zinc-600 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {step}
              </button>
            </Tip>
          ))}
        </div>

        {SEP}

        {/* 도형 추가 */}
        <div className="flex items-center gap-0 shrink-0">
          {SHAPES.map(({ shape, label, icon }) => (
            <Tip key={shape} label={label}>
              <button
                onClick={() => addObject(shape)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-sm"
              >
                {icon}
              </button>
            </Tip>
          ))}
        </div>

        {SEP}

        {/* 정렬 */}
        <div className="relative shrink-0" ref={alignRef}>
          <Tip label={canAlign ? '선택 오브젝트 정렬' : '2개 이상 선택 시 활성화'}>
            <button
              onClick={() => setShowAlign((v) => !v)}
              disabled={!canAlign}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                canAlign
                  ? showAlign
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                  : 'bg-zinc-800/40 text-zinc-600 cursor-not-allowed'
              }`}
            >
              <AlignCenter size={14} />
            </button>
          </Tip>
          {showAlign && canAlign && (
            <div className="absolute top-full right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 p-2 min-w-[160px]">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-1.5">정렬</div>
              {([
                { axis: 'x' as const, label: 'X축', min: '좌', ctr: '중', max: '우' },
                { axis: 'y' as const, label: 'Y축', min: '하', ctr: '중', max: '상' },
                { axis: 'z' as const, label: 'Z축', min: '전', ctr: '중', max: '후' },
              ]).map(({ axis, label, min, ctr, max }) => (
                <div key={axis} className="flex items-center gap-1.5 py-0.5">
                  <span className="text-[10px] font-mono text-zinc-500 w-6 shrink-0">{label}</span>
                  <div className="flex items-center bg-zinc-800 rounded-md p-0.5 gap-0.5 flex-1">
                    {([
                      { mode: 'min' as const, label: min },
                      { mode: 'center' as const, label: ctr },
                      { mode: 'max' as const, label: max },
                    ]).map(({ mode, label: ml }) => (
                      <button
                        key={mode}
                        onClick={() => { alignSelected(axis, mode); setShowAlign(false); }}
                        className="flex-1 h-6 rounded text-[10px] font-medium text-zinc-400 hover:bg-violet-600 hover:text-white transition-all"
                      >
                        {ml}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 와이어프레임 */}
        <Tip label={wireframeMode ? '솔리드 모드로 전환' : '와이어프레임 모드로 전환'}>
          <button
            onClick={toggleWireframe}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 ${
              wireframeMode
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-500/20'
                : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            }`}
          >
            {wireframeMode ? <Layers size={14} /> : <Box size={14} />}
          </button>
        </Tip>

        {SEP}

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 bg-zinc-800/60 rounded-lg p-0.5 shrink-0">
          <Tip label="실행 취소 (Ctrl+Z)">
            <button
              onClick={undo}
              className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
            >
              <Undo2 size={14} />
            </button>
          </Tip>
          <Tip label="다시 실행 (Ctrl+Y)">
            <button
              onClick={redo}
              className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
            >
              <Redo2 size={14} />
            </button>
          </Tip>
        </div>

        {SEP}

        {/* 저장 */}
        <Tip label={isModified ? '저장 (Ctrl+S)' : '변경사항 없음'}>
          <button
            id="save-btn"
            onClick={handleSave}
            disabled={!isModified}
            className={`flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              isModified
                ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md shadow-violet-500/25 hover:from-violet-500 hover:to-cyan-500'
                : 'bg-zinc-800/40 text-zinc-600 cursor-not-allowed'
            }`}
          >
            <Save size={12} />
            <span className="hidden sm:block">저장</span>
          </button>
        </Tip>

        {/* 버전 히스토리 */}
        <Tip label="버전 히스토리">
          <button
            onClick={() => setShowHistory(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-white transition-all shrink-0"
          >
            <History size={14} />
          </button>
        </Tip>

        {/* 미리보기 */}
        {sceneId && (
          <Tip label="새 탭으로 미리보기">
            <a
              href={`/space/${sceneId}`}
              target="_blank"
              className="flex items-center gap-1.5 px-3 h-7 rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700 transition-all text-xs font-medium shrink-0"
            >
              <ExternalLink size={12} />
              <span className="hidden md:block">미리보기</span>
            </a>
          </Tip>
        )}

        {SEP}

        {/* 다크/라이트 토글 */}
        <Tip label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}>
          <button
            onClick={toggleTheme}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all shrink-0 text-sm"
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
        </Tip>
      </header>

      {showHistory && typeof document !== 'undefined' && createPortal(
        <VersionHistoryModal onClose={() => setShowHistory(false)} />,
        document.body,
      )}
    </>
  );
}
