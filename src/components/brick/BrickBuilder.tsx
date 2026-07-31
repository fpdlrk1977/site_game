'use client';

// 브릭 짓기 — **렌더 + 상호작용을 한 덩어리로** 담은 공용 컴포넌트. `<Canvas>` 안에 넣는다.
//
// ★ 왜 공용으로 뽑았나: 프로토타입(`/test/brick`)과 에디터가 **각자 배선하면 반드시 갈라진다.**
//   이 세션에서 배치 규칙이 네 번 바뀌었고, 두 곳에 흩어져 있었다면 한쪽만 고쳐졌을 것이다.
//   → 규칙은 여기 한 군데만 있다.
//
// ★ 포인터 이벤트를 **직접 캔버스 DOM에 붙인다**(부모가 배선하지 않는다).
//   그래야 얹는 쪽은 `<BrickBuilder/>` 한 줄이면 되고, 부모의 클릭 처리와 섞이지 않는다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { anchorCenterWorld, anchorFromFace, faceOf, type FaceAxis, type FacePlacement } from '@/lib/brick/placement';
import {
  beginEraseStroke, canEraseInStroke, beginPlaceStroke, canPlaceInStroke, strokeAnchor, dominantAxis, axisSteps,
  type EraseLock, type PlaceLock,
} from '@/lib/brick/strokeLock';
import { CELL_X, CELL_Y, CELL_Z, worldToCellX, worldToCellY, worldToCellZ } from '@/lib/brick/grid';
import { brickGeometry, type StudStyle } from '@/lib/brick/brickGeometry';
import { PARTS } from '@/lib/brick/parts';
import type { BrickWorld } from '@/lib/brick/world';
import { useBrickStore, type Tool } from '@/store/brickStore';
import { BrickInstances, type BrickHit } from './BrickInstances';
import { PlacementMarker } from './PlacementMarker';

interface Props {
  onStats?: (s: { groups: number; instances: number; tris: number }) => void;
  /** 지금 놓일 자리 — 계기판·안내에 쓴다 */
  onSpot?: (spot: FacePlacement | null, valid: boolean) => void;
}

// 도구별 커서 — 지금 왼쪽 클릭이 무슨 뜻인지 커서만 봐도 알게 한다(SVG data-URI, 외부 파일 없음)
/** 축별 칸 크기 — 줄 긋기에서 월드 거리를 칸으로 환산할 때 쓴다 */
const CELL = [CELL_X, CELL_Y, CELL_Z] as const;

const svgCursor = (body: string, hot = '12 12') =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round">${body}</svg>`,
  )}") ${hot}, crosshair`;
export const PLACE_CURSOR = svgCursor(
  '<path d="M12 4v16M4 12h16" stroke="#111" stroke-opacity=".55" stroke-width="4"/><path d="M12 4v16M4 12h16" stroke="#fff"/>',
);
export const ERASE_CURSOR = svgCursor(
  '<path d="M5 12h14" stroke="#111" stroke-opacity=".55" stroke-width="6"/><path d="M5 12h14" stroke="#ff6b6b" stroke-width="3"/>',
);

/**
 * 지금 실제로 적용되는 도구 — **Ctrl(맥은 Cmd)을 누르고 있으면 일시 반전**된다.
 * 커서 표시는 부모가 자기 DOM에 적용하므로(훅에서 온 값을 직접 바꾸면 안 된다) 훅으로 공유한다.
 */
export function useEffectiveTool(): Tool {
  const tool = useBrickStore((s) => s.tool);
  const [invertHeld, setInvertHeld] = useState(false);
  useEffect(() => {
    const sync = (e: KeyboardEvent) => setInvertHeld(e.ctrlKey || e.metaKey);
    const blur = () => setInvertHeld(false);
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return invertHeld ? (tool === 'place' ? 'erase' : 'place') : tool;
}

/** 도구별 커서 CSS — 부모가 캔버스(또는 감싼 요소)에 적용한다 */
export const brickCursor = (tool: Tool): string => (tool === 'erase' ? ERASE_CURSOR : PLACE_CURSOR);

/**
 * 놓기 획의 좌표원 — 첫 클릭에서 잡은 **표면의 평면**에 커서를 투영해 칸을 돌려준다.
 *
 * ★ 왜 면(hover) 기준이 아니라 평면인가 — **실제로 터진 버그**(2026-07-31):
 *   드래그 중에는 커서가 **방금 놓은 브릭의 옆면**을 짚는다. 그 면은 대개 **카메라를 향한 앞면**이라
 *   `anchorFromFace`가 새 브릭을 **커서 방향이 아니라 내 쪽으로** 붙였고, 그게 이어져 엉뚱한 줄이 생겼다.
 *   평면은 브릭에 가려지지도, 방향이 바뀌지도 않는다 — 커서가 가리키는 **표면 위 그 자리**가 그대로 나온다.
 */
function StrokePlane({ base, onCell }: { base: FacePlacement; onCell: (c: [number, number, number]) => void }) {
  const plane = useMemo(() => {
    const n = new THREE.Vector3(0, 0, 0);
    n.setComponent(base.face.axis, 1);
    return new THREE.Plane(n, -base.planeAt);
  }, [base]);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, pointer }) => {
    ray.setFromCamera(pointer, camera);
    // 시선이 평면과 거의 나란하면 교점이 무한대로 달아난다
    if (Math.abs(ray.ray.direction.getComponent(base.face.axis)) < 0.12) return;
    if (!ray.ray.intersectPlane(plane, hit)) return;
    onCell([worldToCellX(hit.x), worldToCellY(hit.y), worldToCellZ(hit.z)]);
  });
  return null;
}

/**
 * 줄 긋기용 좌표원 — **카메라를 향한 평면**에 커서를 투영해 월드 지점을 돌려준다.
 *
 * 면의 평면을 쓰면 그 평면 위 두 축밖에 못 잰다. 옆면에서 "끈 방향"을 알려면
 * **면 밖으로 나가는 축(법선)** 까지 재야 하므로, 화면을 마주 보는 평면이 필요하다.
 */
function CameraPlane({ origin, onPoint }: { origin: [number, number, number]; onPoint: (x: number, y: number, z: number) => void }) {
  const plane = useMemo(() => new THREE.Plane(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const o = useMemo(() => new THREE.Vector3(...origin), [origin]);
  const n = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, pointer }) => {
    camera.getWorldDirection(n);
    plane.setFromNormalAndCoplanarPoint(n, o);
    ray.setFromCamera(pointer, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    onPoint(hit.x, hit.y, hit.z);
  });
  return null;
}

/** 지우기 도구에서 **어느 브릭이 지워질지** 빨갛게 감싼다 */
function EraseHighlight({ world, brickId, studStyle }: {
  world: BrickWorld; brickId: number | null; studStyle: StudStyle;
}) {
  const b = brickId === null ? undefined : world.bricks.get(brickId);
  const geo = useMemo(() => (b ? brickGeometry(PARTS[b.part], true, studStyle) : null), [b, studStyle]);
  if (!b || !geo) return null;
  const [x, y, z] = anchorCenterWorld({ x: b.x, y: b.y, z: b.z }, b.part, b.rot);
  return (
    <mesh geometry={geo} position={[x, y, z]} rotation={[0, (b.rot * Math.PI) / 2, 0]} raycast={() => null}>
      <meshBasicMaterial color="#f05252" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function BrickBuilder({ onStats, onSpot }: Props) {
  const gl = useThree((s) => s.gl);
  const { world, version, part, rot, studStyle } = useBrickStore();
  const { place, removeBrick } = useBrickStore();
  const { beginBatch, endBatch, undo, redo } = useBrickStore();

  /** 커서 밑 브릭 — 어느 면에 붙일지, 지우기 도구가 무엇을 지울지 결정한다 */
  const [hoverBrick, setHoverBrick] = useState<number | null>(null);
  /** 가리킨 면에 붙을 자리 — 마커가 이것을 그린다 */
  const [spot, setSpot] = useState<FacePlacement | null>(null);

  const anchor = spot?.anchor ?? null;
  const valid = useMemo(
    () => (anchor ? world.canPlace(part, anchor.x, anchor.y, anchor.z, rot) : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, part, rot, world, version],
  );

  useEffect(() => { onSpot?.(spot, valid); }, [spot, valid, onSpot]);

  const effTool = useEffectiveTool();

  /**
   * 드래그 한 획 — 누른 채 끌면 **지나가는 자리에 계속 놓이거나 지워진다.**
   * 바닥 한 층 깔기·벽 한 면 허물기가 한 번에 되고, 한 획 전체가 **되돌리기 한 번**이다.
   *
   * ★ 놓기와 지우기가 **같은 잠금 규칙**을 쓴다(`strokeLock.ts`) — 첫 클릭에서 층·도달 거리를 못 박아
   *   커서가 표면을 벗어나도 엉뚱한 것이 안 지워지고, 엉뚱한 층에 안 놓인다.
   *   단 **판정 대상이 다르다**: 지우기는 "커서 밑 브릭", 놓기는 "새 브릭이 앉을 자리".
   */
  const eraseStrokeRef = useRef<{ lock: EraseLock; done: Set<number> } | null>(null);
  /** `done` = 이 획에서 이미 시도한 칸 — 같은 칸에 매 프레임 다시 놓으려 들지 않게 */
  const placeStrokeRef = useRef<{
    lock: PlaceLock;
    done: Set<string>;
    /** 수직면 = 줄 긋기(끄는 방향 한 축) · 수평면 = 면 칠하기 */
    line: null | { start: [number, number, number] | null; axis: FaceAxis | null };
  } | null>(null);
  /** 놓기 획이 도는 동안에만 존재하는 좌표원 */
  const [placeDrag, setPlaceDrag] = useState<{ spot: FacePlacement; line: boolean } | null>(null);

  /** 커서가 가리킨 면 → 붙을 자리 */
  const onBrickHover = useCallback((h: BrickHit | null) => {
    // 지우기 획 — 커서가 닿는 브릭을 계속 지운다(잠금을 통과한 것만)
    const stroke = eraseStrokeRef.current;
    if (stroke) {
      const b = h ? world.bricks.get(h.brickId) : undefined;
      const allowed = !!b && canEraseInStroke(stroke.lock, b);
      // ★ 못 지울 것은 **강조도 하지 않는다** — 빨갛게 떠 있는데 안 지워지면 고장으로 보인다
      setHoverBrick(allowed ? h!.brickId : null);
      if (allowed && !stroke.done.has(h!.brickId)) {
        stroke.done.add(h!.brickId);
        removeBrick(h!.brickId);
      }
      return;
    }

    // 놓기 획이 도는 동안엔 **평면이 자리를 정한다** — 면(hover)으로 정하면 방향이 틀어진다(StrokePlane 참고)
    if (placeStrokeRef.current) return;

    setHoverBrick(h ? h.brickId : null);
    const f = h ? faceOf(world, h.brickId, h.point.x, h.point.y, h.point.z) : null;
    setSpot(f && h ? anchorFromFace(world, h.brickId, f, h.point.x, h.point.y, h.point.z, part, rot) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, version, part, rot, removeBrick]);

  /**
   * 놓기 획 진행 — 평면 위 칸을 받아 **잠근 층**에 놓는다.
   *
   * 커서가 지나간 칸마다 한 번씩만 시도한다. 막힌 자리는 `place`가 null을 내므로 따로 거르지 않는다(부분 성공).
   */
  const tryPlace = useCallback((a: [number, number, number]) => {
    const st = placeStrokeRef.current;
    if (!st || !canPlaceInStroke(st.lock, a)) return;
    const key = `${a[0]},${a[1]},${a[2]}`;
    if (st.done.has(key)) return;
    st.done.add(key);
    place(a[0], a[1], a[2]);
  }, [place]);

  const onStrokeCell = useCallback((cell: [number, number, number]) => {
    const st = placeStrokeRef.current;
    if (!st) return;
    // 자유 축은 **첫 브릭에서 이어지는 격자**로 스냅한다(안 하면 벽에서 줄이 어긋난다)
    tryPlace(strokeAnchor(st.lock, cell));
  }, [tryPlace]);

  /**
   * 줄 긋기(수직면) — 끈 방향으로 한 축만 늘린다.
   *
   * ★ 축은 **한 번만** 고른다. 매 프레임 다시 고르면 손이 떨릴 때 줄이 방향을 바꿔 어지러워진다.
   *   중간 칸을 전부 채워 **끊긴 줄이 안 생기게** 한다(빨리 끌어 프레임을 건너뛰어도).
   */
  const onLinePoint = useCallback((x: number, y: number, z: number) => {
    const st = placeStrokeRef.current;
    if (!st?.line) return;
    if (!st.line.start) { st.line.start = [x, y, z]; return; }
    const [sx, sy, sz] = st.line.start;
    const d: [number, number, number] = [x - sx, y - sy, z - sz];
    if (st.line.axis === null) {
      // 한 칸 이상 움직이기 전엔 방향을 못 정한다 — 섣불리 고르면 엉뚱한 축으로 잠긴다
      if (Math.hypot(d[0], d[1], d[2]) < CELL_X * 0.75) return;
      st.line.axis = dominantAxis(d[0], d[1], d[2]);
    }
    const k = st.line.axis;
    const n = axisSteps(d[k], st.lock.ext[k], CELL[k]);
    const s = Math.sign(n);
    for (let i = 1; i <= Math.abs(n); i++) {
      const a: [number, number, number] = [...st.lock.originCell];
      a[k] += s * i * Math.max(1, st.lock.ext[k]);
      tryPlace(a);
    }
  }, [tryPlace]);

  /**
   * ★ 놓는 자리는 **화면에 보여준 그 값**(`spot`)이다 — 강조된 칸 그대로.
   *   한때 "상태는 한 프레임 낡으니 ref로 최신 값을 읽자"고 고쳤는데, 그게
   *   **보여준 자리와 놓는 자리를 서로 다른 값으로 갈라놨다.**
   *   사용자에게 정확한 값은 최신 값이 아니라 **눈에 보인 값**이다(WYSIWYG).
   */
  // ★ 한 제스처(누름→끌기→뗌)가 **되돌리기 한 번**이 되도록 묶는다.
  //   안 묶으면 드래그로 자리를 고칠 때마다 op가 쌓여, Ctrl+Z를 수십 번 눌러야 브릭 하나가 사라진다.
  const onDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0) return;
    if (effTool === 'erase') {
      // 누르는 순간 획이 시작된다 — 뗄 때까지 지나가는 브릭이 계속 지워지고, **전부 되돌리기 한 번**이다.
      //   ★ 첫 브릭과 짚은 면으로 **획을 잠근다**(같은 갈래·같은 층·도달 거리) — strokeLock.ts 참고.
      //     안 잠그면 커서가 브릭을 벗어나는 순간 그 뒤의 바닥까지 지워진다(실제로 그랬다).
      const first = hoverBrick !== null ? world.bricks.get(hoverBrick) : undefined;
      if (!first || !spot) return;
      beginBatch();
      eraseStrokeRef.current = { lock: beginEraseStroke(first, spot.face.axis), done: new Set<number>([first.id]) };
      removeBrick(first.id); // 빨갛게 강조된 그 브릭
      return;
    }
    if (!spot || !valid) return;
    // 놓기도 획이다 — 누른 순간 첫 브릭을 놓고 **그 층으로 잠근다.**
    beginBatch();
    const a: [number, number, number] = [spot.anchor.x, spot.anchor.y, spot.anchor.z];
    const id = place(a[0], a[1], a[2]);
    if (id === null) { endBatch(); return; }
    // 수평면(윗면·밑면)은 **면을 칠하고**, 수직면은 **끄는 방향으로 한 줄**을 긋는다.
    //   바닥은 한 획에 넓게 깔려야 하고, 옆면은 "끈 쪽으로 늘어난다"가 기대되는 동작이다.
    const isLine = spot.face.axis !== 1;
    placeStrokeRef.current = {
      lock: beginPlaceStroke(a, spot.face.axis, spot.ext, spot.slide),
      done: new Set<string>([`${a[0]},${a[1]},${a[2]}`]),
      line: isLine ? { start: null, axis: null } : null,
    };
    setPlaceDrag({ spot, line: isLine });
  }, [effTool, hoverBrick, removeBrick, spot, valid, place, beginBatch, endBatch, world]);

  const onUp = useCallback(() => {
    if (placeStrokeRef.current || eraseStrokeRef.current) endBatch();
    placeStrokeRef.current = null;
    eraseStrokeRef.current = null;
    setPlaceDrag(null);
  }, [endBatch]);

  // ★ 포인터는 캔버스 DOM에 직접 붙인다 — 얹는 쪽이 배선할 것이 없다.
  //   `capture` 단계라 에디터의 기존 선택·마퀴보다 먼저 받는다.
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => { onDown(e); };
    el.addEventListener('pointerdown', down, { capture: true });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true } as EventListenerOptions);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onUp);
    };
  }, [gl, onDown, onUp]);

  // 되돌리기 — **짓는 화면에서만** 걸린다(읽기 전용 뷰어엔 BrickBuilder가 아예 없다).
  //   Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z. 입력창에선 브라우저 기본 동작(텍스트 되돌리기)을 살려 준다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const code = e.code;
      if (code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <>
      <BrickInstances
        world={world}
        version={version}
        onHover={onBrickHover}
        onStats={onStats}
        studStyle={studStyle}
      />
      {/* 놓을 자리 안내는 **놓기 도구일 때만**. 지우기 중엔 놓을 자리가 없다 */}
      {effTool === 'place' && <PlacementMarker spot={spot} part={part} rot={rot} valid={valid} />}
      {effTool === 'erase' && <EraseHighlight world={world} brickId={hoverBrick} studStyle={studStyle} />}
      {/* 놓기 획 중에만 존재하는 좌표원 — 수평면은 그 면의 평면, 수직면은 카메라를 마주 보는 평면 */}
      {placeDrag && !placeDrag.line && <StrokePlane base={placeDrag.spot} onCell={onStrokeCell} />}
      {placeDrag && placeDrag.line && (
        <CameraPlane
          origin={anchorCenterWorld(placeDrag.spot.anchor, part, rot)}
          onPoint={onLinePoint}
        />
      )}
    </>
  );
}
