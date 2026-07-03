const GLB_MAGIC = 0x46546c67;       // 'glTF'
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_TYPE_BIN  = 0x004e4942; // 'BIN\0'

function basename(uri: string): string {
  try { return decodeURIComponent(uri.split(/[\\/]/).pop() ?? uri); }
  catch { return uri.split(/[\\/]/).pop() ?? uri; }
}

function mimeFromExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

/**
 * GLB JSON 청크를 직접 파싱해 외부 파일을 참조하는 이미지 URI 목록을 반환한다.
 * 자체완결형 GLB이거나 파싱 실패 시 빈 배열 반환.
 */
export function findExternalTextureUris(buffer: ArrayBuffer): string[] {
  try {
    const view = new DataView(buffer);
    if (buffer.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC) return [];
    let offset = 12;
    let json: { images?: { uri?: string }[] } | null = null;
    while (offset + 8 <= buffer.byteLength) {
      const chunkLength = view.getUint32(offset, true);
      const chunkType  = view.getUint32(offset + 4, true);
      if (chunkType === CHUNK_TYPE_JSON) {
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, chunkLength)));
        break;
      }
      offset = offset + 8 + chunkLength;
    }
    if (!json?.images) return [];
    return json.images
      .map((img) => img.uri)
      .filter((uri): uri is string => typeof uri === 'string' && !uri.startsWith('data:'));
  } catch { return []; }
}

/**
 * THREE.js 로드/익스포트 없이 GLB 바이너리를 직접 패치한다.
 * 외부 텍스처를 BIN 청크에 덧붙이고 JSON 이미지 항목만 bufferView 참조로 교체.
 * animations·skinning 등 기존 데이터는 일절 건드리지 않는다.
 */
async function embedTexturesIntoGlb(buffer: ArrayBuffer, textureFiles: File[]): Promise<ArrayBuffer> {
  const fileByName = new Map(textureFiles.map((f) => [f.name.toLowerCase(), f]));
  const view = new DataView(buffer);

  // ── JSON 청크 파싱 ──────────────────────────────────────────
  const jsonChunkLen  = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== CHUNK_TYPE_JSON) throw new Error('JSON chunk not found');
  const originalJsonStr = new TextDecoder().decode(new Uint8Array(buffer, 20, jsonChunkLen));
  const json = JSON.parse(originalJsonStr) as {
    images?:      { uri?: string; mimeType?: string; bufferView?: number }[];
    bufferViews?: { buffer: number; byteOffset: number; byteLength: number; byteStride?: number; target?: number }[];
    buffers?:     { byteLength: number; uri?: string }[];
    [key: string]: unknown;
  };

  // ── BIN 청크 (없을 수도 있음) ─────────────────────────────
  const binChunkOffset = 20 + jsonChunkLen;
  let existingBin: Uint8Array;
  if (binChunkOffset + 8 <= buffer.byteLength && view.getUint32(binChunkOffset + 4, true) === CHUNK_TYPE_BIN) {
    const binLen = view.getUint32(binChunkOffset, true);
    existingBin = new Uint8Array(buffer, binChunkOffset + 8, binLen);
  } else {
    existingBin = new Uint8Array(0);
  }

  // ── 텍스처 임베드: BIN에 덧붙이기 ────────────────────────
  if (!json.bufferViews) json.bufferViews = [];
  if (!json.buffers)     json.buffers     = [{ byteLength: existingBin.byteLength }];
  if (!json.images)      json.images      = [];

  const extraParts: Uint8Array[] = [];
  let currentOffset = existingBin.byteLength;

  for (const image of json.images) {
    if (!image.uri || image.uri.startsWith('data:')) continue;
    const file = fileByName.get(basename(image.uri).toLowerCase());
    if (!file) continue;

    // 4-byte 정렬 패딩
    const pad = (4 - (currentOffset % 4)) % 4;
    if (pad > 0) { extraParts.push(new Uint8Array(pad)); currentOffset += pad; }

    const data = new Uint8Array(await file.arrayBuffer());
    image.bufferView = json.bufferViews.length;
    image.mimeType   = mimeFromExt(file.name);
    delete image.uri;

    json.bufferViews.push({ buffer: 0, byteOffset: currentOffset, byteLength: data.byteLength });
    extraParts.push(data);
    currentOffset += data.byteLength;
  }

  json.buffers[0].byteLength = currentOffset;

  // ── BIN 청크 재조립 ────────────────────────────────────────
  const totalBin = currentOffset;
  const binPad   = (4 - (totalBin % 4)) % 4;
  const binPadded = new Uint8Array(totalBin + binPad);
  binPadded.set(existingBin, 0);
  let off = existingBin.byteLength;
  for (const part of extraParts) { binPadded.set(part, off); off += part.byteLength; }

  // ── JSON 청크 재조립 (공백으로 4-byte 정렬) ───────────────
  const jsonRaw    = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad    = (4 - (jsonRaw.length % 4)) % 4;
  const jsonPadded = new Uint8Array(jsonRaw.length + jsonPad);
  jsonPadded.set(jsonRaw);
  jsonPadded.fill(0x20, jsonRaw.length); // 공백으로 패딩 (유효한 JSON 공백)

  // ── GLB 재조립 ─────────────────────────────────────────────
  const jsonChunkTotal = 8 + jsonPadded.byteLength;
  const binChunkTotal  = totalBin > 0 ? 8 + binPadded.byteLength : 0;
  const totalLength    = 12 + jsonChunkTotal + binChunkTotal;

  const result     = new ArrayBuffer(totalLength);
  const resultView = new DataView(result);
  const resultU8   = new Uint8Array(result);

  // 헤더
  resultView.setUint32(0, GLB_MAGIC,   true);
  resultView.setUint32(4, 2,           true);
  resultView.setUint32(8, totalLength, true);

  // JSON 청크
  resultView.setUint32(12, jsonPadded.byteLength, true);
  resultView.setUint32(16, CHUNK_TYPE_JSON,        true);
  resultU8.set(jsonPadded, 20);

  // BIN 청크
  if (totalBin > 0) {
    const bo = 20 + jsonPadded.byteLength;
    resultView.setUint32(bo,     binPadded.byteLength, true);
    resultView.setUint32(bo + 4, CHUNK_TYPE_BIN,       true);
    resultU8.set(binPadded, bo + 8);
  }

  return result;
}

export interface EmbedTexturesResult {
  /** null이면 재포장이 필요 없거나 실패 — 원본 파일을 그대로 업로드 */
  blob: Blob | null;
  embeddedNames: string[];
  missingNames:  string[];
}

/**
 * glbFile이 외부 텍스처를 참조하고 textureFiles 중 일치하는 파일이 있으면
 * 텍스처를 임베드한 새 GLB Blob을 반환한다.
 * textureFiles가 비어있거나 GLB가 이미 자체완결형이면 blob: null 반환.
 */
export async function tryEmbedTextures(glbFile: File, textureFiles: File[]): Promise<EmbedTexturesResult> {
  if (textureFiles.length === 0) return { blob: null, embeddedNames: [], missingNames: [] };

  const buffer       = await glbFile.arrayBuffer();
  const externalUris = findExternalTextureUris(buffer);
  if (externalUris.length === 0) return { blob: null, embeddedNames: [], missingNames: [] };

  const fileNames     = new Set(textureFiles.map((f) => f.name.toLowerCase()));
  const embeddedNames: string[] = [];
  const missingNames:  string[] = [];
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
