import { createContext } from 'react';

// animate_object 액션용 — objectId → 재생할 클립 요청({name, t}).
// t(타임스탬프)로 같은 클립의 재트리거를 구분한다. ViewerObject가 자기 id의 요청을 읽어 재생.
// (ViewerObject가 여러 경로에서 렌더되므로 prop 대신 컨텍스트로 전달)
export type ClipReq = { name: string; t: number };
export const ClipRequestContext = createContext<Record<string, ClipReq>>({});
