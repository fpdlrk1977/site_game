'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/store/themeStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'dark') el.classList.add('dark');
    else el.classList.remove('dark');
  }, [theme]);

  return <>{children}</>;
}
