'use client';

import * as THREE from 'three';
import { useEffect, useMemo, useState } from 'react';
import type { EnvSchema } from '@/types/scene';

type WallCfg = NonNullable<EnvSchema['boundaryWall']>;
type Face = 'front' | 'back' | 'left' | 'right';

const TILE = 4; // 텍스처 1타일 = 월드 4유닛

// 벽 4면 — 각 면의 위치/회전/폭(가로) + 면 이름. 평면 기본 법선(+Z)이 중심을 향하도록 회전.
// front/back은 폭 2·bx, left/right는 폭 2·bz. 높이 h, 중심 y=h/2
function wallTransforms(bx: number, bz: number, h: number): {
  pos: [number, number, number]; rot: [number, number, number]; w: number; face: Face;
}[] {
  return [
    { pos: [0, h / 2, -bz], rot: [0, 0, 0], w: bx * 2, face: 'front' },
    { pos: [0, h / 2, bz], rot: [0, Math.PI, 0], w: bx * 2, face: 'back' },
    { pos: [bx, h / 2, 0], rot: [0, -Math.PI / 2, 0], w: bz * 2, face: 'right' },
    { pos: [-bx, h / 2, 0], rot: [0, Math.PI / 2, 0], w: bz * 2, face: 'left' },
  ];
}

// 이미지 텍스처를 비동기(비-Suspense)로 로드 — 인라인 mesh에 Suspense 경계 없이 안전(PrimitiveMaterial과 동일 패턴).
function useAsyncTexture(url: string | undefined, rx: number, ry: number): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) { setTex(null); return; }
    let cancelled = false;
    new THREE.TextureLoader().load(url, (t) => {
      if (cancelled) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      setTex(t);
    });
    return () => { cancelled = true; };
  }, [url]);
  useEffect(() => {
    if (tex) { tex.repeat.set(rx, ry); tex.needsUpdate = true; }
  }, [tex, rx, ry]);
  return tex;
}

// 단일 벽 면 — 색/텍스처 + 선택적 위→아래 알파 그라데이션(vertexColors 알파, 셰이더 수정 없이 안전).
function WallFace({ pos, rot, w, h, color, url, opacity, gradient, side }: {
  pos: [number, number, number]; rot: [number, number, number]; w: number; h: number;
  color: string; url?: string; opacity: number; gradient: boolean; side: THREE.Side;
}) {
  const tex = useAsyncTexture(url, w / TILE, h / TILE);

  // planeGeometry(1세그) 4정점에 알파를 넣어 위(투명)→아래(불투명) 세로 페이드. rgb=1이라 색은 그대로.
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h);
    if (gradient) {
      const p = g.attributes.position;
      const colors = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        const a = p.getY(i) > 0 ? 0 : 1; // 위 정점(투명)→아래 정점(불투명), quad 보간으로 세로 페이드
        colors[i * 4] = 1; colors[i * 4 + 1] = 1; colors[i * 4 + 2] = 1; colors[i * 4 + 3] = a;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    }
    return g;
  }, [w, h, gradient]);
  useEffect(() => () => geo.dispose(), [geo]);

  const transparent = opacity < 1 || gradient;
  return (
    <mesh position={pos} rotation={rot} geometry={geo}>
      <meshStandardMaterial
        map={tex ?? undefined}
        color={tex ? '#ffffff' : color}
        side={side}
        transparent={transparent}
        opacity={opacity}
        vertexColors={gradient}
        roughness={0.92}
        metalness={0}
      />
    </mesh>
  );
}

// 원형 경계 — 열린 실린더 벽(둘레를 감쌈). 텍스처는 둘레(2πr) 기준으로 타일, 그라데이션은 위→아래 알파.
//   oneSided면 안쪽 면(중심 방향)만 = 실린더 BackSide, 아니면 DoubleSide.
function CylinderWall({ radius, h, color, url, opacity, gradient, side }: {
  radius: number; h: number; color: string; url?: string; opacity: number; gradient: boolean; side: THREE.Side;
}) {
  const circ = 2 * Math.PI * radius;
  const tex = useAsyncTexture(url, Math.max(1, circ / TILE), Math.max(1, h / TILE));
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(radius, radius, h, 64, 1, true);
    if (gradient) {
      const p = g.attributes.position;
      const colors = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        const a = p.getY(i) > 0 ? 0 : 1; // 위(투명)→아래(불투명)
        colors[i * 4] = 1; colors[i * 4 + 1] = 1; colors[i * 4 + 2] = 1; colors[i * 4 + 3] = a;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    }
    return g;
  }, [radius, h, gradient]);
  useEffect(() => () => geo.dispose(), [geo]);
  const transparent = opacity < 1 || gradient;
  return (
    <mesh position={[0, h / 2, 0]} geometry={geo}>
      <meshStandardMaterial map={tex ?? undefined} color={tex ? '#ffffff' : color} side={side} transparent={transparent} opacity={opacity} vertexColors={gradient} roughness={0.92} metalness={0} />
    </mesh>
  );
}

// 자유 다각형 경계 — 각 변(edge)마다 벽 한 장(WallFace 재사용) + (선택)천장(ShapeGeometry 삼각분할).
//   oneSided는 윈딩 판정이 복잡해 미지원 → 항상 양면.
function PolygonWall({ poly, h, color, url, opacity, gradient, textured, ceiling }: {
  poly: { x: number; z: number }[]; h: number; color: string; url?: string; opacity: number; gradient: boolean; textured: boolean; ceiling: boolean;
}) {
  return (
    <>
      {poly.map((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) return null;
        return (
          <WallFace
            key={i}
            pos={[(a.x + b.x) / 2, h / 2, (a.z + b.z) / 2]}
            rot={[0, Math.atan2(-dz, dx), 0]}   // 평면 로컬 X(폭)를 변 방향에 정렬
            w={len} h={h} color={color} url={url} opacity={opacity} gradient={gradient} side={THREE.DoubleSide}
          />
        );
      })}
      {ceiling && <PolygonCap poly={poly} h={h} color={color} url={textured ? url : undefined} opacity={opacity} />}
    </>
  );
}
function PolygonCap({ poly, h, color, url, opacity }: { poly: { x: number; z: number }[]; h: number; color: string; url?: string; opacity: number }) {
  const tex = useAsyncTexture(url, 1, 1);
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    poly.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.z) : shape.lineTo(p.x, p.z)));
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [poly]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={geo}>
      <meshStandardMaterial color={tex ? '#ffffff' : color} map={tex ?? undefined} side={THREE.DoubleSide} transparent={opacity < 1} opacity={opacity} roughness={0.92} metalness={0} />
    </mesh>
  );
}

// 360° 파노라마(equirectangular) 구 — 4면 벽 대신 씬을 감싼다. 안쪽에서 보이도록 BackSide.
function Skybox({ url, radius }: { url: string; radius: number }) {
  const tex = useAsyncTexture(url, 1, 1);
  if (!tex) return null;
  return (
    <mesh>
      <sphereGeometry args={[radius, 48, 32]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

/**
 * 경계 벽 시각(직사각 지원) — 에디터·뷰어 공유. 스타일 none이면 안 그림(충돌만).
 * editor=true면 편집을 가리지 않게 불투명도를 낮추고, one-sided도 무시(양면 렌더)해 밖에서도 보이게 한다.
 */
export function BoundaryWalls({ sizeX, sizeZ, shape = 'rect', polygon, config, editor = false }: {
  sizeX: number;
  sizeZ: number;
  shape?: 'rect' | 'circle' | 'polygon';
  polygon?: { x: number; z: number }[];
  config: WallCfg;
  editor?: boolean;
}) {
  const style = config.style ?? 'none';
  if (style === 'none') return null;
  if (shape !== 'polygon' && (sizeX <= 0 || sizeZ <= 0)) return null;

  // 스카이박스 — 씬을 감싸는 파노라마 구(반경은 경계보다 넉넉하게). 모양 무관.
  if (style === 'skybox') {
    if (!config.skyboxUrl) return null;
    const radius = Math.max(sizeX, sizeZ) * 2.2 + 20;
    return <Skybox url={config.skyboxUrl} radius={radius} />;
  }

  const h = Math.max(0.5, config.height ?? 8);
  const opacity = Math.max(0.05, Math.min(1, (config.opacity ?? 1) * (editor ? 0.5 : 1)));
  const ceiling = config.ceiling === true;
  const gradient = config.gradient === true;
  const color = config.color ?? '#8899aa';
  const textured = style === 'texture';

  // ── 자유 다각형 경계 — 변마다 벽 + (선택)천장. ──
  if (shape === 'polygon') {
    if (!polygon || polygon.length < 3) return null;
    return <PolygonWall poly={polygon} h={h} color={color} url={textured ? config.textureUrl : undefined} opacity={opacity} gradient={gradient} textured={textured} ceiling={ceiling} />;
  }

  // ── 원형 경계 — 실린더 벽 + (선택)천장 원반. 면별 텍스처 개념 없음(둘레 한 장). ──
  if (shape === 'circle') {
    const radius = sizeX; // 원형은 boundary=반지름
    // one-sided: 안쪽(중심 방향)만 = 실린더 BackSide. 에디터/양면은 DoubleSide.
    const cside: THREE.Side = config.oneSided && !editor ? THREE.BackSide : THREE.DoubleSide;
    const capOpacity = Math.max(0.05, Math.min(1, (config.opacity ?? 1) * (editor ? 0.5 : 1)));
    return (
      <>
        <CylinderWall radius={radius} h={h} color={color} url={textured ? config.textureUrl : undefined} opacity={opacity} gradient={gradient} side={cside} />
        {ceiling && (
          <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[radius, 64]} />
            <meshStandardMaterial color={textured ? '#ffffff' : color} map={undefined} side={THREE.DoubleSide} transparent={capOpacity < 1} opacity={capOpacity} roughness={0.92} metalness={0} />
          </mesh>
        )}
      </>
    );
  }

  // ── 사각 경계 — 4면 벽 + (선택)천장. ──
  // one-sided: 안쪽(중심)을 향한 면만 보이게 FrontSide. 에디터는 편집 편의를 위해 항상 양면.
  const side: THREE.Side = config.oneSided && !editor ? THREE.FrontSide : THREE.DoubleSide;
  const faceUrl = (face: Face): string | undefined =>
    textured ? (config.faceTextures?.[face] ?? config.textureUrl) : undefined;

  return (
    <>
      {wallTransforms(sizeX, sizeZ, h).map((wt) => (
        <WallFace
          key={wt.face}
          pos={wt.pos}
          rot={wt.rot}
          w={wt.w}
          h={h}
          color={color}
          url={faceUrl(wt.face)}
          opacity={opacity}
          gradient={gradient}
          side={side}
        />
      ))}
      {ceiling && (
        <WallFace
          pos={[0, h, 0]}
          rot={[Math.PI / 2, 0, 0]}
          w={sizeX * 2}
          h={sizeZ * 2}
          color={color}
          url={textured ? config.textureUrl : undefined}
          opacity={opacity}
          gradient={false}
          side={THREE.DoubleSide}
        />
      )}
    </>
  );
}
