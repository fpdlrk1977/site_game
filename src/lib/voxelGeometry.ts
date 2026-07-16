// 복셀(1×1×1 큐브 묶음) → 정점색을 담은 단일 BufferGeometry.
// GLB로 굽기 전 단계(buildVoxelGlb)와, 프리미티브 파이프라인(createPrimitiveGeometry 'voxel')이 공유.
// (GLTFExporter를 안 끌어오는 가벼운 모듈 — 프리미티브 지오메트리 그래프에 안전하게 import.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Voxel { x: number; y: number; z: number; color: string }

// 복셀 목록 → 병합 지오메트리(X/Z 중심 정렬 + 바닥 y=0). 정점색(선형). 대상 없으면 null.
// cellSize: 한 칸의 로컬 크기(미터). 미설정=1. 정수 셀 좌표에 곱해 촘촘한(고해상도) 복셀 지원.
export function buildVoxelGeometry(voxels: Voxel[] | undefined, cellSize = 1, grouped = false): THREE.BufferGeometry | null {
  if (!voxels || voxels.length === 0) return null;
  const s = cellSize > 0 ? cellSize : 1;

  // grouped=true — 색별로 묶어 그룹 지오메트리(재질 배열용). 정점색 대신 면별 UV(BoxGeometry 기본) 유지.
  //   각 그룹(색)에 텍스처 또는 단색 재질을 매칭해 "색→텍스처" 멀티 스킨을 만든다. userData에 색 순서 보관.
  if (grouped) {
    const byColor = new Map<string, THREE.BufferGeometry[]>();
    for (const v of voxels) {
      const g = new THREE.BoxGeometry(s, s, s);
      g.translate((v.x + 0.5) * s, (v.y + 0.5) * s, (v.z + 0.5) * s);
      if (!byColor.has(v.color)) byColor.set(v.color, []);
      byColor.get(v.color)!.push(g);
    }
    const colors = [...byColor.keys()];
    const perColor: THREE.BufferGeometry[] = [];
    for (const cc of colors) {
      const parts = byColor.get(cc)!;
      const m = mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());
      if (m) perColor.push(m);
    }
    const merged = mergeGeometries(perColor, true); // useGroups → 그룹당 materialIndex(색 순서와 일치)
    perColor.forEach((g) => g.dispose());
    if (!merged) return null;
    merged.computeBoundingBox();
    const bb = merged.boundingBox!;
    merged.translate(-((bb.min.x + bb.max.x) / 2), -bb.min.y, -((bb.min.z + bb.max.z) / 2));
    merged.userData.voxelGroupColors = colors;
    return merged;
  }

  const geoms: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  for (const v of voxels) {
    const g = new THREE.BoxGeometry(s, s, s);
    g.translate((v.x + 0.5) * s, (v.y + 0.5) * s, (v.z + 0.5) * s); // 셀 좌표 = 큐브 최소 모서리
    c.set(v.color);
    const lin = c.clone().convertSRGBToLinear(); // sRGB 입력 → 선형(정점색 공간)
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = lin.r; colors[i * 3 + 1] = lin.g; colors[i * 3 + 2] = lin.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoms.push(g);
  }

  const merged = mergeGeometries(geoms, false);
  geoms.forEach((g) => g.dispose());
  if (!merged) return null;

  // X/Z 중심 정렬 + 바닥(min.y)을 0에 앉힘 → 배치 시 지면에 놓임.
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  merged.translate(-cx, -bb.min.y, -cz);
  return merged;
}

// 복셀 데이터 서명 — 재편집으로 색/위치/개수가 바뀌면 지오메트리·캐시가 갱신되도록.
// 정수 해시(O(n), 색 문자열 포함)라 큰 모델에서도 저렴.
export function voxelSig(voxels: Voxel[] | undefined): string {
  if (!voxels || voxels.length === 0) return '';
  let h = voxels.length | 0;
  for (const v of voxels) {
    h = (Math.imul(h, 31) + ((v.x * 73856093) ^ (v.y * 19349663) ^ (v.z * 83492791))) | 0;
    for (let i = 0; i < v.color.length; i++) h = (Math.imul(h, 31) + v.color.charCodeAt(i)) | 0;
  }
  return `${voxels.length}:${h}`;
}

// 색별 스킨 서명 — 매핑(색↔이미지)이 바뀌면 지오메트리(그룹 여부)·재질이 갱신되게. 없으면 ''.
export function voxelSkinsSig(skins: { color: string; texUrl: string }[] | undefined): string {
  if (!skins || skins.length === 0) return '';
  return skins.map((s) => `${s.color}=${s.texUrl}`).join('|');
}
