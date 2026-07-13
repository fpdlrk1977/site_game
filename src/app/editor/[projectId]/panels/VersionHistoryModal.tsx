'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase';
import { useSceneStore } from '@/store/sceneStore';
import { normalizeSceneData } from '@/types/scene';

interface Version {
  id: string;
  created_at: string;
}

interface Props {
  onClose: () => void;
}

export function VersionHistoryModal({ onClose }: Props) {
  const { sceneId, projectId, isModified, loadScene, markModified } = useSceneStore();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!sceneId) return;
    createBrowserSupabase()
      .from('scene_versions')
      .select('id, created_at')
      .eq('scene_id', sceneId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setVersions(data ?? []);
        setLoading(false);
      });
  }, [sceneId]);

  const restore = async (versionId: string) => {
    if (!sceneId || !projectId) return;
    if (isModified && !confirm('저장하지 않은 변경사항이 있습니다. 복구하면 사라집니다.')) return;
    if (!confirm('이 버전으로 복구할까요?')) return;
    setRestoring(versionId);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase
        .from('scene_versions')
        .select('scene_data')
        .eq('id', versionId)
        .single();
      if (!data) return;
      // 복원은 scenes 행에 곧바로 쓰지 않고 에디터에만 불러온다 (사용자가 Ctrl+S로 확정).
      // 따라서 행 리비전(savedVersion)은 현재 값을 유지해야 이후 저장에서 거짓 충돌이 나지 않는다.
      const currentVersion = useSceneStore.getState().savedVersion;
      loadScene(
        normalizeSceneData(
          data.scene_data as Record<string, unknown>,
          projectId,
          sceneId,
        ),
        currentVersion,
      );
      markModified();
      onClose();
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-sm w-full max-w-sm shadow-modal overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">버전 히스토리</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors"><X size={16} /></button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="py-8 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-center text-muted text-sm">
              <p>저장 이력이 없습니다.</p>
              <p className="text-xs mt-1 text-muted/60">Ctrl+S로 저장하면 이력이 생성됩니다.</p>
            </div>
          ) : (
            <div className="py-1">
              {versions.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-background/50 transition-colors group">
                  <div>
                    <p className="text-xs text-foreground font-medium">{formatDate(v.created_at)}</p>
                    {i === 0 && (
                      <span className="text-[9px] text-emerald-400 font-semibold">최신</span>
                    )}
                  </div>
                  <button
                    onClick={() => restore(v.id)}
                    disabled={restoring === v.id}
                    className="opacity-0 group-hover:opacity-100 text-[10px] font-semibold px-2.5 py-1 rounded-xs bg-primary text-white hover:bg-primary/80 transition-all disabled:opacity-40"
                  >
                    {restoring === v.id ? '복구 중...' : '이 버전으로 복구'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border">
          <p className="text-[10px] text-muted/60">최대 30개 이력 보관 · 저장마다 자동 생성</p>
        </div>
      </div>
    </div>
  );
}
