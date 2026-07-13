// 복셀(1×1×1 큐브 묶음)을 하나의 GLB로 구워(bake) 반환한다.
// 결과 GLB는 기존 에셋 파이프라인(uploadGlbBlob)에 태워 '하나의 에셋 오브젝트'가 된다 (Merge/펜툴과 동일).
// 색은 정점 색(vertex color)으로 단일 메쉬에 담아 파일/드로우콜을 최소화한다.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildVoxelGeometry, type Voxel } from './voxelGeometry';

export type { Voxel };

export interface VoxelBakeResult {
  blob: Blob;
  count: number;
}

// 복셀 목록 → GLB. 각 복셀은 [x,x+1]×[y,y+1]×[z,z+1] 단위 큐브. 대상 없으면 null.
// (복셀 B안 전환 후 live 렌더가 기본. 이 GLB 굽기는 .glb 내보내기 등 후속 용도로 유지.)
export async function buildVoxelGlb(voxels: Voxel[]): Promise<VoxelBakeResult | null> {
  const merged = buildVoxelGeometry(voxels);
  if (!merged) return null;

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
