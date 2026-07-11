import type { ObjectNodeSchema, MaterialOverride, MaterialAsset } from '@/types/scene';

/**
 * 오브젝트가 실제 렌더에 쓸 재질을 결정한다(공존형).
 * - `materialId`가 있고 씬 재질 에셋에 존재하면 → 그 에셋 재질(공유). 원본 수정 시 모든 참조 오브젝트에 반영.
 * - 없으면 → 오브젝트 인라인 `material`(기존 동작).
 * (materialId가 있는데 에셋이 삭제됐으면 인라인으로 폴백해 유령 참조 방지.)
 */
export function effectiveMaterial(object: ObjectNodeSchema, materialAssets?: MaterialAsset[]): MaterialOverride | undefined {
  if (object.materialId && materialAssets && materialAssets.length > 0) {
    const a = materialAssets.find((m) => m.id === object.materialId);
    if (a) return a.material;
  }
  return object.material;
}
