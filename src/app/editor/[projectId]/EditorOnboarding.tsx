'use client';

import { useState, useEffect } from 'react';
import { Hand, Package, Gamepad2, Palette, Rocket, X, PartyPopper } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const STORAGE_KEY = 'park3d_editor_onboarded_v1';

const STEPS: {
  icon: LucideIcon; title: string; desc: string; tip?: string | null;
  table?: { key: string; label: string }[];
}[] = [
  {
    icon: Hand,
    title: 'Park3D 에디터에 오신 걸 환영해요!',
    desc: '코딩 없이 3D 공간을 만들고 배포할 수 있어요. 몇 가지 기본 사용법을 안내할게요.',
    tip: null,
  },
  {
    icon: Package,
    title: '오브젝트 추가',
    desc: '상단 툴바 오른쪽 + 버튼으로 박스·구체·원기둥을 추가하거나, 왼쪽 GNB의 Assets 메뉴에서 GLB 파일을 불러올 수 있어요.',
    tip: '왼쪽 GNB의 Assets를 확인하세요',
  },
  {
    icon: Gamepad2,
    title: '이동 · 회전 · 크기',
    desc: '오브젝트를 선택한 뒤 단축키를 활용하세요.',
    table: [
      { key: 'W', label: '이동 (Translate)' },
      { key: 'E', label: '회전 (Rotate)' },
      { key: 'R', label: '크기 (Scale)' },
      { key: 'F', label: '선택 오브젝트로 포커스' },
      { key: 'Del', label: '선택 오브젝트 삭제' },
    ],
    tip: null,
  },
  {
    icon: Palette,
    title: 'Inspector로 속성 편집',
    desc: '오른쪽 Inspector 패널에서 위치·재질·물리·이벤트를 설정하세요. 오브젝트를 선택하지 않으면 환경(sky·fog·조명)을 편집할 수 있어요.',
    tip: '우측 Inspector를 확인하세요',
  },
  {
    icon: Rocket,
    title: '저장 & 미리보기',
    desc: 'Ctrl+S 로 저장하면 썸네일이 자동 업데이트돼요. 상단 "미리보기" 버튼으로 실제 뷰어를 바로 확인할 수 있어요.',
    tip: '저장 버튼을 눌러보세요',
  },
];

export function EditorOnboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 pointer-events-auto">
      <div className="bg-surface border border-border rounded-sm shadow-floating overflow-hidden">
        {/* 진행 바 */}
        <div className="h-0.5 bg-border">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* 헤더 */}
          <div className="flex items-start gap-3">
            <span className="text-primary mt-0.5 shrink-0">{(() => { const I = current.icon; return <I size={24} />; })()}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug">{current.title}</p>
              {'tip' in current && current.tip && (
                <p className="text-[10px] text-primary mt-0.5 font-medium">{current.tip}</p>
              )}
            </div>
            <button
              onClick={dismiss}
              className="text-muted/60 hover:text-muted transition-colors shrink-0 mt-0.5"
              title="닫기"
            >
              <X size={16} />
            </button>
          </div>

          {/* 설명 */}
          <p className="text-muted text-xs leading-relaxed">{current.desc}</p>

          {/* 단축키 테이블 */}
          {'table' in current && current.table && (
            <div className="bg-background/60 rounded-xs px-3 py-2 space-y-1.5">
              {current.table.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2.5">
                  <kbd className="bg-background border border-border text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded min-w-[28px] text-center">
                    {key}
                  </kbd>
                  <span className="text-muted text-[11px]">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* 스텝 닷 + 버튼 */}
          <div className="flex items-center justify-between pt-1">
            {/* 닷 인디케이터 */}
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`rounded-full transition-all ${
                    i === step
                      ? 'w-4 h-1.5 bg-primary'
                      : 'w-1.5 h-1.5 bg-border hover:bg-muted/40'
                  }`}
                />
              ))}
            </div>

            {/* 네비게이션 버튼 */}
            <div className="flex items-center gap-1.5">
              {!isFirst && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="px-3 py-1.5 rounded-xs bg-background hover:bg-surface text-foreground text-xs transition-colors"
                >
                  이전
                </button>
              )}
              {isLast ? (
                <button
                  onClick={dismiss}
                  className="px-3 py-1.5 rounded-xs bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white text-xs font-semibold transition-all inline-flex items-center gap-1.5"
                >
                  시작하기 <PartyPopper size={13} />
                </button>
              ) : (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="px-3 py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-xs font-semibold transition-colors"
                >
                  다음
                </button>
              )}
            </div>
          </div>

          {/* 건너뛰기 */}
          {!isLast && (
            <button
              onClick={dismiss}
              className="w-full text-center text-[10px] text-muted/60 hover:text-muted transition-colors"
            >
              건너뛰기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
