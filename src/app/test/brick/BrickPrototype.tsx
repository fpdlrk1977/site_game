'use client';

// P0 프로토타입 — 기준: doc/BRICK_SYSTEM.md §8 (P0가 게이트)
//
// 검증 목표 두 가지:
//   ① 감각 — 실제로 테이블 하나와 방 하나를 만들어본다
//   ② 폴리곤 예산 — 브릭은 큐브의 3~17배다. 여기서 안 나오면 스터드 처리를 바꿔야 한다
//
// 기존 에디터 코드는 건드리지 않는다. DB도 쓰지 않는다(메모리만).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { BrickInstances, type BrickHit } from '@/components/brick/BrickInstances';
import { STUD_STYLES } from '@/lib/brick/brickGeometry';
import { PlacementMarker } from '@/components/brick/PlacementMarker';
import { anchorCenterWorld, anchorFromFace, faceOf, slideAnchor, type FacePlacement } from '@/lib/brick/placement';
import { MAT_CLASSES, PART_KINDS, PARTS, partsOfKind } from '@/lib/brick/parts';
import { attachBrickStorage, BRICK_COLORS, useBrickStore, type Tool } from '@/store/brickStore';
import { brickGeometry } from '@/lib/brick/brickGeometry';
import type { BrickWorld } from '@/lib/brick/world';
import type { StudStyle } from '@/lib/brick/brickGeometry';

interface Stats { groups: number; instances: number; tris: number }

// 도구별 커서 — 지금 왼쪽 클릭이 무슨 뜻인지 커서만 봐도 알게 한다(SVG data-URI, 외부 파일 없음)
const svgCursor = (body: string, hot = '12 12') =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round">${body}</svg>`,
  )}") ${hot}, crosshair`;
const PLACE_CURSOR = svgCursor(
  '<path d="M12 4v16M4 12h16" stroke="#111" stroke-opacity=".55" stroke-width="4"/><path d="M12 4v16M4 12h16" stroke="#fff"/>',
);
const ERASE_CURSOR = svgCursor(
  '<path d="M5 12h14" stroke="#111" stroke-opacity=".55" stroke-width="6"/><path d="M5 12h14" stroke="#ff6b6b" stroke-width="3"/>',
);

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
  const geo = useMemo(
    () => (b ? brickGeometry(PARTS[b.part], true, studStyle) : null),
    [b, studStyle],
  );
  if (!b || !geo) return null;
  const [x, y, z] = anchorCenterWorld({ x: b.x, y: b.y, z: b.z }, b.part, b.rot);
  return (
    <mesh geometry={geo} position={[x, y, z]} rotation={[0, (b.rot * Math.PI) / 2, 0]} raycast={() => null}>
      <meshBasicMaterial color="#f05252" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function BrickPrototype() {
  const { world, version, part, rot, color, mat, saveState, loaded, studStyle, backend, tool } = useBrickStore();
  const { setPart, rotate, setColor, setMat, setTool, place, moveBrick, removeBrick, clear, stressFill, loadWorld, flush, setStudStyle, indexedChunks } = useBrickStore();

  /** 커서 밑 브릭 — 어느 면에 붙일지, 지우기 도구가 무엇을 지울지 결정한다 */
  const [hoverBrick, setHoverBrick] = useState<number | null>(null);
  /** 가리킨 면에 붙을 자리 (고스트가 이것을 그린다) */
  const [spot, setSpot] = useState<FacePlacement | null>(null);
  const [stats, setStats] = useState<Stats>({ groups: 0, instances: 0, tris: 0 });
  const [perf, setPerf] = useState({ fps: 0, calls: 0, tris: 0 });
  const [copied, setCopied] = useState(false);
  /** 지금 보고 있는 갈래(브릭/플레이트)의 파츠 — 목록·숫자키가 같은 순서를 쓴다 */
  const kindParts = useMemo(() => partsOfKind(PARTS[part].kind), [part]);

  const anchor = spot?.anchor ?? null;
  const valid = useMemo(
    () => (anchor ? world.canPlace(part, anchor.x, anchor.y, anchor.z, rot) : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, part, rot, world, version],
  );

  /** Ctrl을 누르고 있는 동안 도구를 일시 반전 — 하나 잘못 놓았을 때 팔레트 왕복을 없앤다 */
  const [invertHeld, setInvertHeld] = useState(false);
  useEffect(() => {
    // macOS는 Ctrl+클릭이 우클릭이라 Cmd도 같이 받는다
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
  const effTool: Tool = invertHeld ? (tool === 'place' ? 'erase' : 'place') : tool;

  /**
   * ★ 놓기 = **누르고 → 끌어서 자리 고치고 → 뗀다.**
   *   누르는 순간 실제로 놓이고, 누른 채 움직이면 **그 면의 평면 위에서만** 미끄러진다.
   *   액션이 뗄 때가 아니라 **누를 때** 일어나므로, 카메라를 돌리고 손을 떼면서
   *   엉뚱한 곳에 놓이던 문제가 구조적으로 없다.
   */
  const dragRef = useRef<{ id: number; base: FacePlacement } | null>(null);
  const [dragging, setDragging] = useState<FacePlacement | null>(null);

  /**
   * ★ 클릭은 **ref를 읽는다**(상태가 아니라).
   *   상태는 다음 렌더에야 반영되는데 `pointerdown`은 그 사이에 끼어들 수 있다.
   *   그러면 **마우스를 움직이면서 누를 때 한 칸 전 자리**에 놓인다
   *   ("격자에 맞춰 클릭했는데 1칸씩 어긋난다"의 원인). ref는 즉시 반영된다.
   *   상태는 고스트를 그리기 위해서만 둔다(한 프레임 늦어도 눈에 안 띈다).
   */
  const spotRef = useRef<FacePlacement | null>(null);
  const hoverBrickRef = useRef<number | null>(null);

  /** 커서가 가리킨 면 → 붙을 자리 */
  const onBrickHover = useCallback((h: BrickHit | null) => {
    if (dragRef.current) return; // 드래그 중엔 평면이 자리를 정한다
    hoverBrickRef.current = h ? h.brickId : null;
    setHoverBrick(hoverBrickRef.current);
    const f = h ? faceOf(world, h.brickId, h.point.x, h.point.y, h.point.z) : null;
    const fp = f && h ? anchorFromFace(world, h.brickId, f, h.point.x, h.point.y, h.point.z, part, rot) : null;
    spotRef.current = fp;
    setSpot(fp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, version, part, rot]);

  const onDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (effTool === 'erase') {
      if (hoverBrickRef.current !== null) removeBrick(hoverBrickRef.current);
      return;
    }
    const fp = spotRef.current;
    // 유효성도 여기서 새로 판정한다 — 상태로 들고 있으면 같이 한 프레임 낡는다
    if (!fp || !world.canPlace(part, fp.anchor.x, fp.anchor.y, fp.anchor.z, rot)) return;
    const id = place(fp.anchor.x, fp.anchor.y, fp.anchor.z);
    if (id === null) return;
    dragRef.current = { id, base: fp };
    setDragging(fp);
  }, [effTool, removeBrick, world, part, rot, place]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
  }, []);

  /** 드래그 중 — 평면 위 지점을 받아 미끄러질 수 있는 축만 옮긴다 */
  const onSlide = useCallback((px: number, py: number, pz: number) => {
    const d = dragRef.current;
    if (!d) return;
    const next = slideAnchor(d.base, px, py, pz);
    const b = world.bricks.get(d.id);
    if (!b || (b.x === next.x && b.y === next.y && b.z === next.z)) return;
    const id = moveBrick(d.id, next.x, next.y, next.z);
    if (id !== null) d.id = id;
    setSpot({ ...d.base, anchor: next });
  }, [world, moveBrick]);

  // 저장소 선택 후 복원 (1회).
  //   `?scene=<sceneId>` → Supabase `brick_chunks` (씬에 붙은 진짜 경로)
  //   없으면            → localStorage (프로토타입)
  useEffect(() => {
    attachBrickStorage(new URLSearchParams(window.location.search).get('scene'));
    void loadWorld();
  }, [loadWorld]);

  // 자동 저장 — 변경이 멎고 600ms 뒤 **바뀐 청크만** 쓴다
  useEffect(() => {
    if (saveState !== 'pending') return;
    const t = setTimeout(() => { void flush(); }, 600);
    return () => clearTimeout(t);
  }, [saveState, version, flush]);

  // 저장 전에 창이 닫히는 경우 대비
  useEffect(() => {
    const onHide = () => { void flush(); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  // 단축키 — 1~9 파츠(**지금 보고 있는 갈래 안에서**) · R 회전 · PageUp/Down 층 이동 · L 고정 토글
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') {
        const p = kindParts[Number(e.key) - 1];
        if (p) setPart(p.id);
      }
      else if (e.key === 'r' || e.key === 'R') rotate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPart, rotate, kindParts]);

  const btn = 'px-2.5 py-1.5 rounded-xs text-[12px] border transition-colors cursor-pointer';
  const on = 'bg-primary text-white border-primary';
  const off = 'bg-surface text-foreground border-border hover:bg-foreground/[0.06]';

  return (
    <div className="w-full h-dvh relative bg-[#1a1a20]">
      {/* 그림자 맵 없음 — 조명이 환경광 하나뿐이라 켤 것이 없다 */}
      <Canvas
        camera={{ position: [8, 7, 10], fov: 50 }}
        dpr={[1, 2]}
        gl={{ toneMapping: THREE.LinearToneMapping }}
        style={{ cursor: effTool === 'erase' ? ERASE_CURSOR : PLACE_CURSOR }}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* ★ 배경·안개 색이 룩을 좌우한다 — 실시간 그림자를 끈 뒤로는 특히.
            예전엔 거의 검정(#1a1a20)이라 먼 지형이 **검게 사그라들어**, 카메라 주변만 밝은
            "스포트라이트"처럼 보였다(자연광이 아니라 한 곳에 집중된 느낌).
            → 낮 하늘 톤으로 바꾸면 멀어질수록 대기에 잠기는 **자연스러운 원경**이 된다. */}
        <color attach="background" args={['#a6bccf']} />
        {/* 스트리밍 경계를 가린다 — 지형 반경(약 48m)보다 **먼저** 완전히 잠기도록 far를 맞춘다.
            far가 지형 끝보다 멀면 땅 가장자리가 그대로 드러난다. */}
        <fog attach="fog" args={['#a6bccf', 18, 46]} />
        {/* ★ 조명은 **평평한 환경광 하나뿐**이다 — 마인크래프트와 같은 모델.
            입체감은 전부 구운 값이 만든다(하늘빛 전파 × 면 방향 고정 배율, `world.FACE_TONE`).
            방향광을 쓰면 그 위에 **움직이는 음영**이 겹쳐서, 블록을 쌓으면 옆 블록에 그림자가
            지고 카메라를 돌릴 때마다 어떤 면은 직사광선처럼 번쩍인다. 마크엔 태양 방향이 없다.
            → 방향광·그림자 맵은 **넣지 않는다.** (비용 실측치는 BRICK_PROGRESS.md에 남아 있다) */}
        <ambientLight intensity={1.6} />

        {/* 바닥 회색 격자 제거 — 지형 블록 자체가 격자라 중복이고, 블록 위에 겹쳐 지저분했다.
            놓을 자리 안내는 **고스트 아웃라인**이 담당한다 — 격자를 겹치면 선이 두 벌이라 지저분하다. */}

        {/* 평면 바닥은 없앴다 — **지형 블록이 바닥**이다.
            ★ y=0에 투명 판을 깔아 두면 **구멍 안을 가리킬 때 그 판이 레이를 먼저 가로채서**,
              비스듬한 시점에서 구멍 바닥이 아니라 지면 높이 지점이 잡혀 XZ가 어긋난다.
              (그래서 판 구멍 안에 브릭을 놓을 수 없었다) */}

        {/* 높이 고정 모드는 없앴다 — 면에 붙이는 방식이 천장·2층 바닥을 그대로 처리한다 */}
        {/* 드래그로 자리를 고치는 동안에만 존재하는 좌표원 */}
        {dragging && <SlidePlane base={dragging} onPoint={onSlide} />}

        <BrickInstances
          world={world}
          version={version}
          onHover={onBrickHover}
          onStats={setStats}
          studStyle={studStyle}
        />

        {/* 놓을 자리 안내는 **놓기 도구일 때만**. 지우기 중엔 놓을 자리가 없다 */}
        {effTool === 'place' && <PlacementMarker spot={spot} part={part} rot={rot} valid={valid} />}
        {effTool === 'erase' && <EraseHighlight world={world} brickId={hoverBrick} studStyle={studStyle} />}
        <PerfMeter onPerf={setPerf} />
        <Mover />
        <Streamer />

        <OrbitControls
          makeDefault
          enableDamping={false}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={1}
          maxDistance={200}
          mouseButtons={{ LEFT: undefined, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
        />
      </Canvas>

      {/* ── 좌측 도구 ─────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 w-56 rounded-xs bg-surface border border-border shadow-float p-3 text-foreground">
        <div className="text-[13px] font-medium mb-2">브릭 프로토타입 (P0)</div>

        {/* ★ 도구 — **액션은 왼쪽 클릭 하나뿐**이다. 버튼 하나에 두 뜻을 담으면
            카메라 조작과 충돌한다(예전 우클릭 = 회전 + 삭제). 우클릭은 모바일에도 없다. */}
        <div className="text-[10px] uppercase text-muted mb-1">도구 <span className="opacity-60">Ctrl=일시 반전</span></div>
        <div className="flex gap-1 mb-2">
          {(['place', 'erase'] as Tool[]).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`${btn} flex-1 ${effTool === t ? on : off}`}
            >
              {t === 'place' ? '＋ 놓기' : '－ 지우기'}
            </button>
          ))}
        </div>

        {/* 파츠가 16종이라 가로 나열이 안 맞는다 — 갈래 탭 + 격자 */}
        <div className="text-[10px] uppercase text-muted mb-1">
          파츠 <span className="opacity-60">1~9 = 아래 목록 순서</span>
        </div>
        <div className="flex gap-1 mb-1">
          {PART_KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setPart(partsOfKind(k.id)[0].id)}
              title={k.note}
              className={`${btn} flex-1 ${PARTS[part].kind === k.id ? on : off}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1 mb-1">
          {kindParts.map((p) => (
            <button key={p.id} onClick={() => setPart(p.id)} className={`${btn} px-0 ${part === p.id ? on : off}`}>{p.label}</button>
          ))}
        </div>
        <div className="mb-3 text-[10px] text-muted">
          {PART_KINDS.find((k) => k.id === PARTS[part].kind)?.note}
        </div>

        <div className="text-[10px] uppercase text-muted mb-1">방향 <span className="opacity-60">R</span></div>
        <button onClick={rotate} className={`${btn} w-full mb-3 ${off}`}>회전 {rot * 90}°</button>

        <div className="text-[10px] uppercase text-muted mb-1">재질</div>
        <div className="flex gap-1 mb-3">
          {MAT_CLASSES.map((m) => (
            <button key={m.id} onClick={() => setMat(m.id)} className={`${btn} flex-1 ${mat === m.id ? on : off}`}>{m.label}</button>
          ))}
        </div>

        <div className="text-[10px] uppercase text-muted mb-1">색</div>
        <div className="grid grid-cols-5 gap-1 mb-3">
          {BRICK_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 rounded-xs border-2 cursor-pointer ${color === c ? 'border-primary' : 'border-border'}`}
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="text-[10px] uppercase text-muted mb-1">돌기 모양</div>
        <div className="flex gap-1 mb-1">
          {STUD_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStudStyle(s.id)}
              className={`${btn} flex-1 ${studStyle === s.id ? on : off}`}
              title={s.note}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mb-3 text-[10px] text-muted leading-relaxed">
          {STUD_STYLES.find((s) => s.id === studStyle)?.note}
        </div>

        <div className="text-[10px] uppercase text-muted mb-1">폴리곤 예산 측정</div>
        <div className="flex gap-1 mb-1">
          <button onClick={() => stressFill(40, 40, 10)} className={`${btn} flex-1 ${off}`}>2천</button>
          <button onClick={() => stressFill(100, 100, 20)} className={`${btn} flex-1 ${off}`}>2.5만</button>
          <button onClick={() => stressFill(200, 200, 25)} className={`${btn} flex-1 ${off}`}>12만</button>
        </div>
        <button onClick={() => { void clear(); }} className={`${btn} w-full ${off}`}>전체 지우기</button>
      </div>

      {/* ── 우측 통계 ─────────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 w-52 rounded-xs bg-surface border border-border shadow-float p-3 text-foreground">
        <div className="text-[10px] uppercase text-muted mb-1.5 flex items-center justify-between">
          <span>통계</span>
          <span className={saveState === 'saving' ? 'text-primary' : 'text-muted'}>
            {backend === 'db' ? 'DB · ' : ''}
            {!loaded ? '불러오는 중…'
              : saveState === 'saving' ? '저장 중…'
              : saveState === 'pending' ? '변경됨'
              : saveState === 'saved' ? '저장됨' : ''}
          </span>
        </div>
        <Row label="FPS" value={perf.fps ? `${perf.fps}` : '측정 중…'} />
        <Row label="브릭" value={world.count.toLocaleString()} />
        <Row label="보이는 브릭" value={`${stats.instances.toLocaleString()} (${pct(stats.instances, world.count)})`} />
        <div className="mt-1.5 pt-1.5 border-t border-border" />
        <div className="text-[10px] uppercase text-muted mb-0.5">
          프레임 전체
        </div>
        <Row label="draw call" value={String(perf.calls)} />
        <Row label="삼각형" value={perf.tris.toLocaleString()} />
        <div className="mt-1.5 pt-1.5 border-t border-border" />
        <div className="text-[10px] uppercase text-muted mb-0.5">브릭 지오메트리 총량</div>
        <Row label="메시" value={String(stats.groups)} />
        <Row label="삼각형" value={stats.tris.toLocaleString()} />
        <Row label="청크 (로드/전체)" value={`${world.chunkCount} / ${indexedChunks()}`} />
        <Row label="빛 칸 · 계산" value={`${world.lightStats.cells.toLocaleString()} · ${world.lightStats.ms.toFixed(0)}ms`} />
        <button
          onClick={() => {
            const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
            void navigator.clipboard.writeText(
              [
                `FPS ${perf.fps}`,
                `브릭 ${world.count}`,
                `보이는 브릭 ${stats.instances} (${pct(stats.instances, world.count)})`,
                `프레임 draw call ${perf.calls}`,
                `프레임 삼각형 ${perf.tris}`,
                `브릭 메시 ${stats.groups} · 브릭 삼각형 총량 ${stats.tris}`,
                `청크 ${world.chunkCount} / ${indexedChunks()}`,
                `빛 칸 ${world.lightStats.cells} · 계산 ${world.lightStats.ms.toFixed(0)}ms`,
                `화면배율 ${dpr} · ${window.innerWidth}×${window.innerHeight}`,
              ].join('\n'),
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={`${btn} w-full mt-2 ${copied ? on : off}`}
        >
          {copied ? '복사됨 ✓' : '측정값 복사'}
        </button>
        <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted leading-relaxed">
          묻힌 브릭은 인스턴스를 만들지 않는다. 꽉 찬 덩어리일수록
          &apos;보이는 브릭&apos; 비율이 떨어져야 정상.
        </div>
      </div>

      {/* ── 하단 안내 ─────────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xs bg-surface border border-border shadow-float px-3 py-2 text-[11px] text-foreground">
        <b>WASD</b> 이동 · <b>Q/E</b> 위아래 · <b>Shift</b> 빠르게 · <b>좌클릭</b> 도구 실행 · <b>Ctrl</b> 도구 반전 · <b>우드래그</b> 회전 · <b>가운데드래그</b> 이동 · <b>휠</b> 줌

      </div>
    </div>
  );
}

/**
 * 프레임·실제 렌더량 측정 — 폴리곤 예산 판단(스터드 LOD 필요 여부)의 근거.
 *
 * ★ `gl.info.render`는 **컬링이 끝난 뒤 실제로 그린 양**이다.
 *   씬에 있는 InstancedMesh 개수와 다르다 — 그 차이가 곧 프러스텀 컬링의 효과다.
 *
 * 매 프레임 setState하면 측정 대상 자체가 느려지므로 500ms마다만 올린다.
 */
/**
 * 카메라를 따라 청크를 올리고 내린다 (P2-b).
 * 매 프레임 부르면 낭비라, 카메라가 **한 청크 이상 움직였을 때만** 요청한다.
 */
function Streamer() {
  const stream = useBrickStore((s) => s.streamAround);
  const last = useRef({ x: Infinity, z: Infinity });
  useFrame(({ camera, controls }) => {
    // ★ 카메라 **위치**가 아니라 **보는 지점(target)** 을 기준으로 한다.
    //   OrbitControls는 회전할 때 눈 위치가 궤도를 따라 크게 움직여서, 위치 기준이면
    //   가만히 서서 둘러보기만 해도 스트리밍이 계속 발동한다(그때마다 전체 재계산 → 버벅임).
    //   보는 지점은 회전해도 안 움직이므로 실제로 이동할 때만 스트리밍이 돈다.
    const t = (controls as { target?: THREE.Vector3 } | null)?.target;
    const x = t ? t.x : camera.position.x;
    const z = t ? t.z : camera.position.z;
    if (Math.abs(x - last.current.x) < 6 && Math.abs(z - last.current.z) < 6) return;
    last.current = { x, z };
    void stream(x, z);
  });
  return null;
}

/**
 * WASD 이동 — 카메라와 **보는 지점**을 함께 옮긴다.
 *
 * 이게 없으면 OrbitControls로는 제자리 회전·줌만 되어 **월드를 돌아다닐 수가 없다**
 * (= 스트리밍도 영영 안 돈다). 속도는 줌 거리에 비례 — 멀리서 볼수록 빠르게.
 */
function Mover() {
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const isEdit = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === 'INPUT';
    const down = (e: KeyboardEvent) => { if (!isEdit(e)) keys.current.add(e.code); };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear(); // 창을 벗어나면 눌린 채로 남지 않게
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());

  useFrame(({ camera, controls }, dt) => {
    const k = keys.current;
    const target = (controls as { target?: THREE.Vector3; update?: () => void } | null);
    if (!target?.target) return;

    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const u = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (f === 0 && r === 0 && u === 0) return;

    // 수평 기준 전방/우측 (위아래를 봐도 평면 위를 걷듯 움직이게)
    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0;
    if (fwd.current.lengthSq() < 1e-6) fwd.current.set(0, 0, -1);
    fwd.current.normalize();
    // 오른쪽 = fwd × up. 부호를 뒤집으면 A/D가 반대로 간다(실제로 그랬다)
    right.current.set(-fwd.current.z, 0, fwd.current.x);

    const speed = Math.max(6, camera.position.distanceTo(target.target) * 0.9) * (k.has('ShiftLeft') ? 3 : 1);
    move.current.set(0, 0, 0)
      .addScaledVector(fwd.current, f)
      .addScaledVector(right.current, r);
    if (move.current.lengthSq() > 0) move.current.normalize();
    move.current.y = u;
    move.current.multiplyScalar(speed * dt);

    camera.position.add(move.current);
    target.target.add(move.current);
    target.update?.();
  });
  return null;
}

function PerfMeter({ onPerf }: { onPerf: (p: { fps: number; calls: number; tris: number }) => void }) {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ frames: 0, t: 0, calls: 0, tris: 0 });
  useFrame(() => {
    const a = acc.current;
    const now = performance.now();
    if (a.t === 0) { a.t = now; return; }
    a.frames++;
    // useFrame은 렌더 직전에 돌므로 값은 '직전 프레임'의 것 — 표시용으론 충분하다
    a.calls += gl.info.render.calls;
    a.tris += gl.info.render.triangles;
    if (now - a.t >= 500) {
      onPerf({
        fps: Math.round((a.frames * 1000) / (now - a.t)),
        calls: Math.round(a.calls / a.frames),
        tris: Math.round(a.tris / a.frames),
      });
      a.frames = 0; a.calls = 0; a.tris = 0; a.t = now;
    }
  });
  return null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px] py-0.5">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function pct(a: number, b: number): string {
  return b === 0 ? '—' : `${Math.round((a / b) * 100)}%`;
}
