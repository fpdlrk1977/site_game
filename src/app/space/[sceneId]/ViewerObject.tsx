'use client';

import { useState, useRef, Suspense, useEffect, useMemo } from 'react';
import { useGLTF, useAnimations, Text3D, Center, Html, Outlines } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { normalizeGlbMaterials } from '@/lib/glbMaterials';
import type { ObjectNodeSchema, AssetRefSchema, EventSchema } from '@/types/scene';

const DEG2RAD = Math.PI / 180;

// 이 컴포넌트는 우리 Next.js 앱(같은 origin)뿐 아니라 embed.js 번들을 통해
// 완전히 다른 origin(제3자 사이트)에서도 렌더링된다. 루트 상대경로("/fonts/...")는
// 그 경우 우리 서버가 아니라 호스트 페이지의 origin 기준으로 해석되어 깨진다.
// embed/main.tsx가 마운트 직전 window.__PARK3D_ASSET_BASE__를 우리 서버 origin으로
// 설정해두면 그 값을 앞에 붙이고, 없으면(=우리 앱 안에서 직접 렌더링되는 경우) 기존과
// 동일하게 그대로 사용한다 — 일반 뷰어/에디터 동작은 전혀 변하지 않는다.
function assetUrl(path: string): string {
  const base = typeof window !== 'undefined'
    ? (window as unknown as Record<string, string | undefined>).__PARK3D_ASSET_BASE__
    : undefined;
  return base ? `${base}${path}` : path;
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/);
  return m ? m[1] : null;
}

function YouTubeEmbed({ ytId, position, rotation, scale, onClick }: {
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
      <mesh position={position} rotation={rotation} scale={scale}
        onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <group position={position} rotation={rotation}>
        <Html transform center position={[0, 0, 0.01]}
          style={{ width: `${w}px`, height: `${h}px`, overflow: 'hidden', pointerEvents: 'auto' }}>
          <div style={{
            position: 'absolute',
            width: '640px',
            height: '360px',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) scale(${iframeScale})`,
            transformOrigin: 'center',
          }}>
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
              width={640} height={360}
              style={{ border: 'none', display: 'block' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </Html>
      </group>
    </>
  );
}

function VideoMesh({ position, rotation, scale, url, hovered, onClick, onPointerOver, onPointerOut }: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  url: string;
  hovered: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  useEffect(() => {
    const vid = document.createElement('video');
    vid.src = url;
    vid.crossOrigin = 'anonymous';
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.play().catch(() => {});
    const tex = new THREE.VideoTexture(vid);
    setTexture(tex);
    return () => { vid.pause(); vid.src = ''; tex.dispose(); };
  }, [url]);
  return (
    <mesh position={position} rotation={rotation} scale={scale}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); onPointerOver(); }}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[1, 1]} />
      {texture
        ? <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
        : <meshBasicMaterial color="#0f172a" />
      }
      {hovered && <Outlines thickness={2} color="#22d3ee" />}
    </mesh>
  );
}

function ImagePlane({ position, rotation, scale, url, hovered, onClick, onPointerOver, onPointerOut }: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  url: string;
  hovered: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const texture = useLoader(THREE.TextureLoader, url);

  useEffect(() => {
    return () => { texture.dispose(); };
  }, [texture]);

  return (
    <mesh position={position} rotation={rotation} scale={scale}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); onPointerOver(); }}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
      {hovered && <Outlines thickness={2} color="#22d3ee" />}
    </mesh>
  );
}

/** 애니메이션 재생 요청 — t(타임스탬프)로 같은 클립의 재트리거를 구분한다 */
export interface ClipRequest {
  name: string;
  t: number;
}

function GlbViewer({ url, hovered, playClip, onClick, onPointerOver, onPointerOut }: {
  url: string;
  hovered: boolean;
  playClip: ClipRequest | null;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene: rawScene, animations } = useGLTF(url);
  // 스킨드 메시(bone 애니메이션) 포함 GLB는 SkeletonUtils.clone 필수 — scene.clone(true)는 bone 참조를 공유해 버린다
  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(rawScene);
    // GLB 메시가 그림자를 만들고 받도록 (기본값 false라 미설정 시 모델에 그림자가 아예 없음)
    c.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    normalizeGlbMaterials(c);
    return c;
  }, [rawScene]);
  const { actions } = useAnimations(animations, groupRef);
  const bbox = useMemo(() => new THREE.Box3().setFromObject(clone), [clone]);

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
          m.emissive.set(hovered ? '#ffffff' : '#000000');
          m.emissiveIntensity = hovered ? 0.2 : 0;
        }
      });
    });
  }, [clone, hovered]);

  useEffect(() => {
    return () => {
      clone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => (m as THREE.Material).dispose());
      });
    };
  }, [clone]);

  return (
    <group ref={groupRef}>
      <primitive
        object={clone}
        onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onPointerOver(); }}
        onPointerOut={() => onPointerOut()}
      />
      {hovered && <box3Helper args={[bbox, new THREE.Color('#22d3ee')]} />}
    </group>
  );
}

interface Props {
  object: ObjectNodeSchema;
  assets: AssetRefSchema[];
  onEvent: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
  allObjects?: ObjectNodeSchema[];
  /** RigidBody 내부에서 사용할 때 — position/rotation은 부모 RigidBody가 담당, scale만 적용 */
  noTransform?: boolean;
  /** PhysicsObject가 area_enter 시 직접 전달하는 클립 재생 요청 */
  activeClip?: ClipRequest | null;
}

export function ViewerObject({ object, assets, onEvent, allObjects = [], noTransform = false, activeClip: activeClipProp = null }: Props) {
  const [hovered, setHovered] = useState(false);
  const [internalClip, setInternalClip] = useState<ClipRequest | null>(null);
  // PhysicsObject(area_enter)와 내부(click/hover) 요청 중 더 최근 것을 사용
  const effectiveClip = !activeClipProp ? internalClip
    : !internalClip ? activeClipProp
    : activeClipProp.t >= internalClip.t ? activeClipProp : internalClip;

  const hasClick = object.events.some((e) => e.trigger === 'click');
  const hasHover = object.events.some((e) => e.trigger === 'hover_enter');
  const hasHoverExit = object.events.some((e) => e.trigger === 'hover_exit');
  const isInteractive = hasClick || hasHover || hasHoverExit;

  if (!object.visible) return null;

  // 그룹 오브젝트: 자식들을 Three.js group 안에 렌더
  // noTransform=true 일 때는 부모(RigidBody 등)가 transform을 담당하므로 identity로 설정
  if (object.isGroup) {
    const children = allObjects.filter((o) => o.parentId === object.id && o.visible);
    return (
      <group
        position={noTransform ? [0, 0, 0] : [object.position.x, object.position.y, object.position.z]}
        rotation={noTransform ? [0, 0, 0] : [object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD]}
        scale={noTransform ? [1, 1, 1] : [object.scale.x, object.scale.y, object.scale.z]}
      >
        {children.map((child) => (
          <ViewerObject key={child.id} object={child} assets={assets} onEvent={onEvent} allObjects={allObjects} />
        ))}
      </group>
    );
  }

  const pos: [number, number, number] = noTransform ? [0, 0, 0] : [object.position.x, object.position.y, object.position.z];
  const rot: [number, number, number] = noTransform ? [0, 0, 0] : [
    object.rotation.x * DEG2RAD,
    object.rotation.y * DEG2RAD,
    object.rotation.z * DEG2RAD,
  ];
  const scl: [number, number, number] = [object.scale.x, object.scale.y, object.scale.z];

  const assetRef = object.assetId ? assets.find((a) => a.id === object.assetId) : null;

  const handlePointerOver = () => {
    if (!isInteractive) return;
    setHovered(true);
    document.body.style.cursor = 'pointer';
    if (hasHover) {
      const clip = object.events.find((e) => e.trigger === 'hover_enter' && e.action === 'play_animation' && e.value);
      if (clip) setInternalClip({ name: clip.value, t: Date.now() });
      onEvent(object, 'hover_enter');
    }
  };
  const handlePointerOut = () => {
    if (!isInteractive) return;
    setHovered(false);
    document.body.style.cursor = 'auto';
    if (hasHoverExit) {
      const clip = object.events.find((e) => e.trigger === 'hover_exit' && e.action === 'play_animation' && e.value);
      if (clip) setInternalClip({ name: clip.value, t: Date.now() });
      onEvent(object, 'hover_exit');
    }
  };
  const handleClick = () => {
    if (!hasClick) return;
    const clip = object.events.find((e) => e.trigger === 'click' && e.action === 'play_animation' && e.value);
    if (clip) setInternalClip({ name: clip.value, t: Date.now() });
    onEvent(object, 'click');
  };

  if (assetRef) {
    return (
      <group position={pos} rotation={rot} scale={scl}>
        <Suspense fallback={null}>
          <GlbViewer
            url={assetRef.dracoUrl}
            hovered={hovered}
            playClip={effectiveClip}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          />
        </Suspense>
      </group>
    );
  }

  // Content 오브젝트 렌더링
  if (object.content) {
    const { type } = object.content;
    if (type === 'text') {
      const tColor = object.material?.color ?? '#a78bfa';
      const tRoughness = object.material?.roughness ?? 0.5;
      const tMetalness = object.material?.metalness ?? 0.1;
      const tEmissive = object.material?.emissive ?? '#000000';
      return (
        <group position={pos} rotation={rot} scale={scl}
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          onPointerOver={(e) => { e.stopPropagation(); handlePointerOver(); }}
          onPointerOut={handlePointerOut}
        >
          <Suspense fallback={null}>
            <Center>
              <Text3D
                font={assetUrl('/fonts/helvetiker_regular.typeface.json')}
                size={object.content.fontSize ?? 0.5}
                height={object.content.depth ?? 0.1}
                curveSegments={12}
                bevelEnabled
                bevelThickness={0.01}
                bevelSize={0.008}
                bevelSegments={4}
              >
                {object.content.text ?? ''}
                <meshStandardMaterial
                  color={tColor}
                  roughness={tRoughness}
                  metalness={tMetalness}
                  emissive={hovered ? tColor : tEmissive}
                  emissiveIntensity={hovered ? 0.3 : (tEmissive !== '#000000' ? 1 : 0)}
                />
                {hovered && <Outlines thickness={2} color="#22d3ee" />}
              </Text3D>
            </Center>
          </Suspense>
        </group>
      );
    }
    if (type === 'image' && object.content.url) {
      return (
        <Suspense fallback={null}>
          <ImagePlane
            position={pos} rotation={rot} scale={scl}
            url={object.content.url}
            hovered={hovered}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          />
        </Suspense>
      );
    }
    if (type === 'video') {
      const url = object.content.url ?? '';
      const ytId = url ? getYouTubeId(url) : null;
      if (ytId) {
        return <YouTubeEmbed ytId={ytId} position={pos} rotation={rot} scale={scl} onClick={handleClick} />;
      }
      if (url) {
        return (
          <VideoMesh
            position={pos} rotation={rot} scale={scl}
            url={url}
            hovered={hovered}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          />
        );
      }
    }
    // 빈 플레이스홀더 (image URL 없음, video URL 없음)
    return (
      <mesh position={pos} rotation={rot} scale={scl}
        onClick={(e) => { e.stopPropagation(); handleClick(); }}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>
    );
  }

  const color = object.material?.color ?? '#a78bfa';
  const roughness = object.material?.roughness ?? 0.5;
  const metalness = object.material?.metalness ?? 0.1;
  const emissive = object.material?.emissive ?? '#000000';

  return (
    <mesh
      position={pos}
      rotation={rot}
      scale={scl}
      castShadow
      receiveShadow
      onPointerOver={(e) => { e.stopPropagation(); handlePointerOver(); }}
      onPointerOut={handlePointerOut}
      onClick={(e) => { e.stopPropagation(); handleClick(); }}
    >
      {object.primitiveShape === 'box' && <boxGeometry args={[1, 1, 1]} />}
      {object.primitiveShape === 'sphere' && <sphereGeometry args={[0.5, 32, 32]} />}
      {object.primitiveShape === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
      {object.primitiveShape === 'plane' && <planeGeometry args={[1, 1]} />}
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={hovered ? color : emissive}
        emissiveIntensity={hovered ? 0.3 : (emissive !== '#000000' ? 1 : 0)}
      />
      {hovered && <Outlines thickness={2} color="#22d3ee" />}
    </mesh>
  );
}
