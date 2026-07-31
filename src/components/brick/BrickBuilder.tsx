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
import { anchorCenterWorld, anchorFromFace, faceOf, slideAnchor, type FacePlacement } from '@/lib/brick/placement';
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

/** 드래그로 자리를 고칠 수 있는 최대 거리(m) — 시선이 얕을 때 무한대로 달아나는 것을 막는다 */
const SLIDE_REACH = 12;

/**
 * 드래그 중 좌표원 — **처음 붙은 면의 평면**에 포인터를 투영한다.
 *
 * ★ R3F 이벤트가 아니라 직접 레이캐스트인 이유:
 *   ① 방금 놓은 브릭이 **그 뒤의 평면을 가려** 이벤트가 끊긴다(끌다 멈춤)
 *   ② 브릭 표면에서 좌표를 받으면 높이가 달라 **커서와 어긋난다**(시차)
 *   평면은 수학이라 가려지지 않는다.
 */
function SlidePlane({ base, onPoint }: { base: FacePlacement; onPoint: (x: number, y: number, z: number) => void }) {
  const plane = useMemo(() => {
    const n = new THREE.Vector3(0, 0, 0);
    n.setComponent(base.face.axis, 1);
    return new THREE.Plane(n, -base.planeAt);
  }, [base]);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const origin = useMemo(
    () => new THREE.Vector3().fromArray(anchorCenterWorld(base.anchor, 'b1x1', 0)),
    [base],
  );
  useFrame(({ camera, pointer }) => {
    ray.setFromCamera(pointer, camera);
    // 시선이 평면과 거의 나란하면 교점이 무한대로 달아난다
    if (Math.abs(ray.ray.direction.getComponent(base.face.axis)) < 0.12) return;
    if (!ray.ray.intersectPlane(plane, hit)) return;
    if (hit.distanceTo(origin) > SLIDE_REACH) return;
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
  const { place, moveBrick, removeBrick } = useBrickStore();

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

  const dragRef = useRef<{ id: number; base: FacePlacement; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState<FacePlacement | null>(null);

  /** 커서가 가리킨 면 → 붙을 자리 */
  const onBrickHover = useCallback((h: BrickHit | null) => {
    if (dragRef.current) return; // 드래그 중엔 평면이 자리를 정한다
    setHoverBrick(h ? h.brickId : null);
    const f = h ? faceOf(world, h.brickId, h.point.x, h.point.y, h.point.z) : null;
    setSpot(f && h ? anchorFromFace(world, h.brickId, f, h.point.x, h.point.y, h.point.z, part, rot) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, version, part, rot]);

  /**
   * ★ 놓는 자리는 **화면에 보여준 그 값**(`spot`)이다 — 강조된 칸 그대로.
   *   한때 "상태는 한 프레임 낡으니 ref로 최신 값을 읽자"고 고쳤는데, 그게
   *   **보여준 자리와 놓는 자리를 서로 다른 값으로 갈라놨다.**
   *   사용자에게 정확한 값은 최신 값이 아니라 **눈에 보인 값**이다(WYSIWYG).
   */
  const onDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0) return;
    if (effTool === 'erase') {
      if (hoverBrick !== null) removeBrick(hoverBrick); // 빨갛게 강조된 그 브릭
      return;
    }
    if (!spot || !valid) return;
    const id = place(spot.anchor.x, spot.anchor.y, spot.anchor.z);
    if (id === null) return;
    dragRef.current = { id, base: spot, moved: false };
    setDragging(spot);
  }, [effTool, hoverBrick, removeBrick, spot, valid, place]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
  }, []);

  /** 드래그를 시작한 뒤 **실제로 움직였을 때만** 미끄러진다 */
  const onMove = useCallback(() => {
    if (dragRef.current) dragRef.current.moved = true;
  }, []);

  /**
   * 드래그 중 — 평면 위 지점을 받아 미끄러질 수 있는 축만 옮긴다.
   *
   * ★ **마우스를 움직이기 전에는 절대 안 옮긴다.** 예전엔 `SlidePlane`이 마운트되는
   *   첫 프레임에 곧바로 브릭을 옮겨서, **그냥 클릭만 해도 자리가 바뀌었다.**
   */
  const onSlide = useCallback((px: number, py: number, pz: number) => {
    const d = dragRef.current;
    if (!d || !d.moved) return;
    const next = slideAnchor(d.base, px, py, pz);
    const b = world.bricks.get(d.id);
    if (!b || (b.x === next.x && b.y === next.y && b.z === next.z)) return;
    const id = moveBrick(d.id, next.x, next.y, next.z);
    if (id !== null) d.id = id;
    setSpot({ ...d.base, anchor: next });
  }, [world, moveBrick]);

  // ★ 포인터는 캔버스 DOM에 직접 붙인다 — 얹는 쪽이 배선할 것이 없다.
  //   `capture` 단계라 에디터의 기존 선택·마퀴보다 먼저 받는다.
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => { onDown(e); };
    el.addEventListener('pointerdown', down, { capture: true });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true } as EventListenerOptions);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onUp);
    };
  }, [gl, onDown, onMove, onUp]);

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
      {/* 드래그로 자리를 고치는 동안에만 존재하는 좌표원 */}
      {dragging && <SlidePlane base={dragging} onPoint={onSlide} />}
    </>
  );
}
