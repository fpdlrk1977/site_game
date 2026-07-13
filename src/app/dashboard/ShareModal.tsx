'use client';

import { useEffect, useState } from 'react';
import { X, AlertTriangle, Sparkles, Link2, Image as ImageIcon } from 'lucide-react';
import QRCode from 'qrcode';
import { usePlan } from '@/hooks/usePlan';

type Tab = 'share' | 'embed';

interface Props {
  projectName: string;
  sceneId: string;
  isPublished: boolean;
  onClose: () => void;
}

export function ShareModal({ projectName, sceneId, isPublished, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('share');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [embedMethod, setEmbedMethod] = useState<'script' | 'iframe'>('script');
  const { can } = usePlan();
  const canEmbed = can('embedMode');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const spaceUrl = `${origin}/space/${sceneId}`;
  const embedUrl = `${origin}/embed/${sceneId}`;
  const embedCode = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="500"\n  style="border:none;border-radius:12px;"\n  allow="autoplay"\n  title="${projectName}"\n></iframe>`;
  // script 한 줄 방식 — embed.js가 격리된 iframe을 꽂아줌 (권장)
  const scriptCode = `<script src="${origin}/embed.js" data-scene="${sceneId}" data-height="500px"></script>`;

  useEffect(() => {
    QRCode.toDataURL(spaceUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#ffffff', light: '#18181b' },
    }).then(setQrDataUrl);
  }, [spaceUrl]);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(spaceUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyEmbed = async () => {
    await navigator.clipboard.writeText(embedCode);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  const copyScript = async () => {
    await navigator.clipboard.writeText(scriptCode);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-sm w-full max-w-sm shadow-modal overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">{projectName}</h3>
            <p className="text-[11px] text-muted mt-0.5">3D 공간 공유하기</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors"><X size={18} /></button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border">
          {(['share', 'embed'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                tab === t
                  ? 'text-foreground border-b-2 border-primary -mb-px'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">{t === 'share' ? <><Link2 size={13} /> 공유</> : <><ImageIcon size={13} /> 임베드</>}</span>
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* 비공개 경고 */}
          {!isPublished && (
            <div className="mb-4 px-3 py-2 rounded-xs bg-warning/10 border border-warning/30 text-warning text-xs flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              현재 비공개입니다. 공개 전환 후 공유하세요.
            </div>
          )}

          {tab === 'share' && (
            <div className="space-y-3">
              {/* QR */}
              <div className="flex justify-center">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code" width={140} height={140} className="rounded-xs" />
                ) : (
                  <div className="w-36 h-36 rounded-xs bg-background animate-pulse" />
                )}
              </div>

              {/* URL 복사 */}
              <div className="flex items-center gap-2 bg-background rounded-xs px-3 py-2">
                <span className="text-xs text-muted truncate flex-1 font-mono">{spaceUrl}</span>
                <button
                  onClick={copyUrl}
                  className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-xs transition-all ${
                    copied ? 'bg-success text-white' : 'bg-surface border border-border text-foreground hover:bg-background'
                  }`}
                >
                  {copied ? '복사됨!' : '복사'}
                </button>
              </div>

              <a
                href={spaceUrl}
                target="_blank"
                className="block w-full text-center py-2.5 rounded-xs bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all"
              >
                새 탭으로 열기 ↗
              </a>
            </div>
          )}

          {tab === 'embed' && (
            <div className="space-y-4">
              {!canEmbed ? (
                /* Pro 플랜 배너 */
                <div className="bg-gradient-to-br from-violet-600/20 to-cyan-600/20 border border-violet-500/30 rounded-xs p-4 text-center space-y-3">
                  <Sparkles size={24} className="mx-auto text-violet-400" />
                  <div>
                    <p className="text-foreground font-semibold text-sm">Pro 플랜 전용</p>
                    <p className="text-muted text-xs mt-1 leading-relaxed">
                      임베드 기능은 Pro 플랜부터 사용할 수 있습니다.<br />
                      나의 3D 공간을 어디든 삽입하세요.
                    </p>
                  </div>
                  <button className="w-full py-2 rounded-xs bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all">
                    Pro로 업그레이드
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-muted text-xs leading-relaxed">
                    아래 코드를 HTML에 붙여넣으면 어느 웹사이트에서나 3D 공간을 임베드할 수 있어요.
                  </p>

                  {/* 방식 선택 — 스크립트(권장) / iframe */}
                  <div className="flex gap-1 bg-background border border-border rounded-xs p-0.5">
                    {([['script', '스크립트 (권장)'], ['iframe', 'iframe']] as const).map(([m, label]) => (
                      <button
                        key={m}
                        onClick={() => setEmbedMethod(m)}
                        className={`flex-1 text-[11px] font-medium py-1.5 rounded-xs transition-all ${
                          embedMethod === m ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* 임베드 코드 */}
                  {embedMethod === 'script' ? (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <pre className="bg-background border border-border rounded-xs p-3 text-[10px] text-foreground font-mono overflow-x-auto whitespace-pre leading-relaxed">
                          {scriptCode}
                        </pre>
                        <button
                          onClick={copyScript}
                          className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-xs transition-all ${
                            scriptCopied ? 'bg-success text-white' : 'bg-surface border border-border text-foreground hover:bg-background'
                          }`}
                        >
                          {scriptCopied ? '복사됨!' : '복사'}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted/60 leading-relaxed">
                        스크립트 한 줄이 격리된 iframe을 삽입해요(호스트 사이트와 CSS/JS 충돌 없음). 크기는 <code className="text-muted">data-height</code>로 조절.
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <pre className="bg-background border border-border rounded-xs p-3 text-[10px] text-foreground font-mono overflow-x-auto whitespace-pre leading-relaxed">
                        {embedCode}
                      </pre>
                      <button
                        onClick={copyEmbed}
                        className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-xs transition-all ${
                          embedCopied ? 'bg-success text-white' : 'bg-surface border border-border text-foreground hover:bg-background'
                        }`}
                      >
                        {embedCopied ? '복사됨!' : '복사'}
                      </button>
                    </div>
                  )}

                  {/* Event Bridge 안내 */}
                  <div className="bg-background/50 border border-border rounded-xs p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Event Bridge</p>
                    <p className="text-[10px] text-muted leading-relaxed">
                      오브젝트에 <code className="text-primary">emit_event</code> 액션을 설정하면 부모 페이지로 이벤트를 전송해요.
                      스크립트 방식이면 아래 한 줄로 구독합니다.
                    </p>
                    <pre className="text-[9px] text-muted font-mono leading-relaxed">{`window.addEventListener('park3d:event', (e) => {
  console.log(e.detail); // objectId, value 등
});`}</pre>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={embedUrl}
                      target="_blank"
                      className="flex-1 text-center py-2 rounded-xs border border-border text-muted text-xs hover:bg-background transition-colors"
                    >
                      임베드 미리보기 ↗
                    </a>
                    <a
                      href={`/test/event-bridge?url=${encodeURIComponent(embedUrl)}`}
                      target="_blank"
                      className="flex-1 text-center py-2 rounded-xs border border-primary/40 text-primary text-xs hover:bg-primary/10 transition-colors"
                    >
                      Event Bridge 테스트 ↗
                    </a>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
