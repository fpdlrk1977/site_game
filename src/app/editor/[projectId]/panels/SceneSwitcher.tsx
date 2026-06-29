'use client';

import { useState, useRef, useEffect } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { usePlan } from '@/hooks/usePlan';
import { createBrowserSupabase } from '@/lib/supabase';
import { makeEmptySceneData, normalizeSceneData } from '@/types/scene';

interface SceneItem {
  id: string;
  name: string;
}

export function SceneSwitcher() {
  const { projectId, sceneId, isModified, loadScene } = useSceneStore();
  const { can } = usePlan();
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentScene = scenes.find((s) => s.id === sceneId);

  // 드롭다운 열릴 때 씬 목록 조회
  useEffect(() => {
    if (!open || !projectId) return;
    createBrowserSupabase()
      .from('scenes')
      .select('id, name')
      .eq('project_id', projectId)
      .order('created_at')
      .then(({ data }) => setScenes(data ?? []));
  }, [open, projectId]);

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const switchScene = async (targetId: string) => {
    if (targetId === sceneId) { setOpen(false); return; }
    if (isModified && !confirm('저장하지 않은 변경사항이 있습니다. 전환하면 사라집니다.')) return;
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase
        .from('scenes')
        .select('id, scene_data, project_id')
        .eq('id', targetId)
        .single();
      if (data && projectId) {
        loadScene(normalizeSceneData(
          (data.scene_data as Record<string, unknown>) ?? {},
          projectId,
          data.id,
        ));
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const addScene = async () => {
    if (!projectId) return;
    if (!can('multiScene')) {
      alert('다중 씬은 Pro 플랜 이상에서 사용 가능합니다.');
      return;
    }
    const name = prompt('씬 이름', '새 씬');
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const newId = crypto.randomUUID();
      await supabase.from('scenes').insert({
        id: newId,
        project_id: projectId,
        name: name.trim(),
        scene_data: makeEmptySceneData(projectId, newId),
      });
      const newScene = { id: newId, name: name.trim() };
      setScenes((prev) => [...prev, newScene]);
      await switchScene(newId);
    } finally {
      setBusy(false);
    }
  };

  const deleteScene = async (targetId: string, name: string) => {
    if (scenes.length <= 1) { alert('마지막 씬은 삭제할 수 없습니다.'); return; }
    if (!confirm(`"${name}" 씬을 삭제할까요? 복구할 수 없습니다.`)) return;
    await createBrowserSupabase().from('scenes').delete().eq('id', targetId);
    const remaining = scenes.filter((s) => s.id !== targetId);
    setScenes(remaining);
    if (targetId === sceneId) await switchScene(remaining[0].id);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={busy}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-xs max-w-[140px] disabled:opacity-50"
      >
        <span className="text-[10px] text-zinc-500 shrink-0">씬</span>
        <span className="truncate flex-1 text-left">{currentScene?.name ?? '...'}</span>
        <span className="text-zinc-500 shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            씬 목록
          </div>
          {scenes.map((scene) => (
            <div key={scene.id} className="flex items-center group">
              <button
                onClick={() => switchScene(scene.id)}
                className={`flex-1 text-left px-3 py-2 text-xs transition-colors ${
                  scene.id === sceneId
                    ? 'text-violet-400 bg-violet-600/20'
                    : 'text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                {scene.id === sceneId && <span className="mr-1.5 opacity-70">✓</span>}
                {scene.name}
              </button>
              {scene.id !== sceneId && (
                <button
                  onClick={() => deleteScene(scene.id, scene.name)}
                  className="hidden group-hover:flex w-7 items-center justify-center py-2 text-zinc-600 hover:text-red-400 transition-colors text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="border-t border-zinc-700 my-1" />
          <button
            onClick={addScene}
            disabled={busy}
            className="w-full text-left px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            <span>+</span> 새 씬 추가
            {!can('multiScene') && (
              <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white">
                Pro
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
