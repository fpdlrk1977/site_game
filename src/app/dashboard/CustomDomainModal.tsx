'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { X, Sparkles, CircleCheck, Globe } from 'lucide-react';
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
      <div className="relative bg-surface border border-border rounded-sm w-full max-w-md shadow-modal overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-xs bg-primary/20 flex items-center justify-center text-primary">
            <Globe size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground">커스텀 도메인</h2>
            <p className="text-[11px] text-muted truncate">{projectName}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors"><X size={18} /></button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {!canCustomDomain ? (
            /* Pro 플랜 업그레이드 배너 */
            <div className="bg-gradient-to-br from-violet-600/20 to-cyan-600/20 border border-violet-500/30 rounded-xs p-4 text-center space-y-3">
              <Sparkles size={24} className="mx-auto text-violet-400" />
              <div>
                <p className="text-foreground font-semibold text-sm">Pro 플랜 전용</p>
                <p className="text-muted text-xs mt-1 leading-relaxed">
                  커스텀 도메인 연결은 Pro 플랜부터 사용할 수 있습니다.
                  나만의 도메인으로 3D 공간을 제공하세요.
                </p>
              </div>
              <Link
                href="/pricing"
                className="block w-full py-2 rounded-xs bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all"
              >
                Pro로 업그레이드
              </Link>
            </div>
          ) : success ? (
            <div className="py-6 text-center">
              <CircleCheck size={30} className="mx-auto mb-3 text-emerald-500" />
              <p className="text-foreground font-semibold">저장됐어요</p>
            </div>
          ) : (
            <>
              {/* 도메인 입력 */}
              <div>
                <label className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-1.5">
                  도메인
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => { setDomain(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="mysite.com"
                  className="w-full bg-background border border-border rounded-xs px-3 py-2 text-sm text-foreground placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                {error && (
                  <p className="text-danger text-[11px] mt-1.5">{error}</p>
                )}
              </div>

              {/* DNS 안내 */}
              <div className="bg-background/60 border border-border rounded-xs p-3.5 space-y-2">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">DNS 설정 방법</p>
                <p className="text-muted text-[11px] leading-relaxed">
                  도메인 DNS 설정에서 CNAME 레코드를 추가하세요.
                </p>
                <div className="bg-sidebar rounded-xs px-3 py-2 font-mono text-[11px] space-y-1">
                  <div className="grid grid-cols-[60px_1fr] gap-2 text-muted">
                    <span>Type</span><span className="text-foreground">CNAME</span>
                    <span>Name</span><span className="text-foreground">@  <span className="text-muted/60">(또는 www)</span></span>
                    <span>Value</span><span className="text-primary">{PLATFORM_DOMAIN}</span>
                  </div>
                </div>
                <p className="text-muted/60 text-[10px]">
                  DNS 전파는 최대 48시간 소요될 수 있습니다.
                </p>
              </div>

              {/* 현재 도메인 */}
              {currentDomain && (
                <div className="flex items-center justify-between text-[11px] bg-background/40 rounded-xs px-3 py-2">
                  <span className="text-muted">현재: <span className="text-foreground font-mono">{currentDomain}</span></span>
                  <button
                    onClick={handleClear}
                    disabled={isPending}
                    className="text-danger hover:text-danger/80 transition-colors disabled:opacity-50"
                  >
                    제거
                  </button>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-xs bg-background hover:bg-surface text-foreground text-sm transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending || !domain.trim()}
                  className="flex-1 py-2 rounded-xs bg-primary hover:bg-primary/80 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
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
