'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  projectName: string;
  sceneId: string;
  isPublished: boolean;
  onClose: () => void;
}

export function ShareModal({ projectName, sceneId, isPublished, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const spaceUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/space/${sceneId}`
    : `/space/${sceneId}`;

  useEffect(() => {
    QRCode.toDataURL(spaceUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#ffffff', light: '#18181b' },
    }).then(setQrDataUrl);
  }, [spaceUrl]);

  const copy = async () => {
    await navigator.clipboard.writeText(spaceUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white">{projectName}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">3D 공간 공유하기</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        {/* 비공개 경고 */}
        {!isPublished && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
            <span>⚠</span>
            현재 비공개 상태입니다. 대시보드에서 공개로 전환해야 다른 사람이 볼 수 있습니다.
          </div>
        )}

        {/* QR 코드 */}
        <div className="flex justify-center mb-4">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR code"
              width={160}
              height={160}
              className="rounded-xl"
            />
          ) : (
            <div className="w-40 h-40 rounded-xl bg-zinc-800 animate-pulse" />
          )}
        </div>

        {/* URL 복사 */}
        <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2 mb-3">
          <span className="text-xs text-zinc-400 truncate flex-1 font-mono">{spaceUrl}</span>
          <button
            onClick={copy}
            className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            {copied ? '복사됨!' : '복사'}
          </button>
        </div>

        {/* 새 탭으로 열기 */}
        <a
          href={spaceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all"
        >
          새 탭으로 열기 ↗
        </a>
      </div>
    </div>
  );
}
