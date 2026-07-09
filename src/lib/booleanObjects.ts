// 두 프리미티브의 Boolean(합집합/차집합/교집합)을 계산해 하나의 GLB로 구운다(bake).
// Merge와 동일하게 결과 GLB는 uploadGlbBlob → 하나의 에셋 오브젝트가 된다.
// MVP: 프리미티브 2개만. 되돌릴 수 없음(Ctrl+Z로 취소).
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { worldMatrix } from '@/lib/objectBBox';
import { createPrimitiveGeometry } from '@/lib/primitiveGeometry';
import type { ObjectNodeSchema } from '@/types/scene';

export type BooleanOp = 'union' | 'subtract' | 'intersect';

export interface BooleanResult {
  blob: Blob;
  center: { x: number; y: number; z: number };
}

const isPrimitive = (o?: ObjectNodeSchema) =>
  !!o && !!o.primitiveShape && !o.assetId && !o.content && !o.light && !o.particle;

function brushFrom(geom: THREE.BufferGeometry, mat: THREE.Matrix4): Brush {
  const b = new Brush(geom);
  mat.decompose(b.position, b.quaternion, b.scale);
  b.updateMatrixWorld(true);
  return b;
}

// baseId ∘ toolId 를 op로 계산. subtract는 base − tool. 대상이 프리미티브가 아니면 null.
export async function buildBooleanGlb(
  objects: ObjectNodeSchema[],
  baseId: string,
  toolId: string,
  op: BooleanOp,
): Promise<BooleanResult | null> {
  const base = objects.find((o) => o.id === baseId);
  const tool = objects.find((o) => o.id === toolId);
  if (!isPrimitive(base) || !isPrimitive(tool)) return null;

  const matBase = worldMatrix(objects, baseId);
  const matTool = worldMatrix(objects, toolId);

  // 결과를 base의 월드 bbox 중심으로 정렬(에셋 원점 = 중심)
  const unit = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const center = unit.clone().applyMatrix4(matBase).getCenter(new THREE.Vector3());
  const toLocal = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);

  const geomBase = createPrimitiveGeometry(base!.primitiveShape, base!.geom);
  const geomTool = createPrimitiveGeometry(tool!.primitiveShape, tool!.geom);
  const brushBase = brushFrom(geomBase, toLocal.clone().multiply(matBase));
  const brushTool = brushFrom(geomTool, toLocal.clone().multiply(matTool));

  const evaluator = new Evaluator();
  evaluator.useGroups = false; // 단일 머티리얼 결과
  const opConst = op === 'subtract' ? SUBTRACTION : op === 'intersect' ? INTERSECTION : ADDITION;
  const result = evaluator.evaluate(brushBase, brushTool, opConst);

  // base 머티리얼 적용
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(base!.material?.color ?? '#a78bfa'),
    roughness: base!.material?.roughness ?? 0.5,
    metalness: base!.material?.metalness ?? 0.1,
    emissive: new THREE.Color(base!.material?.emissive ?? '#000000'),
  });
  const mesh = new THREE.Mesh(result.geometry, material);
  const scene = new THREE.Group();
  scene.add(mesh);

  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;

  geomBase.dispose();
  geomTool.dispose();
  material.dispose();
  result.geometry.dispose();

  return {
    blob: new Blob([glb], { type: 'model/gltf-binary' }),
    center: { x: center.x, y: center.y, z: center.z },
  };
}
