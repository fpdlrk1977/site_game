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
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { anchorCenterWorld, anchorFromFace, faceOf, type FaceAxis, type FacePlacement } from '@/lib/brick/placement';
import {
  beginEraseStroke, canEraseInStroke, beginPlaceStroke, canPlaceInStroke, strokeRect,
  type EraseLock, type PlaceLock,
} from '@/lib/brick/strokeLock';
import { CELL_X, CELL_Y, CELL_Z, worldToCellX, worldToCellY, worldToCellZ, type Rot } from '@/lib/brick/grid';
import { brickGeometry, type StudStyle } from '@/lib/brick/brickGeometry';
import { extentOf, PARTS, type BrickPart } from '@/lib/brick/parts';
import { propBox } from '@/lib/brick/props';
import type { BrickWorld } from '@/lib/brick/world';
import { useBrickStore, type Tool } from '@/store/brickStore';
import { BrickInstances, brickQuaternion, type BrickHit } from './BrickInstances';
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
/**
 * 커서를 **그 표면의 평면**에 쏴서 칸을 얻는다 — 드래그 사각형의 끝점.
 *
 * ★★ **컴포넌트가 아니라 순수 함수다.** 예전엔 `<StrokePlane>`이 `useFrame`으로 매 프레임 쐈는데
 *   두 가지가 걸렸다:
 *   ① **프레임에 묶인다** — 프레임이 느리면(탭이 뒤에 있으면 rAF가 초당 1회까지 떨어진다, F-5) 끝점이 안 따라온다.
 *   ② **마운트를 기다린다** — 누르자마자 빠르게 끌면 컴포넌트가 붙기 전에 드래그가 끝나 **아무 일도 안 일어난다**
 *      (실제로 자동화에서 그렇게 재현됐다. 사람 손으로는 느려서 안 보였을 뿐, 조건이 갖춰지면 나는 결함이다).
 *   → 포인터 이벤트에서 **그 자리에서** 계산한다. 커서는 카메라와 달리 **이벤트가 원본**이다.
 *
 * ⚠️ 시선이 평면과 거의 나란하면 교점이 무한대로 달아난다 — 그럴 땐 `null`(E-3의 안전장치).
 */
function cellOnPlane(
  el: HTMLElement, camera: THREE.Camera, axis: FaceAxis, planeAt: number,
  clientX: number, clientY: number,
): [number, number, number] | null {
  const r = el.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - r.left) / r.width) * 2 - 1,
    -((clientY - r.top) / r.height) * 2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  if (Math.abs(ray.ray.direction.getComponent(axis)) < 0.12) return null;
  const n = new THREE.Vector3(0, 0, 0);
  n.setComponent(axis, 1);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(n, -planeAt), hit)) return null;
  return [worldToCellX(hit.x), worldToCellY(hit.y), worldToCellZ(hit.z)];
}

// ★ `CameraPlane`(줄 긋기용 카메라 대면 평면)은 §24에서 **지웠다.**
//   수직면을 "끄는 방향 한 축"으로 늘리려고 면 밖 축까지 재던 물건인데,
//   사각형은 **그 면의 평면 위 두 축**만 쓰므로 필요가 없어졌다.
//   덩달아 `dominantAxis`·`axisSteps`(줄 긋기 전용 계산)도 호출부가 사라졌다.

/** 지우기 도구에서 **어느 브릭이 지워질지** 빨갛게 감싼다 */
function EraseHighlight({ world, brickId, studStyle }: {
  world: BrickWorld; brickId: number | null; studStyle: StudStyle;
}) {
  const b = brickId === null ? undefined : world.bricks.get(brickId);
  const geo = useMemo(() => (b ? brickGeometry(PARTS[b.part], true, studStyle) : null), [b, studStyle]);
  if (!b || !geo) return null;
  const [x, y, z] = anchorCenterWorld({ x: b.x, y: b.y, z: b.z }, PARTS[b.part], b.rot);
  // ⚠️ 방향은 24가지다 — Y축 각도(`rot * 90°`)로는 세운 브릭을 못 맞춘다(강조가 브릭을 벗어난다)
  return (
    <mesh geometry={geo} position={[x, y, z]} quaternion={brickQuaternion(b.rot)} raycast={() => null}>
      <meshBasicMaterial color="#f05252" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function BrickBuilder({ onStats, onSpot }: Props) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const { world, version, part, prop, rot, studStyle, walking } = useBrickStore();
  const { place, removeBrick } = useBrickStore();
  const { beginBatch, endBatch, undo, redo } = useBrickStore();

  /**
   * 지금 놓을 것의 **바깥 상자** — 파츠 하나일 수도, 소품(브릭 묶음)일 수도 있다(§22).
   * 배치 계산·고스트·막힘 판정이 **전부 이 하나**를 봐야 한다(E-5: 보여준 값과 놓는 값이 같아야 한다).
   */
  const box = useMemo(() => (prop ? propBox(prop) : PARTS[part]), [prop, part]);

  /** 커서 밑 브릭 — 어느 면에 붙일지, 지우기 도구가 무엇을 지울지 결정한다 */
  const [hoverBrick, setHoverBrick] = useState<number | null>(null);
  /** 가리킨 면에 붙을 자리 — 마커가 이것을 그린다 */
  const [spot, setSpot] = useState<FacePlacement | null>(null);

  const anchor = spot?.anchor ?? null;
  const valid = useMemo(
    () => {
      if (!anchor) return false;
      const e = extentOf(box, rot);
      return world.canPlaceBox(anchor.x, anchor.y, anchor.z, e.ex, e.ey, e.ez);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, box, rot, world, version],
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
    /** 커서를 쏠 평면 — 브릭이 **실제로 닿는 그 표면**(E-2b: 떠 있는 평면은 비스듬히 볼 때 어긋난다) */
    axis: FaceAxis;
    planeAt: number;
    /** 끄는 동안 계산해 둔 사각형 — 손 뗄 때 이걸 놓는다(§24) */
    rect: [number, number, number][];
  } | null>(null);
  /** 놓기 획이 도는 동안에만 존재하는 좌표원 */
  const [placeDrag, setPlaceDrag] = useState<{ spot: FacePlacement } | null>(null);
  /** 끄는 동안 보여줄 사각형 — **놓이기 전에** 무엇이 채워질지 눈으로 확인시킨다 */
  const [rectPreview, setRectPreview] = useState<[number, number, number][] | null>(null);
  /** 마지막으로 겨눈 지점 — 커서가 안 움직여도(R 등) 자리를 다시 계산하려면 필요하다 */
  const lastHitRef = useRef<{ brickId: number; p: [number, number, number] } | null>(null);

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
    lastHitRef.current = h ? { brickId: h.brickId, p: [h.point.x, h.point.y, h.point.z] } : null;
    const f = h ? faceOf(world, h.brickId, h.point.x, h.point.y, h.point.z) : null;
    setSpot(f && h ? anchorFromFace(world, h.brickId, f, h.point.x, h.point.y, h.point.z, box, rot) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, version, box, rot, removeBrick]);

  /**
   * ★ **R(회전)·파츠 변경은 포인터 이벤트가 아니다.**
   *
   * `spot`은 커서가 움직일 때만 다시 계산되는데, 앵커가 **회전에 따라 달라지므로**(꼭지점 기준)
   * 마우스를 안 움직이고 R만 누르면 **앵커는 옛것 · 크기는 새것**이 되어 고스트가 겨눈 칸을 벗어난다.
   * (예전엔 앵커가 회전과 무관해서 이 문제가 안 보였다 — 규칙이 바뀌며 드러난 것)
   * → 마지막으로 겨눈 지점에서 다시 계산한다.
   */
  useEffect(() => {
    if (placeStrokeRef.current || eraseStrokeRef.current) return; // 획 중엔 평면이 자리를 정한다
    const last = lastHitRef.current;
    if (!last) return;
    if (!world.bricks.has(last.brickId)) { setSpot(null); return; }
    const f = faceOf(world, last.brickId, last.p[0], last.p[1], last.p[2]);
    setSpot(f ? anchorFromFace(world, last.brickId, f, last.p[0], last.p[1], last.p[2], box, rot) : null);
  }, [box, rot, world]);

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

  /**
   * 끄는 동안 — **놓지 않는다. 사각형만 기억한다**(§24).
   *
   * ★ 예전엔 여기서 바로 놓았다(지나간 칸만 채워지고, 빨리 끌면 프레임 사이가 비어 구멍이 났다).
   *   지금은 **손 뗄 때 한 번에** 놓는다 — 잘못 끌었으면 떼기 전에 되돌릴 수 있고,
   *   무엇이 놓일지 테두리로 먼저 보인다(E-5: 보여준 값과 놓는 값이 같아야 한다).
   */
  const onDragMove = useCallback((e: PointerEvent) => {
    const st = placeStrokeRef.current;
    if (!st) return;
    const cell = cellOnPlane(gl.domElement, camera, st.axis, st.planeAt, e.clientX, e.clientY);
    if (!cell) return;
    st.rect = strokeRect(st.lock, cell);
    setRectPreview(st.rect);
  }, [gl, camera]);

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
    // ★ 걷기 중엔 짓지 않는다 — 좌드래그가 **둘러보기**로 넘어간다(§6).
    //   한 버튼에 두 뜻을 주지 않는다는 규칙 그대로다(E-1).
    if (useBrickStore.getState().walking) return;
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
    // ★ **소품은 클릭 한 번에 하나다.** 획을 시작하지 않는다 —
    //   끌면 의자가 줄줄이 깔린다(§22 "안 하는 것").
    if (prop) { endBatch(); return; }
    // ★ 수평면·수직면이 **같은 규칙**이다(§24) — 둘 다 "누른 칸 ↔ 지금 칸 사각형".
    //   예전엔 바닥은 붓칠, 벽은 한 줄로 갈라져 있었는데, 사각형이면 축을 고를 일이 없어 규칙이 하나로 준다.
    placeStrokeRef.current = {
      lock: beginPlaceStroke(a, spot.face.axis, spot.ext, spot.slide),
      done: new Set<string>([`${a[0]},${a[1]},${a[2]}`]),
      axis: spot.face.axis,
      planeAt: spot.planeAt,
      rect: [a],
    };
    setPlaceDrag({ spot });
  }, [effTool, hoverBrick, removeBrick, spot, valid, place, beginBatch, endBatch, world, prop]);

  const onUp = useCallback(() => {
    // ★ **여기서 사각형이 확정된다**(§24). 끄는 동안엔 아무것도 안 놓았다 —
    //   그래서 잘못 끌었으면 떼기 전에 되돌릴 수 있었다.
    const st = placeStrokeRef.current;
    if (st) for (const a of st.rect) tryPlace(a);
    if (placeStrokeRef.current || eraseStrokeRef.current) endBatch();
    placeStrokeRef.current = null;
    eraseStrokeRef.current = null;
    setRectPreview(null);
    setPlaceDrag(null);
  }, [endBatch, tryPlace]);

  // ★ 포인터는 캔버스 DOM에 직접 붙인다 — 얹는 쪽이 배선할 것이 없다.
  //   `capture` 단계라 에디터의 기존 선택·마퀴보다 먼저 받는다.
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => { onDown(e); };
    el.addEventListener('pointerdown', down, { capture: true });
    // ★ 드래그 중 커서 추적도 **여기서** 한다 — 컴포넌트 마운트를 기다리지 않는다.
    //   누르자마자 빠르게 끌면 마운트 전에 드래그가 끝나 사각형이 안 자란다(자동화에서 재현됨).
    el.addEventListener('pointermove', onDragMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true } as EventListenerOptions);
      el.removeEventListener('pointermove', onDragMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onUp);
    };
  }, [gl, onDown, onUp, onDragMove]);

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
      {/* 놓을 자리 안내는 **놓기 도구일 때만**. 지우기 중엔 놓을 자리가 없다.
          걷는 중엔 짓지 않으므로 둘 다 안 그린다 — 발밑에 빨간 사각형이 따라다니면 거슬린다. */}
      {!walking && effTool === 'place' && <PlacementMarker spot={spot} part={box} rot={rot} valid={valid} />}
      {!walking && effTool === 'erase' && <EraseHighlight world={world} brickId={hoverBrick} studStyle={studStyle} />}
      {/* ★ 채워질 사각형 미리보기 — **놓이기 전에** 보여준다.
          "비스듬히 보다가 엉뚱한 데 생겼다"는 사고를 막는 가장 실질적인 장치다. */}
      {placeDrag && rectPreview && (
        <RectPreview base={placeDrag.spot} anchors={rectPreview} box={box} rot={rot} />
      )}
    </>
  );
}

/**
 * 채워질 사각형을 표면 위에 그린다 — `PlacementMarker`와 **같은 평면**(접촉면)에 눕힌다.
 *
 * ★ 떠 있는 상자를 그리면 시차로 어긋나 보인다(D-5). 표면과 같은 평면이면 시차가 원리적으로 0이다.
 */
function RectPreview({ base, anchors, box, rot }: {
  base: FacePlacement; anchors: [number, number, number][]; box: BrickPart; rot: Rot;
}) {
  const geo = useMemo(() => {
    if (anchors.length < 2) return null;
    const e = extentOf(box, rot);
    const ext = [e.ex, e.ey, e.ez];
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const a of anchors) {
      for (let k = 0; k < 3; k++) {
        if (a[k] < lo[k]) lo[k] = a[k];
        if (a[k] + ext[k] > hi[k]) hi[k] = a[k] + ext[k];
      }
    }
    const ax = base.face.axis;
    const surface = base.face.dir > 0 ? lo[ax] : hi[ax];
    const [u, v] = ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
    const at = surface * CELL[ax] + base.face.dir * 0.008;
    const pts = new Float32Array(12);
    const quad: [number, number][] = [
      [lo[u], lo[v]], [hi[u], lo[v]], [hi[u], hi[v]], [lo[u], hi[v]],
    ];
    quad.forEach(([uu, vv], i) => {
      pts[i * 3 + ax] = at;
      pts[i * 3 + u] = uu * CELL[u];
      pts[i * 3 + v] = vv * CELL[v];
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    return g;
  }, [base, anchors, box, rot]);

  /** 숫자를 띄울 자리 — 사각형 한가운데(표면 위) */
  const center = useMemo<[number, number, number] | null>(() => {
    if (!geo) return null;
    const p = geo.getAttribute('position');
    const c: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < p.count; i++) { c[0] += p.getX(i); c[1] += p.getY(i); c[2] += p.getZ(i); }
    return [c[0] / p.count, c[1] / p.count, c[2] / p.count];
  }, [geo]);

  /**
   * 얼마나 깔리는지 — **끄는 동안 숫자로** 보여준다(사용자 요청 2026-08-05).
   *
   * ★ 칸이 0.5m라 눈대중이 잘 안 된다. "몇 칸 × 몇 칸"과 **실제 미터**를 같이 낸다 —
   *   방을 지을 땐 "6m 벽"처럼 미터로 생각하지 칸으로 생각하지 않는다.
   */
  const label = useMemo(() => {
    if (anchors.length === 0) return null;
    const e = extentOf(box, rot);
    const ext = [e.ex, e.ey, e.ez];
    const uniq = [0, 1, 2].map((k) => new Set(anchors.map((a) => a[k])).size);
    const cells = [0, 1, 2].map((k) => uniq[k] * ext[k]);
    const [u, v] = base.face.axis === 0 ? [2, 1] : base.face.axis === 1 ? [0, 2] : [0, 1];
    const m = (k: number) => (cells[k] * CELL[k]).toFixed(1).replace(/\.0$/, '');
    return `${cells[u]} × ${cells[v]}칸 · ${m(u)} × ${m(v)}m · ${anchors.length}개`;
  }, [anchors, box, rot, base.face.axis]);

  if (!geo) return null;
  return (
    <group raycast={() => null}>
      <lineLoop geometry={geo}>
        <lineBasicMaterial color="#000000" transparent opacity={0.9} />
      </lineLoop>
      {label && center && (
        <Html position={center} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{
            background: 'rgba(0,0,0,0.72)', color: '#fff', fontSize: 12, lineHeight: 1.2,
            padding: '4px 8px', borderRadius: 3, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
          }}>
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}
