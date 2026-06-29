'use client';

import { useRef, useState } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { createBrowserSupabase } from '@/lib/supabase';
import type { AssetRefSchema } from '@/types/scene';

export function AssetBrowser() {
  const { projectId, assets, addAsset, addAssetObject } = useSceneStore();
  const [uploading, setUploading] = useState(false);
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

      // signed URL (1년)
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
      alert('업로드 실패. 콘솔을 확인하세요.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 bg-zinc-950 border-t border-zinc-800 h-full overflow-x-auto">
      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">
        Assets
      </span>

      {/* 업로드 버튼 */}
      <input
        ref={inputRef}
        type="file"
        accept=".glb"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title=".glb 업로드"
        className="w-16 h-16 rounded-xl border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center text-zinc-600 hover:border-violet-500 hover:text-violet-400 transition-all cursor-pointer shrink-0 gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
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

      {/* 에셋 카드 목록 */}
      <div className="flex items-center gap-2 py-2">
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} onAdd={() => addAssetObject(asset)} />
        ))}
        {assets.length === 0 && (
          <p className="text-xs text-zinc-600 leading-relaxed">
            .glb 파일을 업로드하면 씬에 배치할 수 있습니다
          </p>
        )}
      </div>
    </div>
  );
}

function AssetCard({ asset, onAdd }: { asset: AssetRefSchema; onAdd: () => void }) {
  return (
    <div className="group relative w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all shrink-0 flex flex-col items-center justify-center gap-1 overflow-hidden">
      <span className="text-2xl leading-none">📦</span>
      <span className="text-[9px] text-zinc-500 truncate w-full text-center px-1">{asset.name}</span>
      {/* 호버 오버레이 — 씬에 추가 */}
      <button
        onClick={onAdd}
        className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-xs font-medium"
      >
        + 추가
      </button>
    </div>
  );
}
