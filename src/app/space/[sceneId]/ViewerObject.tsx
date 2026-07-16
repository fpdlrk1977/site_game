"use client";

import { useState, useRef, Suspense, useEffect, useMemo, useContext } from "react";
import { useGLTF, useAnimations, Text3D, Center, Html, Outlines } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { useLoader, useFrame } from "@react-three/fiber";
import { normalizeGlbMaterials } from "@/lib/glbMaterials";
import { PlayModeContext } from "./PlayModeContext";
import { ClipRequestContext } from "./ClipRequestContext";
import { InteractHighlightContext } from "./InteractHighlightContext";
import { DialogueAdvanceContext } from "./DialogueAdvanceContext";
import { useObjectDialogue, effectiveDialogue } from "./useObjectDialogue";
import { glbLocalBboxCache } from "@/lib/glbBboxCache";
import { localCenter } from "@/lib/objectBBox";
import { PrimitiveMaterial } from "@/components/three/PrimitiveMaterial";
import type { ObjectNodeSchema, AssetRefSchema, EventSchema, MotionConfig } from "@/types/scene";
import { computeMotion, makeWanderState } from "@/lib/motion";
import { createPrimitiveGeometry, createRoundedBoxDims, profileSig } from "@/lib/primitiveGeometry";
import { voxelSig, voxelSkinsSig } from "@/lib/voxelGeometry";
import { useVoxelSkinMaterials } from "@/components/three/useVoxelSkinMaterials";

const DEG2RAD = Math.PI / 180;

// 이 컴포넌트는 우리 Next.js 앱(같은 origin)뿐 아니라 embed.js 번들을 통해
// 완전히 다른 origin(제3자 사이트)에서도 렌더링된다. 루트 상대경로("/fonts/...")는
// 그 경우 우리 서버가 아니라 호스트 페이지의 origin 기준으로 해석되어 깨진다.
// embed/main.tsx가 마운트 직전 window.__PARK3D_ASSET_BASE__를 우리 서버 origin으로
// 설정해두면 그 값을 앞에 붙이고, 없으면(=우리 앱 안에서 직접 렌더링되는 경우) 기존과
// 동일하게 그대로 사용한다 — 일반 뷰어/에디터 동작은 전혀 변하지 않는다.
function assetUrl(path: string): string {
  const base = typeof window !== "undefined" ? (window as unknown as Record<string, string | undefined>).__PARK3D_ASSET_BASE__ : undefined;
  return base ? `${base}${path}` : path;
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/);
  return m ? m[1] : null;
}

// 대화 말풍선 — 오브젝트 바로 위에 뜨는 텍스트(꼬리는 아래=오브젝트를 가리킴).
// distanceFactor로 월드 크기에 앵커되고, center로 y 앵커 지점 위에 뜬다(translateY로 바닥=꼬리를 앵커에 맞춤).
function SpeechBubble({
  text,
  y,
  speaker,
  hint,
  endButton,
  onEndClick,
}: {
  text: string;
  y: number;
  speaker?: string;
  hint?: boolean;
  endButton?: string | null;
  onEndClick?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tmp = useRef(new THREE.Vector3());
  // 거리 LOD — 카메라에서 멀어지면 흐려지고(20m~) 32m 넘으면 사실상 사라진다.
  // (drei Html distanceFactor가 원근 축소를 이미 담당 → 여기에 페이드를 더해 먼 말풍선 정리)
  useFrame((state) => {
    const g = groupRef.current;
    const el = contentRef.current;
    if (!g || !el) return;
    g.getWorldPosition(tmp.current);
    const dist = state.camera.position.distanceTo(tmp.current);
    const FADE_START = 12,
      FADE_END = 16;
    const op = dist <= FADE_START ? 1 : dist >= FADE_END ? 0 : 1 - (dist - FADE_START) / (FADE_END - FADE_START);
    el.style.opacity = String(op);
  });
  return (
    <group ref={groupRef} position={[0, y, 0]}>
      <Html position={[0, 0, 0]} center distanceFactor={8} occlude zIndexRange={[30, 0]} style={{ pointerEvents: "none", userSelect: "none" }}>
        <div
          ref={contentRef}
          style={{
            transform: "translateY(-50%)",
            position: "relative",
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            color: "#1f2937",
            fontSize: "14px",
            fontWeight: 600,
            lineHeight: 1.35,
            padding: "8px 12px",
            borderRadius: "10px",
            whiteSpace: "pre-wrap",
            width: "max-content",
            maxWidth: "220px",
            wordBreak: "keep-all",
            textAlign: speaker ? "left" : "center",
            boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
          }}
        >
          {speaker && <div style={{ fontSize: "11px", fontWeight: 800, color: "#6366f1", marginBottom: "3px" }}>{speaker}</div>}
          {text}
          {hint && (
            <span
              style={{
                marginLeft: "6px",
                fontSize: "10px",
                fontWeight: 700,
                color: "#fff",
                background: "#6366f1",
                borderRadius: "4px",
                padding: "1px 5px",
                whiteSpace: "nowrap",
              }}
            >
              E ▶
            </span>
          )}
          {endButton && (
            <div style={{ marginTop: "8px", textAlign: "center" }}>
              <button
                type="button"
                // 클릭만 받고 카메라 드래그(window mousedown)로는 전파 안 되게 막는다.
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onEndClick?.();
                }}
                style={{
                  pointerEvents: "auto",
                  cursor: "pointer",
                  display: "inline-block",
                  border: "none",
                  background: "linear-gradient(90deg,#7c3aed,#0891b2)",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 700,
                  padding: "7px 16px",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  whiteSpace: "nowrap",
                }}
              >
                {endButton} ▶
              </button>
            </div>
          )}
          <span
            style={{
              position: "absolute",
              bottom: "-7px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderTop: "7px solid rgba(255,255,255,0.7)",
            }}
          />
        </div>
      </Html>
    </group>
  );
}

function YouTubeEmbed({
  ytId,
  position,
  rotation,
  scale,
  onClick,
}: {
  ytId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  onClick: () => void;
}) {
  // <Html transform> distanceFactor=10 default: 1 world unit = UNIT_PX = 40 CSS px.
  // Html is placed in a scale-free group (position + rotation only) so that non-uniform
  // object scale (e.g. 16:9) doesn't distort the iframe content.
  // CSS size is computed as UNIT_PX × scale[axis] to match the plane's world size.
  const UNIT_PX = 40;
  const w = Math.round(UNIT_PX * scale[0]);
  const h = Math.round(UNIT_PX * scale[1]);
  const iframeScale = w / 640;
  return (
    <>
      <mesh
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <group position={position} rotation={rotation}>
        <Html transform center position={[0, 0, 0.01]} style={{ width: `${w}px`, height: `${h}px`, overflow: "hidden", pointerEvents: "auto" }}>
          <div
            style={{
              position: "absolute",
              width: "640px",
              height: "360px",
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) scale(${iframeScale})`,
              transformOrigin: "center",
            }}
          >
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
              width={640}
              height={360}
              style={{ border: "none", display: "block" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </Html>
      </group>
    </>
  );
}

function VideoMesh({
  position,
  rotation,
  scale,
  url,
  outline,
  onClick,
  onPointerOver,
  onPointerOut,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  url: string;
  outline: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  useEffect(() => {
    const vid = document.createElement("video");
    vid.src = url;
    vid.crossOrigin = "anonymous";
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.play().catch(() => {});
    const tex = new THREE.VideoTexture(vid);
    setTexture(tex);
    return () => {
      vid.pause();
      vid.src = "";
      tex.dispose();
    };
  }, [url]);
  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onPointerOver();
      }}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[1, 1]} />
      {texture ? <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} /> : <meshBasicMaterial color="#0f172a" />}
      {outline && <Outlines thickness={2} color="#22d3ee" />}
    </mesh>
  );
}

function ImagePlane({
  position,
  rotation,
  scale,
  url,
  outline,
  onClick,
  onPointerOver,
  onPointerOut,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  url: string;
  outline: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const texture = useLoader(THREE.TextureLoader, url);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onPointerOver();
      }}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
      {outline && <Outlines thickness={2} color="#22d3ee" />}
    </mesh>
  );
}

// 앰비언트 모션 — 베이스 변환(pos/rot/scl) + 타입별 델타를 useFrame로 적용. 콘텐츠는 로컬 원점.
// spin/pulse는 이 그룹(=오브젝트 원점) 기준이라 제자리에서 돈다/커진다. 계산은 computeMotion 공유.
const _mOut = { pos: new THREE.Vector3(), rot: new THREE.Euler(), scl: new THREE.Vector3(), quat: new THREE.Quaternion() };
function MotionGroup({
  pos,
  rot,
  scl,
  motion,
  pivot,
  children,
}: {
  pos: [number, number, number];
  rot: [number, number, number];
  scl: [number, number, number];
  motion: MotionConfig;
  pivot?: [number, number, number] | null; // 회전 피벗(로컬 형상 중심) — 그룹 spin 제자리 회전용
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const phase = useRef(Math.random() * 100); // 개별 위상(동시에 안 뛰게)
  const wander = useRef(makeWanderState());

  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    computeMotion(motion, pos, rot, scl, state.clock.elapsedTime + phase.current, dt, wander.current, _mOut, pivot);
    g.position.copy(_mOut.pos);
    g.quaternion.copy(_mOut.quat); // 쿼터니언 직접 적용 — 오일러 왕복 없이 축 기준 깔끔한 회전
    g.scale.copy(_mOut.scl);
  });

  return (
    <group ref={ref} position={pos} rotation={rot} scale={scl}>
      {children}
    </group>
  );
}

// 모션 있으면 MotionGroup, 없으면 정적 group — 콘텐츠 분기에서 변환 래퍼로 사용(핸들러는 내부 요소에)
function Xform({
  pos,
  rot,
  scl,
  motion,
  pivot,
  children,
}: {
  pos: [number, number, number];
  rot: [number, number, number];
  scl: [number, number, number];
  motion?: MotionConfig;
  pivot?: [number, number, number] | null;
  children: React.ReactNode;
}) {
  return motion ? (
    <MotionGroup pos={pos} rot={rot} scl={scl} motion={motion} pivot={pivot}>
      {children}
    </MotionGroup>
  ) : (
    <group position={pos} rotation={rot} scale={scl}>
      {children}
    </group>
  );
}

/** 애니메이션 재생 요청 — t(타임스탬프)로 같은 클립의 재트리거를 구분한다 */
export interface ClipRequest {
  name: string;
  t: number;
}

function GlbViewer({
  url,
  emissive,
  showBox,
  bubbleText,
  bubbleSpeaker,
  bubbleHint,
  bubbleEndButton,
  onBubbleEnd,
  showBubble,
  playClip,
  defaultClip,
  onClick,
  onPointerOver,
  onPointerOut,
}: {
  url: string;
  emissive: boolean;
  showBox: boolean;
  bubbleText?: string;
  bubbleSpeaker?: string;
  bubbleHint?: boolean;
  bubbleEndButton?: string | null;
  onBubbleEnd?: () => void;
  showBubble: boolean;
  playClip: ClipRequest | null;
  /** 트리거 없이 로드 시 자동 루프 재생할 기본 클립 이름 */
  defaultClip?: string;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene: rawScene, animations } = useGLTF(url);
  // 스킨드 메시(bone 애니메이션) 포함 GLB는 SkeletonUtils.clone 필수 — scene.clone(true)는 bone 참조를 공유해 버린다
  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(rawScene);
    c.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      // GLB 메시가 그림자를 만들고 받도록 (기본값 false라 미설정 시 모델에 그림자가 아예 없음)
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // 인스턴스별 재질 복제 — 안 하면 같은 GLB 인스턴스들이 useGLTF 캐시 재질을 공유해
      // 하나에 호버 emissive를 넣으면 나머지도 같이 밝아진다
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => (m as THREE.Material).clone())
        : (mesh.material as THREE.Material).clone();
    });
    normalizeGlbMaterials(c);
    return c;
  }, [rawScene]);
  const { actions } = useAnimations(animations, groupRef);
  const bbox = useMemo(() => new THREE.Box3().setFromObject(clone), [clone]);
  // 뷰어에서도 로컬 bbox를 캐시에 저장 → InteractionHints가 링을 실제 모델 상단에 정확히 띄운다
  // (에디터 GlbObject와 동일 목적. 뷰어/임베드엔 에디터가 없어 여기서 채워야 함)
  useEffect(() => {
    glbLocalBboxCache.set(url, bbox);
  }, [url, bbox]);

  // 기본 클립 — 트리거 없이 로드 시 자동 루프 재생(idle/앰비언트). 트리거 클립이 오면 아래 effect가 덮는다.
  // MVP: 트리거 클립 종료 후 idle 복귀는 없음(playClip이 null로 리셋되지 않으므로 자연스럽게 유지).
  useEffect(() => {
    if (!defaultClip) return;
    const action = actions[defaultClip];
    if (!action) return;
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.3).play();
  }, [defaultClip, actions]);

  // 요청된 클립 재생 — 기존 클립 페이드아웃 후 새 클립 페이드인
  // playClip.t가 바뀌면 같은 클립이라도 다시 재생된다 (영역 재진입/재클릭)
  useEffect(() => {
    if (!playClip) return;
    const action = actions[playClip.name];
    if (!action) return;
    Object.values(actions).forEach((a) => a?.fadeOut(0.2));
    action.reset().fadeIn(0.2).play();
  }, [playClip, actions]);

  useEffect(() => {
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.emissive !== undefined) {
          m.emissive.set(emissive ? "#ffffff" : "#000000");
          m.emissiveIntensity = emissive ? 0.25 : 0;
        }
      });
    });
  }, [clone, emissive]);

  useEffect(() => {
    return () => {
      clone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        // 지오메트리는 useGLTF 캐시와 공유되므로 dispose 금지(다른 인스턴스 깨짐).
        // 재질만 인스턴스별로 복제해 소유하므로 dispose한다.
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => (m as THREE.Material).dispose());
      });
    };
  }, [clone]);

  return (
    <group ref={groupRef}>
      <primitive
        object={clone}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onPointerOver();
        }}
        onPointerOut={() => onPointerOut()}
      />
      {showBox && <box3Helper args={[bbox, new THREE.Color("#22d3ee")]} />}
      {showBubble && (
        <SpeechBubble
          text={bubbleText ?? ""}
          speaker={bubbleSpeaker}
          hint={bubbleHint}
          endButton={bubbleEndButton}
          onEndClick={onBubbleEnd}
          y={bbox.max.y + 0.25}
        />
      )}
    </group>
  );
}

interface Props {
  object: ObjectNodeSchema;
  assets: AssetRefSchema[];
  onEvent: (obj: ObjectNodeSchema, trigger: EventSchema["trigger"]) => void;
  allObjects?: ObjectNodeSchema[];
  /** RigidBody 내부에서 사용할 때 — position/rotation은 부모 RigidBody가 담당, scale만 적용 */
  noTransform?: boolean;
  /** 부모(kinematic RigidBody)가 모션을 구동할 때 — 시각 모션(MotionGroup) 미적용해 이중 적용 방지 */
  noMotion?: boolean;
  /** PhysicsObject가 area_enter 시 직접 전달하는 클립 재생 요청 */
  activeClip?: ClipRequest | null;
}

export function ViewerObject({
  object,
  assets,
  onEvent,
  allObjects = [],
  noTransform = false,
  noMotion = false,
  activeClip: activeClipProp = null,
}: Props) {
  const playMode = useContext(PlayModeContext);
  // 시각 모션 — noMotion(콜라이더가 구동)이면 끈다
  const motion = noMotion ? undefined : object.motion;
  // animate_object 액션이 이 오브젝트(object.id)에 보낸 클립 재생 요청
  const externalClip = useContext(ClipRequestContext)[object.id] ?? null;
  // 플레이 모드에서 캐릭터가 이 오브젝트에 근접(interact 대상)했는지
  const interactActive = useContext(InteractHighlightContext) === object.id;
  // E키 nonce — 근접 대상일 때만 대화 열기/넘김에 반응
  const dialogueNonce = useContext(DialogueAdvanceContext);
  const [hovered, setHovered] = useState(false);
  const [internalClip, setInternalClip] = useState<ClipRequest | null>(null);

  // 프리미티브 지오메트리(둥근 박스·각뿔대 등 확장 파라미터 반영). GLB/콘텐츠/라이트/파티클은 null.
  const isPrimitive = !object.assetId && !object.content && !object.light && !object.particle;
  // 둥근 박스는 에디터와 동일하게 실치수로 굽고 메쉬에 1/scale 역스케일 → 균일한 모서리.
  const isRoundedBox = isPrimitive && object.primitiveShape === 'box' && (object.geom?.cornerRadius ?? 0) > 0;
  const rbX = Math.max(0.001, object.scale.x), rbY = Math.max(0.001, object.scale.y), rbZ = Math.max(0.001, object.scale.z);
  const primGeom = useMemo(
    () => !isPrimitive ? null
      : isRoundedBox
        ? createRoundedBoxDims(rbX, rbY, rbZ, object.geom?.cornerRadius ?? 0, object.geom?.cornerSegments ?? 4, object.geom?.subdivisions ?? 0)
        : createPrimitiveGeometry(object.primitiveShape, object.geom),
    [isPrimitive, object.primitiveShape, object.geom?.cornerRadius, object.geom?.cornerSegments, object.geom?.topScale, (object.geom?.sections ?? []).join(','), object.geom?.extrudeDepth, object.geom?.profileClosed, profileSig(object.geom), voxelSig(object.geom?.voxels), voxelSkinsSig(object.geom?.voxelSkins), object.geom?.subdivisions, isRoundedBox, rbX, rbY, rbZ],
  );
  useEffect(() => () => primGeom?.dispose(), [primGeom]);
  // 복셀 색별 스킨 재질 배열(없으면 null → 기존 PrimitiveMaterial 경로).
  const voxelSkinMats = useVoxelSkinMaterials(
    (primGeom?.userData?.voxelGroupColors) as string[] | undefined,
    object.geom?.voxelSkins,
  );
  // triplanar wrap 모드용 로컬 bbox.
  const wrapBounds = useMemo(() => {
    if (!primGeom) return { min: [-0.5, -0.5, -0.5] as [number, number, number], size: [1, 1, 1] as [number, number, number] };
    primGeom.computeBoundingBox();
    const bb = primGeom.boundingBox!;
    return {
      min: [bb.min.x, bb.min.y, bb.min.z] as [number, number, number],
      size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z] as [number, number, number],
    };
  }, [primGeom]);

  // 모션 회전 피벗(로컬 형상 중심) — 그룹은 원점이 중심과 어긋나 spin이 wobble → 중심 기준 회전.
  // 콜라이더 경로(PlayCanvas)와 동일한 보정을 시각(MotionGroup)에도 적용해 탐색/플레이 모드 일관.
  const motionPivot = useMemo<[number, number, number] | null>(() => {
    if (!object.motion) return null;
    const c = localCenter(allObjects, assets, object.id);
    return c ? [c.x, c.y, c.z] : null;
  }, [object.motion, object.id, allObjects, assets]);
  // 내부(click/hover)·PhysicsObject(area)·animate_object 요청 중 가장 최근(t) 것을 사용
  const effectiveClip = [internalClip, activeClipProp, externalClip]
    .filter((c): c is ClipRequest => !!c)
    .reduce<ClipRequest | null>((a, c) => (a && a.t >= c.t ? a : c), null);

  // 대화 말풍선 상태 머신 (훅 — early return 이전에 호출). 렌더는 아래 각 타입 분기에서.
  // dialogue_end 이벤트가 있으면 대화 종료 시 그 이벤트를 발동(기존 액션 파이프라인 재사용).
  const hasDialogueEnd = object.events.some((e) => e.trigger === "dialogue_end");
  const dv = useObjectDialogue(
    effectiveDialogue(object),
    playMode,
    interactActive,
    dialogueNonce,
    hasDialogueEnd,
    hasDialogueEnd ? () => onEvent(object, "dialogue_end") : undefined,
  );

  const hasClick = object.events.some((e) => e.trigger === "click");
  const hasHover = object.events.some((e) => e.trigger === "hover_enter");
  const hasHoverExit = object.events.some((e) => e.trigger === "hover_exit");
  const isInteractive = hasClick || hasHover || hasHoverExit;

  if (!object.visible) return null;

  // 그룹 오브젝트: 자식들을 Three.js group 안에 렌더
  // noTransform=true 일 때는 부모(RigidBody 등)가 transform을 담당하므로 identity로 설정
  if (object.isGroup) {
    const children = allObjects.filter((o) => o.parentId === object.id && o.visible);
    const gPos: [number, number, number] = noTransform ? [0, 0, 0] : [object.position.x, object.position.y, object.position.z];
    const gRot: [number, number, number] = noTransform
      ? [0, 0, 0]
      : [object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD];
    const gScl: [number, number, number] = noTransform ? [1, 1, 1] : [object.scale.x, object.scale.y, object.scale.z];
    const gInner = children.map((child) => <ViewerObject key={child.id} object={child} assets={assets} onEvent={onEvent} allObjects={allObjects} />);
    return motion ? (
      <MotionGroup pos={gPos} rot={gRot} scl={gScl} motion={motion} pivot={motionPivot}>
        {gInner}
      </MotionGroup>
    ) : (
      <group position={gPos} rotation={gRot} scale={gScl}>
        {gInner}
      </group>
    );
  }

  const pos: [number, number, number] = noTransform ? [0, 0, 0] : [object.position.x, object.position.y, object.position.z];
  const rot: [number, number, number] = noTransform
    ? [0, 0, 0]
    : [object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD];
  const scl: [number, number, number] = [object.scale.x, object.scale.y, object.scale.z];

  const assetRef = object.assetId ? assets.find((a) => a.id === object.assetId) : null;

  // 시각 하이라이트: 호버 또는 interact 근접 → emissive 글로우.
  // 방문자 뷰어(탐색·플레이 공통)는 외곽선/박스 없이 글로우 + 커서 + 힌트 링으로만 안내.
  // (시안 아웃라인은 "에디터 선택 박스" 느낌이라 포트폴리오/전시 룩과 안 맞고, 다른 신호와 중복)
  const emissiveOn = hovered || interactActive;
  const outlineOn = false;

  // 말풍선 렌더 요소 (GLB 외 타입용) — dv는 위 훅에서 계산됨.
  const bubbleEl = dv.visible ? (
    <SpeechBubble
      text={dv.text}
      speaker={dv.speaker}
      hint={dv.manual && dv.hasMore}
      endButton={dv.endButton}
      onEndClick={dv.confirm}
      y={0.5 * object.scale.y + 0.25}
    />
  ) : null;

  const handlePointerOver = () => {
    if (!isInteractive) return;
    setHovered(true);
    document.body.style.cursor = "pointer";
    if (hasHover) {
      const clip = object.events.find((e) => e.trigger === "hover_enter" && e.action === "play_animation" && e.value);
      if (clip) setInternalClip({ name: clip.value, t: Date.now() });
      onEvent(object, "hover_enter");
    }
  };
  const handlePointerOut = () => {
    if (!isInteractive) return;
    setHovered(false);
    document.body.style.cursor = "auto";
    if (hasHoverExit) {
      const clip = object.events.find((e) => e.trigger === "hover_exit" && e.action === "play_animation" && e.value);
      if (clip) setInternalClip({ name: clip.value, t: Date.now() });
      onEvent(object, "hover_exit");
    }
  };
  const handleClick = () => {
    if (!hasClick) return;
    const clip = object.events.find((e) => e.trigger === "click" && e.action === "play_animation" && e.value);
    if (clip) setInternalClip({ name: clip.value, t: Date.now() });
    onEvent(object, "click");
  };

  if (assetRef) {
    const glb = (
      <Suspense fallback={null}>
        <GlbViewer
          url={assetRef.dracoUrl}
          emissive={emissiveOn}
          showBox={outlineOn}
          bubbleText={dv.text}
          bubbleSpeaker={dv.speaker}
          bubbleHint={dv.manual && dv.hasMore}
          bubbleEndButton={dv.endButton}
          onBubbleEnd={dv.confirm}
          showBubble={dv.visible}
          playClip={effectiveClip}
          defaultClip={object.defaultClip}
          onClick={handleClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        />
      </Suspense>
    );
    return motion ? (
      <MotionGroup pos={pos} rot={rot} scl={scl} motion={motion} pivot={motionPivot}>
        {glb}
      </MotionGroup>
    ) : (
      <group position={pos} rotation={rot} scale={scl}>
        {glb}
      </group>
    );
  }

  // Content 오브젝트 렌더링
  if (object.content) {
    const { type } = object.content;
    if (type === "text") {
      const tColor = object.material?.color ?? "#a78bfa";
      const tRoughness = object.material?.roughness ?? 0.5;
      const tMetalness = object.material?.metalness ?? 0.1;
      const tEmissive = object.material?.emissive ?? "#000000";
      return (
        <>
          <Xform pos={pos} rot={rot} scl={scl} motion={motion} pivot={motionPivot}>
            <group
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                handlePointerOver();
              }}
              onPointerOut={handlePointerOut}
            >
              <Suspense fallback={null}>
                <Center>
                  <Text3D
                    font={assetUrl("/fonts/helvetiker_regular.typeface.json")}
                    size={object.content.fontSize ?? 0.5}
                    height={object.content.depth ?? 0.1}
                    curveSegments={12}
                    bevelEnabled
                    bevelThickness={0.01}
                    bevelSize={0.008}
                    bevelSegments={4}
                  >
                    {object.content.text ?? ""}
                    <meshStandardMaterial
                      color={tColor}
                      roughness={tRoughness}
                      metalness={tMetalness}
                      emissive={emissiveOn ? tColor : tEmissive}
                      emissiveIntensity={emissiveOn ? 0.3 : tEmissive !== "#000000" ? 1 : 0}
                    />
                    {outlineOn && <Outlines thickness={2} color="#22d3ee" />}
                  </Text3D>
                </Center>
              </Suspense>
            </group>
          </Xform>
          {bubbleEl}
        </>
      );
    }
    if (type === "image" && object.content.url) {
      return (
        <>
          <Xform pos={pos} rot={rot} scl={scl} motion={motion} pivot={motionPivot}>
            <Suspense fallback={null}>
              <ImagePlane
                position={[0, 0, 0]}
                rotation={[0, 0, 0]}
                scale={[1, 1, 1]}
                url={object.content.url}
                outline={outlineOn}
                onClick={handleClick}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
              />
            </Suspense>
          </Xform>
          {bubbleEl}
        </>
      );
    }
    if (type === "video") {
      const url = object.content.url ?? "";
      const ytId = url ? getYouTubeId(url) : null;
      if (ytId) {
        return <YouTubeEmbed ytId={ytId} position={pos} rotation={rot} scale={scl} onClick={handleClick} />;
      }
      if (url) {
        return (
          <Xform pos={pos} rot={rot} scl={scl} motion={motion} pivot={motionPivot}>
            <VideoMesh
              position={[0, 0, 0]}
              rotation={[0, 0, 0]}
              scale={[1, 1, 1]}
              url={url}
              outline={outlineOn}
              onClick={handleClick}
              onPointerOver={handlePointerOver}
              onPointerOut={handlePointerOut}
            />
          </Xform>
        );
      }
    }
    // 빈 플레이스홀더 (image URL 없음, video URL 없음)
    return (
      <Xform pos={pos} rot={rot} scl={scl} motion={motion} pivot={motionPivot}>
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#1a1a2e" />
        </mesh>
      </Xform>
    );
  }

  const color = object.material?.color ?? "#a78bfa";
  const roughness = object.material?.roughness ?? 0.5;
  const metalness = object.material?.metalness ?? 0.1;
  const emissive = object.material?.emissive ?? "#000000";
  const rdFlat = object.render?.flatShading ?? false;
  const rdSide = object.render?.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  const rdCast = object.render?.castShadow ?? false;
  const rdReceive = object.render?.receiveShadow ?? false;

  const primMesh = (
    <mesh
      geometry={primGeom ?? undefined}
      // 둥근 박스: 실치수 지오메트리라 그룹 scale을 상쇄하는 역스케일(1/scale). 비-둥근은 명시적 [1,1,1].
      scale={isRoundedBox ? [1 / rbX, 1 / rbY, 1 / rbZ] : [1, 1, 1]}
      {...(voxelSkinMats ? { material: voxelSkinMats } : {})}
      castShadow={rdCast}
      receiveShadow={rdReceive}
      onPointerOver={(e) => {
        e.stopPropagation();
        handlePointerOver();
      }}
      onPointerOut={handlePointerOut}
      onClick={(e) => {
        e.stopPropagation();
        handleClick();
      }}
    >
      {!voxelSkinMats && (
      <PrimitiveMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissiveOn ? color : emissive}
        emissiveIntensity={emissiveOn ? 0.3 : emissive !== "#000000" ? 1 : 0}
        textureUrl={object.material?.textureUrl}
        repeat={object.material?.textureRepeat}
        flatShading={rdFlat}
        side={rdSide}
        clearcoat={object.material?.clearcoat}
        sheen={object.material?.sheen}
        transmission={object.material?.transmission}
        ior={object.material?.ior}
        vertexColors={object.primitiveShape === 'voxel' && !object.material?.textureUrl}
        textureMapping={object.material?.textureMapping}
        triplanarScale={object.material?.triplanarScale}
        wrapMin={wrapBounds.min}
        wrapSize={wrapBounds.size}
        gradient={object.material?.gradient}
      />
      )}
      {outlineOn && <Outlines thickness={2} color="#22d3ee" />}
    </mesh>
  );
  return (
    <>
      {motion ? (
        <MotionGroup pos={pos} rot={rot} scl={scl} motion={motion} pivot={motionPivot}>
          {primMesh}
        </MotionGroup>
      ) : (
        <group position={pos} rotation={rot} scale={scl}>
          {primMesh}
        </group>
      )}
      {bubbleEl}
    </>
  );
}
