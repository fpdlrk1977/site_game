'use client';

import { useSceneStore } from '@/store/sceneStore';
import { HierarchyPanel } from './HierarchyPanel';
import { AssetBrowser } from './AssetBrowser';
import type { GnbTab } from './EditorGnb';

// 콘텐츠(Objects 트리 / Assets 브라우저)는 GNB 레일에서 선택된 탭이 결정한다.
export function LeftPanel({ tab }: { tab: GnbTab }) {
  const { objects } = useSceneStore();

  return (
    <div className="flex flex-col bg-surface border-r border-border overflow-hidden h-full">
      {/* 타이틀 바 */}
      <div className="flex items-center gap-1.5 px-3 py-2 pb-0 shrink-0">
        <span className="text-[11px] font-semibold text-foreground">
          {tab === 'objects' ? 'Objects' : 'Assets'}
        </span>
        {tab === 'objects' && (
          <span className="text-[9px] text-muted/60 font-normal">{objects.length}</span>
        )}
      </div>

      {tab === 'objects' ? <HierarchyPanel noWrapper /> : <AssetBrowser />}
    </div>
  );
}
