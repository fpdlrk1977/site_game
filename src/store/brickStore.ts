// 브릭 프로토타입 스토어 (P0) — 기준: doc/BRICK_SYSTEM.md §8
//
// P0는 메모리만 쓴다. 저장·청크·스트리밍은 P1~P2다.
// BrickWorld는 성능상 mutable이라 참조가 안 바뀐다 → `version`을 올려 리렌더를 유발한다.

import { create } from 'zustand';
import {
  CELL_X, CELL_Y, CELL_Z, CHUNK_X, CHUNK_Z, chunkKey, chunkOfY,
  type ChunkCoord, type Rot,
} from '@/lib/brick/grid';
import { extentOf, PARTS, type BrickPart, type MatClass, type PartId } from '@/lib/brick/parts';
import { bricksOfProp, propBox, type PropId } from '@/lib/brick/props';
import { nextExactTip, nextSpin } from '@/lib/brick/rotation';
import type { StudStyle } from '@/lib/brick/brickGeometry';
import { decodeChunk, encodeChunk, toBrickData } from '@/lib/brick/serialize';
import { localBrickStorage, supabaseBrickStorage, type BrickStorage, type ChunkWrite } from '@/lib/brick/storage';
import { loadRecentColors, pushRecentColor } from '@/lib/brick/colorPrefs';
import { disposeRegionLights } from '@/components/brick/BrickInstances';
import { demoRoom, roomSpawn } from '@/lib/brick/demoRoom';
import { unitsOf } from '@/lib/brick/units';
import { BrickWorld } from '@/lib/brick/world';
import { deepenAround, forgetTerrainChunk, generateSurface, noteLoadedTerrain, resetTerrainState, SURFACE_Y, terrainKey, type TerrainGenerated } from '@/lib/brick/terrain';

/** 도구 — 왼쪽 클릭이 무슨 뜻인지 결정한다 */
export type Tool = 'place' | 'erase';


/** 팔레트 — P1에서 청크 팔레트로 승격된다 */
// ★ 흰색이 첫 칸이다 — **기본 색이자 가장 많이 쓰는 색**이라 첫 칸에 둔다(사용자 요청).
//   빨강은 흰색이 있던 자리로 옮겼다.
export const BRICK_COLORS = [
  '#ffffff', '#0d69ab', '#f2cd37', '#237841', '#d01012',
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

// ── 되돌리기 ─────────────────────────────────────────────────────────────
//
// ★ **스냅샷이 아니라 명령을 쌓는다.**
//   구 오브젝트 에디터는 편집마다 `objects` 배열 전체를 복사해 히스토리에 넣었다.
//   브릭 월드는 기본이 1만 개가 넘고 무한히 커지므로, 같은 방식이면 **브릭 하나 놓을 때마다
//   월드를 통째로 복사**하게 된다. 브릭 편집은 실제로 일어나는 일이 둘뿐이라(추가·삭제)
//   그 둘만 기록하면 정확히 되돌릴 수 있다.
//
// ⚠️ **id는 재발급된다.** 되돌리며 다시 놓으면 새 id가 나오므로 op의 id를 갱신해야
//   다시 실행(redo)이 같은 브릭을 가리킨다.

/** 브릭 하나를 되살리기 위한 값. id는 재발급되므로 담지 않는다 */
type BrickSnap = { part: PartId; x: number; y: number; z: number; rot: Rot; color: string; mat: MatClass; tex: number };
/** add = 새로 생김(되돌리기 = 지우기) · del = 사라짐(되돌리기 = 되살리기) */
type UndoOp = { kind: 'add' | 'del'; id: number; b: BrickSnap };
/** 되돌리기 한 단계 — 한 제스처(드래그 한 획 등)가 여러 op일 수 있다 */
type UndoEntry = UndoOp[];

/** 되돌리기 깊이. 브릭 레코드는 7바이트라 메모리는 문제가 아니고, 너무 깊으면 "어디로 돌아가는지" 감이 사라진다 */
const UNDO_LIMIT = 100;

const undoStack: UndoEntry[] = [];
const redoStack: UndoEntry[] = [];
/** 열려 있으면 op가 여기 모인다 — 드래그 한 획이 되돌리기 한 번이 되게 */
let batch: UndoEntry | null = null;

function pushEntry(e: UndoEntry): void {
  if (e.length === 0) return;
  undoStack.push(e);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0; // 새 편집이 생기면 다시 실행할 미래는 사라진다
}

/**
 * 한 조작이 만든 op 여러 개를 **한 단계로** 기록한다.
 *
 * ★ op마다 따로 기록하면 배치 밖에서 **op 하나가 한 단계**가 되어,
 *   지형을 한 번 팠는데 Ctrl+Z를 수십 번 눌러야 원상복구된다(그 사이 상태는 반쯤 파인 채다).
 *   실제로 그 버그가 났다. **브릭 하나짜리 조작도 이 함수를 쓴다** —
 *   `2×4` 한 번이 단위 여덟 개인 지금은 "하나짜리 조작"이라는 게 사실상 없다(§20).
 */
function recordAll(ops: UndoOp[]): void {
  if (ops.length === 0) return;
  if (batch) batch.push(...ops);
  else pushEntry(ops);
}

const snapOf = (b: { part: PartId; x: number; y: number; z: number; rot: Rot; color: string; mat: MatClass; tex: number }): BrickSnap =>
  ({ part: b.part, x: b.x, y: b.y, z: b.z, rot: b.rot, color: b.color, mat: b.mat, tex: b.tex });

/** 되돌릴 수 없는 조작(전체 지우기 등) 뒤엔 스택을 비운다 — 못 되돌리면서 되돌릴 수 있는 척하면 안 된다 */
function resetHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  batch = null;
}

/**
 * op 하나를 되돌린다(add ↔ del 뒤집기).
 *
 * ⚠️ **실패해도 조용히 넘어간다.** 되돌리려는 브릭이 없거나(멀리 걸어가 청크가 내려감)
 *   되살릴 자리가 막혔을 수 있다. 여기서 던지면 되돌리기 도중에 월드가 반쯤 바뀐 채 멈춘다.
 */
function applyReverse(world: BrickWorld, op: UndoOp): void {
  if (op.kind === 'add') {
    world.remove(resolveId(world, op));
  } else {
    const nid = world.place(op.b.part, op.b.x, op.b.y, op.b.z, op.b.rot, op.b.color, op.b.mat, op.b.tex);
    if (nid !== null) op.id = nid; // id 재발급 — 다시 실행이 같은 브릭을 가리키도록
  }
}

/** op 하나를 다시 실행한다(원래 방향) */
function applyForward(world: BrickWorld, op: UndoOp): void {
  if (op.kind === 'add') {
    const nid = world.place(op.b.part, op.b.x, op.b.y, op.b.z, op.b.rot, op.b.color, op.b.mat, op.b.tex);
    if (nid !== null) op.id = nid;
  } else {
    world.remove(resolveId(world, op));
  }
}

/**
 * op이 가리키는 브릭의 **현재** id.
 * 되살릴 때마다 id가 새로 발급되므로, 기록해 둔 id가 이미 없으면 **그 자리(앵커 칸)에 있는 것**으로 찾는다.
 */
function resolveId(world: BrickWorld, op: UndoOp): number {
  if (world.bricks.has(op.id)) return op.id;
  return world.at(op.b.x, op.b.y, op.b.z) ?? op.id;
}

function afterHistory(set: (fn: (s: BrickState) => Partial<BrickState>) => void): void {
  set((s) => ({
    version: s.version + 1,
    saveState: 'pending',
    undoDepth: undoStack.length,
    redoDepth: redoStack.length,
  }));
  scheduleLight(set as Parameters<typeof scheduleLight>[0]);
}

interface BrickState {
  world: BrickWorld;
  version: number;

  part: PartId;
  rot: Rot;
  color: string;
  mat: MatClass;

  /**
   * 현재 도구. **액션은 왼쪽 버튼 하나로만** 한다.
   *
   * ★ 예전엔 우클릭이 삭제였는데, 오른쪽 버튼은 **카메라 회전도** 물고 있었다.
   *   드래그로 화면을 돌리고 떼면 `contextmenu`가 그대로 발동해 **브릭이 지워졌다**.
   *   버튼 하나에 두 뜻을 담으면 이런 충돌이 계속 생긴다.
   *   게다가 우클릭은 **모바일·트랙패드에 없다** — 웹 서비스라 이게 결정적이다.
   */
  tool: Tool;
  setTool: (t: Tool) => void;

  /**
   * 걷기 모드 — 지은 공간 **안에 들어가** 걸어 다닌다(`BRICK_PLAN.md` §6).
   *
   * ★ 켜지면 짓기·궤도 카메라가 **함께** 꺼진다. 한 화면에서 두 조작 체계가 동시에 살아 있으면
   *   좌클릭이 무슨 뜻인지 알 수 없다(예전 우클릭 = 회전 + 삭제와 같은 실수).
   */
  walking: boolean;
  setWalking: (w: boolean) => void;
  /**
   * 걷기를 시작할 자리(월드 미터). 있으면 카메라 대신 여기서 시작한다.
   *
   * ★ 이게 없으면 "방을 만들고 그 안에서 시작하기"를 하려고 **카메라를 먼저 옮긴 뒤** 걷기를 켜야 하는데,
   *   그러면 두 effect의 실행 순서에 기대게 된다(한쪽이 먼저 돌면 엉뚱한 데서 시작한다).
   *   값으로 넘기면 순서와 무관해진다.
   */
  walkSpawn: [number, number, number] | null;

  /** 돌기 모양 — 레고와의 시각적 차별화 검토용(BRICK_SYSTEM.md §8.5). 저장 데이터엔 영향 없음 */
  studStyle: StudStyle;
  setStudStyle: (s: StudStyle) => void;

  /**
   * 고른 **소품**(`BRICK_PLAN.md` §22). `null`이면 파츠를 놓는다.
   *
   * ★ 소품은 **자기 색·재료를 갖는다** — 팔레트에서 고른 색을 안 쓴다. 그래야 "소품"이지 "붓"이 아니다.
   */
  prop: PropId | null;
  setProp: (p: PropId | null) => void;
  /** 지금 놓을 것의 **바깥 상자** — 배치·고스트·막힘 판정이 전부 이걸 쓴다 */
  placingBox: () => BrickPart;

  setPart: (p: PartId) => void;
  setRot: (r: Rot) => void;
  /** 제자리 회전(R) — 눕힌 상태는 그대로 두고 네 방향을 돈다 */
  rotate: () => void;
  /**
   * 뒤집기(Shift+R) — 어느 면이 위를 보는지 바꾼다.
   *
   * ★ 회전과 **따로 둔 이유**: 한 버튼에 다 넣으면 원하는 방향까지 여러 번 눌러야 한다.
   *   "어느 면이 위인가"와 "그 상태에서 몇 도"는 사람이 따로 생각하는 축이다.
   *
   * ⚠️ **지금은 위아래 뒤집기뿐이다** — 옆으로 눕히기는 격자가 정육면체가 아니라 아직 못 한다
   *   (`rotation.ts`의 `isGridExact`, `BRICK_PLAN.md` §14). `nextExactTip`이 그 경계를 지킨다.
   */
  tipOver: () => void;
  setColor: (c: string) => void;
  /** 고르개에서 **확정한** 임의 색 — 현재 색으로 쓰고 최근 목록에 남긴다(드래그 중엔 setColor만 쓴다) */
  rememberColor: (c: string) => void;
  /** 저장된 최근 색을 불러온다 — **마운트 후(클라이언트에서)** 부른다 */
  hydrateRecentColors: () => void;
  /** 최근에 쓴 임의 색(기기에 남는다) */
  recentColors: string[];
  setMat: (m: MatClass) => void;
  /** 무늬(재료) 칸 번호 — 0 = 민짜. `lib/brick/textures.ts` */
  tex: number;
  /** 재료를 고르면 **기본색도 함께** 잡아 준다(잔디→녹색). 색은 그 뒤에 바꿔도 된다 */
  setTex: (t: number) => void;

  /** 놓기 — 새 브릭 id, 못 놓으면 null */
  /** 한 제스처를 되돌리기 한 단계로 묶는다(포인터 down/up) */
  beginBatch: () => void;
  endBatch: () => void;
  undo: () => void;
  redo: () => void;
  /** 남은 단계 수 — 나중에 버튼을 달 때 활성/비활성에 쓴다 */
  undoDepth: number;
  redoDepth: number;

  place: (x: number, y: number, z: number) => number | null;
  removeBrick: (id: number) => void;
  /** 전체 지우기 — 저장소까지 비워 **처음 상태**로 되돌린다 */
  clear: () => Promise<void>;
  /** 스트레스 테스트 — 꽉 찬 직육면체를 채워 폴리곤 예산을 잰다 */
  stressFill: (studsX: number, studsZ: number, layers: number) => void;

  /**
   * **데모 방 하나를 통째로 만든다**(`BRICK_PLAN.md` §23) — 되돌리기 한 번으로 사라진다.
   * 돌아오는 값은 방 안에서 설 자리(월드 미터)라, 호출부가 카메라를 거기로 옮기고 걷기를 켠다.
   */
  buildDemoRoom: () => [number, number, number];

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
/**
 * 로드 반경(청크). 8m/청크 → 6이면 약 48m.
 *
 * ★ 배경의 **먼 땅 고리**가 이 값에 기댄다 — 고리의 구멍이 이 반경보다 작아야
 *   진짜 지형과 겹쳐서 틈이 안 생긴다(`lib/brick/backdrop.ts`의 `FAR_GROUND_INNER`).
 *   그래서 내보낸다. 여기를 줄이면 **먼 땅 구멍도 같이 줄여야** 한다(테스트가 잡는다).
 */
export const LOAD_R = 6;
/** 언로드 반경 — 로드보다 넓게 잡아야 경계에서 껌뻑이지 않는다(히스테리시스) */
const UNLOAD_R = 9;
/** 한 번에 읽는 청크 수. 사이사이 양보해 화면이 안 멈추게 */
const LOAD_BATCH = 24;

/** 저장소에 있는 청크 목록(데이터 아님) — 로드 대상 판단에만 쓴다 */
const chunkIndex = new Map<number, ChunkCoord>();
/** 스트리밍 재진입 방지 */
let streaming = false;
/** 마지막으로 스트리밍한 중심 — 전체 지우기 뒤 그 자리에 바닥을 다시 깔 때 쓴다 */
const lastCenter = { x: 0, z: 0 };

/** 지형을 이미 깔아 준 청크 열 — 다 파낸 청크가 되살아나지 않게 한다 */
const terrainDone: TerrainGenerated = new Set();
/** 지면(y=0 부근)이 속한 청크층 */
export const GROUND_CY = chunkOfY(SURFACE_Y);

/**
 * 저장된 청크가 "이 기둥의 지형은 이미 깔았다"를 증명하는가.
 *
 * ★ **지면층 청크만** 증명한다. 청크는 세로로도 나뉘므로(`CHUNK_Y=32`),
 *   지면에 놓은 브릭(y 0..2)은 지형(y −3..−1)과 **다른 층**에 저장된다.
 *   층을 안 가리면 "브릭만 든 청크"를 읽고서 지형을 깔았다고 착각해
 *   그 기둥(8m×8m) 흙이 통째로 안 생긴다 — 브릭 하나 놓고 새로고침하면 땅이 패였다.
 */
export function provesTerrainGenerated(c: ChunkCoord): boolean {
  return c.cy === GROUND_CY;
}

function markTerrainGenerated(c: ChunkCoord): void {
  terrainDone.add(terrainKey(c.cx, c.cz));
}

/**
 * 저장소는 갈아끼운다 — 프로토타입은 localStorage, 씬에 붙으면 Supabase(`brick_chunks`).
 * P1에서 어댑터로 둔 이유가 이것이다. 인터페이스가 같아 나머지 코드는 그대로다.
 */
let storage: BrickStorage = localBrickStorage('proto');

/**
 * 씬에 연결 — 이후 로드/저장이 그 씬의 `brick_chunks`로 간다.
 * (훅이 아니다 — 모듈 상태를 바꾸는 부수효과라 effect에서 부를 것)
 */
/**
 * 지금 붙어 있는 대상 — **같은 대상에 다시 붙이지 않기 위한** 표식.
 *
 * ★ 이게 없으면 편집물이 날아간다: 에디터의 ▶플레이는 **같은 페이지에 뷰어를 겹쳐** 띄우고,
 *   뷰어가 같은 씬에 다시 붙으면 `setBrickStorage`가 **월드를 새로 만들어** 미저장 편집을 버린다.
 *   컴포넌트 재마운트마다 다시 읽는 낭비도 함께 막는다.
 */
let attachedKey: string | null = null;

export function attachBrickStorage(sceneId: string | null): void {
  const key = sceneId ?? '__local__';
  if (attachedKey === key) return; // 같은 대상 — 월드를 건드리지 않는다
  setBrickStorage(sceneId ? supabaseBrickStorage(sceneId) : localBrickStorage('proto'));
  attachedKey = key;
  useBrickStore.setState({ backend: sceneId ? 'db' : 'local' });
}

/**
 * 저장소를 직접 갈아끼운다 — **새로고침과 같은 상태**로 되돌린다(월드·인덱스·지형 기록 초기화).
 * 테스트에서 메모리 저장소를 물릴 때 쓴다. 앱 코드는 `attachBrickStorage`를 쓸 것.
 */
export function setBrickStorage(s: BrickStorage): void {
  storage = s;
  attachedKey = null; // 직접 갈아끼웠으니 표식을 지운다(다음 attach가 제대로 돌게)
  chunkIndex.clear();
  terrainDone.clear();
  resetTerrainState();
  // ★ 걷기도 끈다 — 월드가 통째로 바뀌는데 서 있던 자리를 들고 있으면 **허공에서 시작**한다
  useBrickStore.setState({ world: new BrickWorld(), version: 0, loaded: false, saveState: 'idle', walking: false, walkSpawn: null });
}

export const useBrickStore = create<BrickState>()((set, get) => ({
  world: new BrickWorld(),
  version: 0,

  part: 'b2x4',
  rot: 0,
  color: BRICK_COLORS[0],
  recentColors: [], // ★ 초기값은 반드시 빈 배열 — 초기화에서 localStorage를 읽으면 SSR과 어긋난다(hydrateRecentColors 참고)
  mat: 'opaque',
  // 기본값 = **라인**(사용자 확인 2026-08-05 — *"모따기는 없어도 될 것 같아"*).
  // 민짜 상자 + 셰이더 외곽선이라 브릭 경계는 그대로 읽히고, **삼각형이 브릭당 108 → 12**다.
  //
  // ★ 제품의 얼굴은 기본값이 정한다 — 스크린샷·템플릿·대부분의 콘텐츠가 이 모양으로 나온다
  //   (BRICK_SYSTEM.md §8.5). 모따기는 룩 때문에 골랐던 것인데, **실제로 걸어 보고**
  //   없어도 된다는 판정이 나왔다. 폴리곤이 9배 싸지는 건 덤이다.
  //   다시 보고 싶으면 도구 패널의 **돌기 모양**에서 한 번만 누르면 된다.
  studStyle: 'line',

  setStudStyle: (s) => {
    set({ studStyle: s });
    void storage.saveSettings({ studStyle: s });
  },

  tool: 'place',
  setTool: (t) => set({ tool: t }),

  walking: false,
  setWalking: (w) => set({ walking: w, ...(w ? {} : { walkSpawn: null }) }),
  walkSpawn: null,

  prop: null,
  // 소품과 파츠는 **둘 중 하나만** 골라져 있다 — 한쪽을 고르면 다른 쪽은 풀린다
  setProp: (p) => set({ prop: p }),
  placingBox: () => {
    const s = get();
    return s.prop ? propBox(s.prop) : PARTS[s.part];
  },

  setPart: (p) => set({ part: p, prop: null }),
  setRot: (r) => set({ rot: r }),
  rotate: () => set((s) => ({ rot: nextSpin(s.rot) as Rot })),
  tipOver: () => set((s) => ({ rot: nextExactTip(s.rot) as Rot })),
  setColor: (c) => set({ color: c }),
  // 고르개로 만든 색만 최근 목록에 남긴다 — 기본 팔레트는 이미 위에 있으므로 중복이다
  rememberColor: (c) => set((s) => ({ color: c, recentColors: pushRecentColor(s.recentColors, c) })),
  hydrateRecentColors: () => set({ recentColors: loadRecentColors() }),
  setMat: (m) => set({ mat: m }),

  tex: 0,
  // ★ 재료를 고르면 색을 **흰색으로** 되돌린다 — 무늬가 자기 색을 갖고 있고 그 위에 색이 곱해지므로,
  //   흰색이라야 재료 본래 색이 그대로 나온다(마인크래프트 잔디 틴트와 같은 구조).
  //   색을 고르면 그때부터 그 색으로 물든다(빨간 벽돌 × 파랑 = 푸른 벽돌).
  setTex: (t) => set(t === 0 ? { tex: 0 } : { tex: t, color: '#ffffff' }),

  // ── 되돌리기 ───────────────────────────────────────────────────────────
  undoDepth: 0,
  redoDepth: 0,

  beginBatch: () => { batch = []; },
  endBatch: () => {
    const b = batch;
    batch = null;
    if (b) pushEntry(b);
    set({ undoDepth: undoStack.length, redoDepth: redoStack.length });
  },

  undo: () => {
    const e = undoStack.pop();
    if (!e) return;
    const { world } = get();
    // **역순으로** 되돌린다 — 나중에 일어난 일부터 취소해야 중간 상태가 맞는다
    for (let i = e.length - 1; i >= 0; i--) applyReverse(world, e[i]);
    redoStack.push(e);
    afterHistory(set);
  },

  redo: () => {
    const e = redoStack.pop();
    if (!e) return;
    const { world } = get();
    // 다시 실행은 **원래 순서대로**
    for (const op of e) applyForward(world, op);
    undoStack.push(e);
    afterHistory(set);
  },

  /**
   * 놓기 — 고른 파츠를 **1×1 단위 여러 개**로 펼쳐 놓는다(`BRICK_PLAN.md` §20).
   * 돌아오는 값은 **첫 단위의 id**(호출부는 "놓였나/안 놓였나"만 본다).
   *
   * ★ **막힘 판정은 큰 파츠의 AABB로 한 번에** 한다 — 단위들이 그 AABB를 정확히 채우므로 결과가 같고,
   *   단위마다 따로 검사하면 **부분 배치**가 되어 "겨눈 대로 놓거나 빨강" 규칙이 깨진다(E-00).
   *
   * ★ `place` 대신 `placeFast` × N + `refreshPending()` 한 번을 쓴다 —
   *   `place`는 브릭마다 이웃 가시성을 다시 잡아서, 단위 여덟 개면 그 일을 여덟 번 한다.
   *   ⚠️ `placeFast`는 가시성을 안 잡으므로 **`refreshPending()`을 빠뜨리면 브릭이 조용히 안 그려진다**(C-1).
   */
  place: (x, y, z) => {
    const { world, part, prop, rot, color, mat, tex } = get();
    // 놓을 것 = 소품이면 그 브릭들, 아니면 고른 파츠를 1×1 단위로 펼친 것.
    // ★ 소품은 **자기 색·재료**를 들고 오므로 팔레트 값을 안 쓴다(§22).
    const put = prop
      ? bricksOfProp(prop, x, y, z, rot)
      : unitsOf(part, x, y, z, rot).map((u) => ({ ...u, color, mat, tex }));

    const box = extentOf(prop ? propBox(prop) : PARTS[part], rot);
    if (!world.canPlaceBox(x, y, z, box.ex, box.ey, box.ez)) return null;

    let first: number | null = null;
    const ops: UndoOp[] = [];
    for (const u of put) {
      const id = world.placeFast(u.part, u.x, u.y, u.z, u.rot, u.color, u.mat, u.tex);
      if (id === null) continue;
      if (first === null) first = id;
      ops.push({ kind: 'add', id, b: { part: u.part, x: u.x, y: u.y, z: u.z, rot: u.rot, color: u.color, mat: u.mat, tex: u.tex } });
    }
    world.refreshPending();
    if (first === null) return null;
    // ★ 단위 여덟 개는 **한 번의 조작**이다 — `record`를 여덟 번 부르면 Ctrl+Z를 여덟 번 눌러야 한다
    recordAll(ops);
    set((s) => ({ version: s.version + 1, saveState: 'pending', undoDepth: undoStack.length, redoDepth: redoStack.length }));
    scheduleLight(set);
    return first;
  },


  removeBrick: (id) => {
    const { world } = get();
    const b = world.bricks.get(id);
    if (!b) return;
    const before = snapOf(b);
    // 지형을 파면 **먼저 아래를 채운다** — 그래야 구멍에 벽과 바닥이 생긴다.
    //   (판 뒤에 채우면 방금 판 자리가 되살아난다)
    //   ★ 이때 새 브릭이 여러 개 생긴다 — **그것도 되돌림 대상**이라 id 범위로 잡아 둔다.
    const idFrom = world.nextBrickId;
    if (b.part === 'terrain') deepenAround(world, b.x, b.y, b.z);
    const filled: UndoOp[] = [];
    for (let nid = idFrom; nid < world.nextBrickId; nid++) {
      const nb = world.bricks.get(nid);
      if (nb) filled.push({ kind: 'add', id: nid, b: snapOf(nb) });
    }
    if (world.remove(id)) {
      world.refreshPending(); // deepenAround가 placeFast라 가시성을 다시 굽는다(주변만)
      // ★ 한 단계로 묶는다 — 판 브릭과 그때 채워진 브릭은 **같은 한 번의 조작**이다
      recordAll([...filled, { kind: 'del', id, b: before }]);
      set((s) => ({ version: s.version + 1, saveState: 'pending', undoDepth: undoStack.length, redoDepth: redoStack.length }));
      scheduleLight(set);
    }
  },

  /**
   * 전체 지우기 = **처음 상태로**. 저장소까지 비운다.
   *
   * ★ 예전엔 월드만 비우고 "빈 청크는 저장 시 삭제된다"에 기댔다. 그런데 지면층은
   *   **비어도 남기도록** 바뀌어서(판 구덩이가 되메워지지 않게), 그 빈 청크가
   *   "지형을 다 파냈다"로 읽혀 **새로고침하면 바닥이 영영 안 깔렸다.**
   *   지우기는 "다 팠다"가 아니라 "없던 일로 한다"이므로 저장소를 통째로 비워야 맞다.
   */
  clear: async () => {
    const { world } = get();
    world.clear();
    // ★ GPU에 구워 둔 빛 볼륨도 함께 버린다 — 리전 키가 되살아나면 옛 텍스처를 물고 온다
    disposeRegionLights();
    world.clearDirty(); // 저장소를 통째로 비울 것이라 dirty는 의미가 없다
    chunkIndex.clear();
    terrainDone.clear();
    resetTerrainState();
    // ⚠️ 전체 지우기는 **되돌릴 수 없다** — 저장소까지 비우므로 메모리에 없던 청크는 복원할 길이 없다.
    //    되돌릴 수 있는 척하지 않고 스택을 비운다.
    resetHistory();
    set((s) => ({ version: s.version + 1, saveState: 'idle', undoDepth: 0, redoDepth: 0 }));
    await storage.clear();
    // 바닥을 바로 다시 깔아 준다 — 안 그러면 카메라를 움직일 때까지 빈 화면이다
    await get().streamAround(lastCenter.x, lastCenter.z);
    // 🔴 **빛을 반드시 다시 굽는다** (사용자 보고: 전체 지우기 뒤 바닥에 그림자가 남는다).
    //   `streamAround`는 **저장된 청크를 읽었을 때만** 빛을 다시 굽는데, 전체 지우기 직후엔
    //   저장소가 비어 있어 그 조건이 거짓이다 → 지운 브릭이 드리우던 그늘이 그대로 남았다.
    get().world.recomputeLight();
    set((s) => ({ version: s.version + 1 }));
  },

  /**
   * 데모 방 — **지면 위에** 짓는다. 지형과 겹치지 않도록 y=0(지면)부터 올린다.
   *
   * ★ 원점에서 조금 떨어뜨린다 — 이미 지어 둔 것 위에 덮어쓰면 남의 작업이 사라진다.
   *   막힌 칸은 `placeFast`가 알아서 건너뛰므로 최악이라도 방이 덜 지어질 뿐이다.
   */
  buildDemoRoom: () => {
    const { world } = get();
    const OX = 24, OY = 0, OZ = 24;
    const idFrom = world.nextBrickId;
    for (const b of demoRoom(OX, OY, OZ)) {
      world.placeFast(b.part, b.x, b.y, b.z, b.rot, b.color, b.mat, b.tex);
    }
    world.refreshPending();
    // ★ 한 번의 조작 = 되돌리기 한 단계. 마음에 안 들면 Ctrl+Z 한 번에 사라져야 한다
    const ops: UndoOp[] = [];
    for (let id = idFrom; id < world.nextBrickId; id++) {
      const nb = world.bricks.get(id);
      if (nb) ops.push({ kind: 'add', id, b: snapOf(nb) });
    }
    recordAll(ops);
    set((s) => ({ version: s.version + 1, saveState: 'pending', undoDepth: undoStack.length, redoDepth: redoStack.length }));
    world.recomputeLight(); // 실내는 빛이 확 달라진다 — 디바운스를 기다릴 이유가 없다
    const [sx, sy, sz] = roomSpawn(OX, OY, OZ);
    const at: [number, number, number] = [(sx + 0.5) * CELL_X, sy * CELL_Y, (sz + 0.5) * CELL_Z];
    set({ walkSpawn: at });
    return at;
  },

  stressFill: (studsX, studsZ, layers) => {
    const { world, color } = get();
    // 2×4 브릭을 격자로 빽빽이. 대량이라 placeFast + 마지막에 한 번 recomputeAll
    // ★ **실제 배치와 같은 경로로** 단위까지 펼친다 — 안 그러면 스트레스 수치가 진짜보다 8배 작게 나온다.
    for (let ly = 0; ly < layers; ly++) {
      for (let ix = 0; ix < studsX; ix += 2) {
        for (let iz = 0; iz < studsZ; iz += 4) {
          for (const u of unitsOf('b2x4', ix, ly * 3, iz, 0)) {
            world.placeFast(u.part, u.x, u.y, u.z, u.rot, color, 'opaque');
          }
        }
      }
    }
    world.recomputeAll();
    world.recomputeLight(); // 대량 생성/불러오기 직후엔 바로 굽는다(디바운스 불필요)
    resetHistory(); // 12만 개를 op로 쌓을 이유가 없다(스트레스 테스트 전용)
    set((s) => ({ version: s.version + 1, saveState: 'pending', undoDepth: 0, redoDepth: 0 }));
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
    lastCenter.x = camX; lastCenter.z = camZ;
    if (streaming) return;
    const { world } = get();
    const ccx = Math.floor(camX / (CHUNK_X * CELL_X));
    const ccz = Math.floor(camZ / (CHUNK_Z * CELL_Z));

    // ── 내릴 것: 언로드 반경 밖 (히스테리시스 — 경계에서 껌뻑이지 않게)
    // ★ 내릴 것은 **월드가 실제로 들고 있는 청크**에서 고른다.
    //   저장소 목록(`chunkIndex`)으로 판정하면 **생성한 지형이 영원히 안 내려간다** —
    //   손 안 댄 지형은 저장하지 않으므로 그 목록에 없고, `if (!c) continue`로 다 빠져나갔다.
    //   실측: 걸어 다니다 보니 로드 8,215청크 / 브릭 525,760개(정상은 약 169청크).
    const toUnload: number[] = [];
    const unloadCoords = new Map<number, ChunkCoord>();
    for (const { key, coord: c } of world.loadedChunks()) {
      if (Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz)) > UNLOAD_R) {
        toUnload.push(key);
        unloadCoords.set(key, c);
      }
    }

    // ── 올릴 것: 로드 반경 안. **세로는 전부** 올린다 —
    //    아래 청크가 없으면 기둥 높이(colTop)가 틀려 브릭이 엉뚱한 높이에 얹힌다.
    const toLoad: { key: number; c: ChunkCoord; d: number }[] = [];
    for (const [key, c] of chunkIndex) {
      if (world.hasChunk(key)) continue;
      const d = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz));
      if (d <= LOAD_R) toLoad.push({ key, c, d });
    }
    toLoad.sort((a, b) => a.d - b.d); // 가까운 것부터

    streaming = true;
    try {
      // 지형 생성분은 저장하지 않으므로(아래 clearDirty), 사용자가 편집한 것은 **먼저 저장**해 둔다
      await get().flush();

      // 내릴 때 **지형 기록도 잊는다** — 안 그러면 되돌아왔을 때 "이미 깔았다"며
      // 땅을 다시 안 깐다. (판 자리는 저장소에 남아 있어 다시 로드되면서 복원된다)
      for (const key of toUnload) {
        const c = unloadCoords.get(key);
        if (c && provesTerrainGenerated(c)) {
          terrainDone.delete(terrainKey(c.cx, c.cz));
          forgetTerrainChunk(c);
        }
        world.unloadChunk(key);
      }

      // 나눠 읽는다 — 한 번에 다 읽으면 화면이 멈춘다(12만 브릭에서 3초였다)
      let loadedAny = false;
      for (let i = 0; i < toLoad.length; i += LOAD_BATCH) {
        for (const { c } of toLoad.slice(i, i + LOAD_BATCH)) {
          const data = await storage.loadChunk(c);
          if (!data) continue;
          loadedAny = true;
          if (provesTerrainGenerated(c)) markTerrainGenerated(c); // 지면층만 지형을 증명한다
          for (const d of decodeChunk(data, c.cx, c.cy, c.cz)) {
            // ★ 옛 저장물의 큰 파츠(`b2x4` 등)는 **읽으면서 1×1 단위로 갈라진다**(§20 지연 마이그레이션).
            //   저장소는 안 건드린다 — 그 청크를 편집하면 그때 단위로 다시 저장된다.
            //   ⚠️ 여기서 안 펼치면 **옛 월드만 안 쪼개진 채 남는다.** 에러도 안 나고 화면도 그럴듯하다.
            // ⚠️ `tex`(무늬)를 빠뜨리면 **기본값 0(민짜)** 이 들어가 저장해 둔 무늬가 통째로 사라진다.
            //   실제로 그랬다(2026-08-02) — 저장·디코드는 멀쩡한데 여기서만 안 넘겨서,
            //   새로고침하면 모든 브릭이 하얗게 변했다. 에러가 없어서 눈으로만 알 수 있었다.
            for (const u of unitsOf(d.part, d.x, d.y, d.z, d.rot)) {
              world.placeFast(u.part, u.x, u.y, u.z, u.rot, d.color, d.mat, d.tex);
            }
            // 불러온 지형의 최하단을 학습 — 이어서 팔 때 판 자리가 되살아나지 않게
            if (d.part === 'terrain') noteLoadedTerrain(world, d.x, d.y, d.z);
          }
        }
        set((s) => ({ version: s.version + 1 })); // 들어온 만큼 바로 보여준다
        if (i + LOAD_BATCH < toLoad.length) await new Promise((r) => setTimeout(r, 0));
      }

      // ★ 바닥 깔기 — **저장된 청크가 하나도 없어도 반드시 돈다.**
      //   예전엔 위에서 "올릴 것도 내릴 것도 없으면 return" 했는데, 빈 월드에선 항상 그 조건이라
      //   바닥이 아예 안 생겼다(브릭을 하나 놓아 청크가 생겨야 비로소 돌았다).
      let generated = 0;
      for (let dcx = ccx - LOAD_R; dcx <= ccx + LOAD_R; dcx++) {
        for (let dcz = ccz - LOAD_R; dcz <= ccz + LOAD_R; dcz++) {
          generated += generateSurface(world, { cx: dcx, cy: GROUND_CY, cz: dcz }, terrainDone);
        }
      }

      if (toLoad.length === 0 && toUnload.length === 0 && generated === 0) return;

      // 들어온 것 주변만 다시 굽는다 — 전량 재계산은 리전을 전부 되만들어 이동이 끊긴다
      world.refreshPending();
      // 읽어온 것·생성한 지형은 저장 대상이 아니다(손대지 않은 바닥까지 저장하면 낭비).
      // 파거나 놓는 순간 그 청크가 dirty가 되어 그때 저장된다.
      world.clearDirty();
      set((s) => ({ version: s.version + 1 }));
      // ★ 빛은 **저장된 청크를 읽어온 때만** 다시 굽는다.
      //   새로 깐 지형은 윗면이 열린 하늘(O(1))·옆은 이웃 지형·아래는 안 판 땅이라
      //   빛 지도에 아무것도 더하지 않는다. 그걸 확인하려고 전 기둥을 훑을 이유가 없다.
      if (loadedAny) scheduleLight(set);
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
      // ★ 빈 청크는 지우지만 **지면층은 비어도 남긴다.**
      //   지우면 다음 로드에서 읽을 게 없어 "지형을 다 파냈다"는 사실이 사라지고,
      //   `generateSurface`가 다시 돌아 **판 구덩이가 도로 메워진다.**
      data: bricks.length === 0 && !provesTerrainGenerated(coord)
        ? null
        : encodeChunk(bricks.map(toBrickData), coord.cx, coord.cy, coord.cz),
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
