import { createRoot } from 'react-dom/client';
import { EmbedApp } from './EmbedApp';

// type="module" 스크립트는 HTML 스펙상 document.currentScript가 항상 null이라서
// (일반 <script>와 달리) 내 <script> DOM 엘리먼트를 직접 알아낼 방법이 없다.
// 대신 src가 embed.js(또는 embed.v1.js 등 버전 파일명)로 끝나는 <script> 태그를
// 전부 찾아서 매칭한다 — 한 페이지에 여러 씬을 동시에 삽입해도 각각 처리된다.
function mountAll() {
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[src*="embed"]'),
  ).filter((s) => /embed(\.v\d+)?\.js(\?|$)/.test(s.src));

  for (const scriptEl of scripts) {
    if (scriptEl.dataset.park3dMounted) continue; // 중복 마운트 방지
    scriptEl.dataset.park3dMounted = 'true';

    const sceneId = scriptEl.getAttribute('data-scene');
    if (!sceneId) {
      console.error('[Park3D Embed] <script data-scene="SCENE_ID"> 속성이 필요합니다.');
      continue;
    }

    const apiBase = new URL(scriptEl.src).origin;
    const targetId = scriptEl.getAttribute('data-target') || 'park3d-root';

    let rootEl = document.getElementById(targetId);
    if (!rootEl) {
      rootEl = document.createElement('div');
      rootEl.id = targetId;
      scriptEl.insertAdjacentElement('afterend', rootEl);
    }
    if (!rootEl.style.height) rootEl.style.height = '600px';
    if (!rootEl.style.position) rootEl.style.position = 'relative';

    // ViewerObject.tsx의 assetUrl()이 폰트 등 루트 상대경로 에셋을 호스트 페이지가 아닌
    // 우리 서버 origin 기준으로 풀어내도록 지정 (다른 origin에 임베드될 때만 의미가 있음)
    (window as unknown as Record<string, string>).__PARK3D_ASSET_BASE__ = apiBase;

    createRoot(rootEl).render(<EmbedApp sceneId={sceneId} apiBase={apiBase} />);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}
