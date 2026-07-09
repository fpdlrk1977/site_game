// 여러 오브젝트(프리미티브)를 하나의 GLB로 구워(bake) 반환한다.
// 결과 GLB는 기존 에셋 업로드 파이프라인(uploadGlbBlob)에 태워 '하나의 에셋 오브젝트'가 된다.
// MVP: 프리미티브(box/sphere/cylinder/plane/frustum)만 병합. GLB/콘텐츠/라이트/파티클은 제외.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { worldMatrix } from '@/lib/objectBBox';
import { createPrimitiveGeometry } from '@/lib/primitiveGeometry';
import type { ObjectNodeSchema } from '@/types/scene';

// 루트들의 서브트리에서 병합 대상(프리미티브) 오브젝트만 수집.
function collectPrimitives(objects: ObjectNodeSchema[], rootIds: string[]): ObjectNodeSchema[] {
  const seen = new Set<string>();
  const out: ObjectNodeSchema[] = [];
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const o = objects.find((x) => x.id === id);
    if (!o) return;
    const isPrimitive = !!o.primitiveShape && !o.assetId && !o.content && !o.light && !o.particle;
    if (isPrimitive) out.push(o);
    for (const c of objects.filter((x) => x.parentId === id)) walk(c.id);
  };
  rootIds.forEach(walk);
  return out;
}

export interface MergeResult {
  blob: Blob;
  center: { x: number; y: number; z: number }; // 병합 결과 배치 위치(대상들의 월드 bbox 중심)
  count: number;                                 // 병합된 프리미티브 개수
}

// rootIds(+자손)의 프리미티브를 하나의 GLB로 구운다. 대상이 없으면 null.
export async function buildMergedGlb(
  objects: ObjectNodeSchema[],
  rootIds: string[],
): Promise<MergeResult | null> {
  const prims = collectPrimitives(objects, rootIds);
  if (prims.length === 0) return null;

  // 각 프리미티브의 월드 행렬 + 전체 월드 bbox 중심(결과를 이 중심으로 옮겨 원점 정렬)
  const mats = prims.map((p) => worldMatrix(objects, p.id));
  const worldBox = new THREE.Box3().makeEmpty();
  const unit = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  prims.forEach((_, i) => worldBox.union(unit.clone().applyMatrix4(mats[i])));
  const center = worldBox.getCenter(new THREE.Vector3());
  const toLocal = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);

  const scene = new THREE.Group();
  prims.forEach((p, i) => {
    const geom = createPrimitiveGeometry(p.primitiveShape, p.geom);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(p.material?.color ?? '#a78bfa'),
      roughness: p.material?.roughness ?? 0.5,
      metalness: p.material?.metalness ?? 0.1,
      emissive: new THREE.Color(p.material?.emissive ?? '#000000'),
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.applyMatrix4(toLocal.clone().multiply(mats[i])); // 월드 → 중심 기준 로컬
    scene.add(mesh);
  });

  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;

  // dispose (export 후 불필요)
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
  });

  return {
    blob: new Blob([glb], { type: 'model/gltf-binary' }),
    center: { x: center.x, y: center.y, z: center.z },
    count: prims.length,
  };
}
