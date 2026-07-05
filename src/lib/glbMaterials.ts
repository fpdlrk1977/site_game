import * as THREE from 'three';

/**
 * 잘못 export된 GLB 재질 보정.
 *
 * 일부 에셋(Kenney 등)은 unlit(KHR_materials_unlit) 선언이 extensionsUsed에만 있고
 * 개별 재질에는 붙지 않은 채 metallicFactor=1로 export되어 있다. 이 경우 three.js가
 * 완전 금속(PBR metalness=1)으로 로드하는데, 금속은 환경맵(HDR) 없는 씬에서
 * 반사할 대상이 없어 검게 렌더된다 (각도에 따라 스펙큘러만 번쩍임).
 *
 * 금속 텍스처(metalnessMap) 없이 metalness=1인 재질은 의도된 금속 표현이 아니라
 * export 결함으로 간주하고 비금속으로 보정한다. 여러 번 호출해도 안전(idempotent).
 */
export function normalizeGlbMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial;
      if (m.isMeshStandardMaterial && m.metalness === 1 && !m.metalnessMap) {
        m.metalness = 0;
      }
    }
  });
}
