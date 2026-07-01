import * as THREE from 'three';
import { GLTFLoader, GLTFExporter } from 'three-stdlib';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON'

function basename(uri: string): string {
  try {
    return decodeURIComponent(uri.split(/[\\/]/).pop() ?? uri);
  } catch {
    return uri.split(/[\\/]/).pop() ?? uri;
  }
}

/**
 * GLB 바이너리(JSON 청크)를 직접 파싱해 외부 파일을 참조하는(embed되지 않은) 이미지 URI 목록을 반환한다.
 * 자체완결형 GLB이거나 파싱에 실패하면 빈 배열을 반환한다 (원본 그대로 업로드하는 기존 동작 유지).
 */
export function findExternalTextureUris(buffer: ArrayBuffer): string[] {
  try {
    const view = new DataView(buffer);
    if (buffer.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC) return [];

    let offset = 12; // magic(4) + version(4) + totalLength(4)
    let json: { images?: { uri?: string }[] } | null = null;

    while (offset + 8 <= buffer.byteLength) {
      const chunkLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;
      if (chunkType === CHUNK_TYPE_JSON) {
        const jsonBytes = new Uint8Array(buffer, chunkStart, chunkLength);
        json = JSON.parse(new TextDecoder('utf-8').decode(jsonBytes));
        break;
      }
      offset = chunkStart + chunkLength;
    }

    if (!json?.images) return [];
    return json.images
      .map((img) => img.uri)
      .filter((uri): uri is string => typeof uri === 'string' && !uri.startsWith('data:'));
  } catch {
    return [];
  }
}

/**
 * 외부 텍스처를 참조하는 GLB를 로드해, 제공된 텍스처 파일들을 이미지 데이터로 매칭한 뒤
 * 완전히 임베드된 단일 .glb(ArrayBuffer)로 재포장한다.
 * 로드/익스포트 중 생성된 임시 blob URL과 Three.js 리소스는 완료 즉시 정리한다.
 */
async function embedTexturesIntoGlb(buffer: ArrayBuffer, textureFiles: File[]): Promise<ArrayBuffer> {
  const fileByName = new Map(textureFiles.map((f) => [f.name.toLowerCase(), f]));
  const objectUrls: string[] = [];

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const match = fileByName.get(basename(url).toLowerCase());
    if (!match) return url;
    const objectUrl = URL.createObjectURL(match);
    objectUrls.push(objectUrl);
    return objectUrl;
  });

  const loader = new GLTFLoader(manager);
  let scene: THREE.Object3D | null = null;
  try {
    const gltf = await loader.parseAsync(buffer, '');
    scene = gltf.scene;

    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(scene, { binary: true });
    if (!(result instanceof ArrayBuffer)) {
      throw new Error('GLTFExporter가 예상치 못한 형식을 반환했습니다.');
    }
    return result;
  } finally {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    if (scene) {
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if (!m) return;
          const mat = m as THREE.MeshStandardMaterial;
          [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.emissiveMap, mat.aoMap]
            .forEach((t) => t?.dispose());
          mat.dispose();
        });
      });
    }
  }
}

export interface EmbedTexturesResult {
  /** null이면 재포장이 필요 없거나 실패한 것 — 원본 파일을 그대로 업로드하면 된다 */
  blob: Blob | null;
  embeddedNames: string[];
  missingNames: string[];
}

/**
 * glbFile이 외부 텍스처를 참조하고, textureFiles 중 일치하는 파일이 있으면
 * 임베드된 새 GLB Blob을 만들어 반환한다. textureFiles가 비어있거나, glb가 이미
 * 자체완결형이거나, 일치하는 파일이 하나도 없으면 blob: null을 반환한다
 * (호출자는 이 경우 원본 파일을 그대로 업로드하면 됨 — 기존 동작과 100% 동일).
 */
export async function tryEmbedTextures(glbFile: File, textureFiles: File[]): Promise<EmbedTexturesResult> {
  if (textureFiles.length === 0) return { blob: null, embeddedNames: [], missingNames: [] };

  const buffer = await glbFile.arrayBuffer();
  const externalUris = findExternalTextureUris(buffer);
  if (externalUris.length === 0) return { blob: null, embeddedNames: [], missingNames: [] };

  const fileNames = new Set(textureFiles.map((f) => f.name.toLowerCase()));
  const embeddedNames: string[] = [];
  const missingNames: string[] = [];
  for (const uri of externalUris) {
    const name = basename(uri);
    if (fileNames.has(name.toLowerCase())) embeddedNames.push(name);
    else missingNames.push(name);
  }
  if (embeddedNames.length === 0) return { blob: null, embeddedNames: [], missingNames };

  try {
    const resultBuffer = await embedTexturesIntoGlb(buffer, textureFiles);
    return { blob: new Blob([resultBuffer], { type: 'model/gltf-binary' }), embeddedNames, missingNames };
  } catch (err) {
    console.error('텍스처 임베드 실패:', err);
    return { blob: null, embeddedNames: [], missingNames: externalUris.map(basename) };
  }
}
