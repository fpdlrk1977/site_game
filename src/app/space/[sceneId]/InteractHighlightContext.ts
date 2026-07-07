import { createContext } from 'react';

// 플레이 모드에서 캐릭터가 근접한 interact 대상의 objectId (없으면 null).
// ViewerObject가 자기 자신이면 하이라이트(emissive + 아웃라인)를 표시한다 — 플레이 모드에서도.
export const InteractHighlightContext = createContext<string | null>(null);
