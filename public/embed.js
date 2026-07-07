/*!
 * Park3D Embed — iframe 주입기 (YouTube IFrame API 패턴)
 *
 * 사용법:
 *   <script src="https://<your-domain>/embed.js" data-scene="SCENE_ID"></script>
 *
 * 옵션(data-*):
 *   data-scene   (필수) 씬 id
 *   data-target  기존 요소 id에 삽입 (없으면 <script> 바로 뒤에 iframe 생성)
 *   data-width   기본 "100%"
 *   data-height  기본 "600px"
 *   data-radius  기본 "12px"
 *
 * Event Bridge:
 *   호스트 페이지에서 아래 한 줄로 씬 이벤트를 구독할 수 있다(postMessage 몰라도 됨).
 *     window.addEventListener('park3d:event', function (e) { console.log(e.detail); });
 *     window.addEventListener('park3d:popup', function (e) { console.log(e.detail); });
 *
 * 이 스크립트는 React/Three를 호스트 페이지에 심지 않는다. 격리된 iframe(우리 /embed 라우트,
 * 전체 기능 지원)을 꽂을 뿐이라 CSS/JS 충돌이 없고 크기도 ~1KB다.
 */
(function () {
  'use strict';

  function mountAll() {
    var scripts = Array.prototype.slice
      .call(document.querySelectorAll('script[src*="embed"]'))
      .filter(function (s) { return /embed(\.v\d+)?\.js(\?|$)/.test(s.src); });

    scripts.forEach(function (scriptEl) {
      if (scriptEl.dataset.park3dMounted) return; // 중복 삽입 방지
      scriptEl.dataset.park3dMounted = 'true';

      var sceneId = scriptEl.getAttribute('data-scene');
      if (!sceneId) {
        console.error('[Park3D Embed] <script data-scene="SCENE_ID"> 속성이 필요합니다.');
        return;
      }

      var origin = new URL(scriptEl.src).origin;
      var iframe = document.createElement('iframe');
      // parentOrigin — iframe(EmbedClient)이 postMessage를 이 호스트로 정확히 보내도록 전달
      iframe.src = origin + '/embed/' + encodeURIComponent(sceneId)
        + '?parentOrigin=' + encodeURIComponent(location.origin);
      iframe.title = 'Park3D';
      iframe.loading = 'lazy';
      iframe.setAttribute('allow', 'autoplay; fullscreen; xr-spatial-tracking; accelerometer; gyroscope');
      iframe.setAttribute('allowfullscreen', 'true');
      iframe.style.border = '0';
      iframe.style.display = 'block';
      iframe.style.width = scriptEl.getAttribute('data-width') || '100%';
      iframe.style.height = scriptEl.getAttribute('data-height') || '600px';
      // iframe.style.borderRadius = scriptEl.getAttribute('data-radius') || '12px';

      var targetId = scriptEl.getAttribute('data-target');
      var container = targetId ? document.getElementById(targetId) : null;
      if (container) container.appendChild(iframe);
      else scriptEl.insertAdjacentElement('afterend', iframe);
    });
  }

  // iframe → 부모로 온 park3d 메시지를 호스트 window의 CustomEvent로 재전달 (구독 DX)
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'park3d:event' || d.type === 'park3d:popup') {
      try { window.dispatchEvent(new CustomEvent(d.type, { detail: d })); } catch (_) { /* noop */ }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
