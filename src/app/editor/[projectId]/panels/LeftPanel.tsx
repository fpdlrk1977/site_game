'use client';

import Link from 'next/link';
import { Menu, ArrowLeft } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { HierarchyPanel } from './HierarchyPanel';
import { AssetBrowser } from './AssetBrowser';
import { LogicPanel } from './LogicPanel';
import { ScenesSection } from './ScenesSection';
import type { GnbTab } from './EditorGnb';

// 좌측 패널 — 프로젝트 타이틀 · Objects/Assets 탭 · Scenes 목록 · 콘텐츠(트리/에셋).
//   2026-07-21 재구성: 상단 바에 흩어져 있던 프로젝트명·씬 전환(SceneSwitcher 드롭다운)을 여기로 **옮겼다**.
//   GNB 레일(Objects/Assets/Logic)은 당분간 유지 — 레일 자체를 걷어낼 예정이라 그때까지 진입점이 둘이다.
export function LeftPanel({
  tab,
  projectName,
  onTabChange,
}: {
  tab: GnbTab;
  projectName: string;
  onTabChange: (tab: GnbTab) => void;
}) {
  const { objects } = useSceneStore();

  // Logic 탭은 자체 헤더/스크롤을 가진 전용 패널(레일에서만 진입)
  if (tab === 'logic') return <LogicPanel />;

  const TABS: { id: GnbTab; label: string }[] = [
    { id: 'objects', label: 'Objects' },
    { id: 'assets', label: 'Assets' },
  ];

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* 타이틀 바 — 프로젝트명 + ☰ 메뉴. 대시보드로 나가는 길은 이 메뉴의 'Back to file'뿐이다
          (상단 바의 ← 화살표는 제거했다). 메뉴 항목은 앞으로 늘어날 자리. */}
      <div className="flex items-center gap-1.5 px-3 h-10 shrink-0">
        <span className="flex-1 min-w-0 truncate text-[12px] font-semibold text-foreground" title={projectName}>
          {projectName}
        </span>
        <DropdownMenu
          placement="right"
          panelClassName="w-max py-1"
          trigger={({ toggle, ref }) => (
            <button
              ref={ref}
              onClick={toggle}
              title="메뉴"
              className="w-6 h-6 shrink-0 rounded-xs flex items-center justify-center text-foreground hover:bg-background transition-colors"
            >
              <Menu size={20} />
            </button>
          )}
        >
          {({ close }) => (
            <Link
              href="/dashboard"
              onClick={close}
              className="w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-background transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <ArrowLeft size={13} className="text-foreground" /> Back to file
            </Link>
          )}
        </DropdownMenu>
      </div>

      {/* 탭 — Objects / Assets (활성 = 연회색 pill) */}
      <div className="flex items-center gap-1 px-2 pb-1.5 shrink-0 border-b border-border">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex-1 px-3 py-1.5 rounded-xs text-[12px] font-medium transition-colors ${
              tab === id ? 'bg-foreground/[0.06] text-foreground' : 'text-muted hover:text-foreground'
            }`}
          >
            {label}
            {id === 'objects' && tab === id && (
              <span className="ml-1 text-[9px] text-muted/60 font-normal">{objects.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Scenes는 Objects 탭에서만 — 에셋 라이브러리는 프로젝트 단위라 씬 목록과 관계없다. */}
      {tab === 'objects' && <ScenesSection />}

      {tab === 'objects' ? <HierarchyPanel noWrapper /> : <AssetBrowser />}
    </div>
  );
}
