'use client';

import { useRef, useState } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import type { AssetRefSchema, ContentType, ParticlePreset } from '@/types/scene';

type Tab = 'models' | 'content' | 'particle' | 'materials' | 'textures' | 'hdr' | 'audio';

const TABS: { id: Tab; label: string; wip?: boolean }[] = [
  { id: 'models',    label: 'Models' },
  { id: 'content',   label: 'Content' },
  { id: 'particle',  label: 'Particle' },
  { id: 'materials', label: 'Materials', wip: true },
  { id: 'textures',  label: 'Textures',  wip: true },
  { id: 'hdr',       label: 'HDR',       wip: true },
  { id: 'audio',     label: 'Audio',     wip: true },
];

const CONTENT_ITEMS: { type: ContentType; label: string; emoji: string }[] = [
  { type: 'text',  label: '텍스트', emoji: '𝐓' },
  { type: 'image', label: '이미지', emoji: '🖼' },
  { type: 'video', label: '동영상', emoji: '▶' },
];

const PARTICLE_ITEMS: { preset: ParticlePreset; label: string; emoji: string }[] = [
  { preset: 'fire',  label: '불꽃',   emoji: '🔥' },
  { preset: 'dust',  label: '먼지',   emoji: '💨' },
  { preset: 'light', label: '빛',     emoji: '✨' },
  { preset: 'snow',  label: '눈',     emoji: '❄️' },
];

export function AssetBrowser() {
  const { projectId, assets, addAsset, addAssetObject, addContentObject, addParticleObject } = useSceneStore();
  const [tab, setTab] = useState<Tab>('models');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    e.target.value = '';

    if (file.size > 50 * 1024 * 1024) {
      addToast('파일이 너무 큽니다. 최대 50MB까지 지원합니다.', 'error');
      return;
    }

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

      if (dbErr) {
        await supabase.storage.from('assets').remove([path]);
        throw dbErr;
      }

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

  const currentTab = TABS.find((t) => t.id === tab)!;
  const filteredAssets = search.trim()
    ? assets.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : assets;

  return (
    <div className="flex h-full bg-zinc-950 border-t border-zinc-800 overflow-hidden">
      {/* 왼쪽 세로 탭 사이드바 */}
      <div className="flex flex-col w-[88px] shrink-0 border-r border-zinc-800/80 py-2 gap-0.5">
        <p className="px-3 pb-1 text-[9px] font-semibold text-zinc-600 uppercase tracking-widest">Assets</p>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`mx-1.5 px-2 py-1.5 text-[11px] font-medium text-left rounded-lg transition-all ${
              tab === t.id
                ? 'bg-zinc-800 text-white'
                : t.wip
                  ? 'text-zinc-700 hover:text-zinc-500 hover:bg-zinc-900/50'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
            }`}
          >
            {t.label}
            {t.wip && <span className="ml-1 text-[8px] opacity-50">·</span>}
          </button>
        ))}
      </div>

      {/* 콘텐츠 영역 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 검색창 (Models 탭에서만) */}
        {tab === 'models' && (
          <div className="px-3 pt-2 pb-1.5 shrink-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="에셋 검색..."
              className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
        )}

        {/* Models */}
        {tab === 'models' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex items-center gap-2 px-3 pb-2 h-full">
              <input ref={inputRef} type="file" accept=".glb" className="hidden" onChange={handleFileChange} />
              {/* 업로드 버튼 */}
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                title=".glb 파일 업로드"
                className="w-[72px] h-[72px] shrink-0 rounded-xl border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center text-zinc-600 hover:border-violet-500 hover:text-violet-400 transition-all gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <span className="text-xs animate-pulse">...</span>
                ) : (
                  <>
                    <span className="text-xl leading-none">+</span>
                    <span className="text-[9px]">.glb</span>
                  </>
                )}
              </button>

              {/* 에셋 목록 */}
              {filteredAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} onAdd={() => addAssetObject(asset)} />
              ))}
              {assets.length === 0 && (
                <p className="text-[11px] text-zinc-600 ml-2">.glb 파일을 업로드하면 씬에 배치할 수 있습니다</p>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {tab === 'content' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex items-center gap-2 px-3 pb-2 h-full pt-2">
              {CONTENT_ITEMS.map(({ type, label, emoji }) => (
                <button
                  key={type}
                  onClick={() => addContentObject(type)}
                  className="w-[72px] h-[72px] shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all flex flex-col items-center justify-center gap-1.5"
                >
                  <span className="text-xl leading-none">{emoji}</span>
                  <span className="text-[9px] text-zinc-500">{label}</span>
                </button>
              ))}
              <p className="text-[11px] text-zinc-600 ml-2">클릭하면 씬에 배치됩니다</p>
            </div>
          </div>
        )}

        {/* Particle */}
        {tab === 'particle' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex items-center gap-2 px-3 pb-2 h-full pt-2">
              {PARTICLE_ITEMS.map(({ preset, label, emoji }) => (
                <button
                  key={preset}
                  onClick={() => addParticleObject(preset)}
                  className="w-[72px] h-[72px] shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-violet-500/60 hover:bg-zinc-800/50 transition-all flex flex-col items-center justify-center gap-1.5"
                >
                  <span className="text-xl leading-none">{emoji}</span>
                  <span className="text-[9px] text-zinc-500">{label}</span>
                </button>
              ))}
              <p className="text-[11px] text-zinc-600 ml-2">클릭하면 씬에 파티클이 배치됩니다</p>
            </div>
          </div>
        )}

        {/* 준비 중 탭 */}
        {currentTab.wip && (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 select-none">
            <span className="text-2xl opacity-20">
              {tab === 'materials' ? '🎨' : tab === 'textures' ? '🖼' : tab === 'hdr' ? '🌅' : '🎵'}
            </span>
            <p className="text-[11px] text-zinc-600 font-medium">{currentTab.label} — 준비 중</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({ asset, onAdd }: { asset: AssetRefSchema; onAdd: () => void }) {
  return (
    <div className="group relative w-[72px] h-[72px] shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all flex flex-col items-center justify-center gap-1 overflow-hidden">
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
