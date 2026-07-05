'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Save, History, ExternalLink } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import { SceneSwitcher } from './SceneSwitcher';
import { VersionHistoryModal } from './VersionHistoryModal';
import type { ProjectSceneSchema } from '@/types/scene';
import { SCENE_VERSION } from '@/types/scene';

interface Props {
  projectName: string;
}


export function ViewportToolbar({ projectName }: Props) {
  const {
    isModified,
    projectId, sceneId, objects, assets, environment, markSaved,
  } = useSceneStore();
  const { addToast } = useToast();
  const [showHistory, setShowHistory] = useState(false);
  const [autoSaveAt, setAutoSaveAt] = useState<number | null>(null);
  const [autoSaveAgo, setAutoSaveAgo] = useState('');
  const [saving, setSaving] = useState(false);
  // 연타/중복 호출 방지 — state는 렌더용, ref는 즉시 차단용
  const savingRef = useRef(false);

  const handleSave = useCallback(async () => {
    if (!sceneId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
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
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [sceneId, projectId, objects, assets, environment, markSaved, addToast]);

  // 오토세이브: 60초마다 변경사항 있으면 자동 저장 (임시 비활성화)
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  // useEffect(() => {
  //   const interval = setInterval(async () => {
  //     const state = useSceneStore.getState();
  //     if (!state.isModified || !state.sceneId) return;
  //     await handleSaveRef.current();
  //     setAutoSaveAt(Date.now());
  //   }, 60_000);
  //   return () => clearInterval(interval);
  // }, []);

  // "N분 전" 표시 갱신
  useEffect(() => {
    if (!autoSaveAt) return;
    const update = () => {
      const mins = Math.floor((Date.now() - autoSaveAt) / 60_000);
      setAutoSaveAgo(mins === 0 ? '방금 전' : `${mins}분 전`);
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [autoSaveAt]);

  return (
    <>
      <header className="flex items-center gap-2 px-3 h-full bg-surface border-b border-border/80 select-none">

        {/* 왼쪽: 네비게이션 + 프로젝트/씬 */}
        <Tooltip content="대시보드로 이동">
          <Link
            href="/dashboard"
            className="w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-background rounded-xs transition-all shrink-0"
          >
            <ArrowLeft size={15} />
          </Link>
        </Tooltip>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-5 h-5 rounded-xs bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold shadow-md shadow-primary/30">
            ⬡
          </div>
          <span className="text-xs font-bold text-foreground hidden xl:block">Park3D</span>
        </div>

        <div className="w-px h-4 bg-border shrink-0" />

        <div className="flex items-center gap-1.5 min-w-0 shrink">
          <span className="text-sm font-medium text-foreground truncate max-w-[90px] hidden lg:block">{projectName}</span>
          <span className="text-muted text-xs hidden lg:block">—</span>
          <SceneSwitcher />
          {isModified && (
            <Tooltip content="저장되지 않은 변경사항">
              <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0 animate-pulse" />
            </Tooltip>
          )}
        </div>

        <div className="flex-1" />

        {/* 오토세이브 표시 */}
        {autoSaveAt && (
          <span className="text-[10px] text-muted hidden lg:block shrink-0">
            자동저장 {autoSaveAgo}
          </span>
        )}

        {/* 오른쪽: 액션 */}
        <Tooltip content="버전 히스토리">
          <button
            onClick={() => setShowHistory(true)}
            className="w-7 h-7 flex items-center justify-center rounded-xs border border-border text-muted hover:bg-background hover:text-foreground transition-all shrink-0"
          >
            <History size={14} />
          </button>
        </Tooltip>

        <Tooltip content={isModified ? '저장 (Ctrl+S)' : '변경사항 없음'}>
          <button
            id="save-btn"
            onClick={handleSave}
            disabled={!isModified || saving}
            className={`flex items-center gap-1.5 px-3 h-7 rounded-xs text-xs font-semibold transition-all shrink-0 ${
              isModified && !saving
                ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md shadow-primary/25 hover:from-violet-500 hover:to-cyan-500'
                : 'bg-background/40 text-muted cursor-not-allowed'
            }`}
          >
            <Save size={12} />
            <span className="hidden sm:block">{saving ? '저장 중...' : '저장'}</span>
          </button>
        </Tooltip>

        {sceneId && (
          <Tooltip content={isModified ? '저장 후 새 탭으로 미리보기' : '새 탭으로 미리보기'}>
            <button
              onClick={async () => {
                if (isModified) await handleSave();
                window.open(`/space/${sceneId}`, '_blank');
              }}
              className="flex items-center gap-1.5 px-3 h-7 rounded-xs border border-border text-foreground hover:bg-background hover:border-border/60 transition-all text-xs font-medium shrink-0"
            >
              <ExternalLink size={12} />
              <span className="hidden md:block">미리보기</span>
            </button>
          </Tooltip>
        )}

      </header>

      {showHistory && typeof document !== 'undefined' && createPortal(
        <VersionHistoryModal onClose={() => setShowHistory(false)} />,
        document.body,
      )}
    </>
  );
}
