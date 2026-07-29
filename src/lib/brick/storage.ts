// 브릭 월드 저장소 — 기준: doc/BRICK_SYSTEM.md §3.5
//
// **희소 저장** — 비어 있지 않은 청크만 보관한다. 무한 맵의 빈 공간은 비용이 0이다.
// 저장은 **바뀐 청크만**(dirty) 쓴다. 브릭 하나 놓을 때마다 월드 전체를 쓰지 않는다.
//
// 어댑터로 둔 이유: 프로토타입은 localStorage로 즉시 검증하고,
// 씬에 붙는 단계에서 Supabase(brick_chunks 테이블)로 갈아끼우기 위함이다.

import { createBrowserSupabase } from '@/lib/supabase';
import type { StudStyle } from './brickGeometry';
import type { ChunkCoord } from './grid';
import { base64ToBytes, bytesToBase64 } from './serialize';

/** 청크가 아니라 **월드 전체**에 걸리는 설정. 씬 통합 시 scene_data로 간다 */
export interface BrickSettings {
  studStyle?: StudStyle;
}

export interface ChunkBlob {
  coord: ChunkCoord;
  data: Uint8Array;
}

/** 저장할 것 — data가 null이면 "이 청크는 비었으니 지워라" */
export interface ChunkWrite {
  coord: ChunkCoord;
  data: Uint8Array | null;
}

export interface BrickStorage {
  /** 어떤 청크가 있는지만 — **데이터는 안 읽는다**(스트리밍의 출발점) */
  listChunks(): Promise<ChunkCoord[]>;
  /** 청크 하나만 읽기 */
  loadChunk(coord: ChunkCoord): Promise<Uint8Array | null>;
  loadAll(): Promise<ChunkBlob[]>;
  save(writes: ChunkWrite[]): Promise<void>;
  loadSettings(): Promise<BrickSettings>;
  saveSettings(s: BrickSettings): Promise<void>;
  clear(): Promise<void>;
}

/** 청크 좌표 → 저장 키 문자열 */
const ck = (c: ChunkCoord) => `${c.cx},${c.cy},${c.cz}`;

function parseCk(s: string): ChunkCoord | null {
  const p = s.split(',');
  if (p.length !== 3) return null;
  const [cx, cy, cz] = p.map(Number);
  return Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(cz) ? { cx, cy, cz } : null;
}

/**
 * localStorage 어댑터 — 프로토타입 검증용(새로고침 후 복원).
 * 청크 하나당 항목 하나라, 바뀐 청크만 쓰는 것이 그대로 성립한다.
 */
export function localBrickStorage(namespace: string): BrickStorage {
  const prefix = `brick:${namespace}:`;
  const settingsKey = `brickcfg:${namespace}`;

  return {
    async listChunks() {
      const out: ChunkCoord[] = [];
      if (typeof localStorage === 'undefined') return out;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const coord = parseCk(key.slice(prefix.length));
        if (coord) out.push(coord);
      }
      return out;
    },

    async loadChunk(coord) {
      if (typeof localStorage === 'undefined') return null;
      const b64 = localStorage.getItem(prefix + ck(coord));
      if (!b64) return null;
      try {
        return base64ToBytes(b64);
      } catch {
        localStorage.removeItem(prefix + ck(coord));
        return null;
      }
    },

    async loadAll() {
      const out: ChunkBlob[] = [];
      if (typeof localStorage === 'undefined') return out;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const coord = parseCk(key.slice(prefix.length));
        const b64 = localStorage.getItem(key);
        if (!coord || !b64) continue;
        try {
          out.push({ coord, data: base64ToBytes(b64) });
        } catch {
          // 깨진 항목은 조용히 버리지 말고 지운다 — 다음 로드에서 또 걸리지 않게
          localStorage.removeItem(key);
        }
      }
      return out;
    },

    async save(writes) {
      if (typeof localStorage === 'undefined') return;
      for (const w of writes) {
        const key = prefix + ck(w.coord);
        if (w.data === null) localStorage.removeItem(key);
        else localStorage.setItem(key, bytesToBase64(w.data));
      }
    },

    async loadSettings() {
      if (typeof localStorage === 'undefined') return {};
      const raw = localStorage.getItem(settingsKey);
      if (!raw) return {};
      try {
        return JSON.parse(raw) as BrickSettings;
      } catch {
        localStorage.removeItem(settingsKey); // 깨진 항목은 지운다 — 다음에 또 걸리지 않게
        return {};
      }
    },

    async saveSettings(s) {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(settingsKey, JSON.stringify(s));
    },

    async clear() {
      if (typeof localStorage === 'undefined') return;
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
      // 설정은 브릭을 다 지워도 남긴다(사용자가 고른 룩이므로)
    },
  };
}

/**
 * Supabase 어댑터 — 씬에 붙은 브릭 월드 (`brick_chunks` 테이블, 마이그레이션 0009).
 *
 * 인터페이스가 localStorage판과 같아서 **갈아끼우기만** 하면 된다(P1에서 어댑터로 둔 이유).
 * 설정(돌기 모양 등)은 청크가 아니라 씬 단위라 `scenes.scene_data.brick`에 넣는다.
 */
export function supabaseBrickStorage(sceneId: string): BrickStorage {
  const sb = () => createBrowserSupabase();

  return {
    async listChunks() {
      // 데이터(text)는 빼고 좌표만 — 목록은 가볍게
      const { data, error } = await sb()
        .from('brick_chunks').select('cx,cy,cz').eq('scene_id', sceneId);
      if (error) { console.warn('[brick] listChunks 실패', error.message); return []; }
      return (data ?? []) as ChunkCoord[];
    },

    async loadChunk(coord) {
      const { data, error } = await sb()
        .from('brick_chunks').select('data')
        .eq('scene_id', sceneId).eq('cx', coord.cx).eq('cy', coord.cy).eq('cz', coord.cz)
        .maybeSingle();
      if (error || !data) return null;
      try { return base64ToBytes(data.data as string); } catch { return null; }
    },

    async loadAll() {
      const { data, error } = await sb()
        .from('brick_chunks').select('cx,cy,cz,data').eq('scene_id', sceneId);
      if (error) { console.warn('[brick] loadAll 실패', error.message); return []; }
      const out: ChunkBlob[] = [];
      for (const r of data ?? []) {
        try {
          out.push({ coord: { cx: r.cx, cy: r.cy, cz: r.cz }, data: base64ToBytes(r.data as string) });
        } catch { /* 깨진 행은 건너뛴다 */ }
      }
      return out;
    },

    async save(writes) {
      const upserts = writes.filter((w) => w.data !== null).map((w) => ({
        scene_id: sceneId, cx: w.coord.cx, cy: w.coord.cy, cz: w.coord.cz,
        data: bytesToBase64(w.data as Uint8Array), updated_at: new Date().toISOString(),
      }));
      const deletes = writes.filter((w) => w.data === null).map((w) => w.coord);

      if (upserts.length > 0) {
        const { error } = await sb().from('brick_chunks').upsert(upserts, { onConflict: 'scene_id,cx,cy,cz' });
        if (error) throw new Error(`브릭 저장 실패: ${error.message}`);
      }
      // 빈 청크는 행을 지운다(희소 저장 유지)
      for (const c of deletes) {
        await sb().from('brick_chunks').delete()
          .eq('scene_id', sceneId).eq('cx', c.cx).eq('cy', c.cy).eq('cz', c.cz);
      }
    },

    // 설정은 씬 데이터에 있다 — 여기서는 다루지 않는다(씬 저장 경로가 담당)
    async loadSettings() { return {}; },
    async saveSettings() { /* no-op */ },

    async clear() {
      const { error } = await sb().from('brick_chunks').delete().eq('scene_id', sceneId);
      if (error) throw new Error(`브릭 전체 삭제 실패: ${error.message}`);
    },
  };
}
