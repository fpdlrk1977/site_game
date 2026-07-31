'use client';

// P0 프로토타입 — 기준: doc/BRICK_SYSTEM.md §8 (P0가 게이트)
//
// 검증 목표 두 가지:
//   ① 감각 — 실제로 테이블 하나와 방 하나를 만들어본다
//   ② 폴리곤 예산 — 브릭은 큐브의 3~17배다. 여기서 안 나오면 스터드 처리를 바꿔야 한다
//
// 기존 에디터 코드는 건드리지 않는다. DB도 쓰지 않는다(메모리만).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BrickOrbit } from '@/components/brick/BrickOrbit';
import { BrickBuilder, brickCursor, useEffectiveTool } from '@/components/brick/BrickBuilder';
import { BrickToolPanel } from '@/components/brick/BrickToolPanel';
import type { FacePlacement } from '@/lib/brick/placement';
import { attachBrickStorage, useBrickStore } from '@/store/brickStore';

interface Stats { groups: number; instances: number; tris: number }

export default function BrickPrototype() {
  const { world, version, saveState, loaded, backend } = useBrickStore();
  const { clear, stressFill, loadWorld, flush, indexedChunks } = useBrickStore();

  const [stats, setStats] = useState<Stats>({ groups: 0, instances: 0, tris: 0 });
  const [perf, setPerf] = useState({ fps: 0, calls: 0, tris: 0 });
  const [copied, setCopied] = useState(false);
  /** 계기판용 — 지금 놓일 자리(BrickBuilder가 알려준다) */
  const [spot, setSpot] = useState<FacePlacement | null>(null);
  const [valid, setValid] = useState(false);
  const onSpot = useCallback((s2: FacePlacement | null, v: boolean) => { setSpot(s2); setValid(v); }, []);
  const anchor = spot?.anchor ?? null;
  const effTool = useEffectiveTool();

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
        style={{ cursor: brickCursor(effTool) }}
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

        {/* ★ 브릭 렌더 + 상호작용은 한 덩어리다 — 에디터와 **같은 컴포넌트**를 쓴다.
            각자 배선하면 반드시 갈라진다(배치 규칙이 이 세션에 네 번 바뀌었다). */}
        <BrickBuilder onStats={setStats} onSpot={onSpot} />

        <PerfMeter onPerf={setPerf} />
        <Mover />
        <Streamer />

        {/* 카메라 조작 — 에디터와 **같은 컴포넌트**. 설정을 바꿀 땐 BrickOrbit만 고친다 */}
        <BrickOrbit />
      </Canvas>

      {/* ── 좌측 도구 ─────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 w-56 rounded-xs bg-surface border border-border shadow-float p-3 text-foreground">
        <div className="text-[13px] font-medium mb-2">브릭 프로토타입 (P0)</div>

        {/* ★ 도구 UI는 **에디터와 같은 컴포넌트**다 — 두 곳에 흩어지면 반드시 갈라진다 */}
        <BrickToolPanel showStudStyle />

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

        {/* ★ 배치 계기판 — "어긋난다"를 느낌이 아니라 **숫자로** 확인한다.
            겨눈 칸(강조된 사각형)과 놓일 첫 칸이 화면과 맞는지 여기서 바로 읽을 수 있다. */}
        <div className="mt-1.5 pt-1.5 border-t border-border" />
        <div className="text-[10px] uppercase text-muted mb-0.5">배치</div>
        {spot ? (
          <>
            <Row label="겨눈 칸" value={`${spot.cell[0]}, ${spot.cell[1]}, ${spot.cell[2]}`} />
            <Row label="놓일 첫 칸" value={`${anchor!.x}, ${anchor!.y}, ${anchor!.z}`} />
            <Row label="면" value={`${'xyz'[spot.face.axis]}${spot.face.dir > 0 ? '+' : '−'}`} />
            <Row label="놓을 수 있나" value={valid ? '예' : '아니오 (막힘)'} />
          </>
        ) : (
          <Row label="겨눈 칸" value="—" />
        )}
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
