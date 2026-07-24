'use client';

import { useEffect } from 'react';
import * as Y from 'yjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserSupabase } from '@/lib/supabase';
import { useSceneStore } from '@/store/sceneStore';
import { useLiveTransformStore } from '@/store/liveTransformStore';
import { useCollabStore, peerColor, shortName, type CollabPeer } from '@/store/collabStore';
import { attachBinding } from '@/lib/collab/collabBinding';
import { createYjsSupabaseProvider } from '@/lib/collab/YjsSupabaseProvider';
import { persistCurrentScene } from '@/lib/saveScene';

/**
 * 실시간 협업 세션 lifecycle (M1 Presence + M3 문서 co-edit).
 *
 * 같은 씬을 편집 중인 사용자를 Supabase Realtime으로 연결한다.
 * - Presence: 참가자 아바타 / 선택 오브젝트 / 조작(드래그) 중 잠금.
 * - 문서(Yjs): objects/environment/... 를 CRDT로 동기화 → 편집이 실시간 수렴.
 *
 * sceneId·userId가 없으면 no-op(비협업 = 기존과 동일). 바인딩은 start() 이후에만 로컬→문서 반영.
 */
export function useCollab(sceneId: string | null, userId: string | null, email: string | null) {
  useEffect(() => {
    if (!sceneId || !userId) return;

    const supabase = createBrowserSupabase();
    const selfKey =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${userId}-${Date.now()}`;
    const color = peerColor(userId);
    const name = shortName(email ?? userId);

    const local = {
      userId,
      name,
      color,
      selectedIds: useSceneStore.getState().selectedIds,
      editingId: null as string | null,
    };

    // ── Yjs 문서 + 바인딩 ──────────────────────────────
    const doc = new Y.Doc();
    const binding = attachBinding(doc);

    let started = false;
    const startSession = () => {
      if (started) return;
      started = true;
      binding.start();
    };

    // ── M4: 리더 디바운스 저장 ─────────────────────────────
    // 접속자 중 selfKey가 가장 작은 클라 하나만 저장 → 낙관적 version 잠금 경합 회피.
    // 내용은 CRDT로 모두 수렴하므로 누가 저장하든 동일. 충돌 시 버전만 맞춘다.
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const amLeader = () => useCollabStore.getState().peers.every((p) => selfKey < p.key);
    const scheduleSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        if (!started || !amLeader()) return;
        const r = await persistCurrentScene();
        if (r.status === 'conflict') {
          // 다른 클라가 이미 저장(내용 동일) → 로컬 savedVersion만 최신으로 맞춰 다음 저장 준비
          try {
            const sb = createBrowserSupabase();
            const sid = useSceneStore.getState().sceneId;
            if (sid) {
              const { data } = await sb.from('scenes').select('version').eq('id', sid).single();
              if (data?.version != null) useSceneStore.getState().markSaved(data.version as number);
            }
          } catch { /* 무시 */ }
        }
      }, 3000);
    };
    const onDocSave = () => scheduleSave();
    doc.on('update', onDocSave); // 로컬/원격 변경 모두 저장 예약

    let channel: RealtimeChannel | null = supabase.channel(`scene:${sceneId}`, {
      config: { presence: { key: selfKey }, broadcast: { self: false } },
    });

    // 프로바이더는 subscribe 전에 broadcast 핸들러를 등록해야 한다.
    const provider = createYjsSupabaseProvider(doc, channel, {
      onRemoteState: () => startSession(), // 원격 상태 수신 = 동기화됨 → 로컬 반영 시작
    });

    useCollabStore.getState().setSelfKey(selfKey);

    const syncPeers = () => {
      if (!channel) return;
      const raw = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const peers: CollabPeer[] = [];
      for (const [key, arr] of Object.entries(raw)) {
        if (key === selfKey) continue;
        const s = arr[0];
        if (!s) continue;
        peers.push({
          key,
          userId: String(s.userId ?? ''),
          name: String(s.name ?? '익명'),
          color: String(s.color ?? '#888'),
          selectedIds: Array.isArray(s.selectedIds) ? (s.selectedIds as string[]) : [],
          editingId: (s.editingId as string | null) ?? null,
        });
      }
      useCollabStore.getState().setPeers(peers);
    };

    const push = () => {
      if (channel) channel.track({ ...local });
    };

    // 핸드셰이크: 상태를 못 받으면(=첫 참가자) 문서를 seed. 동시 콜드조인 중복 방지 위해 최소 키가 시더.
    const scheduleSeed = () => {
      const fire = () => {
        if (started) return;
        if (!binding.isDocEmpty()) { startSession(); return; } // 누군가 상태를 보냄
        const peers = useCollabStore.getState().peers;
        const amSeeder = peers.every((p) => selfKey < p.key);
        if (amSeeder) {
          binding.seedFromStore();
          startSession();
        } else {
          setTimeout(fire, 1200); // 시더 상태 도착 대기
        }
      };
      setTimeout(fire, 700);
    };

    channel
      .on('presence', { event: 'sync' }, syncPeers)
      .on('presence', { event: 'join' }, syncPeers)
      .on('presence', { event: 'leave' }, syncPeers)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          useCollabStore.getState().setConnected(true);
          push();
          provider.requestSync();
          scheduleSeed();
        }
      });

    // 선택 변경 → presence track
    const unsubSel = useSceneStore.subscribe((s) => {
      if (s.selectedIds !== local.selectedIds) {
        local.selectedIds = s.selectedIds;
        push();
      }
    });

    // 드래그(조작) 중 오브젝트 → editingId (잠금 표시)
    const unsubDrag = useLiveTransformStore.subscribe((s) => {
      const next = s.dragging ? s.live?.id ?? (local.selectedIds[0] ?? null) : null;
      if (next !== local.editingId) {
        local.editingId = next;
        push();
      }
    });

    return () => {
      unsubSel();
      unsubDrag();
      if (saveTimer) clearTimeout(saveTimer);
      doc.off('update', onDocSave);
      binding.detach();
      provider.destroy();
      if (channel) {
        channel.untrack();
        supabase.removeChannel(channel);
        channel = null;
      }
      doc.destroy();
      useCollabStore.getState().reset();
    };
  }, [sceneId, userId, email]);
}
