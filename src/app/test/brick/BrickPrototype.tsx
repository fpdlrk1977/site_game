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
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { BrickInstances, type BrickHit } from '@/components/brick/BrickInstances';
import { STUD_STYLES } from '@/lib/brick/brickGeometry';
import { BrickGhost } from '@/components/brick/BrickGhost';
import { PlacementGrid } from '@/components/brick/PlacementGrid';
import { anchorFromPointer, type Anchor } from '@/lib/brick/placement';
import { MAT_CLASSES, PART_LIST } from '@/lib/brick/parts';
import { BRICK_CELLS_Y, CELL_X, CELL_Y } from '@/lib/brick/grid';
import { attachBrickStorage, BRICK_COLORS, useBrickStore } from '@/store/brickStore';

interface Stats { groups: number; instances: number; tris: number }

export default function BrickPrototype() {
  const { world, version, part, rot, color, mat, lockY, saveState, loaded, studStyle, backend } = useBrickStore();
  const { setPart, rotate, setColor, setMat, place, removeBrick, clear, stressFill, toggleLock, nudgeLock, loadWorld, flush, setStudStyle, indexedChunks } = useBrickStore();

  // 포인터가 가리킨 월드 지점 — 브릭 위든 바닥이든 상관없이 **XZ만** 쓴다.
  // 높이는 고스트 발자국이 정한다(드롭 모드) 또는 lockY로 고정한다.
  const [hover, setHover] = useState<THREE.Vector3 | null>(null);
  const [stats, setStats] = useState<Stats>({ groups: 0, instances: 0, tris: 0 });
  const [perf, setPerf] = useState({ fps: 0, calls: 0, tris: 0 });
  const [copied, setCopied] = useState(false);
  // P3-a부터 입체감은 **구운 하늘빛**(면 단위)이 낸다 → 실시간 그림자는 기본 끔.
  // 실측에서 그림자 패스가 프레임의 절반(10.3ms)을 먹었다. 비교용으로 토글만 남긴다.
  const [shadowsOn, setShadowsOn] = useState(false);


  const locked = lockY !== null;

  // 놓일 자리 — 고스트와 클릭이 같은 값을 쓰도록 한 곳에서 계산
  const anchor = useMemo<Anchor | null>(
    () => (hover ? anchorFromPointer(world, hover.x, hover.z, part, rot, lockY) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hover, part, rot, world, version, lockY],
  );

  const valid = useMemo(
    () => (anchor ? world.canPlace(part, anchor.x, anchor.y, anchor.z, rot) : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, part, rot, world, version],
  );

  const doPlace = useCallback(() => {
    if (anchor && valid) place(anchor.x, anchor.y, anchor.z);
  }, [anchor, valid, place]);

  // 고정 모드에선 XZ를 **작업 평면에서만** 받는다.
  // 브릭 표면에서 받으면 커서와 고스트가 어긋난다(높이가 다르니 시차가 생김).
  const onBrickHover = useCallback((h: BrickHit | null) => {
    if (h && !locked) setHover(h.point);
  }, [locked]);

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

  // 단축키 — 1~4 파츠 · R 회전 · PageUp/Down 층 이동 · L 고정 토글
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '4') setPart(PART_LIST[Number(e.key) - 1].id);
      else if (e.key === 'r' || e.key === 'R') rotate();
      else if (e.key === 'l' || e.key === 'L') toggleLock(anchor?.y ?? 0);
      else if (e.key === 'PageUp') { e.preventDefault(); nudgeLock(1); }
      else if (e.key === 'PageDown') { e.preventDefault(); nudgeLock(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPart, rotate, toggleLock, nudgeLock, anchor]);

  const btn = 'px-2.5 py-1.5 rounded-xs text-[12px] border transition-colors cursor-pointer';
  const on = 'bg-primary text-white border-primary';
  const off = 'bg-surface text-foreground border-border hover:bg-foreground/[0.06]';

  return (
    <div className="w-full h-dvh relative bg-[#1a1a20]">
      <Canvas
        shadows="percentage"
        camera={{ position: [8, 7, 10], fov: 50 }}
        dpr={[1, 2]}
        gl={{ toneMapping: THREE.LinearToneMapping }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <color attach="background" args={['#1a1a20']} />
        {/* 스트리밍 경계를 가린다 — 청크가 나타나고 사라지는 게 안 보이게.
            배경색과 같은 색이라 자연스럽게 사라진다 (LOD 대신 쓰는 방식) */}
        <fog attach="fog" args={['#1a1a20', 30, 70]} />
        {/* 구운 하늘빛이 음영을 담당하므로 실시간 조명은 '면 방향 구분' 정도만 한다.
            환경광을 올리고 방향광을 낮춰야 구운 값이 뭉개지지 않는다. */}
        <ambientLight intensity={0.9} />
        <directionalLight
          position={[8, 14, 6]}
          intensity={1.1}
          castShadow={shadowsOn}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20} shadow-camera-right={20}
          shadow-camera-top={20} shadow-camera-bottom={-20}
          shadow-bias={-0.0005}
        />
        <hemisphereLight intensity={0.25} />

        <Grid
          args={[200, 200]}
          cellSize={CELL_X}
          cellThickness={0.5}
          sectionSize={CELL_X * 8}
          sectionThickness={1}
          cellColor="#3a3a46"
          sectionColor="#55556a"
          fadeDistance={60}
          infiniteGrid
          position={[0, -0.001, 0]}
        />

        {/* 바닥 — 클릭 대상(레이캐스트)이자 그림자 수신면. P2에서 '가상 바닥'으로 승격된다 */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
          onPointerMove={(e) => { if (locked) return; e.stopPropagation(); setHover(e.point); }}
          onClick={(e) => { e.stopPropagation(); doPlace(); }}
        >
          <planeGeometry args={[400, 400]} />
          <shadowMaterial opacity={0.35} />
        </mesh>

        {/* 작업 평면(높이 고정 모드) — 이 높이에서 XZ를 받는다. 격자로 "지금 이 층" 표시 */}
        {locked && (
          <group position={[0, lockY * CELL_Y, 0]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerMove={(e) => { e.stopPropagation(); setHover(e.point); }}
              onClick={(e) => { e.stopPropagation(); doPlace(); }}
            >
              <planeGeometry args={[400, 400]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <Grid
              args={[120, 120]}
              cellSize={CELL_X}
              cellThickness={0.5}
              sectionSize={CELL_X * 8}
              sectionThickness={1}
              cellColor="#4a6b8a"
              sectionColor="#7aa7cc"
              fadeDistance={45}
              side={THREE.DoubleSide}
            />
          </group>
        )}

        <BrickInstances
          world={world}
          version={version}
          onHover={onBrickHover}
          onPlace={doPlace}
          onRemove={(h) => removeBrick(h.brickId)}
          onStats={setStats}
          studStyle={studStyle}
        />

        {/* 놓을 면의 격자 — 돌기가 하던 "여기 붙는다" 역할.
            고정 모드에선 작업 평면 격자가 이미 같은 일을 하므로 중복을 피한다 */}
        {!locked && <PlacementGrid anchor={anchor} part={part} rot={rot} />}

        <BrickGhost anchor={anchor} part={part} rot={rot} valid={valid} studStyle={studStyle} />
        <PerfMeter onPerf={setPerf} />
        <Streamer />

        <OrbitControls
          makeDefault
          enableDamping={false}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={1}
          maxDistance={200}
          mouseButtons={{ LEFT: undefined, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        />
      </Canvas>

      {/* ── 좌측 도구 ─────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 w-56 rounded-xs bg-surface border border-border shadow-float p-3 text-foreground">
        <div className="text-[13px] font-medium mb-2">브릭 프로토타입 (P0)</div>

        <div className="text-[10px] uppercase text-muted mb-1">파츠 <span className="opacity-60">1~4</span></div>
        <div className="flex gap-1 mb-3">
          {PART_LIST.map((p) => (
            <button key={p.id} onClick={() => setPart(p.id)} className={`${btn} flex-1 ${part === p.id ? on : off}`}>{p.label}</button>
          ))}
        </div>

        <div className="text-[10px] uppercase text-muted mb-1">방향 <span className="opacity-60">R</span></div>
        <button onClick={rotate} className={`${btn} w-full mb-3 ${off}`}>회전 {rot * 90}°</button>

        <div className="text-[10px] uppercase text-muted mb-1">높이 <span className="opacity-60">L</span></div>
        <button
          onClick={() => toggleLock(anchor?.y ?? 0)}
          className={`${btn} w-full mb-1 ${locked ? on : off}`}
        >
          {locked ? '높이 고정 중' : '발밑에 얹기 (자동)'}
        </button>
        {locked && (
          <div className="flex items-center gap-1 mb-3">
            <button onClick={() => nudgeLock(-1)} className={`${btn} px-2 ${off}`}>−</button>
            <div className="flex-1 text-center text-[11px] leading-tight">
              {Math.floor(lockY / BRICK_CELLS_Y) + 1}층
              <span className="text-muted"> · {(lockY * CELL_Y).toFixed(1)}m</span>
            </div>
            <button onClick={() => nudgeLock(1)} className={`${btn} px-2 ${off}`}>+</button>
          </div>
        )}
        {!locked && <div className="mb-3 text-[10px] text-muted leading-relaxed">천장·2층 바닥처럼 발밑이 빈 자리는 고정해야 놓입니다.</div>}

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
        <button onClick={clear} className={`${btn} w-full ${off}`}>전체 지우기</button>
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
          프레임 전체{shadowsOn && <span className="normal-case"> (그림자 패스 포함)</span>}
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
          onClick={() => setShadowsOn((v) => !v)}
          className={`${btn} w-full mt-2 ${shadowsOn ? on : off}`}
        >
          그림자 {shadowsOn ? '켬' : '끔'}
        </button>
        <button
          onClick={() => {
            const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
            void navigator.clipboard.writeText(
              [
                `FPS ${perf.fps}`,
                `브릭 ${world.count}`,
                `보이는 브릭 ${stats.instances} (${pct(stats.instances, world.count)})`,
                `그림자 ${shadowsOn ? '켬' : '끔'}`,
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
        <b>좌클릭</b> 놓기 · <b>우클릭</b> 삭제 · <b>우드래그</b> 회전 · <b>휠</b> 줌 · <b>L</b> 높이 고정 · <b>PgUp/PgDn</b> 층
        <span className="text-muted">
          {locked ? ' · 고정 중: 발밑이 비어도 이 높이에 놓인다' : ' · 브릭은 발밑에서 가장 높은 것 위에 얹힌다'}
        </span>
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
  useFrame(({ camera }) => {
    const { x, z } = camera.position;
    if (Math.abs(x - last.current.x) < 4 && Math.abs(z - last.current.z) < 4) return;
    last.current = { x, z };
    void stream(x, z);
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
