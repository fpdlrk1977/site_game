'use client';

import { useState, useRef } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { HierarchyPanel } from './HierarchyPanel';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import type { AssetRefSchema, ContentType, ParticlePreset } from '@/types/scene';

type LeftTab = 'objects' | 'assets';
type AssetTab = 'models' | 'content' | 'particle';

const ASSET_TABS: { id: AssetTab; label: string }[] = [
  { id: 'models',   label: 'Models' },
  { id: 'content',  label: 'Content' },
  { id: 'particle', label: 'Particles' },
];

const CONTENT_ITEMS: { type: ContentType; label: string; emoji: string }[] = [
  { type: 'text',  label: '텍스트', emoji: '𝐓' },
  { type: 'image', label: '이미지', emoji: '🖼' },
  { type: 'video', label: '동영상', emoji: '▶' },
];

const PARTICLE_ITEMS: { preset: ParticlePreset; label: string; emoji: string }[] = [
  { preset: 'fire',  label: '불꽃', emoji: '🔥' },
  { preset: 'dust',  label: '먼지', emoji: '💨' },
  { preset: 'light', label: '빛',   emoji: '✨' },
  { preset: 'snow',  label: '눈',   emoji: '❄️' },
];

function AssetsTabContent() {
  const { projectId, objects, assets, addAsset, addAssetObject, addContentObject, addParticleObject } = useSceneStore();
  const [assetTab, setAssetTab] = useState<AssetTab>('models');
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
      const { data: signedData } = await supabase.storage.from('assets').createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!signedData?.signedUrl) throw new Error('signed URL 생성 실패');
      const { error: dbErr } = await supabase.from('assets').insert({
        id: assetId, project_id: projectId, owner_id: user.id,
        name: file.name.replace(/\.glb$/i, ''),
        file_url: signedData.signedUrl, draco_url: signedData.signedUrl,
        mime_type: 'model/gltf-binary', size_bytes: file.size,
      });
      if (dbErr) { await supabase.storage.from('assets').remove([path]); throw dbErr; }
      addAsset({ id: assetId, name: file.name.replace(/\.glb$/i, ''), dracoUrl: signedData.signedUrl });
    } catch (err) {
      addToast(`에셋 업로드 실패: ${err instanceof Error ? err.message : '오류'}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 에셋 탭 */}
      <div className="flex gap-0.5 px-2 pt-2 pb-1.5 border-b border-border/60 shrink-0">
        {ASSET_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setAssetTab(t.id)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
              assetTab === t.id
                ? 'bg-background text-foreground'
                : 'text-muted hover:text-foreground hover:bg-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-2">
        {assetTab === 'models' && (
          <>
            <input ref={inputRef} type="file" accept=".glb" className="hidden" onChange={handleFileChange} />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="h-[72px] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted hover:border-primary hover:text-primary transition-all gap-0.5 disabled:opacity-40"
              >
                {uploading ? (
                  <span className="text-xs animate-pulse">...</span>
                ) : (
                  <>
                    <span className="text-lg leading-none">+</span>
                    <span className="text-[9px]">.glb</span>
                  </>
                )}
              </button>
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => addAssetObject(asset)}
                  title={asset.name}
                  className="group relative h-[72px] rounded-xl bg-background border border-border hover:border-border/60 transition-all flex flex-col items-center justify-center gap-1 overflow-hidden"
                >
                  <span className="text-xl leading-none">📦</span>
                  <span className="text-[9px] text-muted truncate w-full text-center px-1">{asset.name}</span>
                  <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-[10px] font-medium">
                    + 추가
                  </div>
                </button>
              ))}
              {assets.length === 0 && (
                <p className="col-span-2 text-[10px] text-muted text-center py-4 leading-relaxed">
                  .glb 파일을 업로드하면<br />여기에 표시됩니다
                </p>
              )}
            </div>
          </>
        )}

        {assetTab === 'content' && (
          <div className="grid grid-cols-2 gap-2">
            {CONTENT_ITEMS.map(({ type, label, emoji }) => (
              <button
                key={type}
                onClick={() => addContentObject(type)}
                className="h-[72px] rounded-xl bg-background border border-border hover:border-border/60 hover:bg-surface transition-all flex flex-col items-center justify-center gap-1.5"
              >
                <span className="text-xl leading-none">{emoji}</span>
                <span className="text-[9px] text-muted">{label}</span>
              </button>
            ))}
          </div>
        )}

        {assetTab === 'particle' && (
          <div className="grid grid-cols-2 gap-2">
            {PARTICLE_ITEMS.map(({ preset, label, emoji }) => (
              <button
                key={preset}
                onClick={() => addParticleObject(preset)}
                className="h-[72px] rounded-xl bg-background border border-border hover:border-primary/60 hover:bg-surface transition-all flex flex-col items-center justify-center gap-1.5"
              >
                <span className="text-xl leading-none">{emoji}</span>
                <span className="text-[9px] text-muted">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LeftPanel() {
  const [tab, setTab] = useState<LeftTab>('objects');
  const { objects } = useSceneStore();

  return (
    <div className="flex flex-col bg-sidebar border-r border-border overflow-hidden h-full">
      {/* 탭 헤더 */}
      <div className="flex items-center gap-0 border-b border-border shrink-0 px-2 pt-1.5">
        <button
          onClick={() => setTab('objects')}
          className={`relative px-3 pb-1.5 pt-1 text-[11px] font-semibold transition-all ${
            tab === 'objects'
              ? 'text-foreground'
              : 'text-muted hover:text-foreground'
          }`}
        >
          Objects
          {tab === 'objects' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full" />
          )}
          <span className="ml-1 text-[9px] text-muted/60 font-normal">{objects.length}</span>
        </button>
        <button
          onClick={() => setTab('assets')}
          className={`relative px-3 pb-1.5 pt-1 text-[11px] font-semibold transition-all ${
            tab === 'assets'
              ? 'text-foreground'
              : 'text-muted hover:text-foreground'
          }`}
        >
          Assets
          {tab === 'assets' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full" />
          )}
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      {tab === 'objects' ? (
        <HierarchyPanel noWrapper />
      ) : (
        <AssetsTabContent />
      )}
    </div>
  );
}
