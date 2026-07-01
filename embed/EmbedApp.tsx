import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ViewerCanvas } from '@/app/space/[sceneId]/ViewerCanvas';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';

interface Props {
  sceneId: string;
  apiBase: string;
}

const WRAPPER_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  background: '#0f0f1a',
};

const CENTER_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'rgba(255,255,255,0.5)',
  fontFamily: 'sans-serif',
  fontSize: 13,
};

const PLAY_BTN_STYLE: CSSProperties = {
  position: 'absolute',
  bottom: 12,
  right: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(0,0,0,0.4)',
  color: 'rgba(255,255,255,0.7)',
  backdropFilter: 'blur(4px)',
  cursor: 'pointer',
};

const WATERMARK_STYLE: CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: 'sans-serif',
  fontSize: 9,
  color: 'rgba(255,255,255,0.3)',
  background: 'rgba(0,0,0,0.3)',
  padding: '4px 8px',
  borderRadius: 6,
  pointerEvents: 'none',
};

export function EmbedApp({ sceneId, apiBase }: Props) {
  const [scene, setScene] = useState<ProjectSceneSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/api/scenes/${sceneId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`씬을 불러올 수 없습니다 (${res.status})`);
        return res.json();
      })
      .then((data) => { if (!cancelled) setScene(data.scene_data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : '알 수 없는 오류'); });
    return () => { cancelled = true; };
  }, [sceneId, apiBase]);

  // postMessage 수신 허용 오리진 — referrer 기반으로 한정 (알 수 없으면 와일드카드)
  const parentOrigin = useMemo(() => {
    try {
      if (document.referrer) return new URL(document.referrer).origin;
    } catch {
      /* ignore */
    }
    return '*';
  }, []);

  const handleObjectEvent = (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => {
    if (window.parent === window) return; // 임베드 모드가 아니면(=iframe 없이 최상위) 브릿지 불필요
    const events = obj.events.filter((e) => e.trigger === trigger);
    for (const ev of events) {
      if (ev.action === 'open_url' && ev.value) {
        window.open(ev.value, '_blank', 'noopener noreferrer');
      } else if (ev.action === 'show_popup') {
        window.parent.postMessage(
          { type: 'park3d:popup', sceneId, objectId: obj.id, objectName: obj.name, value: ev.value },
          parentOrigin,
        );
      } else if (ev.action === 'emit_event') {
        window.parent.postMessage(
          { type: 'park3d:event', sceneId, objectId: obj.id, objectName: obj.name, trigger, value: ev.value },
          parentOrigin,
        );
      }
    }
  };

  if (error) {
    return <div style={CENTER_STYLE}>씬을 불러올 수 없습니다</div>;
  }
  if (!scene) {
    return <div style={CENTER_STYLE}>불러오는 중...</div>;
  }

  return (
    <div style={WRAPPER_STYLE}>
      <ViewerCanvas scene={scene} playMode={playMode} onObjectClick={handleObjectEvent} />
      <button onClick={() => setPlayMode((v) => !v)} style={PLAY_BTN_STYLE}>
        {playMode ? '⏹' : '▶'}
      </button>
      <div style={WATERMARK_STYLE}>⬡ Park3D</div>
    </div>
  );
}
