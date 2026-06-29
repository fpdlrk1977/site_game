'use client';

import { useRef, useState } from 'react';
import { MathUtils } from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import { DEFAULT_PHYSICS } from '@/types/scene';
import type { AssetRefSchema, ObjectNodeSchema, ContentType, ParticlePreset } from '@/types/scene';

type Tab = 'assets' | 'content' | 'particle';

const CONTENT_ITEMS: { type: ContentType; label: string; emoji: string }[] = [
  { type: 'text', label: '텍스트', emoji: '𝐓' },
  { type: 'image', label: '이미지', emoji: '🖼' },
  { type: 'video', label: '동영상', emoji: '▶' },
];

const PARTICLE_ITEMS: { preset: ParticlePreset; label: string; emoji: string }[] = [
  { preset: 'fire',  label: '불꽃',      emoji: '🔥' },
  { preset: 'dust',  label: '먼지',      emoji: '💨' },
  { preset: 'light', label: '빛 파티클', emoji: '✨' },
  { preset: 'snow',  label: '눈',        emoji: '❄️' },
];

export function AssetBrowser() {
  const { projectId, assets, addAsset, addAssetObject, addContentObject, addParticleObject } = useSceneStore();
  const [tab, setTab] = useState<Tab>('assets');
  const [uploading, setUploading] = useState(false);
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    e.target.value = '';

    setUploading(true);
    try {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const assetId = crypto.randomUUID();
      const path = `assets/${projectId}/${assetId}.glb`;

      const { error: storageErr } = await supabase.storage
        .from('assets')
        .upload(path, file, { contentType: 'model/gltf-binary', upsert: false });

      if (storageErr) throw storageErr;

      const { data: signedData } = await supabase.storage
        .from('assets')
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      if (!signedData?.signedUrl) throw new Error('signed URL 생성 실패');

      const { error: dbErr } = await supabase.from('assets').insert({
        id: assetId,
        project_id: projectId,
        owner_id: user.id,
        name: file.name.replace(/\.glb$/i, ''),
        file_url: signedData.signedUrl,
        draco_url: signedData.signedUrl,
        mime_type: 'model/gltf-binary',
        size_bytes: file.size,
      });

      if (dbErr) throw dbErr;

      const asset: AssetRefSchema = {
        id: assetId,
        name: file.name.replace(/\.glb$/i, ''),
        dracoUrl: signedData.signedUrl,
      };
      addAsset(asset);
    } catch (err) {
      console.error('Asset upload failed:', err);
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      addToast(`에셋 업로드 실패: ${msg}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-stretch bg-zinc-950 border-t border-zinc-800 h-full overflow-hidden">
      {/* 탭 */}
      <div className="flex flex-col border-r border-zinc-800 shrink-0">
        {(['assets', 'content', 'particle'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[10px] font-semibold transition-colors ${
              tab === t ? 'text-white bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t === 'assets' ? '에셋' : t === 'content' ? '콘텐츠' : '파티클'}
          </button>
        ))}
      </div>

      {tab === 'assets' && (
        <div className="flex items-center gap-3 px-4 overflow-x-auto flex-1">
          {/* 업로드 버튼 */}
          <input ref={inputRef} type="file" accept=".glb" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            title=".glb 업로드"
            className="w-16 h-16 rounded-xl border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center text-zinc-600 hover:border-violet-500 hover:text-violet-400 transition-all cursor-pointer shrink-0 gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? <span className="text-xs animate-pulse">...</span> : (
              <><span className="text-xl leading-none">+</span><span className="text-[9px]">.glb</span></>
            )}
          </button>

          <div className="flex items-center gap-2 py-2">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onAdd={() => addAssetObject(asset)} />
            ))}
            {assets.length === 0 && (
              <p className="text-xs text-zinc-600">.glb 파일을 업로드하면 씬에 배치할 수 있습니다</p>
            )}
          </div>
        </div>
      )}

      {tab === 'content' && (
        <div className="flex items-center gap-3 px-4 overflow-x-auto flex-1">
          {CONTENT_ITEMS.map(({ type, label, emoji }) => (
            <button
              key={type}
              onClick={() => addContentObject(type)}
              className="w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all shrink-0 flex flex-col items-center justify-center gap-1"
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className="text-[9px] text-zinc-500">{label}</span>
            </button>
          ))}
          <p className="text-xs text-zinc-600 ml-2">클릭하면 씬에 배치됩니다</p>
        </div>
      )}

      {tab === 'particle' && (
        <div className="flex items-center gap-3 px-4 overflow-x-auto flex-1">
          {PARTICLE_ITEMS.map(({ preset, label, emoji }) => (
            <button
              key={preset}
              onClick={() => addParticleObject(preset)}
              className="w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-violet-500/60 transition-all shrink-0 flex flex-col items-center justify-center gap-1"
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className="text-[9px] text-zinc-500">{label}</span>
            </button>
          ))}
          <p className="text-xs text-zinc-600 ml-2">클릭하면 씬에 파티클이 배치됩니다</p>
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, onAdd }: { asset: AssetRefSchema; onAdd: () => void }) {
  return (
    <div className="group relative w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all shrink-0 flex flex-col items-center justify-center gap-1 overflow-hidden">
      <span className="text-2xl leading-none">📦</span>
      <span className="text-[9px] text-zinc-500 truncate w-full text-center px-1">{asset.name}</span>
      <button
        onClick={onAdd}
        className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-xs font-medium"
      >
        + 추가
      </button>
    </div>
  );
}
