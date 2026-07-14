"use client";

import { useRef, useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Sky, Environment } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useSceneStore } from "@/store/sceneStore";
import { EditorObjectInstance } from "./EditorObjectInstance";
import { GizmoController } from "./GizmoController";
import { ObjectRefsContext, useObjectRefs } from "./ObjectRefsContext";
import { pointerDownOnObjectRef } from "./boxSelectState";
import { PostProcessingEffects } from "@/components/three/PostProcessingEffects";
import { GroundPlane } from "@/components/three/GroundPlane";
import { worldBBox } from "@/lib/objectBBox";
import { sampleClip } from "@/lib/animSample";
import { exportObjectsToGlb } from "@/lib/exportGlb";
import { DefaultEnvironment } from "@/components/three/DefaultEnvironment";
import { SceneToneMapping } from "@/components/three/SceneToneMapping";
import { BoundaryWalls } from "@/components/three/BoundaryWalls";
import { CharacterPreview } from "./CharacterPreview";
import { FolderOpen } from "lucide-react";
import type { Vector3 as Vec3, HdrPreset } from "@/types/scene";

function BoundaryGizmo({ sizeX, sizeZ }: { sizeX: number; sizeZ: number }) {
  const bx = sizeX;
  const bz = sizeZ;
  const H = 8;
  const positions = useMemo(
    () =>
      new Float32Array([
        // 바닥 사각형
        -bx,
        0.02,
        -bz,
        bx,
        0.02,
        -bz,
        bx,
        0.02,
        -bz,
        bx,
        0.02,
        bz,
        bx,
        0.02,
        bz,
        -bx,
        0.02,
        bz,
        -bx,
        0.02,
        bz,
        -bx,
        0.02,
        -bz,
        // 모서리 기둥
        -bx,
        0,
        -bz,
        -bx,
        H,
        -bz,
        bx,
        0,
        -bz,
        bx,
        H,
        -bz,
        bx,
        0,
        bz,
        bx,
        H,
        bz,
        -bx,
        0,
        bz,
        -bx,
        H,
        bz,
        // 상단 사각형
        -bx,
        H,
        -bz,
        bx,
        H,
        -bz,
        bx,
        H,
        -bz,
        bx,
        H,
        bz,
        bx,
        H,
        bz,
        -bx,
        H,
        bz,
        -bx,
        H,
        bz,
        -bx,
        H,
        -bz,
      ]),
    [bx, bz],
  );
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#f59e0b" />
    </lineSegments>
  );
}

function SpawnMarker({ position }: { position: Vec3 }) {
  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1, 8]} />
        <meshBasicMaterial color="#10b981" />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <coneGeometry args={[0.14, 0.35, 8]} />
        <meshBasicMaterial color="#10b981" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 16]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

// 전역 태양 방향 표식(읽기 전용) — Environment › Lights › Sun Position(directionalPosition)이
// 화면 어디서 어느 방향으로 비추는지 보여준다. 전역 directionalLight는 이 위치에서 원점(0,0,0)을
// 향해 비추므로, 광선 방향 = normalize(-directionalPosition). 조명 동작/값은 건드리지 않는 순수
// 에디터 표식(뷰어/플레이 미표시). 노랑 구=태양 위치(dir×R), 화살표=광선 방향(태양→원점).
function SunDirectionGizmo({ position }: { position: Vec3 }) {
  const R = 10;
  const shaftLen = 2.4;
  const { sunPos, quat } = useMemo(() => {
    const dir = new THREE.Vector3(position.x, position.y, position.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    const sun = dir.clone().multiplyScalar(R);
    const rayDir = dir.clone().multiplyScalar(-1); // 태양 → 원점(광선이 나아가는 방향)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), rayDir);
    return { sunPos: sun, quat: q };
  }, [position.x, position.y, position.z]);

  // depthTest=false + 높은 renderOrder → 바닥/그리드/오브젝트에 가려지지 않고 항상 위에 그려짐
  // (카메라를 낮춰도 높이 뜬 태양 표식이 바닥에 가리지 않게 하는 오버레이 규칙).
  return (
    <group renderOrder={999}>
      {/* 태양 위치 */}
      <mesh position={[sunPos.x, sunPos.y, sunPos.z]} renderOrder={999}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color="#facc15" depthTest={false} depthWrite={false} />
      </mesh>
      {/* 광선 방향 화살표(태양 → 원점) — 로컬 +Y축이 rayDir을 향하도록 회전 */}
      <group position={[sunPos.x, sunPos.y, sunPos.z]} quaternion={quat}>
        <mesh position={[0, shaftLen / 2, 0]} renderOrder={999}>
          <cylinderGeometry args={[0.05, 0.05, shaftLen, 8]} />
          <meshBasicMaterial color="#facc15" depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0, shaftLen + 0.25, 0]} renderOrder={999}>
          <coneGeometry args={[0.2, 0.5, 12]} />
          <meshBasicMaterial color="#facc15" depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function CameraCapture({ cameraRef }: { cameraRef: React.MutableRefObject<THREE.Camera | null> }) {
  const { camera } = useThree();
  cameraRef.current = camera;
  return null;
}

// 애니 클립의 회전 피벗(경첩) 표식 — 선택 오브젝트에 클립이 있을 때만. 에디터 전용(뷰어 미표시).
//   앰버 구=피벗 점, 수직선=회전축(대개 수직 경첩). depthTest off로 물체 뒤에서도 보임.
const _ANIM_DEG = Math.PI / 180;
function AnimPivotGizmo() {
  const selectedId = useSceneStore((s) => s.selectedId);
  const objects = useSceneStore((s) => s.objects);
  const animClips = useSceneStore((s) => s.animClips);
  if (!selectedId) return null;
  const obj = objects.find((o) => o.id === selectedId);
  if (!obj || obj.isGroup || obj.parentId) return null; // 단일 루트 오브젝트만(피벗 UI와 동일)
  const clip = animClips.find((c) => c.rootId === selectedId);
  if (!clip) return null;
  const p = clip.pivot ?? { x: 0, y: 0, z: 0 };
  const e = new THREE.Euler(obj.rotation.x * _ANIM_DEG, obj.rotation.y * _ANIM_DEG, obj.rotation.z * _ANIM_DEG, "XYZ");
  const rp = new THREE.Vector3(p.x, p.y, p.z).applyEuler(e);
  return (
    <group position={[obj.position.x + rp.x, obj.position.y + rp.y, obj.position.z + rp.z]} renderOrder={1000}>
      <mesh renderOrder={1000}>
        <cylinderGeometry args={[0.015, 0.015, 2.4, 8]} />
        <meshBasicMaterial color="#f5a623" transparent opacity={0.55} depthTest={false} />
      </mesh>
      <mesh renderOrder={1000}>
        <sphereGeometry args={[0.085, 16, 16]} />
        <meshBasicMaterial color="#f5a623" depthTest={false} />
      </mesh>
    </group>
  );
}

// 에디터 미리보기(▶) — animPreview가 켜지면 클립을 뷰포트에서 재생. 오브젝트 Three ref를 매 프레임 직접 구동
//   (기즈모와 동일한 비파괴 방식 — 스토어/저장 무변경). 종료 시 스토어 트랜스폼으로 복원.
function ClipPreview() {
  const refsMap = useObjectRefs();
  const animPreview = useSceneStore((s) => s.animPreview);
  const stopAnimPreview = useSceneStore((s) => s.stopAnimPreview);
  const affectedRef = useRef<Set<string>>(new Set());

  // 미리보기 종료(animPreview=null) 시 영향받은 오브젝트를 스토어 값으로 복원(비파괴)
  useEffect(() => {
    if (animPreview) return;
    const ids = affectedRef.current;
    if (ids.size === 0) return;
    const { objects } = useSceneStore.getState();
    for (const id of ids) {
      const ref = refsMap.current.get(id);
      const o = objects.find((x) => x.id === id);
      if (ref && o) {
        ref.position.set(o.position.x, o.position.y, o.position.z);
        ref.rotation.set(o.rotation.x * _ANIM_DEG, o.rotation.y * _ANIM_DEG, o.rotation.z * _ANIM_DEG);
        ref.scale.set(o.scale.x, o.scale.y, o.scale.z);
      }
    }
    affectedRef.current = new Set();
  }, [animPreview, refsMap]);

  useFrame(() => {
    if (!animPreview) return;
    const { animClips } = useSceneStore.getState();
    const clip = animClips.find((c) => c.id === animPreview.clipId);
    if (!clip) { stopAnimPreview(); return; }
    let t = (performance.now() - animPreview.startedAt) / 1000;
    if (clip.loop) t = clip.duration > 0 ? t % clip.duration : 0;
    else if (t >= clip.duration) t = clip.duration; // 끝 포즈 유지(정지 버튼으로 종료·복원)
    const samples = sampleClip(clip, t);
    for (const id in samples) {
      const ref = refsMap.current.get(id);
      if (!ref) continue;
      affectedRef.current.add(id);
      const s = samples[id];
      if (s.position) ref.position.set(s.position.x, s.position.y, s.position.z);
      if (s.rotation) ref.rotation.set(s.rotation.x * _ANIM_DEG, s.rotation.y * _ANIM_DEG, s.rotation.z * _ANIM_DEG);
      if (s.scale) ref.scale.set(s.scale.x, s.scale.y, s.scale.z);
    }
  });
  return null;
}

// 씬 로드 직후 1회 자동 전체 맞춤 — 저장한 넓은 공간을 다시 열 때 카메라가 너무 가깝지 않도록
// 들어오자마자 Shift+F(전체 맞춤) 뷰로 시작. Canvas 내부라 orbitRef 준비 타이밍이 보장되고,
// sceneLoadTick에 묶어 '로드 시점'에만 fit(새 빈 씬에서 첫 오브젝트 추가 시 카메라 튐 방지).
function InitialFit({ orbitRef }: { orbitRef: React.RefObject<OrbitControlsImpl | null> }) {
  const lastTick = useRef<number | null>(null);
  useFrame(() => {
    const { sceneLoadTick, objects } = useSceneStore.getState();
    if (lastTick.current === sceneLoadTick) return; // 이 로드는 이미 처리
    const orbit = orbitRef.current;
    if (!orbit) return; // orbitRef 준비 전엔 대기(아직 tick 소비 안 함)
    lastTick.current = sceneLoadTick;
    const roots = objects.filter((o) => o.visible && o.parentId === null);
    if (roots.length === 0) return; // 빈 씬 → fit 안 함
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const o of roots) {
      minX = Math.min(minX, o.position.x);
      maxX = Math.max(maxX, o.position.x);
      minY = Math.min(minY, o.position.y);
      maxY = Math.max(maxY, o.position.y);
      minZ = Math.min(minZ, o.position.z);
      maxZ = Math.max(maxZ, o.position.z);
    }
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2,
      cz = (minZ + maxZ) / 2;
    const spread = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 4);
    orbit.target.set(cx, cy, cz);
    orbit.object.position.set(cx + spread * 0.8, cy + spread * 0.6, cz + spread * 0.8);
    orbit.update();
  });
  return null;
}

type SelBox = { left: number; top: number; width: number; height: number };

// 배치 모드 고스트 — 마우스 커서(바닥)를 따라다니는 단순 반투명 플레이스홀더 + 바닥 링.
function PlacementGhost({ posRef }: { posRef: React.MutableRefObject<THREE.Vector3> }) {
  const pending = useSceneStore((s) => s.pendingPlacement);
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) groupRef.current.position.copy(posRef.current);
  });
  if (!pending) return null;
  return (
    <group ref={groupRef}>
      {/* <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.3} depthWrite={false} />
      </mesh> */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <boxGeometry args={[1.5, 1.5, 0]} />
        <meshBasicMaterial color="#FF66C2" transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// 그룹 격리 스코프 진입 시 상단 배너 — 사용자가 "그룹 안에서 편집 중"임을 알리고 나가기 제공.
function GroupScopeIndicator() {
  const groupScope = useSceneStore((s) => s.groupScope);
  const name = useSceneStore((s) => s.objects.find((o) => o.id === s.groupScope)?.name);
  const setGroupScope = useSceneStore((s) => s.setGroupScope);
  const selectObject = useSceneStore((s) => s.selectObject);

  useEffect(() => {
    if (!groupScope) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGroupScope(null);
        selectObject(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [groupScope, setGroupScope, selectObject]);

  if (!groupScope) return null;
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-primary/90 text-white text-[11px] px-3 py-1 shadow-lg backdrop-blur pointer-events-auto">
      <span className="font-medium flex items-center gap-1.5">
        <FolderOpen size={13} /> 그룹 편집 중{name ? ` — ${name}` : ""}
      </span>
      <button
        onClick={() => {
          setGroupScope(null);
          selectObject(null);
        }}
        className="rounded-full bg-white/20 hover:bg-white/30 px-2 py-0.5 transition-colors cursor-pointer"
      >
        나가기 (Esc)
      </button>
    </div>
  );
}

// 박스(단위) 8꼭짓점 중 한 축만 다른 12개 엣지(인덱스: x=i&1, y=i&2, z=i&4)
const BOX_EDGE_PAIRS: [number, number][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7], // x
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7], // y
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7], // z
];

// SelectionOverlay 미리보기용 재사용 임시 벡터 (매 프레임 할당 방지)
const _ovCamPos = new THREE.Vector3();
const _ovCamDir = new THREE.Vector3();
const _ovFp = new THREE.Vector3();
const _ovProj = new THREE.Vector3();

// 선택 오버레이 (Canvas 내부, 별도 레이어) — 오브젝트 렌더는 건드리지 않는다.
//  ① 드래그 미리보기: 드래그 중 박스에 '닿는' 오브젝트들에 연보라 와이어프레임(닿기 선택과 일치)
//  ② 선택 바운더리: 2개 이상 선택 시 전체를 감싸는 청록 바운딩 박스(무엇이 선택됐는지 한눈에)
function SelectionOverlay({
  dragRectRef,
  isDraggingRef,
  dragCanvasRectRef,
}: {
  dragRectRef: React.MutableRefObject<{ x1: number; y1: number; x2: number; y2: number } | null>;
  isDraggingRef: React.MutableRefObject<boolean>;
  dragCanvasRectRef: React.MutableRefObject<DOMRect | null>;
}) {
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const { camera, size } = useThree();
  const refs = useObjectRefs();

  const bounds = useMemo(() => {
    // matrixAutoUpdate는 true로 둔다 — Box3Helper.updateMatrixWorld가 box로부터 position/scale을 세팅한 뒤
    // updateMatrix()로 행렬에 합성돼야 실제 박스가 union 영역을 따라간다(false면 원점 단위박스로 고정되는 버그).
    const h = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color("#22d3ee"));
    const m = h.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.9;
    m.depthTest = false;
    h.renderOrder = 999;
    h.visible = false;
    return h;
  }, []);

  const preview = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
    const m = new THREE.LineBasicMaterial({ color: "#a78bfa", transparent: true, opacity: 0.9, depthTest: false });
    const ls = new THREE.LineSegments(g, m);
    ls.renderOrder = 999;
    ls.frustumCulled = false;
    ls.visible = false;
    return ls;
  }, []);

  useFrame(() => {
    const { objects, assets } = useSceneStore.getState();

    // ② 선택 바운더리. 드래그 중에도 실시간으로 따라오도록 '라이브 Three 객체(ref)'로 계산한다
    //    (worldBBox는 스키마 기반이라 기즈모 드래그 중엔 커밋 전까지 안 움직임 → 마우스 뗄 때 튀던 문제).
    //    - 2개 이상 선택: 청록(#22d3ee) 묶음 박스
    //    - 그룹 1개 선택: 그룹은 자체 아웃라인이 없으므로 보라(#7c3aed) 박스로 선택 표시(단일 오브젝트 가이드와 통일)
    const single = selectedIds.length === 1 ? objects.find((o) => o.id === selectedIds[0]) : undefined;
    const showBounds = selectedIds.length >= 2 || single?.isGroup === true;
    if (showBounds) {
      const box = new THREE.Box3().makeEmpty();
      const tmp = new THREE.Box3();
      for (const id of selectedIds) {
        const o3 = refs.current.get(id);
        if (o3) {
          tmp.setFromObject(o3);
          if (!tmp.isEmpty()) box.union(tmp);
        } else {
          const b = worldBBox(objects, assets, id); // 폴백(ref 미등록 시)
          if (b && !b.isEmpty()) box.union(b);
        }
      }
      if (!box.isEmpty()) {
        bounds.visible = true;
        (bounds.material as THREE.LineBasicMaterial).color.set(selectedIds.length >= 2 ? "#22d3ee" : "#3a82ed");
        bounds.box.copy(box);
        bounds.updateMatrixWorld(true);
      } else {
        bounds.visible = false;
      }
    } else {
      bounds.visible = false;
    }

    // ① 드래그 미리보기 (드래그 중일 때만)
    const rect = isDraggingRef.current ? dragRectRef.current : null;
    if (!rect) {
      preview.visible = false;
      return;
    }
    // 선택 판정(handlePointerUp)과 동일 소스: 드래그 시작 시 캐시한 캔버스 rect. 미스면 R3F size 폴백.
    const cr = dragCanvasRectRef.current;
    const projW = cr?.width ?? size.width;
    const projH = cr?.height ?? size.height;
    // 카메라 뒤 코너는 project()가 폭주 → 선택 판정과 동일하게 걸러내 미리보기도 일치시킨다.
    const camPos = camera.getWorldPosition(_ovCamPos);
    const camDir = camera.getWorldDirection(_ovCamDir);
    const verts: number[] = [];
    for (const obj of objects) {
      if (obj.locked || !obj.visible || obj.isGroup) continue;
      const b = worldBBox(objects, assets, obj.id);
      if (!b || b.isEmpty()) continue;
      const cs: THREE.Vector3[] = [];
      let anyBehind = false;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
        cs.push(v);
        if (_ovFp.copy(v).sub(camPos).dot(camDir) <= 0.05) {
          anyBehind = true;
          break;
        }
        const p = _ovProj.copy(v).project(camera);
        const sx = (p.x * 0.5 + 0.5) * projW;
        const sy = (-p.y * 0.5 + 0.5) * projH;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
      if (anyBehind) continue; // 카메라 뒤 걸침 → 미리보기 제외(선택도 중심점 폴백이라 아웃라인 생략)
      if (minX <= rect.x2 && maxX >= rect.x1 && minY <= rect.y2 && maxY >= rect.y1) {
        for (const [a, c] of BOX_EDGE_PAIRS) {
          verts.push(cs[a].x, cs[a].y, cs[a].z, cs[c].x, cs[c].y, cs[c].z);
        }
      }
    }
    if (verts.length === 0) {
      preview.visible = false;
      return;
    }
    preview.visible = true;
    preview.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    preview.geometry.computeBoundingSphere();
  });

  return (
    <>
      <primitive object={bounds} />
      <primitive object={preview} />
    </>
  );
}

export function EditorCanvas() {
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const objectRefsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const cameraRef = useRef<THREE.Camera | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gizmoDraggingRef = useRef(false);

  // Box-select drag state — all in refs to avoid stale closures in event handlers
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // 드래그 시작 시점의 캔버스(렌더 서피스) rect를 캐시 — 드래그 사각형·선택 판정·미리보기가 모두
  //   같은 좌표 소스를 쓰게 해 화면 배율(브라우저 줌·DPR)에서 좌표가 어긋나던 문제를 없앤다.
  const dragCanvasRectRef = useRef<DOMRect | null>(null);
  const [selBox, setSelBox] = useState<SelBox | null>(null);

  // 배치 모드 — 뷰포트에서 바닥(y=0)에 레이캐스트해 고스트를 마우스로 따라다니게 하고, 클릭 위치에 생성.
  const placeGhostPosRef = useRef(new THREE.Vector3());
  const placeRaycaster = useRef(new THREE.Raycaster());
  const groundPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const justPlacedRef = useRef(false); // 배치 직후 onPointerMissed의 선택 해제를 1회 무시

  const {
    environment,
    assets,
    focusTarget,
    focusAllRequest,
    focusSelectedRequest,
    exportRequest,
    cameraViewRequest,
    objects,
    bookmarkSaveRequest,
    bookmarkRecallRequest,
    setCameraBookmark,
    pendingPlacement,
    gridPlane,
  } = useSceneStore();
  // 기준 격자 평면 — 바닥(XZ)/벽(XY·YZ). 시각 참조용 회전만.
  const gridRot: [number, number, number] = gridPlane === 'xy' ? [Math.PI / 2, 0, 0] : gridPlane === 'yz' ? [0, 0, Math.PI / 2] : [0, 0, 0];
  const gridPos: [number, number, number] = gridPlane === 'xy' ? [0, 0, -0.001] : gridPlane === 'yz' ? [-0.001, 0, 0] : [0, -0.001, 0];

  // 포인터 이벤트 → 바닥 평면(y=0) 교차점(월드 좌표). 씬 오브젝트와 무관하게 항상 계산.
  const groundPointFromEvent = useCallback((e: { clientX: number; clientY: number }): THREE.Vector3 | null => {
    const cam = cameraRef.current;
    const wr = wrapperRef.current;
    if (!cam || !wr) return null;
    const rect = wr.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    placeRaycaster.current.setFromCamera(ndc, cam);
    const pt = new THREE.Vector3();
    return placeRaycaster.current.ray.intersectPlane(groundPlaneRef.current, pt) ? pt : null;
  }, []);

  // ESC로 배치 취소
  useEffect(() => {
    if (!pendingPlacement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        useSceneStore.getState().cancelPlacement();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingPlacement]);

  useEffect(() => {
    if (!focusTarget || !orbitRef.current) return;
    orbitRef.current.target.set(focusTarget.x, focusTarget.y, focusTarget.z);
    orbitRef.current.update();
  }, [focusTarget]);

  // Focus All — 모든 오브젝트가 화면에 들어오도록 카메라 이동
  useEffect(() => {
    if (!focusAllRequest || !orbitRef.current) return;
    const visible = objects.filter((o) => o.visible && !o.parentId);
    if (visible.length === 0) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const o of visible) {
      minX = Math.min(minX, o.position.x);
      maxX = Math.max(maxX, o.position.x);
      minY = Math.min(minY, o.position.y);
      maxY = Math.max(maxY, o.position.y);
      minZ = Math.min(minZ, o.position.z);
      maxZ = Math.max(maxZ, o.position.z);
    }
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2,
      cz = (minZ + maxZ) / 2;
    const spread = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 4);
    orbitRef.current.target.set(cx, cy, cz);
    orbitRef.current.object.position.set(cx + spread * 0.8, cy + spread * 0.6, cz + spread * 0.8);
    orbitRef.current.update();
  }, [focusAllRequest, objects]);

  // Focus Selected (F키 / 더블클릭) — 선택 오브젝트(들)로 orbit pivot 이동 + 거리 맞춤(시점 방향 유지).
  // 라이브 ref로 정확한 월드 bbox를 구해 프레이밍 → 확대 시 줌/패닝이 답답하던 문제 해소(pivot이 대상에 붙음).
  useEffect(() => {
    if (!focusSelectedRequest || !orbitRef.current || !cameraRef.current) return;
    const ids = useSceneStore.getState().selectedIds;
    if (ids.length === 0) return;
    const box = new THREE.Box3().makeEmpty();
    const tmp = new THREE.Box3();
    for (const id of ids) {
      const o3 = objectRefsRef.current.get(id);
      if (o3) {
        tmp.setFromObject(o3);
        if (!tmp.isEmpty()) box.union(tmp);
      }
    }
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(0.5 * size.length(), 0.35); // 대상 경계구 반경(최소값으로 과도한 접근 방지)
    const cam = cameraRef.current as THREE.PerspectiveCamera;
    const fov = ((cam.fov ?? 60) * Math.PI) / 180;
    const dist = (radius / Math.sin(fov / 2)) * 1.25; // 여백 포함해 화면에 꽉 차게
    const dir = new THREE.Vector3().subVectors(cam.position, orbitRef.current.target);
    if (dir.lengthSq() < 1e-6) dir.set(0.6, 0.5, 0.6);
    dir.normalize();
    orbitRef.current.target.copy(center);
    cam.position.copy(center).addScaledVector(dir, dist);
    orbitRef.current.update();
  }, [focusSelectedRequest]);

  // .glb 내보내기 — 라이브 Three 객체(refs)를 클론해 GLTFExporter로 export 후 다운로드.
  useEffect(() => {
    if (!exportRequest) return;
    const ids =
      exportRequest.ids.length > 0
        ? exportRequest.ids
        : useSceneStore
            .getState()
            .objects.filter((o) => !o.parentId && o.visible)
            .map((o) => o.id);
    const objs3d = ids.map((id) => objectRefsRef.current.get(id)).filter((o): o is THREE.Object3D => !!o);
    if (objs3d.length === 0) return;
    exportObjectsToGlb(objs3d, exportRequest.name).catch(() => {});
  }, [exportRequest]);

  // Camera view preset (Numpad7=Top, Numpad1=Front, Numpad3=Right)
  // 씬 바운드에 맞춰 중심·거리를 잡아 전체가 자연스럽게 담기게 한다(고정 거리 X).
  useEffect(() => {
    if (!cameraViewRequest || !orbitRef.current) return;
    const { view } = cameraViewRequest;
    // deps에 objects를 넣으면 오브젝트 이동 때마다 카메라가 튀므로 fire 시점에 getState로 읽는다
    const objs = useSceneStore.getState().objects.filter((o) => o.visible && !o.parentId);
    let cx = 0,
      cy = 0,
      cz = 0,
      spread = 8;
    if (objs.length > 0) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const o of objs) {
        minX = Math.min(minX, o.position.x);
        maxX = Math.max(maxX, o.position.x);
        minY = Math.min(minY, o.position.y);
        maxY = Math.max(maxY, o.position.y);
        minZ = Math.min(minZ, o.position.z);
        maxZ = Math.max(maxZ, o.position.z);
      }
      cx = (minX + maxX) / 2;
      cy = (minY + maxY) / 2;
      cz = (minZ + maxZ) / 2;
      spread = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 4);
    }
    const d = spread * 1.4; // 전체 맞춤과 비슷한 프레이밍
    orbitRef.current.target.set(cx, cy, cz);
    if (view === "top") orbitRef.current.object.position.set(cx, cy + d, cz + 0.001);
    else if (view === "front") orbitRef.current.object.position.set(cx, cy, cz + d);
    else orbitRef.current.object.position.set(cx + d, cy, cz);
    orbitRef.current.update();
  }, [cameraViewRequest]);

  useEffect(() => {
    if (!bookmarkSaveRequest || !orbitRef.current) return;
    const cam = orbitRef.current.object;
    const tgt = orbitRef.current.target;
    setCameraBookmark(bookmarkSaveRequest.slot, [cam.position.x, cam.position.y, cam.position.z], [tgt.x, tgt.y, tgt.z]);
  }, [bookmarkSaveRequest, setCameraBookmark]);

  useEffect(() => {
    if (!bookmarkRecallRequest || !orbitRef.current) return;
    const bm = useSceneStore.getState().cameraBookmarks[bookmarkRecallRequest.slot];
    if (!bm) return;
    orbitRef.current.object.position.set(...bm.position);
    orbitRef.current.target.set(...bm.target);
    orbitRef.current.update();
  }, [bookmarkRecallRequest]);

  const resetDrag = useCallback(() => {
    if (orbitRef.current) orbitRef.current.enabled = true;
    dragStartRef.current = null;
    isDraggingRef.current = false;
    dragRectRef.current = null;
    setSelBox(null);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 배치 모드: 좌클릭(비-ctrl) = 클릭 위치에 생성. ctrl+좌/우클릭은 카메라 조작으로 통과.
    if (useSceneStore.getState().pendingPlacement) {
      if (e.button === 0 && !e.ctrlKey) {
        const pt = groundPointFromEvent(e);
        if (pt) {
          useSceneStore.getState().commitPlacement(pt.x, pt.z);
          justPlacedRef.current = true;
        }
        // 배치 클릭이 OrbitControls 좌드래그 회전으로 새지 않도록 잠깐 비활성화(pointerUp의 resetDrag가 복구)
        if (orbitRef.current) orbitRef.current.enabled = false;
      }
      return;
    }
    if (e.button !== 0) return;
    // Ctrl+drag → orbit (let OrbitControls handle it)
    // Object/gizmo hit → orbit/transform (let three.js handle it)
    if (e.ctrlKey || pointerDownOnObjectRef.current || gizmoDraggingRef.current) {
      pointerDownOnObjectRef.current = false;
      return;
    }
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
    dragRectRef.current = null;
    // 캔버스(카메라가 실제 투영하는 렌더 서피스) rect를 드래그 시작 시 1회 캐시.
    dragCanvasRectRef.current = (wrapperRef.current?.querySelector("canvas") ?? wrapperRef.current)?.getBoundingClientRect() ?? null;
    // Disable orbit immediately so it doesn't jitter before the 6px threshold kicks in
    if (orbitRef.current) orbitRef.current.enabled = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 배치 모드: 고스트를 바닥 커서 위치로 갱신(선택 박스 로직은 건너뜀)
    if (useSceneStore.getState().pendingPlacement) {
      const pt = groundPointFromEvent(e);
      if (pt) placeGhostPosRef.current.copy(pt);
      return;
    }
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) < 6) return;

    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
    }

    const wr = dragCanvasRectRef.current ?? wrapperRef.current!.getBoundingClientRect();
    const x1 = Math.min(dragStartRef.current.x, e.clientX) - wr.left;
    const y1 = Math.min(dragStartRef.current.y, e.clientY) - wr.top;
    const x2 = Math.max(dragStartRef.current.x, e.clientX) - wr.left;
    const y2 = Math.max(dragStartRef.current.y, e.clientY) - wr.top;
    dragRectRef.current = { x1, y1, x2, y2 };
    setSelBox({ left: x1, top: y1, width: x2 - x1, height: y2 - y1 });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current || !dragRectRef.current || !cameraRef.current || !wrapperRef.current) {
      resetDrag();
      return;
    }

    const { x1, y1, x2, y2 } = dragRectRef.current;
    const wr = dragCanvasRectRef.current ?? wrapperRef.current.getBoundingClientRect();
    const { objects, selectObjects } = useSceneStore.getState();
    const matchingIds: string[] = [];

    // 최상위 조상 ID 반환 (그룹 내부 오브젝트 → 루트 그룹 선택)
    const getRootId = (obj: (typeof objects)[number]): string => {
      if (!obj.parentId) return obj.id;
      const parent = objects.find((o) => o.id === obj.parentId);
      return parent ? getRootId(parent) : obj.id;
    };

    const cam = cameraRef.current;
    if (!cam) {
      resetDrag();
      return;
    }
    const box = new THREE.Box3();
    const _corner = new THREE.Vector3();
    const _proj = new THREE.Vector3();
    const _center = new THREE.Vector3();
    const _fp = new THREE.Vector3();
    // 카메라 '뒤'에 있는 점은 project()가 원근분할 부호 반전으로 좌표가 폭주(±수만 px)해
    // 스크린 AABB가 화면 전체를 덮어 아무 드래그나 다 걸리는 오선택을 만든다 → 카메라 앞 여부를 먼저 판정.
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const camDir = cam.getWorldDirection(new THREE.Vector3());
    const inFront = (p: THREE.Vector3) => _fp.copy(p).sub(camPos).dot(camDir) > 0.05;
    const project = (p: THREE.Vector3) => {
      _proj.copy(p).project(cam);
      return { sx: (_proj.x * 0.5 + 0.5) * wr.width, sy: (-_proj.y * 0.5 + 0.5) * wr.height };
    };

    for (const obj of objects) {
      if (obj.locked || !obj.visible || obj.isGroup) continue;
      const obj3d = objectRefsRef.current.get(obj.id);
      if (!obj3d) continue;

      box.setFromObject(obj3d);
      let selected = false;

      if (!box.isEmpty()) {
        // 8 코너가 모두 카메라 앞이면 스크린 AABB로 '닿기 선택'(피그마식) 판정.
        // 하나라도 카메라 뒤면 AABB를 신뢰할 수 없으므로(폭주) 중심점 폴백으로 판정.
        let anyBehind = false;
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (let i = 0; i < 8; i++) {
          _corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
          if (!inFront(_corner)) {
            anyBehind = true;
            break;
          }
          const { sx, sy } = project(_corner);
          minX = Math.min(minX, sx);
          maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy);
          maxY = Math.max(maxY, sy);
        }
        if (!anyBehind) {
          selected = minX <= x2 && maxX >= x1 && minY <= y2 && maxY >= y1;
        } else {
          box.getCenter(_center);
          if (inFront(_center)) {
            const { sx, sy } = project(_center);
            selected = sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2;
          }
        }
      } else {
        // 빈 bbox(라이트 등) → 원점 한 점(카메라 앞일 때만)
        obj3d.getWorldPosition(_center);
        if (inFront(_center)) {
          const { sx, sy } = project(_center);
          selected = sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2;
        }
      }

      if (selected) {
        const rootId = getRootId(obj);
        if (!matchingIds.includes(rootId)) matchingIds.push(rootId);
      }
    }

    selectObjects(matchingIds);

    resetDrag();
  }, [resetDrag]);

  const useHdr = (environment.hdrPreset ?? "none") !== "none";
  const isSkyMode = !useHdr && environment.sky.type === "sky";
  const skyColor = environment.sky.type === "color" ? environment.sky.value : "#f3f1f1";

  return (
    <ObjectRefsContext.Provider value={objectRefsRef}>
      <div
        ref={wrapperRef}
        style={{ position: "relative", width: "100%", height: "100%", cursor: pendingPlacement ? "crosshair" : undefined }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={resetDrag}
      >
        <Canvas
          id="editor-canvas"
          shadows="percentage"
          camera={{ position: [9, 7, 13], fov: 60 }}
          gl={{ preserveDrawingBuffer: true, toneMapping: THREE.LinearToneMapping }}
          onPointerMissed={() => {
            // 배치 직후엔 새로 생성·선택된 오브젝트를 해제하지 않도록 1회 무시
            if (justPlacedRef.current) {
              justPlacedRef.current = false;
              return;
            }
            if (useSceneStore.getState().pendingPlacement) return;
            if (!isDraggingRef.current) {
              useSceneStore.getState().selectObject(null);
              useSceneStore.getState().setGroupScope(null); // 빈 곳 클릭 → 그룹 격리 스코프 해제
            }
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <CameraCapture cameraRef={cameraRef} />
          <InitialFit orbitRef={orbitRef} />

          {/* 톤매핑 Neutral 고정 + 씬별 노출 — 저장 색을 최대한 그대로 렌더(뷰어와 동일) */}
          <SceneToneMapping exposure={environment.toneMappingExposure ?? 1} />

          {/* ── 배경 (HDR / Sky / 단색 — 상호 배타) ── */}
          {!useHdr && !isSkyMode && <color attach="background" args={[skyColor]} />}
          {isSkyMode && (
            <Sky
              sunPosition={[
                environment.lights.directionalPosition.x,
                environment.lights.directionalPosition.y,
                environment.lights.directionalPosition.z,
              ]}
              turbidity={8}
              rayleigh={2}
              mieCoefficient={0.005}
              mieDirectionalG={0.85}
            />
          )}
          {useHdr && (
            <Suspense fallback={null}>
              <Environment preset={environment.hdrPreset as Exclude<HdrPreset, "none">} background />
            </Suspense>
          )}
          {/* HDR 미설정 시에도 은은한 IBL 제공 → PBR 재질 생기 */}
          {!useHdr && <DefaultEnvironment />}

          {/* fill 광을 낮춰 방향광 그림자를 더 진하게. ambient/hemisphere가 그림자를 씻어내므로
              fill 기여를 줄인다(ambient는 저장값의 0.35배, hemisphere 0.04). */}
          <hemisphereLight args={["#b9d5ff", "#4a5568", 0.02]} />
          <ambientLight intensity={environment.lights.ambientIntensity * 0.2} color={environment.lights.ambientColor ?? "#ffffff"} />
          <directionalLight
            position={[environment.lights.directionalPosition.x, environment.lights.directionalPosition.y, environment.lights.directionalPosition.z]}
            intensity={environment.lights.directionalIntensity}
            color={environment.lights.directionalColor ?? "#ffffff"}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.03}
            shadow-camera-near={0.5}
            shadow-camera-far={120}
            shadow-camera-left={-50}
            shadow-camera-right={50}
            shadow-camera-top={50}
            shadow-camera-bottom={-50}
          />

          <Grid
            position={gridPos}
            rotation={gridRot}
            args={[50, 50]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#666"
            sectionSize={5}
            sectionThickness={0.8}
            sectionColor="#ddd"
            fadeDistance={100}
            fadeStrength={1}
            infiniteGrid
          />

          {objects
            .filter((o) => o.parentId === null)
            .map((obj) => (
              <EditorObjectInstance key={obj.id} object={obj} />
            ))}

          {/* 선택 오버레이 — 드래그 미리보기 + 선택 묶음 바운더리 (오브젝트 렌더 미변경) */}
          <SelectionOverlay dragRectRef={dragRectRef} isDraggingRef={isDraggingRef} dragCanvasRectRef={dragCanvasRectRef} />

          {(environment.boundary ?? 0) > 0 && <BoundaryGizmo sizeX={environment.boundary!} sizeZ={environment.boundaryZ ?? environment.boundary!} />}
          {/* 경계 벽 미리보기 — editor=true라 반투명으로 편집을 덜 가림. 실제 룩은 뷰어에서 확인 */}
          {(environment.boundary ?? 0) > 0 && environment.boundaryWall && (
            <BoundaryWalls
              sizeX={environment.boundary!}
              sizeZ={environment.boundaryZ ?? environment.boundary!}
              config={environment.boundaryWall}
              editor
            />
          )}

          {environment.ground?.enabled && (
            <GroundPlane
              preset={environment.ground.preset ?? "custom"}
              color={environment.ground.color}
              textureUrl={environment.ground.textureUrl}
              positionY={-0.002}
            />
          )}

          {/* 접지 그림자 — 에디터에선 미표시. preserveDrawingBuffer(썸네일 캡처용)+오브젝트 이동이
              바닥에 그림자 잔상(트레일)을 남기기 때문. 최종 모습은 뷰어(게시)에서 확인.
              (설정값 environment.contactShadows는 저장되어 뷰어에 반영됨) */}

          {/* 둘러보기 전용 씬은 캐릭터 프리뷰·스폰 마커 숨김 */}
          {!environment.disableWalk &&
            (environment.playerCharacterId ? (
              (() => {
                const charAsset = assets.find((a) => a.id === environment.playerCharacterId);
                return charAsset ? <CharacterPreview url={charAsset.dracoUrl} scale={environment.playerCharacterScale ?? 1} /> : null;
              })()
            ) : environment.playerStartPosition ? (
              <SpawnMarker position={environment.playerStartPosition} />
            ) : null)}

          {/* 전역 태양 방향 표식(읽기 전용) — Sun Position이 어느 방향으로 비추는지 시각화 */}
          <SunDirectionGizmo position={environment.lights.directionalPosition} />

          {/* 애니 회전 피벗(경첩) 표식 — 선택 오브젝트에 클립이 있을 때 축 위치 시각화 */}
          <AnimPivotGizmo />
          <ClipPreview />

          <GizmoController orbitRef={orbitRef} gizmoDraggingRef={gizmoDraggingRef} />

          <PlacementGhost posRef={placeGhostPosRef} />

          <PostProcessingEffects preset={environment.postProcessing?.preset ?? "none"} effects={environment.effects} />

          <OrbitControls
            ref={orbitRef}
            makeDefault
            enableDamping={false}
            zoomSpeed={2}
            screenSpacePanning={false}
            minPolarAngle={0.1}
            maxPolarAngle={Math.PI / 2 - 0.08}
            minDistance={1}
            maxDistance={200}
            onChange={() => {
              const ctrl = orbitRef.current;
              if (!ctrl) return;
              // 패닝으로 타겟이 바닥 아래로 내려가면 바닥이 화면 위로 올라가는 현상 방지.
              // 카메라는 target.y≥0 + maxPolarAngle<90° 조합으로 항상 바닥 위에 있으므로
              // position.y를 직접 클램프하지 않는다 — 직접 클램프는 휠 줌(dolly)과 싸워
              // 낮은 각도에서 확대가 안 먹던 원인이었다.
              if (ctrl.target.y < 0) ctrl.target.y = 0;
            }}
          />
        </Canvas>

        {/* 배치 모드 안내 배너 */}
        {pendingPlacement && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-[11px] rounded-xs shadow-floating">
              <span>클릭해서 배치</span>
              <span className="opacity-70">·</span>
              <span className="opacity-90">ESC 취소</span>
            </div>
          </div>
        )}

        <GroupScopeIndicator />

        {selBox && (
          <div
            style={{
              position: "absolute",
              left: selBox.left,
              top: selBox.top,
              width: selBox.width,
              height: selBox.height,
              border: "1.5px solid #7c3aed",
              background: "rgba(124, 58, 237, 0.08)",
              pointerEvents: "none",
              boxSizing: "border-box",
            }}
          />
        )}
      </div>
    </ObjectRefsContext.Provider>
  );
}
