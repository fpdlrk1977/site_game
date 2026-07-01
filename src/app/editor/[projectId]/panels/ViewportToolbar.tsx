'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Save, History, ExternalLink } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { useThemeStore } from '@/store/themeStore';
import { createBrowserSupabase } from '@/lib/supabase';
import { SceneSwitcher } from './SceneSwitcher';
import { VersionHistoryModal } from './VersionHistoryModal';
import type { ProjectSceneSchema } from '@/types/scene';
import { SCENE_VERSION } from '@/types/scene';

interface Props {
  projectName: string;
}

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

export function ViewportToolbar({ projectName }: Props) {
  const {
    isModified,
    projectId, sceneId, objects, assets, environment, markSaved,
  } = useSceneStore();
  const { addToast } = useToast();
  const { theme, toggleTheme } = useThemeStore();
  const [showHistory, setShowHistory] = useState(false);

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

  return (
    <>
      <header className="flex items-center gap-2 px-3 h-full bg-zinc-900 border-b border-zinc-800/80 select-none overflow-hidden">

        {/* 왼쪽: 네비게이션 + 프로젝트/씬 */}
        <Tip label="대시보드로 이동">
          <Link
            href="/dashboard"
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all shrink-0"
          >
            <ArrowLeft size={15} />
          </Link>
        </Tip>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold shadow-md shadow-violet-500/30">
            ⬡
          </div>
          <span className="text-xs font-bold text-zinc-300 hidden xl:block">Park3D</span>
        </div>

        <div className="w-px h-4 bg-zinc-800 shrink-0" />

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

        {/* 오른쪽: 액션 */}
        <Tip label="버전 히스토리">
          <button
            onClick={() => setShowHistory(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-white transition-all shrink-0"
          >
            <History size={14} />
          </button>
        </Tip>

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

        <div className="w-px h-4 bg-zinc-800 shrink-0" />

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
