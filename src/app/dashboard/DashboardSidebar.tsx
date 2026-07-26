'use client';

import Link from 'next/link';
import { LayoutGrid, BarChart3, Compass, CreditCard, Settings, LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { usePricingModal } from '@/store/pricingModalStore';
import type { PlanTier } from '@/store/userStore';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

export type SidebarKey = 'projects' | 'analytics' | 'explore';

export function DashboardSidebar({ planTier, active = 'projects' }: { planTier: PlanTier; active?: SidebarKey }) {
  const showPricing = usePricingModal((s) => s.show);
  const item = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xs text-sm transition-colors ${
      active ? 'text-primary font-semibold' : 'text-foreground/70 hover:text-foreground hover:bg-foreground/[0.04]'
    }`;
  const activeStyle = { background: 'rgba(124,108,255,.14)' };

  return (
    <aside className="w-[240px] shrink-0 h-full overflow-y-auto bg-sidebar border-r border-border flex-col p-3 hidden md:flex">
      <nav className="flex flex-col gap-0.5">
        <Link href="/dashboard" className={item(active === 'projects')} style={active === 'projects' ? activeStyle : undefined}><LayoutGrid size={17} /> Projects</Link>
        <Link href="/dashboard/analytics" className={item(active === 'analytics')} style={active === 'analytics' ? activeStyle : undefined}><BarChart3 size={17} /> Analytics</Link>
        <Link href="/community" className={item(active === 'explore')} style={active === 'explore' ? activeStyle : undefined}><Compass size={17} /> Explore</Link>
        <button onClick={showPricing} className={`${item(false)} w-full text-left`}><CreditCard size={17} /> Pricing</button>

        <div className="text-[.66rem] uppercase tracking-[.1em] text-muted/60 font-bold px-3 pt-4 pb-1.5">Account</div>
        <Link href="/account" className={item(false)}><Settings size={17} /> Settings</Link>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className={`${item(false)} w-full text-left`}><LogOut size={17} /> Sign out</button>
        </form>
      </nav>

      <div className="mt-auto">
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="text-xs text-muted">Theme</span>
          <ThemeToggle />
        </div>
        {planTier === 'free' && (
          <div className="rounded-xs p-4 border border-border" style={{ background: 'linear-gradient(160deg,rgba(106,77,255,.14),rgba(57,208,234,.08))' }}>
            <p className="text-sm font-semibold mb-1">Upgrade to Pro</p>
            <p className="text-xs text-muted leading-relaxed">Custom domains · unlimited scenes · analytics</p>
            <button onClick={showPricing} className="block w-full text-center mt-3 text-white text-[.82rem] font-semibold py-2 rounded-xs" style={{ background: GRAD }}>Upgrade →</button>
          </div>
        )}
      </div>
    </aside>
  );
}
