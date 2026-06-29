import { create } from 'zustand';

export type PlanTier = 'free' | 'pro' | 'business';

interface UserState {
  userId: string | null;
  email: string | null;
  planTier: PlanTier;
  isLoaded: boolean;
}

interface UserActions {
  setUser: (userId: string, email: string, planTier: PlanTier) => void;
  clearUser: () => void;
  setLoaded: () => void;
}

export const useUserStore = create<UserState & UserActions>((set) => ({
  userId: null,
  email: null,
  planTier: 'free',
  isLoaded: false,

  setUser: (userId, email, planTier) => set({ userId, email, planTier }),
  clearUser: () => set({ userId: null, email: null, planTier: 'free' }),
  setLoaded: () => set({ isLoaded: true }),
}));
