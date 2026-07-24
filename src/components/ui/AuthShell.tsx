import Link from 'next/link';

/**
 * 로그인 / 회원가입 / 가입완료 페이지가 공유하는 인증 화면 셸.
 * 배경 장식 · 로고 · 카드 레이아웃을 한 곳에서 관리한다.
 */
export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* 배경 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* 로고 */}
        <Link href="/" className="block text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 mb-4 shadow-lg shadow-violet-500/25">
            <span className="text-3xl">⬡</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Park3D</h1>
          <p className="text-muted text-sm mt-1">노코드 3D 공간 제작 플랫폼</p>
        </Link>

        {/* 카드 */}
        <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-modal">
          <h2 className="text-lg font-semibold text-foreground mb-6">{title}</h2>
          {children}
        </div>

        {footer && <div className="mt-6 text-center">{footer}</div>}
      </div>
    </div>
  );
}

const inputCls =
  'w-full bg-background border border-border rounded-xs px-4 py-2.5 text-foreground placeholder-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all';

/** 이메일/비밀번호 입력 필드 (로그인·회원가입 공용) */
export function AuthField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-muted mb-1.5">{label}</label>
      <input {...props} className={inputCls} />
    </div>
  );
}

/** 그라데이션 제출 버튼 */
export function AuthSubmit({
  loading,
  children,
}: {
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold py-2.5 rounded-xs transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5"
    >
      {loading ? '처리 중...' : children}
    </button>
  );
}

/** 인증 폼 안내/에러 메시지 */
export function AuthMessage({ type, text }: { type: 'error' | 'info'; text: string }) {
  return (
    <p
      className={`text-sm rounded-xs px-3 py-2 ${
        type === 'error'
          ? 'text-danger bg-danger/10 border border-danger/20'
          : 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/20'
      }`}
    >
      {text}
    </p>
  );
}
