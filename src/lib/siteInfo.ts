/**
 * 사업자 정보 — 약관·개인정보처리방침·푸터가 여기 한 곳을 읽는다.
 *
 * ⚠️ 아직 채워지지 않은 값은 빈 문자열로 두었다. 빈 값은 화면에 "확인 중"으로
 *    표시되지 않고 **아예 렌더되지 않는다** — 없는 정보를 있는 척하지 않기 위함.
 *    결제(유료 결제) 개시 전에는 전자상거래법상 사업자 정보 표기가 필요하므로
 *    그 전에 반드시 채울 것.
 */
export const SITE_INFO = {
  serviceName: 'Park3D',
  /** 법인/사업자명 */
  legalName: '',
  /** 대표자 */
  representative: '',
  /** 사업자등록번호 */
  businessNumber: '',
  /** 통신판매업 신고번호 */
  mailOrderNumber: '',
  /** 사업장 주소 */
  address: '',
  /** 고객 문의 메일 (필수) */
  supportEmail: 'support@park3d.io',
  /** 개인정보 보호책임자 */
  privacyOfficer: '',
  /** 약관·방침 최종 개정일 */
  effectiveDate: '2026-07-26',
} as const;

/**
 * 플랫폼 절대 URL.
 * 게시된 공간은 커스텀 도메인에서 서빙될 수 있어 `location.origin`이 플랫폼이 아니다 →
 * 배지/워터마크 링크는 반드시 이 함수로 만든다.
 */
export function platformUrl(path = '/', params?: Record<string, string>): string {
  const domain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'park3d.io';
  const proto = /^(localhost|127\.|0\.0\.0\.0)/.test(domain) ? 'http' : 'https';
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return `${proto}://${domain}${path}${qs}`;
}

/** 값이 채워진 항목만 [라벨, 값] 쌍으로 — 빈 항목은 표에서 빠진다 */
export function filledBusinessRows(): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['상호', SITE_INFO.legalName],
    ['대표자', SITE_INFO.representative],
    ['사업자등록번호', SITE_INFO.businessNumber],
    ['통신판매업 신고번호', SITE_INFO.mailOrderNumber],
    ['주소', SITE_INFO.address],
    ['개인정보 보호책임자', SITE_INFO.privacyOfficer],
    ['문의', SITE_INFO.supportEmail],
  ];
  return rows.filter(([, v]) => v.trim().length > 0);
}
