'use client';

import { useEffect, useState } from 'react';
import { RichContent } from './RichContent';
import type { PopupConfig } from '@/types/scene';

/**
 * show_popup 팝업 본문 렌더러 (Phase 1).
 * - mode 'auto' : 기존 RichContent 자동판별 (이미지/영상/YouTube/URL링크/텍스트)
 * - mode 'url'  : 웹사이트 URL을 <iframe src>로 삽입 (부모 페이지와 cross-origin 격리)
 * - mode 'html' : HTML 문자열을 <iframe srcdoc sandbox>로 격리 렌더
 *
 * ⚠️ 많은 사이트가 X-Frame-Options/CSP(frame-ancestors)로 임베드를 차단한다.
 *    cross-origin iframe은 JS로 성공/실패를 확실히 알 수 없으므로(차단 시에도 onLoad가
 *    발화하거나 contentDocument 접근이 막힘), "새 탭에서 열기" 탈출구를 항상 노출하고
 *    로딩이 오래 걸리면 차단 가능성을 안내하는 방식으로 안전하게 폴백한다.
 *
 * html 모드는 sandbox에서 allow-same-origin을 부여하지 않아(스크립트가 불투명 origin에서 실행)
 *    호스트/부모 페이지의 쿠키·DOM에 접근할 수 없다(XSS 격리).
 */
export function PopupFrame({ value, config }: { value: string; config?: PopupConfig }) {
  const mode = config?.mode ?? 'auto';
  const isUrl = mode === 'url';
  const isHtml = mode === 'html';
  const src = isUrl ? value.trim() : undefined;

  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (mode === 'auto') return;
    setLoaded(false);
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [value, mode]);

  if (mode === 'auto') return <RichContent value={value} onLight />;

  return (
    <div className="relative w-full h-full">
      <iframe
        src={src}
        srcDoc={isHtml ? value : undefined}
        title="popup-content"
        onLoad={() => setLoaded(true)}
        className="w-full h-full border-0 rounded-xs bg-white"
        // url 모드는 sandbox 미부여(대다수 사이트가 sandbox 하에선 깨짐).
        // html 모드는 allow-same-origin 제외로 부모 접근 차단(스크립트는 불투명 origin).
        sandbox={isHtml ? 'allow-scripts allow-forms allow-popups allow-modals' : undefined}
        allow="autoplay; encrypted-media; fullscreen; clipboard-write"
        referrerPolicy="no-referrer"
      />

      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/85 text-slate-500 rounded-xs">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          {slow && isUrl && (
            <p className="text-[11px] text-center px-6 leading-relaxed">
              불러오는 데 시간이 걸리거나, 이 사이트가 삽입(iframe)을 차단했을 수 있어요.
              <br />아래 &lsquo;새 탭에서 열기&rsquo;로 확인하세요.
            </p>
          )}
        </div>
      )}

      {isUrl && src && (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2 right-2 text-[11px] bg-black/55 text-white px-2 py-1 rounded-xs hover:bg-black/75 transition-colors"
        >
          새 탭에서 열기 ↗
        </a>
      )}
    </div>
  );
}
