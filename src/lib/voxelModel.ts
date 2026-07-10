// 복셀(1×1×1 큐브 묶음)을 하나의 GLB로 구워(bake) 반환한다.
// 결과 GLB는 기존 에셋 파이프라인(uploadGlbBlob)에 태워 '하나의 에셋 오브젝트'가 된다 (Merge/펜툴과 동일).
// 색은 정점 색(vertex color)으로 단일 메쉬에 담아 파일/드로우콜을 최소화한다.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Voxel { x: number; y: number; z: number; color: string }

export interface VoxelBakeResult {
  blob: Blob;
  count: number;
}

// 복셀 목록 → GLB. 각 복셀은 [x,x+1]×[y,y+1]×[z,z+1] 단위 큐브. 대상 없으면 null.
export async function buildVoxelGlb(voxels: Voxel[]): Promise<VoxelBakeResult | null> {
  if (voxels.length === 0) return null;

  const geoms: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  for (const v of voxels) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(v.x + 0.5, v.y + 0.5, v.z + 0.5); // 셀 좌표가 큐브의 최소 모서리가 되도록
    c.set(v.color);
    // sRGB 입력색을 선형으로(정점색은 선형 공간) — 렌더 색이 지정색과 일치
    const lin = c.clone().convertSRGBToLinear();
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = lin.r; colors[i * 3 + 1] = lin.g; colors[i * 3 + 2] = lin.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoms.push(g);
  }

  const merged = mergeGeometries(geoms, false);
  geoms.forEach((g) => g.dispose());
  if (!merged) return null;

  // X/Z 중심 정렬 + 바닥(min.y)을 0에 앉힘 → 배치 시 지면에 놓임
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  merged.translate(-cx, -bb.min.y, -cz);

  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }),
  );
  const scene = new THREE.Group();
  scene.add(mesh);

  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;

  merged.dispose();
  (mesh.material as THREE.Material).dispose();

  return { blob: new Blob([glb], { type: 'model/gltf-binary' }), count: voxels.length };
}
