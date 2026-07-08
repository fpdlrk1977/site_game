'use client';

/**
 * "A사이트" 목업 — 임베드 + emit_event로 호스트 페이지가 자기 콘텐츠를 3D 위에 띄우는 참조 구현.
 *
 * 시나리오 (사용자 의도):
 *   1) 회사(A사이트)가 park3d 씬을 iframe으로 임베드한다.
 *   2) 방문자가 3D 안의 '건물'을 클릭한다.
 *      → 에디터에서 그 건물에 걸어둔 이벤트: Trigger=Click, Action=emit_event, value='about' / 'history'
 *   3) A사이트가 park3d:event 를 받아 '자기 페이지(회사소개/연혁)'를 3D 위 오버레이로 띄운다.
 *      → A가 자기 콘텐츠를 자기가 렌더 → same-origin → X-Frame-Options 무관.
 *
 * 사용법: /test/host-demo?url=/embed/<sceneId>  (게시된 씬 필요)
 *   실제 배포에선 embed.js가 park3d:event 를 window CustomEvent로 재전달하므로
 *   호스트 코드는 window.addEventListener('park3d:event', e => e.detail) 형태가 된다.
 *   여기선 self-app iframe이라 raw postMessage(message)를 직접 구독한다(동일 페이로드).
 */

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// A사이트가 가진 '자기 페이지들' (호스트가 소유·렌더하는 콘텐츠)
const HOST_PAGES: Record<string, { title: string; body: string }> = {
  about: {
    title: '회사소개',
    body: 'ACME는 3D 공간 경험을 만드는 회사입니다. 이 패널은 park3d가 아니라 "A사이트(호스트)"가 직접 렌더한 자기 페이지예요. 방문자가 3D 안의 본사 건물을 클릭하면 park3d:event(value="about")가 호스트로 전달되고, 호스트가 이 오버레이를 띄웁니다.',
  },
  history: {
    title: '연혁',
    body: '2019 창립 · 2021 첫 제품 출시 · 2023 시리즈A · 2026 park3d 도입. 이 연혁도 호스트(A사이트)의 same-origin 콘텐츠라 자유롭게 스타일링됩니다. park3d는 "건물이 클릭됐다(value=history)"는 신호만 보냈어요.',
  },
};

function HostDemo() {
  const params = useSearchParams();
  const embedUrl = params.get('url') ?? '';
  // 현재 열린 호스트 페이지 key (null이면 닫힘)
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [lastSignal, setLastSignal] = useState<string>('(아직 없음)');

  useEffect(() => {
    // 실배포: window.addEventListener('park3d:event', e => handle(e.detail)) (embed.js가 재전달)
    // 여기(self-app iframe): raw message 직접 구독 — 페이로드 동일
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type !== 'park3d:event' && d.type !== 'park3d:popup') return;
      const value = String(d.value ?? '');
      setLastSignal(`${d.type} · value="${value}" · ${d.objectName ?? ''}`);
      // 호스트가 value를 자기 페이지로 매핑 — 있으면 오버레이 오픈
      if (value && HOST_PAGES[value]) setOpenKey(value);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const page = openKey ? HOST_PAGES[openKey] : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* A사이트 상단 내비게이션 (호스트 소유 UI) */}
      <header className="absolute top-0 inset-x-0 z-20 h-14 px-6 flex items-center gap-6 bg-slate-950/80 backdrop-blur border-b border-white/10">
        <span className="font-black tracking-tight text-lg">ACME<span className="text-cyan-400">Corp</span></span>
        <nav className="flex items-center gap-4 text-sm text-slate-300">
          <button onClick={() => setOpenKey('about')} className="hover:text-white transition-colors">회사소개</button>
          <button onClick={() => setOpenKey('history')} className="hover:text-white transition-colors">연혁</button>
        </nav>
        <span className="ml-auto text-[11px] text-slate-500 font-mono">host: A사이트 (this page)</span>
      </header>

      {/* 3D 임베드 (park3d iframe) — 배경 전체 */}
      <div className="absolute inset-0 pt-14">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen"
            title="park3d embed"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="text-5xl">🏢</div>
            <p className="text-sm">게시된 씬의 임베드 URL을 붙여 로드하세요:</p>
            <code className="text-xs bg-slate-800 px-3 py-1.5 rounded">/test/host-demo?url=/embed/&lt;sceneId&gt;</code>
            <p className="text-xs text-slate-500 max-w-md text-center leading-relaxed mt-2">
              건물에 <b>Trigger=Click · Action=emit_event · value=&quot;about&quot;(또는 &quot;history&quot;)</b>를 걸어두면,
              클릭 시 이 호스트 페이지가 자기 회사소개/연혁 오버레이를 3D 위에 띄웁니다.
            </p>
          </div>
        )}
      </div>

      {/* 마지막 수신 신호 표시 (디버그) */}
      <div className="absolute bottom-3 left-3 z-20 text-[11px] font-mono bg-black/50 backdrop-blur px-3 py-1.5 rounded text-cyan-300">
        park3d 신호: {lastSignal}
      </div>

      {/* 호스트가 렌더하는 '자기 페이지' 오버레이 — 3D 위에, 우측 사이드 패널 */}
      {page && (
        <>
          <div className="absolute inset-0 z-30 bg-black/40" onClick={() => setOpenKey(null)} />
          <aside className="absolute top-0 right-0 z-40 h-full w-full max-w-md bg-white text-slate-900 shadow-2xl flex flex-col animate-[slideIn_0.25s_ease]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-bold">{page.title}</h2>
              <button onClick={() => setOpenKey(null)} className="text-slate-400 hover:text-slate-900 text-sm font-semibold">✕ 닫기</button>
            </div>
            <div className="px-6 py-5 overflow-y-auto leading-relaxed text-[15px] text-slate-700">
              {page.body}
            </div>
            <div className="mt-auto px-6 py-4 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 font-mono leading-relaxed">
              이 패널 = 호스트(A사이트)의 same-origin 콘텐츠.<br />park3d는 신호만 전달, 렌더는 호스트가 함.
            </div>
          </aside>
        </>
      )}

      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </div>
  );
}

export default function HostDemoPage() {
  return (
    <Suspense>
      <HostDemo />
    </Suspense>
  );
}
