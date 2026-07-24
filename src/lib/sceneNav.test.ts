import { nextSceneHref } from './sceneNav';

// 간단한 결정론 테스트 (npx tsx src/lib/sceneNav.test.ts)
let pass = 0;
let fail = 0;
function eq(name: string, got: string, want: string) {
  if (got === want) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${name}\n    got:  ${got}\n    want: ${want}`);
  }
}

const A = 'aaaaaaaa-1111-2222-3333-444444444444';
const B = 'bbbbbbbb-5555-6666-7777-888888888888';

// 플랫폼: /space/{id} → 씬 id 치환
eq('platform space', nextSceneHref(`/space/${A}`, A, B), `/space/${B}`);

// 임베드: /embed/{id} → 씬 id 치환 (embed 유지)
eq('embed', nextSceneHref(`/embed/${A}`, A, B), `/embed/${B}`);

// 커스텀 도메인 루트: '/' → /s/{target}
eq('custom root', nextSceneHref('/', A, B), `/s/${B}`);

// 커스텀 도메인 씬 경로: /s/{id} → /s/{target}
eq('custom /s/', nextSceneHref(`/s/${A}`, A, B), `/s/${B}`);

// 플랫폼인데 경로에 현재 씬 id가 없는 edge → /space 폴백
eq('platform fallback', nextSceneHref('/space/other', A, B), `/space/${B}`);

// 커스텀 도메인 임의 경로(비-space/embed)도 /s 스킴
eq('custom other path', nextSceneHref('/anything', A, B), `/s/${B}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
