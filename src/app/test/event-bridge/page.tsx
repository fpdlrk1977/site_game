'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface LogEntry {
  id: number;
  ts: string;
  type: 'park3d:event' | 'park3d:popup' | 'other';
  data: Record<string, unknown>;
}

let idSeq = 0;

function EventBridgeTester() {
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get('url') ?? '';

  const [embedUrl, setEmbedUrl] = useState(initialUrl);
  const [activeUrl, setActiveUrl] = useState(initialUrl);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (!['park3d:event', 'park3d:popup'].includes(d.type)) return;

      idSeq += 1;
      const now = new Date();
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;

      setLog((prev) => [...prev, { id: idSeq, ts, type: d.type, data: d }]);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const loadScene = () => {
    if (embedUrl.trim()) setActiveUrl(embedUrl.trim());
  };

  const TYPE_STYLE: Record<string, string> = {
    'park3d:event': 'text-primary',
    'park3d:popup': 'text-cyan-400',
  };

  return (
    <div className="min-h-screen bg-sidebar text-foreground flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-border px-5 py-3 flex items-center gap-3 shrink-0 bg-surface">
        <div className="w-7 h-7 rounded-xs bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xs shadow-lg shadow-violet-500/25">
          ⬡
        </div>
        <span className="font-bold text-sm">Park3D</span>
        <span className="text-muted/60 text-sm">·</span>
        <span className="text-sm text-muted">Event Bridge 테스트</span>
      </header>

      {/* URL 입력 */}
      <div className="border-b border-border px-5 py-3 flex items-center gap-2 shrink-0 bg-surface">
        <span className="text-xs text-muted shrink-0">임베드 URL</span>
        <input
          type="text"
          value={embedUrl}
          onChange={(e) => setEmbedUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadScene()}
          placeholder="/embed/<sceneId> 또는 전체 URL 입력"
          className="flex-1 px-3 py-1.5 bg-background border border-border rounded-xs text-sm text-foreground placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-mono"
        />
        <button
          onClick={loadScene}
          disabled={!embedUrl.trim()}
          className="px-4 py-1.5 bg-primary hover:bg-primary/80 disabled:bg-background disabled:text-muted text-white text-sm font-medium rounded-xs transition-colors shrink-0"
        >
          로드
        </button>
      </div>

      {/* 본문 — iframe 좌 / 이벤트 로그 우 */}
      <div className="flex flex-1 min-h-0">
        {/* iframe */}
        <div className="flex-1 bg-canvas relative">
          {activeUrl ? (
            <iframe
              key={activeUrl}
              src={activeUrl}
              className="w-full h-full border-0"
              allow="autoplay"
              title="Park3D Embed"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
              <div className="text-4xl">📡</div>
              <p className="text-sm">임베드 URL을 입력하고 로드하세요.</p>
            </div>
          )}
        </div>

        {/* 이벤트 로그 */}
        <div className="w-96 shrink-0 border-l border-border flex flex-col bg-sidebar">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${log.length > 0 ? 'bg-success animate-pulse' : 'bg-border'}`} />
              <span className="text-xs font-semibold text-foreground">이벤트 로그</span>
              {log.length > 0 && (
                <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-mono">
                  {log.length}
                </span>
              )}
            </div>
            <button
              onClick={() => setLog([])}
              className="text-[10px] text-muted/60 hover:text-muted transition-colors"
            >
              지우기
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[11px]">
            {log.length === 0 ? (
              <div className="text-muted/40 text-center pt-8 leading-relaxed">
                씬을 로드하고<br />
                emit_event 액션이 설정된<br />
                오브젝트를 클릭해보세요.
              </div>
            ) : (
              log.map((entry) => (
                <div key={entry.id} className="bg-surface border border-border rounded-xs p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`font-bold ${TYPE_STYLE[entry.type] ?? 'text-muted'}`}>
                      {entry.type}
                    </span>
                    <span className="text-muted/60">{entry.ts}</span>
                  </div>
                  {entry.type === 'park3d:event' && (
                    <div className="space-y-0.5 text-muted">
                      {!!entry.data.value && (
                        <div><span className="text-muted/60">value</span>  <span className="text-foreground">{String(entry.data.value)}</span></div>
                      )}
                      {!!entry.data.trigger && (
                        <div><span className="text-muted/60">trigger</span> <span className="text-success">{String(entry.data.trigger)}</span></div>
                      )}
                      {!!entry.data.objectName && (
                        <div><span className="text-muted/60">object</span> <span className="text-foreground">{String(entry.data.objectName)}</span></div>
                      )}
                    </div>
                  )}
                  {entry.type === 'park3d:popup' && (
                    <div className="space-y-0.5 text-muted">
                      {!!entry.data.value && (
                        <div><span className="text-muted/60">value</span>  <span className="text-foreground">{String(entry.data.value)}</span></div>
                      )}
                      {!!entry.data.objectName && (
                        <div><span className="text-muted/60">object</span> <span className="text-foreground">{String(entry.data.objectName)}</span></div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          {/* 안내 */}
          <div className="border-t border-border px-4 py-3 shrink-0">
            <p className="text-[10px] text-muted/60 leading-relaxed">
              <span className="text-primary">park3d:event</span> — emit_event 액션<br />
              <span className="text-cyan-400">park3d:popup</span> — show_popup 액션 (임베드 모드)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EventBridgeTestPage() {
  return (
    <Suspense>
      <EventBridgeTester />
    </Suspense>
  );
}
