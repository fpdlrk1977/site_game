import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase-server';
import { AccountClient } from './AccountClient';
import type { PlanTier } from '@/store/userStore';

export default async function AccountPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: planData } = await supabase
    .from('users_plan')
    .select('plan_tier')
    .eq('user_id', user.id)
    .single();

  const planTier = (planData?.plan_tier ?? 'free') as PlanTier;
  const displayName = (user.user_metadata?.display_name as string | undefined) ?? '';

  return (
    <AccountClient
      email={user.email ?? ''}
      displayName={displayName}
      planTier={planTier}
    />
  );
}
