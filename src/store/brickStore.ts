// 브릭 프로토타입 스토어 (P0) — 기준: doc/BRICK_SYSTEM.md §8
//
// P0는 메모리만 쓴다. 저장·청크·스트리밍은 P1~P2다.
// BrickWorld는 성능상 mutable이라 참조가 안 바뀐다 → `version`을 올려 리렌더를 유발한다.

import { create } from 'zustand';
import {
  BRICK_CELLS_Y, CELL_X, CELL_Z, CHUNK_X, CHUNK_Z, chunkKey, Y_MAX,
  type ChunkCoord, type Rot,
} from '@/lib/brick/grid';
import type { MatClass, PartId } from '@/lib/brick/parts';
import type { StudStyle } from '@/lib/brick/brickGeometry';
import { decodeChunk, encodeChunk, toBrickData } from '@/lib/brick/serialize';
import { localBrickStorage, supabaseBrickStorage, type BrickStorage, type ChunkWrite } from '@/lib/brick/storage';
import { BrickWorld } from '@/lib/brick/world';

/** 팔레트 — P1에서 청크 팔레트로 승격된다 */
export const BRICK_COLORS = [
  '#d01012', '#0d69ab', '#f2cd37', '#237841', '#ffffff',
  '#05131d', '#a0a5a9', '#c870a0', '#fe8a18', '#582a12',
];

/**
 * 빛 재계산 디바운스 — 편집마다 BFS를 돌리면 배치가 끊긴다.
 * 편집이 멎고 나서 한 번만 돌리고, 끝나면 version을 올려 면 밝기를 다시 굽게 한다.
 */
let lightTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleLight(set: (fn: (s: BrickState) => Partial<BrickState>) => void): void {
  if (lightTimer) clearTimeout(lightTimer);
  lightTimer = setTimeout(() => {
    lightTimer = null;
    set((s) => {
      s.world.recomputeLight();
      return { version: s.version + 1 };
    });
  }, 140);
}

/** 고정 높이는 지면 위 & 세로 상한 안으로 (P2에서 파기가 들어오면 하한이 음수로 열린다) */
function clampLock(y: number): number {
  return Math.max(0, Math.min(Y_MAX - BRICK_CELLS_Y + 1, y));
}

interface BrickState {
  world: BrickWorld;
  version: number;

  part: PartId;
  rot: Rot;
  color: string;
  mat: MatClass;

  /**
   * 높이 고정 — null이면 드롭 모드(발밑에 얹힘), 숫자면 그 높이에 고정.
   * 드롭 모델은 받쳐줄 게 없는 자리에 못 놓는다(천장·2층 바닥·다리 상판).
   */
  lockY: number | null;

  /** 돌기 모양 — 레고와의 시각적 차별화 검토용(BRICK_SYSTEM.md §8.5). 저장 데이터엔 영향 없음 */
  studStyle: StudStyle;
  setStudStyle: (s: StudStyle) => void;

  setPart: (p: PartId) => void;
  setRot: (r: Rot) => void;
  rotate: () => void;
  setColor: (c: string) => void;
  setMat: (m: MatClass) => void;
  /** 현재 고스트 높이로 잠그거나, 잠겨 있으면 해제 */
  toggleLock: (currentY: number) => void;
  /** 한 단(브릭 높이 = 3칸)씩 올리고 내리기 */
  nudgeLock: (dir: 1 | -1) => void;

  place: (x: number, y: number, z: number) => boolean;
  removeBrick: (id: number) => void;
  clear: () => void;
  /** 스트레스 테스트 — 꽉 찬 직육면체를 채워 폴리곤 예산을 잰다 */
  stressFill: (studsX: number, studsZ: number, layers: number) => void;

  // ── 저장 (P1) ──────────────────────────────────────────────────────────
  /** 'idle' 저장할 것 없음 · 'pending' 변경 있음 · 'saving' 쓰는 중 · 'saved' 방금 저장됨 */
  saveState: 'idle' | 'pending' | 'saving' | 'saved';
  loaded: boolean;
  loadWorld: () => Promise<void>;
  /** 바뀐 청크만 저장 */
  flush: () => Promise<void>;
  /** 카메라 주변 청크를 올리고 먼 것은 내린다 (P2-b 스트리밍) */
  streamAround: (camX: number, camZ: number) => Promise<void>;
  /** 저장소에 존재하는 청크 수 (로드된 수는 world.chunkCount) */
  indexedChunks: () => number;
  /** 지금 어디에 저장하는가 — 'local'=프로토타입, 'db'=씬의 brick_chunks */
  backend: 'local' | 'db';
}

// ── 스트리밍 튜닝 ────────────────────────────────────────────────────────
/** 로드 반경(청크). 8m/청크 → 6이면 약 48m */
const LOAD_R = 6;
/** 언로드 반경 — 로드보다 넓게 잡아야 경계에서 껌뻑이지 않는다(히스테리시스) */
const UNLOAD_R = 9;
/** 한 번에 읽는 청크 수. 사이사이 양보해 화면이 안 멈추게 */
const LOAD_BATCH = 24;

/** 저장소에 있는 청크 목록(데이터 아님) — 로드 대상 판단에만 쓴다 */
const chunkIndex = new Map<number, ChunkCoord>();
/** 스트리밍 재진입 방지 */
let streaming = false;

/**
 * 저장소는 갈아끼운다 — 프로토타입은 localStorage, 씬에 붙으면 Supabase(`brick_chunks`).
 * P1에서 어댑터로 둔 이유가 이것이다. 인터페이스가 같아 나머지 코드는 그대로다.
 */
let storage: BrickStorage = localBrickStorage('proto');

/**
 * 씬에 연결 — 이후 로드/저장이 그 씬의 `brick_chunks`로 간다.
 * (훅이 아니다 — 모듈 상태를 바꾸는 부수효과라 effect에서 부를 것)
 */
export function attachBrickStorage(sceneId: string | null): void {
  storage = sceneId ? supabaseBrickStorage(sceneId) : localBrickStorage('proto');
  chunkIndex.clear();
  useBrickStore.setState({ backend: sceneId ? 'db' : 'local' });
}

export const useBrickStore = create<BrickState>()((set, get) => ({
  world: new BrickWorld(),
  version: 0,

  part: 'b2x4',
  rot: 0,
  color: BRICK_COLORS[0],
  mat: 'opaque',
  lockY: null,
  // 기본값 = 라인. 제품의 얼굴은 기본값이 정한다 — 스크린샷·템플릿·대부분의 사용자 콘텐츠가
  // 이 모양으로 나온다(BRICK_SYSTEM.md §8.5). 원형 등 나머지는 선택지로 남겨 둔다.
  studStyle: 'line',

  setStudStyle: (s) => {
    set({ studStyle: s });
    void storage.saveSettings({ studStyle: s });
  },

  setPart: (p) => set({ part: p }),
  setRot: (r) => set({ rot: r }),
  rotate: () => set((s) => ({ rot: ((s.rot + 1) % 4) as Rot })),
  setColor: (c) => set({ color: c }),
  setMat: (m) => set({ mat: m }),

  toggleLock: (currentY) => set((s) => ({ lockY: s.lockY === null ? clampLock(currentY) : null })),
  nudgeLock: (dir) => set((s) => (s.lockY === null ? {} : { lockY: clampLock(s.lockY + dir * BRICK_CELLS_Y) })),

  place: (x, y, z) => {
    const { world, part, rot, color, mat } = get();
    const id = world.place(part, x, y, z, rot, color, mat);
    if (id === null) return false;
    set((s) => ({ version: s.version + 1, saveState: 'pending' }));
    scheduleLight(set);
    return true;
  },

  removeBrick: (id) => {
    if (get().world.remove(id)) {
      set((s) => ({ version: s.version + 1, saveState: 'pending' }));
      scheduleLight(set);
    }
  },

  clear: () => {
    get().world.clear();
    set((s) => ({ version: s.version + 1, saveState: 'pending' }));
  },

  stressFill: (studsX, studsZ, layers) => {
    const { world, color } = get();
    // 2×4 브릭을 격자로 빽빽이. 대량이라 placeFast + 마지막에 한 번 recomputeAll
    for (let ly = 0; ly < layers; ly++) {
      for (let ix = 0; ix < studsX; ix += 2) {
        for (let iz = 0; iz < studsZ; iz += 4) {
          world.placeFast('b2x4', ix, ly * 3, iz, 0, color, 'opaque');
        }
      }
    }
    world.recomputeAll();
    world.recomputeLight(); // 대량 생성/불러오기 직후엔 바로 굽는다(디바운스 불필요)
    set((s) => ({ version: s.version + 1, saveState: 'pending' }));
  },

  // ── 저장 ───────────────────────────────────────────────────────────────
  saveState: 'idle',
  loaded: false,

  loadWorld: async () => {
    const cfg = await storage.loadSettings();
    if (cfg.studStyle) set({ studStyle: cfg.studStyle });
    // 데이터는 안 읽고 **목록만** 만든다 — 실제 로드는 카메라 주변부터 스트리밍으로.
    const list = await storage.listChunks();
    chunkIndex.clear();
    for (const c of list) chunkIndex.set(chunkKey(c.cx, c.cy, c.cz), c);
    set({ loaded: true, saveState: 'idle' });
    await get().streamAround(0, 0); // 원점 주변부터
  },

  streamAround: async (camX, camZ) => {
    if (streaming) return;
    const { world } = get();
    const ccx = Math.floor(camX / (CHUNK_X * CELL_X));
    const ccz = Math.floor(camZ / (CHUNK_Z * CELL_Z));

    // ── 내릴 것: 언로드 반경 밖 (히스테리시스 — 경계에서 껌뻑이지 않게)
    const toUnload: number[] = [];
    for (const key of world.loadedChunkKeys()) {
      const c = chunkIndex.get(key);
      if (!c) continue;
      if (Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz)) > UNLOAD_R) toUnload.push(key);
    }

    // ── 올릴 것: 로드 반경 안. **세로는 전부** 올린다 —
    //    아래 청크가 없으면 기둥 높이(colTop)가 틀려 브릭이 엉뚱한 높이에 얹힌다.
    const toLoad: { key: number; c: ChunkCoord; d: number }[] = [];
    for (const [key, c] of chunkIndex) {
      if (world.hasChunk(key)) continue;
      const d = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz));
      if (d <= LOAD_R) toLoad.push({ key, c, d });
    }
    if (toUnload.length === 0 && toLoad.length === 0) return;
    toLoad.sort((a, b) => a.d - b.d); // 가까운 것부터

    streaming = true;
    try {
      // 내리기 전에 **반드시 저장**한다 — 안 그러면 편집분이 사라진다
      if (toUnload.length > 0) {
        await get().flush();
        for (const key of toUnload) world.unloadChunk(key);
      }

      // 나눠 읽는다 — 한 번에 다 읽으면 화면이 멈춘다(12만 브릭에서 3초였다)
      for (let i = 0; i < toLoad.length; i += LOAD_BATCH) {
        for (const { c } of toLoad.slice(i, i + LOAD_BATCH)) {
          const data = await storage.loadChunk(c);
          if (!data) continue;
          for (const d of decodeChunk(data, c.cx, c.cy, c.cz)) {
            world.placeFast(d.part, d.x, d.y, d.z, d.rot, d.color, d.mat);
          }
        }
        set((s) => ({ version: s.version + 1 })); // 들어온 만큼 바로 보여준다
        if (i + LOAD_BATCH < toLoad.length) await new Promise((r) => setTimeout(r, 0));
      }

      world.recomputeAll();
      world.recomputeLight();
      world.clearDirty(); // 읽어온 것은 저장 대상이 아니다
      set((s) => ({ version: s.version + 1 }));
    } finally {
      streaming = false;
    }
  },

  flush: async () => {
    const { world } = get();
    if (!world.hasUnsaved) return;
    set({ saveState: 'saving' });
    // 스냅샷을 먼저 뜨고 dirty를 비운다 — 쓰는 동안 들어온 변경이 묻히지 않게
    const writes: ChunkWrite[] = world.dirtyChunks().map(({ coord, bricks }) => ({
      coord,
      data: bricks.length === 0 ? null : encodeChunk(bricks.map(toBrickData), coord.cx, coord.cy, coord.cz),
    }));
    world.clearDirty();
    await storage.save(writes);
    // 새로 생긴 청크도 인덱스에 넣어야 나중에 스트리밍으로 다시 올라온다
    for (const w of writes) {
      const k = chunkKey(w.coord.cx, w.coord.cy, w.coord.cz);
      if (w.data === null) chunkIndex.delete(k);
      else chunkIndex.set(k, w.coord);
    }
    set({ saveState: world.hasUnsaved ? 'pending' : 'saved' });
  },

  indexedChunks: () => chunkIndex.size,
  backend: 'local',
}));
