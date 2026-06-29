'use client';

import { useState, useTransition } from 'react';
import { setCustomDomain } from './actions';
import { usePlan } from '@/hooks/usePlan';

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'park3d.io';

interface Props {
  projectId: string;
  projectName: string;
  currentDomain: string | null;
  onClose: () => void;
}

export function CustomDomainModal({ projectId, projectName, currentDomain, onClose }: Props) {
  const [domain, setDomain] = useState(currentDomain ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { can } = usePlan();
  const canCustomDomain = can('customDomain');

  const validateDomain = (v: string) => {
    if (!v) return null;
    if (v.startsWith('http') || v.startsWith('//')) return 'http:// 없이 도메인만 입력하세요 (예: mysite.com)';
    if (!v.includes('.')) return '유효한 도메인을 입력하세요 (예: mysite.com)';
    if (/\s/.test(v)) return '공백을 포함할 수 없습니다';
    return null;
  };

  const handleSave = () => {
    const trimmed = domain.trim().toLowerCase();
    const validationError = validateDomain(trimmed);
    if (validationError) { setError(validationError); return; }

    setError(null);
    startTransition(async () => {
      try {
        await setCustomDomain(projectId, trimmed || null);
        setSuccess(true);
        setTimeout(onClose, 1200);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '저장 실패';
        if (msg.includes('PLAN_FEATURE')) {
          setError('커스텀 도메인은 Pro 플랜 전용 기능입니다.');
        } else if (msg.includes('unique') || msg.includes('duplicate')) {
          setError('이미 다른 프로젝트에서 사용 중인 도메인입니다.');
        } else {
          setError(msg);
        }
      }
    });
  };

  const handleClear = () => {
    startTransition(async () => {
      await setCustomDomain(projectId, null);
      setSuccess(true);
      setTimeout(onClose, 1000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-base">
            🌐
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white">커스텀 도메인</h2>
            <p className="text-[11px] text-zinc-500 truncate">{projectName}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {!canCustomDomain ? (
            /* Pro 플랜 업그레이드 배너 */
            <div className="bg-gradient-to-br from-violet-600/20 to-cyan-600/20 border border-violet-500/30 rounded-xl p-4 text-center space-y-3">
              <div className="text-2xl">✨</div>
              <div>
                <p className="text-white font-semibold text-sm">Pro 플랜 전용</p>
                <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
                  커스텀 도메인 연결은 Pro 플랜부터 사용할 수 있습니다.
                  나만의 도메인으로 3D 공간을 제공하세요.
                </p>
              </div>
              <button className="w-full py-2 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all">
                Pro로 업그레이드
              </button>
            </div>
          ) : success ? (
            <div className="py-6 text-center">
              <div className="text-3xl mb-3">✅</div>
              <p className="text-white font-semibold">저장됐어요</p>
            </div>
          ) : (
            <>
              {/* 도메인 입력 */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  도메인
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => { setDomain(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="mysite.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                />
                {error && (
                  <p className="text-red-400 text-[11px] mt-1.5">{error}</p>
                )}
              </div>

              {/* DNS 안내 */}
              <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-3.5 space-y-2">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">DNS 설정 방법</p>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  도메인 DNS 설정에서 CNAME 레코드를 추가하세요.
                </p>
                <div className="bg-zinc-900 rounded-lg px-3 py-2 font-mono text-[11px] space-y-1">
                  <div className="grid grid-cols-[60px_1fr] gap-2 text-zinc-500">
                    <span>Type</span><span className="text-zinc-300">CNAME</span>
                    <span>Name</span><span className="text-zinc-300">@  <span className="text-zinc-600">(또는 www)</span></span>
                    <span>Value</span><span className="text-violet-300">{PLATFORM_DOMAIN}</span>
                  </div>
                </div>
                <p className="text-zinc-600 text-[10px]">
                  DNS 전파는 최대 48시간 소요될 수 있습니다.
                </p>
              </div>

              {/* 현재 도메인 */}
              {currentDomain && (
                <div className="flex items-center justify-between text-[11px] bg-zinc-800/40 rounded-lg px-3 py-2">
                  <span className="text-zinc-400">현재: <span className="text-white font-mono">{currentDomain}</span></span>
                  <button
                    onClick={handleClear}
                    disabled={isPending}
                    className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    제거
                  </button>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending || !domain.trim()}
                  className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                >
                  {isPending ? '저장 중…' : '저장'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
