'use client';

import { useRef, useState } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import { tryEmbedTextures } from '@/lib/glbEmbed';
import type { AssetRefSchema, ContentType, ParticlePreset } from '@/types/scene';

type Tab = 'models' | 'character' | 'content' | 'particle' | 'materials' | 'textures' | 'hdr' | 'audio';

const TABS: { id: Tab; label: string; wip?: boolean }[] = [
  { id: 'models',    label: 'Models' },
  { id: 'character', label: 'Character' },
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
  const modelInputRef = useRef<HTMLInputElement>(null);
  const characterInputRef = useRef<HTMLInputElement>(null);

  const uploadGlb = async (file: File, assetType: AssetRefSchema['type'], textureFiles: File[] = []) => {
    if (!projectId) return;
    if (file.size > 50 * 1024 * 1024) {
      addToast('파일이 너무 큽니다. 최대 50MB까지 지원합니다.', 'error');
      return;
    }
    setUploading(true);
    try {
      // glb가 텍스처를 외부 파일로 참조하고 있고, 함께 선택한 파일 중 일치하는 게 있으면
      // 완전히 임베드된 새 glb로 재포장한다. 해당 없음/실패 시 blob은 null → 원본 그대로 업로드.
      const { blob, embeddedNames, missingNames } = await tryEmbedTextures(file, textureFiles);
      if (embeddedNames.length > 0) {
        addToast(`텍스처 ${embeddedNames.length}개를 파일에 포함했습니다: ${embeddedNames.join(', ')}`, 'success');
      }
      if (missingNames.length > 0) {
        addToast(`일부 텍스처를 찾을 수 없어 비어있을 수 있습니다: ${missingNames.join(', ')}`, 'error');
      }
      const uploadBody: File | Blob = blob ?? file;

      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const assetId = crypto.randomUUID();
      const path = `assets/${projectId}/${assetId}.glb`;
      const { error: storageErr } = await supabase.storage
        .from('assets')
        .upload(path, uploadBody, { contentType: 'model/gltf-binary', upsert: false });
      if (storageErr) throw storageErr;
      const { data: signedData } = await supabase.storage.from('assets').createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!signedData?.signedUrl) throw new Error('signed URL 생성 실패');
      const { error: dbErr } = await supabase.from('assets').insert({
        id: assetId, project_id: projectId, owner_id: user.id,
        name: file.name.replace(/\.glb$/i, ''),
        file_url: signedData.signedUrl, draco_url: signedData.signedUrl,
        mime_type: 'model/gltf-binary', size_bytes: uploadBody.size,
      });
      if (dbErr) { await supabase.storage.from('assets').remove([path]); throw dbErr; }
      const asset: AssetRefSchema = {
        id: assetId,
        name: file.name.replace(/\.glb$/i, ''),
        dracoUrl: signedData.signedUrl,
        type: assetType,
      };
      addAsset(asset);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      addToast(`에셋 업로드 실패: ${msg}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleModelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []);
    e.target.value = '';
    const modelFile = fileList.find((f) => /\.glb$/i.test(f.name));
    if (!modelFile) {
      if (fileList.length > 0) addToast('.glb 파일을 선택해주세요.', 'error');
      return;
    }
    const textureFiles = fileList.filter((f) => f !== modelFile);
    await uploadGlb(modelFile, 'model', textureFiles);
  };

  const handleCharacterFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []);
    e.target.value = '';
    const modelFile = fileList.find((f) => /\.glb$/i.test(f.name));
    if (!modelFile) {
      if (fileList.length > 0) addToast('.glb 파일을 선택해주세요.', 'error');
      return;
    }
    const textureFiles = fileList.filter((f) => f !== modelFile);
    await uploadGlb(modelFile, 'character', textureFiles);
  };

  const currentTab = TABS.find((t) => t.id === tab)!;
  const modelAssets = assets.filter((a) => a.type !== 'character');
  const characterAssets = assets.filter((a) => a.type === 'character');
  const filteredModels = search.trim()
    ? modelAssets.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : modelAssets;

  return (
    <div className="flex h-full bg-sidebar border-t border-border overflow-hidden">
      {/* 왼쪽 세로 탭 사이드바 */}
      <div className="flex flex-col w-[88px] shrink-0 border-r border-border/80 py-2 gap-0.5">
        <p className="px-3 pb-1 text-[9px] font-semibold text-muted/60 uppercase tracking-widest">Assets</p>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`mx-1.5 px-2 py-1.5 text-[11px] font-medium text-left rounded-lg transition-all ${
              tab === t.id
                ? 'bg-background text-foreground'
                : t.wip
                  ? 'text-muted/40 hover:text-muted hover:bg-surface/50'
                  : 'text-muted hover:text-foreground hover:bg-surface/50'
            }`}
          >
            {t.label}
            {t.wip && <span className="ml-1 text-[8px] opacity-50">·</span>}
          </button>
        ))}
      </div>

      {/* 콘텐츠 영역 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {tab === 'models' && (
          <div className="px-3 pt-2 pb-1.5 shrink-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="에셋 검색..."
              className="w-full max-w-xs bg-background border border-border rounded-lg px-2.5 py-1 text-[11px] text-foreground placeholder-muted focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        )}

        {tab === 'models' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex items-center gap-2 px-3 pb-2 h-full">
              <input ref={modelInputRef} type="file" accept=".glb,image/*" multiple className="hidden" onChange={handleModelFile} />
              <UploadButton
                uploading={uploading}
                onClick={() => modelInputRef.current?.click()}
                title="glb 선택 시 텍스처 이미지 파일도 함께(Ctrl/Cmd로 다중 선택) 고르면 자동으로 파일에 포함됩니다"
              />
              {filteredModels.map((asset) => (
                <AssetCard key={asset.id} asset={asset} icon="📦" onAdd={() => addAssetObject(asset)} />
              ))}
              {modelAssets.length === 0 && (
                <p className="text-[11px] text-muted ml-2">.glb 파일을 업로드하면 씬에 배치할 수 있습니다</p>
              )}
            </div>
          </div>
        )}

        {tab === 'character' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex items-center gap-2 px-3 pb-2 h-full">
              <input ref={characterInputRef} type="file" accept=".glb,image/*" multiple className="hidden" onChange={handleCharacterFile} />
              <UploadButton
                uploading={uploading}
                onClick={() => characterInputRef.current?.click()}
                label="캐릭터"
                title="glb 선택 시 텍스처 이미지 파일도 함께(Ctrl/Cmd로 다중 선택) 고르면 자동으로 파일에 포함됩니다"
              />
              {characterAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} icon="🧍" />
              ))}
              {characterAssets.length === 0 && (
                <p className="text-[11px] text-muted ml-2">캐릭터 GLB를 업로드하세요. Inspector → Player에서 씬에 적용합니다</p>
              )}
            </div>
          </div>
        )}

        {tab === 'content' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex items-center gap-2 px-3 pb-2 h-full pt-2">
              {CONTENT_ITEMS.map(({ type, label, emoji }) => (
                <button
                  key={type}
                  onClick={() => addContentObject(type)}
                  className="w-[72px] h-[72px] shrink-0 rounded-xl bg-background border border-border hover:border-border/60 hover:bg-surface transition-all flex flex-col items-center justify-center gap-1.5"
                >
                  <span className="text-xl leading-none">{emoji}</span>
                  <span className="text-[9px] text-muted">{label}</span>
                </button>
              ))}
              <p className="text-[11px] text-muted ml-2">클릭하면 씬에 배치됩니다</p>
            </div>
          </div>
        )}

        {tab === 'particle' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex items-center gap-2 px-3 pb-2 h-full pt-2">
              {PARTICLE_ITEMS.map(({ preset, label, emoji }) => (
                <button
                  key={preset}
                  onClick={() => addParticleObject(preset)}
                  className="w-[72px] h-[72px] shrink-0 rounded-xl bg-background border border-border hover:border-primary/60 hover:bg-surface transition-all flex flex-col items-center justify-center gap-1.5"
                >
                  <span className="text-xl leading-none">{emoji}</span>
                  <span className="text-[9px] text-muted">{label}</span>
                </button>
              ))}
              <p className="text-[11px] text-muted ml-2">클릭하면 씬에 파티클이 배치됩니다</p>
            </div>
          </div>
        )}

        {currentTab.wip && (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 select-none">
            <span className="text-2xl opacity-20">
              {tab === 'materials' ? '🎨' : tab === 'textures' ? '🖼' : tab === 'hdr' ? '🌅' : '🎵'}
            </span>
            <p className="text-[11px] text-muted font-medium">{currentTab.label} — 준비 중</p>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadButton({ uploading, onClick, label = '.glb', title }: { uploading: boolean; onClick: () => void; label?: string; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={uploading}
      title={title}
      className="w-[72px] h-[72px] shrink-0 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted hover:border-primary hover:text-primary transition-all gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {uploading ? (
        <span className="text-xs animate-pulse">...</span>
      ) : (
        <>
          <span className="text-xl leading-none">+</span>
          <span className="text-[9px]">{label}</span>
        </>
      )}
    </button>
  );
}

function AssetCard({ asset, icon, onAdd }: { asset: AssetRefSchema; icon: string; onAdd?: () => void }) {
  return (
    <div className="group relative w-[72px] h-[72px] shrink-0 rounded-xl bg-background border border-border hover:border-border/60 transition-all flex flex-col items-center justify-center gap-1 overflow-hidden">
      <span className="text-2xl leading-none">{icon}</span>
      <span className="text-[9px] text-muted truncate w-full text-center px-1">{asset.name}</span>
      {onAdd && (
        <button
          onClick={onAdd}
          className="absolute inset-0 bg-primary/0 group-hover:bg-primary/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-xs font-medium"
        >
          + 추가
        </button>
      )}
    </div>
  );
}
