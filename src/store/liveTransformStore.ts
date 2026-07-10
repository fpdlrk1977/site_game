import { create } from 'zustand';

export interface LiveTransform {
  id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // 도(deg) — Inspector 표시 단위와 동일
  scale: { x: number; y: number; z: number };
}

interface LiveTransformState {
  live: LiveTransform | null;
  setLive: (t: LiveTransform | null) => void;
}

// ── 라이브 트랜스폼 채널 ────────────────────────────────────────────────
// 직접 조작 도구(기즈모 등)가 드래그 '중'에 실시간 트랜스폼을 흘려보내는 임시 채널.
// 메인 스토어(objects[])와 분리 → 캔버스/기즈모 리렌더 없이 Inspector 수치만 실시간 갱신한다.
//  - 쓰기: 기즈모가 useLiveTransformStore.getState().setLive(...) 로 매 프레임 게시(구독 없음 → 기즈모 리렌더 X).
//  - 읽기: Inspector의 Transform 입력부만 useLiveTransformStore(selector)로 구독(그 서브트리만 리렌더).
//  - 저장(scene_data)과 무관(transient). 조작 종료 시 setLive(null)로 클리어하고 확정값은 메인 스토어에 커밋.
// 재사용 규칙: 앞으로 새로 추가되는 '직접 조작' UI도 이 채널에 게시하면 관련 수치 표시부가 실시간 반영된다.
export const useLiveTransformStore = create<LiveTransformState>((set) => ({
  live: null,
  setLive: (t) => set({ live: t }),
}));
