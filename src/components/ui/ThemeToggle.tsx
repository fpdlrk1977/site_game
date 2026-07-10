'use client';

import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="w-8 h-8 flex items-center justify-center rounded-xs border border-border text-muted hover:bg-surface hover:text-foreground transition-all"
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
