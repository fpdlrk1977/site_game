'use client';

import { useEffect, useState } from 'react';
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
  const { can } = usePlan();
  const canEmbed = can('embedMode');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const spaceUrl = `${origin}/space/${sceneId}`;
  const embedUrl = `${origin}/embed/${sceneId}`;
  const embedCode = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="500"\n  style="border:none;border-radius:12px;"\n  allow="autoplay"\n  title="${projectName}"\n></iframe>`;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">{projectName}</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">3D 공간 공유하기</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-zinc-800">
          {(['share', 'embed'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                tab === t
                  ? 'text-white border-b-2 border-violet-500 -mb-px'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'share' ? '🔗 공유' : '🖼 임베드'}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* 비공개 경고 */}
          {!isPublished && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
              <span>⚠</span>
              현재 비공개입니다. 공개 전환 후 공유하세요.
            </div>
          )}

          {tab === 'share' && (
            <div className="space-y-3">
              {/* QR */}
              <div className="flex justify-center">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code" width={140} height={140} className="rounded-xl" />
                ) : (
                  <div className="w-36 h-36 rounded-xl bg-zinc-800 animate-pulse" />
                )}
              </div>

              {/* URL 복사 */}
              <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2">
                <span className="text-xs text-zinc-400 truncate flex-1 font-mono">{spaceUrl}</span>
                <button
                  onClick={copyUrl}
                  className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all ${
                    copied ? 'bg-emerald-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  }`}
                >
                  {copied ? '복사됨!' : '복사'}
                </button>
              </div>

              <a
                href={spaceUrl}
                target="_blank"
                className="block w-full text-center py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all"
              >
                새 탭으로 열기 ↗
              </a>
            </div>
          )}

          {tab === 'embed' && (
            <div className="space-y-4">
              {!canEmbed ? (
                /* Pro 플랜 배너 */
                <div className="bg-gradient-to-br from-violet-600/20 to-cyan-600/20 border border-violet-500/30 rounded-xl p-4 text-center space-y-3">
                  <div className="text-2xl">✨</div>
                  <div>
                    <p className="text-white font-semibold text-sm">Pro 플랜 전용</p>
                    <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
                      임베드 기능은 Pro 플랜부터 사용할 수 있습니다.<br />
                      나의 3D 공간을 어디든 삽입하세요.
                    </p>
                  </div>
                  <button className="w-full py-2 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all">
                    Pro로 업그레이드
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-zinc-400 text-xs leading-relaxed">
                    아래 코드를 HTML에 붙여넣으면 어느 웹사이트에서나 3D 공간을 임베드할 수 있어요.
                  </p>

                  {/* 임베드 코드 */}
                  <div className="relative">
                    <pre className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-[10px] text-zinc-300 font-mono overflow-x-auto whitespace-pre leading-relaxed">
                      {embedCode}
                    </pre>
                    <button
                      onClick={copyEmbed}
                      className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-md transition-all ${
                        embedCopied ? 'bg-emerald-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                    >
                      {embedCopied ? '복사됨!' : '복사'}
                    </button>
                  </div>

                  {/* Event Bridge 안내 */}
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Event Bridge</p>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      오브젝트에 <code className="text-violet-400">emit_event</code> 액션을 설정하면 부모 페이지로 메시지를 전송해요.
                    </p>
                    <pre className="text-[9px] text-zinc-400 font-mono leading-relaxed">{`window.addEventListener('message', (e) => {
  if (e.data?.type === 'park3d:event') {
    console.log(e.data); // objectId, value 등
  }
});`}</pre>
                  </div>

                  <a
                    href={embedUrl}
                    target="_blank"
                    className="block w-full text-center py-2 rounded-xl border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors"
                  >
                    임베드 미리보기 ↗
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
