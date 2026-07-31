'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, ArrowLeft, History, Hexagon, Sun, Moon, Share2, Globe, SlidersHorizontal, LogOut } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useThemeStore } from '@/store/themeStore';
import { createBrowserSupabase } from '@/lib/supabase';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { ShareModal } from '@/app/dashboard/ShareModal';
import { CustomDomainModal } from '@/app/dashboard/CustomDomainModal';
import { SceneSwitcher } from './SceneSwitcher';
import { VersionHistoryModal } from './VersionHistoryModal';

// ☰ 메뉴 항목/소제목 공통 클래스
const MENU_ITEM = 'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-foreground hover:bg-background transition-colors text-left whitespace-nowrap';
const MENU_TITLE = 'px-3 pt-2 pb-0.5 text-[9px] font-semibold text-muted uppercase tracking-wider';

// 좌측 패널 — **브랜드 · 프로젝트명 · ☰ 메뉴뿐이다.**
//   2026-07-31: Objects/Assets 탭 · Scenes 목록 · 계층 트리 · 에셋 브라우저를 전부 걷어냈다.
//   브릭엔 오브젝트 트리도 에셋 업로드도 없다(격자에 놓는 파츠가 전부고, 도구는 우측 인스펙터에 있다).
//   씬 전환만 되살려 프로젝트명 아래 드롭다운(SceneSwitcher)으로 뒀다.
export function LeftPanel({ projectName }: { projectName: string }) {
  const { projectId, sceneId } = useSceneStore();
  const { theme, toggleTheme } = useThemeStore();
  const [showHistory, setShowHistory] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [shareData, setShareData] = useState<{ isPublished: boolean } | null>(null);
  const [domainData, setDomainData] = useState<{ currentDomain: string | null } | null>(null);

  // 이메일은 메뉴 처음 열 때 1회 로드
  const loadEmail = async () => {
    if (email !== null) return;
    const { data: { user } } = await createBrowserSupabase().auth.getUser();
    setEmail(user?.email ?? '');
  };
  const openShare = async () => {
    if (!sceneId) return;
    const { data } = await createBrowserSupabase().from('scenes').select('is_published').eq('id', sceneId).single();
    setShareData({ isPublished: !!data?.is_published });
  };
  const openDomain = async () => {
    if (!projectId) return;
    const { data } = await createBrowserSupabase().from('projects').select('custom_domain').eq('id', projectId).single();
    setDomainData({ currentDomain: data?.custom_domain ?? null });
  };


  return (
    <div className="flex flex-col overflow-hidden">
      {/* 타이틀 바 — Park3D 브랜드 + 프로젝트명 + ☰ 메뉴. 상단바에서 옮겨왔다(2026-07-22).
          ☰ 메뉴 = Back to file(대시보드) · Version history. */}
      <div className="px-3 pt-2.5 pb-2 shrink-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-xs bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-primary/30 shrink-0">
            <Hexagon size={12} />
          </div>
          <span className="text-xs font-bold text-foreground">Park3D</span>
          <div className="flex-1" />
          <DropdownMenu
            placement="right"
            panelClassName="min-w-[210px] py-1"
            trigger={({ open, toggle, ref }) => (
              <button
                ref={ref}
                onClick={() => { if (!open) loadEmail(); toggle(); }}
                title="메뉴"
                className="w-6 h-6 shrink-0 rounded-xs flex items-center justify-center text-foreground hover:bg-background transition-colors"
              >
                <Menu size={16} />
              </button>
            )}
          >
            {({ close }) => (
              <>
                {/* 계정 정보 — 제일 위 */}
                <div className="px-3 py-2 border-b border-border/60">
                  <p className="text-[10px] text-muted">Signed in as</p>
                  <p className="text-[11px] text-foreground truncate">{email ?? '…'}</p>
                </div>

                {/* 프로젝트 액션 */}
                <Link href="/dashboard" onClick={close} className={MENU_ITEM}>
                  <ArrowLeft size={13} className="text-foreground" /> Back to file
                </Link>
                <button onClick={() => { close(); setShowHistory(true); }} className={MENU_ITEM}>
                  <History size={13} className="text-foreground" /> Version history
                </button>

                {/* Settings */}
                <div className="border-t border-border/60 mt-1" />
                <div className={MENU_TITLE}>Settings</div>
                <button onClick={() => { toggleTheme(); close(); }} className={MENU_ITEM}>
                  {theme === 'dark' ? <Sun size={13} className="text-foreground" /> : <Moon size={13} className="text-foreground" />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <button onClick={() => { close(); openShare(); }} className={MENU_ITEM}>
                  <Share2 size={13} className="text-foreground" /> Share / Embed
                </button>
                <button onClick={() => { close(); openDomain(); }} className={MENU_ITEM}>
                  <Globe size={13} className="text-foreground" /> Custom domain
                </button>

                {/* Account */}
                <div className="border-t border-border/60 mt-1" />
                <div className={MENU_TITLE}>Account</div>
                <Link href="/account" onClick={close} className={MENU_ITEM}>
                  <SlidersHorizontal size={13} className="text-foreground" /> Account settings
                </Link>
                <form action="/api/auth/signout" method="POST">
                  <button type="submit" className={`${MENU_ITEM} text-danger hover:bg-danger/10`}>
                    <LogOut size={13} /> Sign out
                  </button>
                </form>
              </>
            )}
          </DropdownMenu>
        </div>
        <div className="truncate text-[12px] font-semibold text-foreground" title={projectName}>
          {projectName}
        </div>
        {/* 씬 전환 — 목록을 인라인으로 펼치면 패널이 도로 길어져서 드롭다운으로 */}
        <SceneSwitcher />
      </div>


      {showHistory && typeof document !== 'undefined' && createPortal(
        <VersionHistoryModal onClose={() => setShowHistory(false)} />,
        document.body,
      )}
      {shareData && sceneId && (
        <ShareModal projectName={projectName} sceneId={sceneId} isPublished={shareData.isPublished} onClose={() => setShareData(null)} />
      )}
      {domainData && projectId && (
        <CustomDomainModal projectId={projectId} projectName={projectName} currentDomain={domainData.currentDomain} onClose={() => setDomainData(null)} />
      )}
    </div>
  );
}
