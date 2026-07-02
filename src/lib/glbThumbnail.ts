import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';

export async function generateGlbThumbnail(glbBlob: Blob, size = 256): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 100000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-2, 2, -2);
  scene.add(fill);

  const url = URL.createObjectURL(glbBlob);
  try {
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      new GLTFLoader().load(url, (g) => resolve(g as { scene: THREE.Group }), undefined, reject);
    });
    scene.add(gltf.scene);

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const dims = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(dims.x, dims.y, dims.z) || 1;

    const dist = maxDim * 1.8;
    camera.position.set(center.x + dist * 0.7, center.y + dist * 0.4, center.z + dist);
    camera.lookAt(center);
    camera.near = maxDim * 0.001;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    renderer.dispose();
  }
}
