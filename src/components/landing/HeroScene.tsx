'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Float, RoundedBox, Grid } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useRef, useMemo, useState, useEffect, type ReactNode } from 'react';
import * as THREE from 'three';

/**
 * 랜딩 히어로용 인터랙티브 R3F 씬 — 커서를 따라 움직이고 발광(Bloom)하는 오브젝트 클러스터.
 * 우리 3D 엔진으로 마케팅을 렌더("제품으로 만든 마케팅"). reduced-motion이면 정지.
 *
 * 얕은 편집 인터랙션(에디터 스택 없이 자체 완결):
 *   호버 = 살짝 커지고 발광↑ + 포인터 커서 / 클릭 = 색 순환 + 팝 애니메이션.
 *   에디터의 선택·기즈모·스토어는 끌어오지 않는다(랜딩 번들·프레임 보호).
 */
const REDUCE = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 클릭할 때마다 순환하는 색 — 브랜드 팔레트(바이올렛→시안→핑크→앰버→민트) */
const PALETTE: { c: string; e: string }[] = [
  { c: '#7c5cff', e: '#5b3fe0' },
  { c: '#39d0ea', e: '#0e7f96' },
  { c: '#ff7ac0', e: '#c0407e' },
  { c: '#ffd36a', e: '#e0a020' },
  { c: '#7ef0b0', e: '#1f9c68' },
];

type ShapeProps = {
  children: ReactNode;               // geometry
  position: [number, number, number];
  rotation?: [number, number, number];
  color: number;                     // PALETTE 시작 인덱스
  emissive?: number;                 // 기본 발광 세기
  metalness?: number;
  roughness?: number;
  float: { speed: number; rot: number; f: number };
  reduce: boolean;
  onPick: () => void;                // 히어로 힌트 숨김용
};

function Shape({ children, position, rotation, color, emissive = 0.5, metalness = 0.5, roughness = 0.22, float, reduce, onPick }: ShapeProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const [idx, setIdx] = useState(color);
  const [hover, setHover] = useState(false);
  const punch = useRef(0); // 클릭 순간 튀어오르는 양(감쇠)

  const p = PALETTE[idx % PALETTE.length];

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    punch.current = THREE.MathUtils.damp(punch.current, 0, 6, dt);
    const target = (hover ? 1.09 : 1) + punch.current;
    const k = reduce ? 1 : THREE.MathUtils.damp(m.scale.x, target, 12, dt);
    m.scale.setScalar(k);
    if (mat.current) {
      mat.current.emissiveIntensity = THREE.MathUtils.damp(
        mat.current.emissiveIntensity,
        hover ? emissive * 2.1 : emissive,
        10,
        dt,
      );
    }
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(true);
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    setHover(false);
    document.body.style.cursor = '';
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setIdx((i) => (i + 1) % PALETTE.length);
    punch.current = 0.22;
    onPick();
  };

  // 언마운트 시 커서 원복(호버 상태로 사라져도 커서가 남지 않게)
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  return (
    <Float speed={reduce ? 0 : float.speed} rotationIntensity={float.rot} floatIntensity={float.f}>
      <mesh
        ref={mesh}
        position={position}
        rotation={rotation}
        onPointerOver={over}
        onPointerOut={out}
        onClick={click}
      >
        {children}
        <meshStandardMaterial
          ref={mat}
          color={p.c}
          emissive={p.e}
          emissiveIntensity={emissive}
          metalness={metalness}
          roughness={roughness}
        />
      </mesh>
    </Float>
  );
}

/** RoundedBox는 자체 지오메트리를 들고 있어 Shape의 mesh 패턴과 달라 별도 처리 */
function HeroBox({ reduce, onPick, position }: { reduce: boolean; onPick: () => void; position: [number, number, number] }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const punch = useRef(0);
  const p = PALETTE[idx % PALETTE.length];

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    punch.current = THREE.MathUtils.damp(punch.current, 0, 6, dt);
    const target = (hover ? 1.07 : 1) + punch.current;
    m.scale.setScalar(reduce ? 1 : THREE.MathUtils.damp(m.scale.x, target, 12, dt));
    if (mat.current) {
      mat.current.emissiveIntensity = THREE.MathUtils.damp(mat.current.emissiveIntensity, hover ? 0.8 : 0.35, 10, dt);
    }
  });

  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  return (
    <Float speed={reduce ? 0 : 0.65} rotationIntensity={0.5} floatIntensity={0.9}>
      <RoundedBox
        ref={mesh}
        args={[1.6, 1.6, 1.6]}
        radius={0.24}
        smoothness={6}
        position={position}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); setIdx((i) => (i + 1) % PALETTE.length); punch.current = 0.2; onPick(); }}
      >
        <meshStandardMaterial ref={mat} color={p.c} emissive={p.e} emissiveIntensity={0.35} metalness={0.5} roughness={0.2} />
      </RoundedBox>
    </Float>
  );
}

/**
 * 위도/경도 링으로 구 와이어를 만든다.
 * SphereGeometry + wireframe은 삼각형 대각선까지 나와 지저분하므로 링을 직접 구성.
 */
function makeGlobeWire(r: number, lat = 7, lon = 12, seg = 72) {
  const p: number[] = [];
  const push = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => p.push(x1, y1, z1, x2, y2, z2);

  for (let i = 1; i < lat; i++) {            // 위도(가로 링)
    const phi = (i / lat) * Math.PI;
    const y = r * Math.cos(phi);
    const rr = r * Math.sin(phi);
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2, b = ((s + 1) / seg) * Math.PI * 2;
      push(Math.cos(a) * rr, y, Math.sin(a) * rr, Math.cos(b) * rr, y, Math.sin(b) * rr);
    }
  }
  for (let j = 0; j < lon; j++) {            // 경도(세로 링)
    const th = (j / lon) * Math.PI;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2, b = ((s + 1) / seg) * Math.PI * 2;
      push(Math.sin(a) * r * Math.cos(th), Math.cos(a) * r, Math.sin(a) * r * Math.sin(th),
           Math.sin(b) * r * Math.cos(th), Math.cos(b) * r, Math.sin(b) * r * Math.sin(th));
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return g;
}

/** 중앙 배경 오브젝트 — 면 없이 라인만 그린 구. 헤드라인을 가리지 않는다 */
function WireObject({ reduce }: { reduce: boolean }) {
  const ref = useRef<THREE.LineSegments>(null);
  // 링이 많을수록 앞/뒤 반구 선이 겹쳐 알파가 누적돼 진해 보인다 → 밀도를 낮춘다
  const geo = useMemo(() => makeGlobeWire(0.95, 5, 8, 64), []);
  useEffect(() => () => geo.dispose(), [geo]);

  useFrame((_, dt) => {
    if (reduce || !ref.current) return;
    const k = Math.min(dt, 1 / 30); // 렌더 정지 후 복귀 시 튀지 않게
    ref.current.rotation.y += k * 0.08;
    ref.current.rotation.x += k * 0.03;
  });

  return (
    <lineSegments ref={ref} geometry={geo} position={[0, 0.5, -1.8]} raycast={() => null}>
      {/*
        밝기를 알파에만 맡기지 않는다 — 겹친 선끼리 알파가 누적돼 설정값보다 진해 보이기 때문.
        어두운 색 자체로 이미 흐리게 만들고(검정 배경 기준) 알파는 보조로만 쓴다.
        toneMapped=false로 톤매핑이 색을 끌어올리는 것도 막는다.
      */}
      <lineBasicMaterial color="#4a4560" transparent opacity={0.6} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

/**
 * 렌더 루프를 멈춰도 THREE.Clock은 실시간을 계속 센다 → 재개 시 elapsedTime이 수십 초 점프하고,
 * 그 시간을 읽는 drei <Float>가 한 프레임에 튄다. 멈추기 직전 시각을 저장했다가 재개할 때 되돌린다.
 */
function ClockGuard({ paused }: { paused: boolean }) {
  const clock = useThree((s) => s.clock);
  const saved = useRef(0);
  useEffect(() => {
    if (paused) { saved.current = clock.elapsedTime; return; }
    clock.getDelta();                  // 멈춘 동안 쌓인 델타를 한 번 삼켜 oldTime을 현재로
    clock.elapsedTime = saved.current;  // 멈추기 직전 시각으로 복원
  }, [paused, clock]);
  return null;
}

function Cluster({ onPick }: { onPick: () => void }) {
  const g = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const reduce = useMemo(REDUCE, []);
  const size = useThree((s) => s.size);

  useFrame((state, dt) => {
    const grp = g.current;
    if (!grp) return;
    if (reduce) return;
    // 렌더 루프가 멈췄다 켜지면 dt에 수십 초가 한꺼번에 들어온다 → 클램프한 자체 시간축으로 자전
    // (clock.elapsedTime을 그대로 쓰면 목표 각도가 튀어 오브젝트가 확 돌아간다)
    spin.current += Math.min(dt, 1 / 30) * 0.03;
    // 커서 추종 기울기 폭(반응 속도가 아니라 움직이는 양)
    const targetY = state.pointer.x * 0.275 + spin.current;
    const targetX = -state.pointer.y * 0.15;
    // 프레임레이트 독립 감쇠 + 큰 dt 클램프(멈춤 복귀 시 따라잡기 회전 방지)
    const k = Math.min(dt, 1 / 30);
    grp.rotation.y = THREE.MathUtils.damp(grp.rotation.y, targetY, 2.8, k);
    grp.rotation.x = THREE.MathUtils.damp(grp.rotation.x, targetX, 2.8, k);
  });

  // 화면이 넓을수록 좌우로 더 벌린다(가운데 텍스트를 피해 화면 폭을 쓰게).
  // 좁은 화면에선 좁혀서 오브젝트가 밖으로 밀려나지 않게.
  const ar = size.width / Math.max(1, size.height);
  const sx = THREE.MathUtils.clamp(ar / 1.6, 0.5, 1.25);

  return (
    <group ref={g}>
      <WireObject reduce={reduce} />
      <HeroBox reduce={reduce} onPick={onPick} position={[-3.0 * sx, 0.5, -0.8]} />
      <Shape position={[3.3 * sx, 1.5, -1]} color={1} emissive={0.5} metalness={0.6} roughness={0.12}
        float={{ speed: 1, rot: 0.6, f: 1.2 }} reduce={reduce} onPick={onPick}>
        <sphereGeometry args={[0.6, 64, 64]} />
      </Shape>
      <Shape position={[-3.6 * sx, -1.4, 0.9]} rotation={[0.6, 0.3, 0]} color={2} emissive={0.55} metalness={0.4} roughness={0.25}
        float={{ speed: 0.85, rot: 1, f: 1 }} reduce={reduce} onPick={onPick}>
        <torusGeometry args={[0.55, 0.2, 32, 96]} />
      </Shape>
      <Shape position={[2.6 * sx, -1.7, 1.1]} color={0} emissive={0.9} metalness={0.15} roughness={0.35}
        float={{ speed: 1.2, rot: 1.2, f: 1.4 }} reduce={reduce} onPick={onPick}>
        <icosahedronGeometry args={[0.46, 0]} />
      </Shape>
      <Shape position={[-1.9 * sx, 2.2, -1.4]} rotation={[0.4, 0, 0.5]} color={1} emissive={0.7} metalness={0.4} roughness={0.18}
        float={{ speed: 0.95, rot: 0.8, f: 1.1 }} reduce={reduce} onPick={onPick}>
        <capsuleGeometry args={[0.2, 0.45, 12, 24]} />
      </Shape>
      <Shape position={[1.6 * sx, 2.4, -1.8]} color={3} emissive={0.6} metalness={0.5} roughness={0.3}
        float={{ speed: 1.1, rot: 1, f: 1.3 }} reduce={reduce} onPick={onPick}>
        <dodecahedronGeometry args={[0.34, 0]} />
      </Shape>
      <Shape position={[4.4 * sx, -0.6, 0.2]} color={4} emissive={0.55} metalness={0.45} roughness={0.22}
        float={{ speed: 0.8, rot: 0.9, f: 1.2 }} reduce={reduce} onPick={onPick}>
        <torusKnotGeometry args={[0.3, 0.11, 96, 24]} />
      </Shape>
      <Shape position={[-4.6 * sx, 1.9, -0.4]} color={2} emissive={0.6} metalness={0.5} roughness={0.2}
        float={{ speed: 1.05, rot: 1.1, f: 1.3 }} reduce={reduce} onPick={onPick}>
        <octahedronGeometry args={[0.42, 0]} />
      </Shape>
    </group>
  );
}

export default function HeroScene({ onPick }: { onPick?: () => void }) {
  const reduce = useMemo(REDUCE, []);
  const wrap = useRef<HTMLDivElement>(null);
  // 히어로가 화면 밖으로 나가면 렌더 루프를 멈춘다 — 스크롤 중 GPU 부하 제거(가장 큰 최적화)
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} style={{ width: '100%', height: '100%' }}>
    <Canvas
      dpr={[1, 1.5]}
      frameloop={visible ? 'always' : 'never'}
      // 위에서 45°로 내려다보는 앵글(높이 = 거리) — R3F가 기본 카메라를 원점으로 lookAt 해준다
      camera={{ position: [0, 4.4, 4.4], fov: 42 }}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 5]} intensity={2.4} color="#ffffff" />
      <directionalLight position={[-6, -2, 2]} intensity={1} color="#8b78ff" />
      <pointLight position={[0, 0, 5]} intensity={1.6} color="#39d0ea" distance={16} />
      <pointLight position={[-4, 3, -2]} intensity={1.2} color="#ff7ac0" distance={14} />
      <ClockGuard paused={!visible} />
      {/* 에디터와 같은 바닥 그리드. Cluster 밖에 두어 커서에 반응하지 않는 고정 배경 */}
      <Grid
        position={[0, -2.6, 0]}
        args={[60, 60]}
        cellSize={0.4}
        cellThickness={0.5}
        cellColor="#413c58"
        sectionSize={2}
        sectionThickness={0.7}
        sectionColor="#544d78"
        fadeDistance={26}
        fadeStrength={1.3}
        infiniteGrid
      />
      <Cluster onPick={onPick ?? (() => {})} />
      {!reduce && (
        // multisampling 기본값 8은 전체 화면 MSAA라 비싸다 → 2로. Bloom도 임계값을 올려 번지는 픽셀 수를 줄임
        <EffectComposer multisampling={2}>
          <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.5} luminanceSmoothing={0.4} radius={0.7} />
        </EffectComposer>
      )}
    </Canvas>
    </div>
  );
}
