'use client';

// 전역 단일 컬러픽커 코디네이터 — 화면에 픽커 팝업은 항상 하나만.
//   각 <ColorPicker>는 자기 fieldId가 active일 때만 팝업을 렌더한다.
//   다른 필드 클릭 시 activeFieldId만 교체 → 팝업 위치(panelPos)는 유지하고 '내용만 스왑'(피그마식).
import { create } from 'zustand';

interface ColorPickerStore {
  activeFieldId: string | null;
  panelPos: { x: number; y: number };
  /** 최근 사용한 색(세션 유지, 최신순·중복 제거·최대 12) */
  recent: string[];
  /** 새로 열기 — activeFieldId + 위치 지정 */
  openAt: (fieldId: string, pos: { x: number; y: number }) => void;
  /** 열린 상태에서 다른 필드로 전환 — 위치 유지, 대상만 교체 */
  switchTo: (fieldId: string) => void;
  close: () => void;
  setPanelPos: (pos: { x: number; y: number }) => void;
  pushRecent: (hex: string) => void;
}

const RECENT_MAX = 12;

export const useColorPickerStore = create<ColorPickerStore>((set) => ({
  activeFieldId: null,
  panelPos: { x: 0, y: 0 },
  recent: [],
  openAt: (fieldId, pos) => set({ activeFieldId: fieldId, panelPos: pos }),
  switchTo: (fieldId) => set({ activeFieldId: fieldId }),
  close: () => set({ activeFieldId: null }),
  setPanelPos: (pos) => set({ panelPos: pos }),
  pushRecent: (hex) =>
    set((s) => {
      const h = hex.toLowerCase();
      const next = [h, ...s.recent.filter((c) => c.toLowerCase() !== h)].slice(0, RECENT_MAX);
      return { recent: next };
    }),
}));
