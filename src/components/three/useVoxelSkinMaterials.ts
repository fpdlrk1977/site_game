'use client';

// 복셀 "색→텍스처" 멀티 스킨 — 그룹 지오메트리(색별 그룹)의 순서에 맞춰 재질 배열을 만든다.
// 매핑된 색은 텍스처(면별 UV) 재질, 아닌 색은 단색 재질. 에디터·뷰어 공유.
import { useEffect, useState } from 'react';
import * as THREE from 'three';

export function useVoxelSkinMaterials(
  groupColors: string[] | undefined,
  skins: { color: string; texUrl: string }[] | undefined,
): THREE.Material[] | null {
  const [mats, setMats] = useState<THREE.Material[] | null>(null);
  const colorsSig = groupColors ? groupColors.join(',') : '';
  const skinsSig = skins ? skins.map((s) => `${s.color}=${s.texUrl}`).join('|') : '';
  useEffect(() => {
    if (!groupColors || !skins || skins.length === 0) { setMats(null); return; }
    const skinMap = new Map(skins.map((s) => [s.color, s.texUrl]));
    const loader = new THREE.TextureLoader();
    let cancelled = false;
    const arr: THREE.Material[] = groupColors.map((c) => {
      const url = skinMap.get(c);
      if (url) {
        const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, metalness: 0 });
        loader.load(url, (t) => { if (cancelled) { t.dispose(); return; } t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.needsUpdate = true; });
        return m;
      }
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0 });
    });
    setMats(arr);
    return () => {
      cancelled = true;
      arr.forEach((m) => { const mm = m as THREE.MeshStandardMaterial; mm.map?.dispose(); mm.dispose(); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorsSig, skinsSig]);
  return mats;
}
