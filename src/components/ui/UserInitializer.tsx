'use client';

import { useEffect } from 'react';
import { useUserStore, type PlanTier } from '@/store/userStore';

interface Props {
  userId: string;
  email: string;
  planTier: PlanTier;
}

/** 서버에서 조회한 유저/플랜 정보를 클라이언트 store에 주입 */
export function UserInitializer({ userId, email, planTier }: Props) {
  const setUser = useUserStore((s) => s.setUser);

  useEffect(() => {
    setUser(userId, email, planTier);
  }, [userId, email, planTier, setUser]);

  return null;
}
