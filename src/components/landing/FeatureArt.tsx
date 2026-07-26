/**
 * 랜딩 기능 카드 / CTA용 장식 일러스트.
 *
 * 전부 인라인 SVG(정적) — 캔버스를 더 만들지 않는다(WebGL 컨텍스트 상한·스크롤 비용 회피).
 * 선은 currentColor + opacity라 라이트/다크 양쪽에 자동 적응하고, 면만 브랜드 색을 쓴다.
 * 순수 장식이므로 aria-hidden + pointer-events-none.
 */

const V = '#8b78ff';   // violet
const C = '#39d0ea';   // cyan
const P = '#ff7ac0';   // pink
const A = '#ffd36a';   // amber
const SEL = '#0D99FF'; // 에디터 선택 색과 동일

type ArtProps = { className?: string };

const wrap = (className?: string) => `pointer-events-none select-none ${className ?? ''}`;

/** 큰 타일 — 에디터 뷰포트 목업: 원근 그리드 바닥 + 선택된 오브젝트(기즈모 핸들) + 커서 */
export function EditorArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 520 300" className={wrap(className)} aria-hidden fill="none">
      <defs>
        <linearGradient id="ea-box" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={V} stopOpacity=".95" />
          <stop offset="1" stopColor="#5b3fe0" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id="ea-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".45" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="ea-mask"><rect width="520" height="300" fill="url(#ea-fade)" /></mask>
      </defs>

      {/* 원근 바닥 그리드 */}
      <g stroke="currentColor" strokeOpacity=".16" mask="url(#ea-mask)">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <line key={`h${i}`} x1={-40} y1={150 + i * i * 5.5} x2={560} y2={150 + i * i * 5.5} />
        ))}
        {[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((i) => (
          <line key={`v${i}`} x1={260 + i * 26} y1={150} x2={260 + i * 150} y2={330} />
        ))}
      </g>

      {/* 떠 있는 보조 도형들 */}
      <circle cx="430" cy="72" r="20" fill={C} fillOpacity=".85" />
      <rect x="72" y="52" width="30" height="30" rx="8" fill={P} fillOpacity=".8" transform="rotate(-14 87 67)" />
      <path d="M362 128l16-27 16 27z" fill={A} fillOpacity=".85" />

      {/* 선택된 박스(아이소메트릭) */}
      <g transform="translate(196 96)">
        <path d="M64 0l64 34-64 34-64-34z" fill="url(#ea-box)" />
        <path d="M0 34l64 34v68L0 102z" fill={V} fillOpacity=".55" />
        <path d="M128 34l-64 34v68l64-34z" fill="#4b32c9" fillOpacity=".65" />
      </g>

      {/* 선택 아웃라인 + 코너 핸들(에디터 기즈모 느낌) */}
      <rect x="188" y="88" width="144" height="128" stroke={SEL} strokeWidth="1.5" strokeDasharray="6 5" />
      {[[188, 88], [332, 88], [188, 216], [332, 216]].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 4} y={y - 4} width="8" height="8" fill={SEL} />
      ))}

      {/* 드래그 커서 */}
      <g transform="translate(322 196)">
        <path d="M0 0l16 6-6 2-2 6z" fill="currentColor" />
        <rect x="14" y="10" width="46" height="15" rx="3" fill={SEL} />
        <text x="20" y="21" fontSize="9" fill="#fff" fontFamily="ui-sans-serif, system-ui">drag</text>
      </g>
    </svg>
  );
}

/** 물리 — 포물선 궤적 + 튀는 공 + 충돌 스파크 */
export function PhysicsArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 300 130" className={wrap(className)} aria-hidden fill="none">
      <line x1="16" y1="112" x2="284" y2="112" stroke="currentColor" strokeOpacity=".22" />
      <path d="M28 96C64 28 96 26 124 96" stroke={C} strokeOpacity=".7" strokeWidth="1.6" strokeDasharray="4 5" />
      <path d="M124 96c22-46 46-46 62 6" stroke={C} strokeOpacity=".45" strokeWidth="1.6" strokeDasharray="4 5" />
      <circle cx="28" cy="98" r="7" fill={C} fillOpacity=".35" />
      <circle cx="124" cy="98" r="9" fill={C} />
      {/* 충돌한 상자 */}
      <g transform="rotate(9 214 92)">
        <rect x="196" y="72" width="40" height="40" rx="6" fill={V} fillOpacity=".9" />
        <rect x="196" y="72" width="40" height="40" rx="6" stroke="#fff" strokeOpacity=".18" />
      </g>
      {/* 스파크 */}
      <g stroke={A} strokeWidth="2" strokeLinecap="round" opacity=".9">
        <line x1="190" y1="66" x2="184" y2="58" />
        <line x1="200" y1="60" x2="199" y2="50" />
        <line x1="182" y1="76" x2="171" y2="73" />
      </g>
      {/* 중력 화살표 */}
      <g stroke="currentColor" strokeOpacity=".3" strokeWidth="1.4">
        <line x1="266" y1="34" x2="266" y2="62" />
        <path d="M262 56l4 7 4-7" />
      </g>
    </svg>
  );
}

/** 게시 — 브라우저 목업 + 도메인 + 공유 */
export function PublishArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 300 130" className={wrap(className)} aria-hidden fill="none">
      <rect x="26" y="18" width="212" height="96" rx="8" stroke="currentColor" strokeOpacity=".22" />
      <line x1="26" y1="42" x2="238" y2="42" stroke="currentColor" strokeOpacity=".18" />
      <circle cx="40" cy="30" r="3" fill={P} fillOpacity=".8" />
      <circle cx="52" cy="30" r="3" fill={A} fillOpacity=".8" />
      <circle cx="64" cy="30" r="3" fill={C} fillOpacity=".8" />
      <rect x="80" y="24" width="120" height="12" rx="6" fill="currentColor" fillOpacity=".07" />
      <text x="88" y="33.5" fontSize="8" fill="currentColor" fillOpacity=".5" fontFamily="ui-sans-serif, system-ui">yourname.com</text>
      {/* 미리보기 안의 3D 도형 */}
      <g transform="translate(108 58)">
        <path d="M24 0l24 13-24 13L0 13z" fill={V} fillOpacity=".95" />
        <path d="M0 13l24 13v26L0 39z" fill={V} fillOpacity=".55" />
        <path d="M48 13l-24 13v26l24-13z" fill="#4b32c9" fillOpacity=".6" />
      </g>
      {/* 발행 화살표 */}
      <path d="M246 66h22" stroke={C} strokeWidth="1.6" strokeDasharray="4 4" />
      <path d="M264 61l7 5-7 5" stroke={C} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="252" y="26" width="34" height="20" rx="5" fill={C} fillOpacity=".16" stroke={C} strokeOpacity=".5" />
      <text x="259" y="40" fontSize="9" fill={C} fontFamily="ui-sans-serif, system-ui">live</text>
    </svg>
  );
}

/** 협업 — 공유 캔버스 위 여러 커서 + 이름표 */
export function CollabArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 300 130" className={wrap(className)} aria-hidden fill="none">
      <rect x="30" y="16" width="240" height="100" rx="8" stroke="currentColor" strokeOpacity=".2" />
      <g stroke="currentColor" strokeOpacity=".08">
        {[1, 2, 3, 4, 5].map((i) => <line key={i} x1={30 + i * 40} y1="16" x2={30 + i * 40} y2="116" />)}
        {[1, 2].map((i) => <line key={i} x1="30" y1={16 + i * 33} x2="270" y2={16 + i * 33} />)}
      </g>
      {/* 함께 편집 중인 오브젝트 */}
      <rect x="118" y="48" width="56" height="42" rx="7" fill={V} fillOpacity=".85" />
      <rect x="114" y="44" width="64" height="50" rx="9" stroke={V} strokeOpacity=".55" strokeDasharray="5 4" />
      {/* 커서 A */}
      <g transform="translate(96 76)">
        <path d="M0 0l15 6-6 2-2 6z" fill={C} />
        <rect x="10" y="12" width="42" height="15" rx="3" fill={C} />
        <text x="16" y="23" fontSize="8.5" fill="#04323c" fontFamily="ui-sans-serif, system-ui">yuna</text>
      </g>
      {/* 커서 B */}
      <g transform="translate(184 40)">
        <path d="M0 0l15 6-6 2-2 6z" fill={P} />
        <rect x="10" y="12" width="38" height="15" rx="3" fill={P} />
        <text x="16" y="23" fontSize="8.5" fill="#4a0f2c" fontFamily="ui-sans-serif, system-ui">dan</text>
      </g>
      {/* 아바타 스택 */}
      <g transform="translate(226 100)">
        <circle cx="0" cy="0" r="8" fill={C} />
        <circle cx="12" cy="0" r="8" fill={P} />
        <circle cx="24" cy="0" r="8" fill={A} />
      </g>
    </svg>
  );
}

/** 최종 CTA 배경 — 원근 지평선 + 떠 있는 도형 실루엣 */
export function CtaArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMax slice" className={wrap(className)} aria-hidden fill="none">
      <defs>
        <linearGradient id="cta-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="cta-mask"><rect width="1200" height="420" fill="url(#cta-fade)" /></mask>
      </defs>

      {/* 원근 그리드 바닥 */}
      <g stroke="#a99bff" strokeOpacity=".28" mask="url(#cta-mask)">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line key={`h${i}`} x1="-100" y1={250 + i * i * 4} x2="1300" y2={250 + i * i * 4} />
        ))}
        {Array.from({ length: 19 }, (_, k) => k - 9).map((i) => (
          <line key={`v${i}`} x1={600 + i * 34} y1="250" x2={600 + i * 190} y2="480" />
        ))}
      </g>

      {/* 떠 있는 도형 실루엣 */}
      <g opacity=".9">
        <g transform="translate(150 96)">
          <path d="M40 0l40 22-40 22L0 22z" fill="#8b78ff" fillOpacity=".55" />
          <path d="M0 22l40 22v44L0 66z" fill="#8b78ff" fillOpacity=".3" />
          <path d="M80 22L40 44v44l40-22z" fill="#5b3fe0" fillOpacity=".4" />
        </g>
        <circle cx="1010" cy="132" r="34" fill="#39d0ea" fillOpacity=".38" />
        <rect x="905" y="228" width="42" height="42" rx="12" fill="#ff7ac0" fillOpacity=".34" transform="rotate(18 926 249)" />
        <path d="M262 236l22-38 22 38z" fill="#ffd36a" fillOpacity=".38" />
      </g>
    </svg>
  );
}
