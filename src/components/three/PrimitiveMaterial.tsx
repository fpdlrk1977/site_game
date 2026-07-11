'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';

interface Props {
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  wireframe?: boolean;
  textureUrl?: string;
  repeat?: { x: number; y: number };
  flatShading?: boolean;
  side?: THREE.Side;
  clearcoat?: number;
  sheen?: number;
  transmission?: number;
  ior?: number;
}

// 프리미티브 표준 재질 — 색상 + 선택적 이미지 텍스처(map). 에디터/뷰어가 공유.
// 텍스처 로딩을 비동기(비-Suspense)로 처리해 인라인 mesh에 Suspense 경계 없이도 안전하게 쓸 수 있다.
export function PrimitiveMaterial({
  color, roughness, metalness, emissive, emissiveIntensity, wireframe, textureUrl, repeat, flatShading, side,
  clearcoat, sheen, transmission, ior,
}: Props) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const rx = repeat?.x ?? 1;
  const ry = repeat?.y ?? 1;

  useEffect(() => {
    if (!textureUrl) { setTex(null); return; }
    let cancelled = false;
    new THREE.TextureLoader().load(textureUrl, (t) => {
      if (cancelled) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      setTex(t);
    });
    return () => { cancelled = true; };
  }, [textureUrl]);

  useEffect(() => {
    if (tex) { tex.repeat.set(rx, ry); tex.needsUpdate = true; }
  }, [tex, rx, ry]);

  // 텍스처가 있으면 베이스 색을 흰색으로 → 이미지가 재질 색으로 물들지 않고 그대로 보임(포스터처럼).
  const base = tex ? '#ffffff' : color;
  const t = transmission ?? 0;
  const hasPhysical = t > 0 || (clearcoat ?? 0) > 0 || (sheen ?? 0) > 0;

  // 물리 재질(clearcoat/sheen/transmission) — 가벼운 내장 MeshPhysicalMaterial.
  //   유리(transmission): 비금속이어야 뒤가 비치므로 metalness 0 강제. transparent는 불필요(three가
  //   transmission을 transmissive 렌더 리스트로 분류해 뒤 씬 버퍼를 자동 샘플). thickness>0 + ior 필요.
  if (hasPhysical) {
    return (
      // key에 재질 종류·flatShading 포함 → std↔physical 전환 시 재마운트(셰이더 재컴파일 안전).
      <meshPhysicalMaterial
        key={`phys-${tex ? 'tex' : 'plain'}-${flatShading ? 'flat' : 'smooth'}`}
        map={tex ?? undefined}
        color={base}
        roughness={roughness}
        metalness={t > 0 ? 0 : metalness}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        wireframe={wireframe}
        flatShading={flatShading ?? false}
        side={side ?? THREE.FrontSide}
        clearcoat={clearcoat ?? 0}
        clearcoatRoughness={0.1}
        sheen={sheen ?? 0}
        sheenColor={base}
        transmission={t}
        thickness={t > 0 ? 1 : 0}
        ior={ior ?? 1.5}
      />
    );
  }

  return (
    // key: 텍스처 유무·flatShading 전환 시 재질을 새로 마운트해 셰이더 재컴파일 이슈 회피(flatShading은 런타임 변경 시 needsUpdate 필요).
    <meshStandardMaterial
      key={`std-${tex ? 'tex' : 'plain'}-${flatShading ? 'flat' : 'smooth'}`}
      map={tex ?? undefined}
      color={base}
      roughness={roughness}
      metalness={metalness}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      wireframe={wireframe}
      flatShading={flatShading ?? false}
      side={side ?? THREE.FrontSide}
    />
  );
}
