import { create } from 'zustand';

/**
 * 실시간 협업 인지(Presence) 상태 — 접속자·원격 선택·편집 잠금.
 * M1 범위: 순수 오버레이(문서 변이 동기화 없음). Supabase Realtime Presence로 채워진다.
 * scene_data와 무관(transient).
 */
export interface CollabPeer {
  key: string;            // presence 연결 키(탭마다 고유)
  userId: string;
  name: string;           // 표시 이름(이메일 앞부분 등)
  color: string;          // 유저별 색
  selectedIds: string[];  // 이 유저가 선택 중인 오브젝트
  editingId?: string | null; // 이 유저가 지금 조작(드래그) 중인 오브젝트 → 잠금 표시
}

interface CollabState {
  connected: boolean;
  selfKey: string | null;
  peers: CollabPeer[];    // 나를 제외한 접속자
  setConnected: (v: boolean) => void;
  setSelfKey: (k: string | null) => void;
  setPeers: (p: CollabPeer[]) => void;
  reset: () => void;
}

export const useCollabStore = create<CollabState>((set) => ({
  connected: false,
  selfKey: null,
  peers: [],
  setConnected: (connected) => set({ connected }),
  setSelfKey: (selfKey) => set({ selfKey }),
  setPeers: (peers) => set({ peers }),
  reset: () => set({ connected: false, selfKey: null, peers: [] }),
}));

// 유저별 색 — 문자열 해시로 팔레트에서 안정적으로 선택(같은 유저=같은 색).
const PEER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e',
];

export function peerColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PEER_COLORS[Math.abs(h) % PEER_COLORS.length];
}

/** 이메일/이름에서 짧은 표시 이름 */
export function shortName(email: string): string {
  return email.split('@')[0] || email || '익명';
}
