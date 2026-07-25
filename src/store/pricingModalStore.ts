import { create } from 'zustand';

/** 업그레이드 클릭 시 뜨는 요금제 비교 모달의 열림 상태(전역). */
interface PricingModalState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const usePricingModal = create<PricingModalState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
