// 에디터의 라이브 Three 객체(들)를 하나의 .glb로 내보내 브라우저 다운로드.
// GLB 에셋·프리미티브·그룹 모두 '렌더된 그대로' 잡히므로(schema 재구성 아님) 정확하다.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// objects3d: 내보낼 루트 Three 객체들(각자의 서브트리 포함). 월드 변환은 그대로 보존된다.
export async function exportObjectsToGlb(objects3d: THREE.Object3D[], fileName: string): Promise<void> {
  const root = new THREE.Group();
  for (const o of objects3d) {
    o.updateWorldMatrix(true, true);
    const clone = o.clone(true);
    clone.visible = true; // 숨김 상태여도 내보낼 땐 보이게(onlyVisible과 별개로 클론 자체를 표시)
    root.add(clone);
  }
  const exporter = new GLTFExporter();
  const result = (await exporter.parseAsync(root, { binary: true })) as ArrayBuffer;
  const blob = new Blob([result], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = /\.glb$/i.test(fileName) ? fileName : `${fileName || 'export'}.glb`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 다운로드가 시작되도록 약간의 지연 후 revoke
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
