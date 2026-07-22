'use client';

// 씬 저장 로직 — 낙관적 잠금 저장 + 버전 스냅샷 + 썸네일 업로드.
//   상단바(ViewportToolbar, 현재 hidden)와 우측 패널 액션바(InspectorActionBar)가 공유한다.
import { useCallback, useRef, useState } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import { persistCurrentScene } from '@/lib/saveScene';

export function useEditorSave() {
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // 연타/중복 호출 즉시 차단

  const save = useCallback(async (): Promise<'ok' | 'conflict' | 'error'> => {
    const { sceneId, projectId } = useSceneStore.getState();
    if (!sceneId || savingRef.current) return 'error';
    savingRef.current = true;
    setSaving(true);
    try {
      // 낙관적 잠금 저장 — 다른 탭/기기가 먼저 저장했으면 conflict로 덮어쓰기 차단
      const result = await persistCurrentScene();
      if (result.status === 'conflict') {
        addToast('다른 탭이나 기기에서 이 씬이 먼저 저장되었습니다. 변경사항을 잃지 않으려면 새로고침 후 다시 시도해 주세요.', 'error');
        return 'conflict';
      }
      if (result.status !== 'ok') {
        addToast('씬 저장에 실패했습니다. 다시 시도해 주세요.', 'error');
        return 'error';
      }
      const sceneData = result.sceneData;

      const supabase = createBrowserSupabase();
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
              const { data: { publicUrl } } = supabase.storage.from('thumbnails').getPublicUrl(`${projectId}.jpg`);
              await supabase.from('projects').update({ thumbnail_url: publicUrl }).eq('id', projectId);
            }
          } catch {
            // 썸네일 실패는 저장을 막지 않음
          }
        }
      }

      // markSaved는 persistCurrentScene 성공 시 내부에서 이미 호출됨(savedVersion 갱신 포함)
      addToast('저장되었습니다.', 'success');
      return 'ok';
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [addToast]);

  return { save, saving };
}
