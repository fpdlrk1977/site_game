// 브릭 조립 P0 프로토타입 — /test/brick
// 기존 에디터와 완전히 분리된 검증용 라우트. 기준: doc/BRICK_SYSTEM.md

import BrickPrototype from './BrickPrototype';

export const metadata = { title: 'Brick Prototype (P0)' };

export default function Page() {
  return <BrickPrototype />;
}
