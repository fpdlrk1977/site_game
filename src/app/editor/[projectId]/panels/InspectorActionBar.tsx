'use client';

// 우측 패널 상단 액션 바 — Save / Play / Preview (아이콘 + 영문 툴팁).
//   상단바(ViewportToolbar)에 있던 액션을 우측 패널로 옮겼다(2026-07-22). Version history는 좌측 ☰ 메뉴로.
import { Save, Play, ExternalLink } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useSceneStore } from '@/store/sceneStore';
import { useEditorSave } from './useEditorSave';

export function InspectorActionBar() {
  const isModified = useSceneStore((s) => s.isModified);
  const sceneId = useSceneStore((s) => s.sceneId);
  const setEditorPlaying = useSceneStore((s) => s.setEditorPlaying);
  const { save, saving } = useEditorSave();

  return (
    <div className="flex items-center justify-end gap-1 px-2 h-9 border-b border-border shrink-0">
      {isModified && (
        <Tooltip content="Unsaved changes">
          <span className="w-1.5 h-1.5 rounded-full bg-warning mr-auto ml-1 animate-pulse" />
        </Tooltip>
      )}

      <Tooltip content={isModified ? 'Save (Ctrl+S)' : 'No changes to save'}>
        <button
          id="save-btn"
          onClick={() => { void save(); }}
          disabled={!isModified || saving}
          className={`w-7 h-7 flex items-center justify-center rounded-xs transition-all ${
            isModified && !saving
              ? 'text-foreground hover:bg-background'
              : 'text-muted/50 cursor-not-allowed'
          }`}
        >
          <Save size={15} />
        </button>
      </Tooltip>

      <Tooltip content="Play (test in-editor)">
        <button
          onClick={() => setEditorPlaying(true)}
          className="w-7 h-7 flex items-center justify-center rounded-xs text-primary hover:bg-background transition-all"
        >
          <Play size={15} />
        </button>
      </Tooltip>

      {sceneId && (
        <Tooltip content="Preview (open published view)">
          <button
            onClick={async () => {
              if (useSceneStore.getState().isModified) await save();
              window.open(`/space/${sceneId}`, '_blank');
            }}
            className="w-7 h-7 flex items-center justify-center rounded-xs text-foreground hover:bg-background transition-all"
          >
            <ExternalLink size={15} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
