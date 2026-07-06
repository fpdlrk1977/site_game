import { createContext } from 'react';

// 뷰어가 플레이(걷기) 모드인지 여부. ViewerObject가 여러 경로(탐색/PhysicsObject/그룹)에서
// 렌더되므로 prop 대신 컨텍스트로 전달한다. 플레이 모드에선 호버 하이라이트를 숨긴다.
export const PlayModeContext = createContext(false);
