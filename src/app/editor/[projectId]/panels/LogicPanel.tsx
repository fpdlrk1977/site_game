'use client';

// 게임 컨트롤러(Game Logic) 전용 탭 — 게임 변수 + 전역 규칙 + HUD를 한 곳에.
// GNB 'logic' 탭에서 좌패널로 렌더. 각 섹션은 EnvironmentPanel과 공유하는 자체 완결 컴포넌트.

import { GameVariablesSection } from './inspector/GameVariablesSection';
import { HudSection } from './inspector/HudSection';
import { SceneLogicSection } from './inspector/SceneLogicSection';

export function LogicPanel() {
  return (
    <div className="flex flex-col overflow-hidden h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 pb-1 shrink-0">
        <span className="text-[11px] font-semibold text-foreground">Game Logic</span>
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-3 space-y-1">
        <GameVariablesSection />
        <SceneLogicSection />
        <HudSection />
      </div>
    </div>
  );
}
