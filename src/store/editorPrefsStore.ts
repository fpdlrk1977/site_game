import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 에디터 표시 단위 등 세션/기기에 남는 UI 취향(씬 데이터 아님, localStorage 저장).
export type SizeUnit = 'mm' | 'cm' | 'm';

// 미터 기준 1 → 각 단위 표시 배율. m=1, cm=100, mm=1000.
export const SIZE_UNIT_FACTOR: Record<SizeUnit, number> = { mm: 1000, cm: 100, m: 1 };
export const SIZE_UNITS: SizeUnit[] = ['mm', 'cm', 'm'];

interface EditorPrefsStore {
  sizeUnit: SizeUnit;
  setSizeUnit: (u: SizeUnit) => void;
}

export const useEditorPrefsStore = create<EditorPrefsStore>()(
  persist(
    (set) => ({
      sizeUnit: 'm',
      setSizeUnit: (u) => set({ sizeUnit: u }),
    }),
    { name: 'park3d-editor-prefs' },
  ),
);
