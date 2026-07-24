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
    <AuthShell title={active ? '가입 완료 🎉' : '가입 완료'}>
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
              환영합니다! 계정이 만들어졌어요.
            </p>
            <p className="text-muted text-sm mb-7 leading-relaxed">
              바로 로그인된 상태입니다.
              <br />
              이제 첫 3D 공간을 만들어보세요.
            </p>
            <Link
              href="/dashboard"
              className="block text-center w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold py-2.5 rounded-xs transition-all duration-200 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5"
            >
              대시보드 시작하기
            </Link>
          </>
        ) : (
          <>
            <p className="text-foreground font-medium mb-1.5">
              계정이 만들어졌어요.
            </p>
            <p className="text-muted text-sm mb-7 leading-relaxed">
              이메일 인증이 필요한 설정입니다.
              <br />
              받은 편지함에서 인증을 완료한 뒤 로그인해 주세요.
            </p>
            <Link
              href="/login"
              className="block text-center w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold py-2.5 rounded-xs transition-all duration-200 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5"
            >
              로그인하기
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
