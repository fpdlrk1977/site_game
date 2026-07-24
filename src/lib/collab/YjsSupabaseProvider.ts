import * as Y from 'yjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { isDocEmpty } from './yjsSceneDoc';

/**
 * Yjs ↔ Supabase Realtime broadcast 전송(M3).
 *
 * - 로컬 문서 업데이트를 broadcast로 송신, 수신 시 applyUpdate(origin=REMOTE_ORIGIN).
 * - 초기 상태 핸드셰이크: 참가 시 state vector로 'y-sync-request' → 내용 있는 피어가
 *   diff('y-sync-state')로 응답 → 적용. (커스텀 WS 서버 불필요.)
 *
 * ⚠️ channel.on(...) 핸들러는 channel.subscribe() '전에' 등록돼야 한다 → 호출부가 provider를
 *    subscribe 전에 생성하도록 보장한다.
 */
export const REMOTE_ORIGIN = Symbol('collab-remote');

export interface YjsProvider {
  requestSync: () => void;
  destroy: () => void;
}

// Uint8Array ↔ base64 (broadcast payload는 JSON이라 문자열로 실어 보낸다). 대용량 대비 청크 인코딩.
function u8ToB64(u: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u.length; i += CHUNK) {
    s += String.fromCharCode(...u.subarray(i, i + CHUNK));
  }
  return btoa(s);
}
function b64ToU8(b: string): Uint8Array {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export function createYjsSupabaseProvider(
  doc: Y.Doc,
  channel: RealtimeChannel,
  opts: { onRemoteState?: () => void } = {},
): YjsProvider {
  // 로컬 문서 변경 → 방송(원격 적용분은 재방송 안 함)
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) return;
    channel.send({ type: 'broadcast', event: 'y-update', payload: { u: u8ToB64(update) } });
  };
  doc.on('update', onUpdate);

  channel.on('broadcast', { event: 'y-update' }, ({ payload }) => {
    if (payload?.u) Y.applyUpdate(doc, b64ToU8(payload.u), REMOTE_ORIGIN);
  });

  channel.on('broadcast', { event: 'y-sync-request' }, ({ payload }) => {
    if (isDocEmpty(doc)) return; // 줄 상태가 없음
    const sv = payload?.sv ? b64ToU8(payload.sv) : undefined;
    const update = Y.encodeStateAsUpdate(doc, sv);
    channel.send({ type: 'broadcast', event: 'y-sync-state', payload: { u: u8ToB64(update) } });
  });

  channel.on('broadcast', { event: 'y-sync-state' }, ({ payload }) => {
    if (payload?.u) {
      Y.applyUpdate(doc, b64ToU8(payload.u), REMOTE_ORIGIN);
      opts.onRemoteState?.();
    }
  });

  return {
    requestSync() {
      const sv = Y.encodeStateVector(doc);
      channel.send({ type: 'broadcast', event: 'y-sync-request', payload: { sv: u8ToB64(sv) } });
    },
    destroy() {
      doc.off('update', onUpdate);
    },
  };
}
