import { create } from 'zustand';

interface UIState {
  popup: { isOpen: boolean; content: string };
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
}

interface UIActions {
  openPopup: (content: string) => void;
  closePopup: () => void;
  setLoading: (isLoading: boolean, message?: string) => void;
  setError: (message: string | null) => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  popup: { isOpen: false, content: '' },
  isLoading: false,
  loadingMessage: '',
  error: null,

  openPopup: (content) => set({ popup: { isOpen: true, content } }),
  closePopup: () => set({ popup: { isOpen: false, content: '' } }),
  setLoading: (isLoading, message = '') => set({ isLoading, loadingMessage: message }),
  setError: (message) => set({ error: message }),
}));
