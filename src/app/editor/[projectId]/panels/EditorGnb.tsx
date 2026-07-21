'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Layers, Package, Cpu, Settings, UserRound, Share2, Globe, LogOut, SlidersHorizontal, Sun, Moon } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { useSceneStore } from '@/store/sceneStore';
import { useThemeStore } from '@/store/themeStore';
import { createBrowserSupabase } from '@/lib/supabase';
import { ShareModal } from '@/app/dashboard/ShareModal';
import { CustomDomainModal } from '@/app/dashboard/CustomDomainModal';

export type GnbTab = 'objects' | 'assets' | 'logic';

interface Props {
  tab: GnbTab;
  panelOpen: boolean;
  onTabClick: (tab: GnbTab) => void;
  projectName: string;
}

// ── 레일 버튼 ───────────────────────────────────────────────────
function RailButton({
  icon,
  label,
  active,
  onClick,
  buttonRef,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <Tooltip content={label}>
      <button
        ref={buttonRef}
        onClick={onClick}
        className={`w-10 h-10 mx-auto rounded-xs flex flex-col items-center justify-center gap-0.5 transition-all ${
          active
            ? 'bg-primary/15 text-primary'
            : 'text-muted hover:text-foreground hover:bg-surface'
        }`}
      >
        {icon}
        <span className="text-[8px] font-medium leading-none">{label}</span>
      </button>
    </Tooltip>
  );
}

// ── 드롭다운 메뉴 항목 ──────────────────────────────────────────
const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-background transition-colors text-left';

// ── 설정 메뉴 ───────────────────────────────────────────────────
function SettingsMenu({ projectName }: { projectName: string }) {
  const { theme, toggleTheme } = useThemeStore();
  const { projectId, sceneId } = useSceneStore();
  const [shareData, setShareData] = useState<{ isPublished: boolean } | null>(null);
  const [domainData, setDomainData] = useState<{ currentDomain: string | null } | null>(null);

  const openShare = async () => {
    if (!sceneId) return;
    const { data } = await createBrowserSupabase()
      .from('scenes').select('is_published').eq('id', sceneId).single();
    setShareData({ isPublished: !!data?.is_published });
  };

  const openDomain = async () => {
    if (!projectId) return;
    const { data } = await createBrowserSupabase()
      .from('projects').select('custom_domain').eq('id', projectId).single();
    setDomainData({ currentDomain: data?.custom_domain ?? null });
  };

  return (
    <>
      <DropdownMenu
        placement="right"
        panelClassName="w-48 py-1"
        trigger={({ open, toggle, ref }) => (
          <RailButton buttonRef={ref} icon={<Settings size={14} />} label="Settings" active={open} onClick={toggle} />
        )}
      >
        {({ close }) => (
          <>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Settings</div>
            <button onClick={() => { toggleTheme(); close(); }} className={MENU_ITEM_CLASS}>
              <span className="w-4 flex items-center justify-center text-muted">{theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}</span>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <div className="border-t border-border my-1" />
            <button onClick={() => { close(); openShare(); }} className={MENU_ITEM_CLASS}>
              <Share2 size={13} className="text-muted" /> Share / Embed
            </button>
            <button onClick={() => { close(); openDomain(); }} className={MENU_ITEM_CLASS}>
              <Globe size={13} className="text-muted" /> Custom domain
            </button>
          </>
        )}
      </DropdownMenu>

      {shareData && sceneId && (
        <ShareModal
          projectName={projectName}
          sceneId={sceneId}
          isPublished={shareData.isPublished}
          onClose={() => setShareData(null)}
        />
      )}
      {domainData && projectId && (
        <CustomDomainModal
          projectId={projectId}
          projectName={projectName}
          currentDomain={domainData.currentDomain}
          onClose={() => setDomainData(null)}
        />
      )}
    </>
  );
}

// ── 회원정보 메뉴 ───────────────────────────────────────────────
function AccountMenu() {
  const [email, setEmail] = useState<string | null>(null);

  // 이메일은 처음 열 때 한 번 로드(이전과 동일). 트리거 열림 시점에 호출.
  const loadEmail = async () => {
    if (email !== null) return;
    const { data: { user } } = await createBrowserSupabase().auth.getUser();
    setEmail(user?.email ?? '');
  };

  return (
    <DropdownMenu
      placement="right"
      panelClassName="w-52 py-1"
      trigger={({ open, toggle, ref }) => (
        <RailButton
          buttonRef={ref}
          icon={<UserRound size={14} />}
          label="Account"
          active={open}
          onClick={() => { if (!open) loadEmail(); toggle(); }}
        />
      )}
    >
      {({ close }) => (
        <>
          <div className="px-3 py-2 border-b border-border/60">
            <p className="text-[10px] text-muted">Signed in as</p>
            <p className="text-xs text-foreground truncate">{email ?? '...'}</p>
          </div>
          <Link href="/account" className={MENU_ITEM_CLASS} onClick={close}>
            <SlidersHorizontal size={13} className="text-muted" /> Account settings
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className={`${MENU_ITEM_CLASS} text-danger hover:bg-danger/10`}>
              <LogOut size={13} /> Sign out
            </button>
          </form>
        </>
      )}
    </DropdownMenu>
  );
}

// ── GNB 레일 ────────────────────────────────────────────────────
export function EditorGnb({ tab, panelOpen, onTabClick, projectName }: Props) {
  return (
    <div className="flex flex-col w-full h-full py-2 gap-1 shrink-0 select-none">
      <RailButton
        icon={<Layers size={14} />}
        label="Object"
        active={panelOpen && tab === 'objects'}
        onClick={() => onTabClick('objects')}
      />
      <RailButton
        icon={<Package size={14} />}
        label="Assets"
        active={panelOpen && tab === 'assets'}
        onClick={() => onTabClick('assets')}
      />
      <RailButton
        icon={<Cpu size={14} />}
        label="Logic"
        active={panelOpen && tab === 'logic'}
        onClick={() => onTabClick('logic')}
      />
      <div className="w-full h-px bg-border shrink-0 my-1"></div>
      {/* <div className="flex-1" /> */}
      <SettingsMenu projectName={projectName} />
      <AccountMenu />
    </div>
  );
}
