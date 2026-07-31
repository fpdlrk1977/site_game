'use client';

// 우측 패널 — **브릭 도구 + 환경 설정.**
//   2026-07-31: 구 오브젝트 시스템(2d)을 걷어내며 오브젝트 섹션 19개를 통째로 삭제했다.
//   Transform·Material·Geometry·Physics·Motion·Actuator·Events·Light·Particle·Content·Prefab·
//   Subdivision·Visibility·Animation·MultiSelect — **선택할 오브젝트 자체가 없으므로 전부 죽은 UI였다.**
//
//   브릭은 "선택해서 속성을 고치는" 모델이 아니다. 파츠·색·재질을 **먼저 고르고 격자에 놓는다.**
//   그래서 인스펙터에 선택 분기가 없고, 도구가 항상 같은 자리에 있다.
//
// ⚠️ `EnvironmentPanel`은 아직 남아 있으나 **대부분 죽은 컨트롤**이다 —
//   하늘·안개·조명·바닥은 룩 정리(BrickEnvironment)에서 렌더 경로가 사라졌다. 다음 단계에서 정리한다.

import { GroupBox, SectionHeader } from './inspector/ui';
import { EnvironmentPanel } from './inspector/EnvironmentPanel';
import { BrickToolPanel } from '@/components/brick/BrickToolPanel';
import { Blocks } from 'lucide-react';

export function InspectorPanel() {
  return (
    <aside className="flex flex-col overflow-hidden h-full">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-foreground tracking-wide">Build</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <GroupBox>
          <SectionHeader
            title="Brick"
            icon={<Blocks size={14} />}
            hint="왼쪽 클릭으로 놓고, Ctrl을 누르면 도구가 잠깐 반대로 바뀝니다. 표면의 한 칸을 겨누면 그 옆 칸에 놓입니다. 막힌 자리는 빨갛게 표시되고 놓이지 않습니다."
          />
          <div className="px-3 pb-4">
            <BrickToolPanel />
          </div>
        </GroupBox>
        <EnvironmentPanel />
      </div>
    </aside>
  );
}
