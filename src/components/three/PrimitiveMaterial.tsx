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
}

// 프리미티브 표준 재질 — 색상 + 선택적 이미지 텍스처(map). 에디터/뷰어가 공유.
// 텍스처 로딩을 비동기(비-Suspense)로 처리해 인라인 mesh에 Suspense 경계 없이도 안전하게 쓸 수 있다.
export function PrimitiveMaterial({
  color, roughness, metalness, emissive, emissiveIntensity, wireframe, textureUrl, repeat,
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

  return (
    // key: 텍스처 유무 전환 시 재질을 새로 마운트해 셰이더 재컴파일 이슈 회피(map 붙이고/떼기).
    <meshStandardMaterial
      key={tex ? 'tex' : 'plain'}
      map={tex ?? undefined}
      color={base}
      roughness={roughness}
      metalness={metalness}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      wireframe={wireframe}
    />
  );
}
