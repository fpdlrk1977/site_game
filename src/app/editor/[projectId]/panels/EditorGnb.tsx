'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Layers, Package, Settings, UserRound, Share2, Globe, LogOut, SlidersHorizontal } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useDropdown } from '@/hooks/useDropdown';
import { useSceneStore } from '@/store/sceneStore';
import { useThemeStore } from '@/store/themeStore';
import { createBrowserSupabase } from '@/lib/supabase';
import { ShareModal } from '@/app/dashboard/ShareModal';
import { CustomDomainModal } from '@/app/dashboard/CustomDomainModal';

export type GnbTab = 'objects' | 'assets';

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
  const { open, toggle, close, triggerRef, panelRef, panelStyle } = useDropdown({ placement: 'right' });
  const { theme, toggleTheme } = useThemeStore();
  const { projectId, sceneId } = useSceneStore();
  const [shareData, setShareData] = useState<{ isPublished: boolean } | null>(null);
  const [domainData, setDomainData] = useState<{ currentDomain: string | null } | null>(null);

  const openShare = async () => {
    close();
    if (!sceneId) return;
    const { data } = await createBrowserSupabase()
      .from('scenes').select('is_published').eq('id', sceneId).single();
    setShareData({ isPublished: !!data?.is_published });
  };

  const openDomain = async () => {
    close();
    if (!projectId) return;
    const { data } = await createBrowserSupabase()
      .from('projects').select('custom_domain').eq('id', projectId).single();
    setDomainData({ currentDomain: data?.custom_domain ?? null });
  };

  return (
    <>
      <RailButton
        buttonRef={triggerRef}
        icon={<Settings size={16} />}
        label="설정"
        active={open}
        onClick={toggle}
      />
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="w-48 bg-surface border border-border rounded-xs shadow-dropdown py-1 overflow-hidden"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">설정</div>
          <button onClick={() => { toggleTheme(); close(); }} className={MENU_ITEM_CLASS}>
            <span className="w-4 text-center">{theme === 'dark' ? '☀' : '🌙'}</span>
            {theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          </button>
          <div className="border-t border-border my-1" />
          <button onClick={openShare} className={MENU_ITEM_CLASS}>
            <Share2 size={13} className="text-muted" /> 공유 / 임베드
          </button>
          <button onClick={openDomain} className={MENU_ITEM_CLASS}>
            <Globe size={13} className="text-muted" /> 커스텀 도메인
          </button>
        </div>,
        document.body,
      )}

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
  const { open, openMenu, close, triggerRef, panelRef, panelStyle } = useDropdown({ placement: 'right' });
  const [email, setEmail] = useState<string | null>(null);

  const handleToggle = async () => {
    if (open) { close(); return; }
    openMenu();
    if (email === null) {
      const { data: { user } } = await createBrowserSupabase().auth.getUser();
      setEmail(user?.email ?? '');
    }
  };

  return (
    <>
      <RailButton
        buttonRef={triggerRef}
        icon={<UserRound size={16} />}
        label="계정"
        active={open}
        onClick={handleToggle}
      />
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="w-52 bg-surface border border-border rounded-xs shadow-dropdown py-1 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-border/60">
            <p className="text-[10px] text-muted">로그인 계정</p>
            <p className="text-xs text-foreground truncate">{email ?? '...'}</p>
          </div>
          <Link href="/account" className={MENU_ITEM_CLASS} onClick={close}>
            <SlidersHorizontal size={13} className="text-muted" /> 계정 설정
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className={`${MENU_ITEM_CLASS} text-danger hover:bg-danger/10`}>
              <LogOut size={13} /> 로그아웃
            </button>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── GNB 레일 ────────────────────────────────────────────────────
export function EditorGnb({ tab, panelOpen, onTabClick, projectName }: Props) {
  return (
    <div className="flex flex-col w-12 h-full bg-surface border-r border-border py-2 gap-1 shrink-0 select-none">
      <RailButton
        icon={<Layers size={16} />}
        label="Object"
        active={panelOpen && tab === 'objects'}
        onClick={() => onTabClick('objects')}
      />
      <RailButton
        icon={<Package size={16} />}
        label="Assets"
        active={panelOpen && tab === 'assets'}
        onClick={() => onTabClick('assets')}
      />
      <div className="flex-1" />
      <SettingsMenu projectName={projectName} />
      <AccountMenu />
    </div>
  );
}
