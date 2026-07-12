'use client';

// GLB 애니메이션 클립 선택기 — 이벤트(play_animation/animate_object)와 Animation(defaultClip) 섹션 공용.
// InspectorPanel 분리 리팩터: 이벤트 섹션 분리 전에 공용 의존부터 별도 파일로 뺀다(동작 무변경).

import { useState, useEffect } from 'react';
import { SelectBox } from '@/components/ui/SelectBox';

// ── GLB 애니메이션 클립 선택기 ─────────────────────────────────
// three-stdlib GLTFLoader가 이 GLB의 animations를 파싱 못하는 문제 우회:
// GLB 바이너리의 JSON 청크를 직접 읽어 animation 이름만 추출
async function parseGlbAnimationNames(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB');
  const jsonChunkLen = view.getUint32(12, true);
  const jsonStr = new TextDecoder().decode(new Uint8Array(buffer, 20, jsonChunkLen));
  const gltf = JSON.parse(jsonStr) as { animations?: { name: string }[] };
  return (gltf.animations ?? []).map((a) => a.name);
}

// URL별 클립 목록 캐시 — 같은 GLB(수십 MB)를 피커 열 때마다 다시 받지 않는다.
// 실패한 Promise는 캐시에서 제거해 재시도 가능하게 유지.
const clipNamesCache = new Map<string, Promise<string[]>>();
function getGlbAnimationNames(url: string): Promise<string[]> {
  let p = clipNamesCache.get(url);
  if (!p) {
    p = parseGlbAnimationNames(url);
    p.catch(() => clipNamesCache.delete(url));
    clipNamesCache.set(url, p);
  }
  return p;
}

export function GlbClipPicker({ url, value, onChange }: { url: string; value: string; onChange: (v: string) => void }) {
  const [clips, setClips] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setClips(null);
    setLoadError(null);
    getGlbAnimationNames(url)
      .then((names) => { if (!cancelled) setClips(names); })
      .catch((err) => { if (!cancelled) { setLoadError(String(err)); setClips([]); } });
    return () => { cancelled = true; };
  }, [url]);

  if (clips === null) {
    return (
      <div className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-muted/50">
        클립 목록 로딩 중…
      </div>
    );
  }
  if (loadError || clips.length === 0) {
    return (
      <>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="clip name"
          className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-white placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary" />
        {loadError
          ? <p className="text-danger text-[10px] mt-1">로드 실패: {loadError.slice(0, 80)}</p>
          : <p className="text-muted/50 text-[10px] mt-1">이 GLB에 애니메이션 클립이 없습니다.</p>}
      </>
    );
  }
  return (
    <SelectBox
      value={value}
      options={clips.map((n) => ({ value: n, label: n }))}
      onChange={onChange}
      placeholder="클립 선택"
    />
  );
}
