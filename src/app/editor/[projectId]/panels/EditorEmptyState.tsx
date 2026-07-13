'use client';

// 빈 씬 코칭(STEP 4 시그니처 모먼트) — 오브젝트가 하나도 없을 때 뷰포트 중앙에
// 친근한 카드로 첫 도형 추가를 유도한다. 오브젝트가 생기면 스스로 사라진다.
// 캔버스 위에 뜨는 DOM 오버레이(패널 z-30 아래인 z-10, 중앙 배치라 패널과 겹치지 않음).

import { Box, Circle, Cylinder, Sparkles } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';

const QUICK = [
  { shape: 'box', label: '상자', Icon: Box },
  { shape: 'sphere', label: '구체', Icon: Circle },
  { shape: 'cylinder', label: '원기둥', Icon: Cylinder },
] as const;

export function EditorEmptyState() {
  // objects 길이만 구독 → 오브젝트가 생기면 리렌더되어 숨는다.
  const count = useSceneStore((s) => s.objects.length);
  const addObject = useSceneStore((s) => s.addObject);
  if (count > 0) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto w-[288px] rounded-lg border border-border bg-surface shadow-floating px-7 py-6 text-center select-none">
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
          <Sparkles size={22} />
        </div>
        <h2 className="text-sm font-semibold text-foreground mb-1">빈 씬이에요</h2>
        <p className="text-[12px] text-muted leading-relaxed mb-4">
          첫 오브젝트를 놓아 3D 공간을 시작해 보세요.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK.map(({ shape, label, Icon }) => (
            <button
              key={shape}
              onClick={() => addObject(shape)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-md border border-border text-muted hover:text-primary hover:border-primary/60 hover:bg-primary/5 transition-all"
            >
              <Icon size={18} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted/60 mt-4 leading-relaxed">
          또는 하단 툴바에서 도형·펜·복셀을 고르거나{' '}
          <kbd className="px-1 py-0.5 rounded bg-background border border-border text-[9px] font-mono">Ctrl</kbd>
          +
          <kbd className="px-1 py-0.5 rounded bg-background border border-border text-[9px] font-mono">K</kbd>
          {' '}명령 팔레트
        </p>
      </div>
    </div>
  );
}
