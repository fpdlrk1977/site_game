import Link from 'next/link';
import { CircleCheck, MailCheck } from 'lucide-react';
import { AuthShell } from '@/components/ui/AuthShell';

export default async function SignUpCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = status === 'active';

  return (
    <AuthShell title={active ? 'You’re in 🎉' : 'Account created'}>
      <div className="flex flex-col items-center text-center">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-5 ${
            active
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-cyan-500/15 text-cyan-400'
          }`}
        >
          {active ? <CircleCheck size={34} /> : <MailCheck size={34} />}
        </div>

        {active ? (
          <>
            <p className="text-foreground font-medium mb-1.5">
              Welcome! Your account is ready.
            </p>
            <p className="text-muted text-sm mb-7 leading-relaxed">
              You're already signed in.
              <br />
              Time to build your first 3D space.
            </p>
            <Link
              href="/dashboard"
              className="block text-center w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold py-2.5 rounded-xs transition-all duration-200 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5"
            >
              Go to dashboard
            </Link>
          </>
        ) : (
          <>
            <p className="text-foreground font-medium mb-1.5">
              Your account is created.
            </p>
            <p className="text-muted text-sm mb-7 leading-relaxed">
              Email verification is required.
              <br />
              Confirm from your inbox, then log in.
            </p>
            <Link
              href="/login"
              className="block text-center w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold py-2.5 rounded-xs transition-all duration-200 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
