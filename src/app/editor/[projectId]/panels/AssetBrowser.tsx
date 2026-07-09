'use client';

import { useRef, useState } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import { persistCurrentScene } from '@/lib/saveScene';
import { tryEmbedTextures } from '@/lib/glbEmbed';
import { uploadGlbBlob } from '@/lib/uploadAsset';
import { AssetPreviewPopup } from './AssetPreviewPopup';
import { SelectBox } from '@/components/ui/SelectBox';
import type { AssetRefSchema, ContentType, ParticlePreset, LightType } from '@/types/scene';

type Tab = 'models' | 'character' | 'content' | 'particle' | 'lights' | 'materials' | 'textures' | 'hdr' | 'audio';

const TABS: { id: Tab; label: string; wip?: boolean }[] = [
  { id: 'models',    label: 'Models' },
  { id: 'character', label: 'Character' },
  { id: 'content',   label: 'Content' },
  { id: 'particle',  label: 'Particle' },
  { id: 'lights',    label: 'Lights' },
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

const LIGHT_ITEMS: { type: LightType; label: string; emoji: string }[] = [
  { type: 'point',       label: '포인트',     emoji: '💡' },
  { type: 'spot',        label: '스팟',       emoji: '🔦' },
  { type: 'directional', label: '방향 라이트', emoji: '☀️' },
];

export function AssetBrowser() {
  const { projectId, assets, addAsset, addAssetObject, addContentObject, addParticleObject, addLightObject, removeAsset, removeObjectsByAsset, updateEnvironment } = useSceneStore();
  const [tab, setTab] = useState<Tab>('models');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { addToast } = useToast();
  const modelInputRef = useRef<HTMLInputElement>(null);
  const characterInputRef = useRef<HTMLInputElement>(null);

  const deleteAsset = async (asset: AssetRefSchema) => {
    if (deletingId) return;

    // 사용 중이면 연쇄 삭제 확인 — 에셋과 함께 참조 오브젝트도 정리해 유령 참조를 막는다
    // (다른 씬의 사용 여부까지는 확인하지 못하는 한계 있음)
    const cur = useSceneStore.getState();
    const usedCount = cur.objects.filter((o) => o.assetId === asset.id).length;
    const isPlayerChar = cur.environment.playerCharacterId === asset.id;
    if (usedCount > 0 || isPlayerChar) {
      const lines = [`"${asset.name}" 에셋을 삭제하면:`];
      if (usedCount > 0) lines.push(`• 씬에서 이 에셋을 쓰는 오브젝트 ${usedCount}개도 함께 삭제됩니다`);
      if (isPlayerChar) lines.push('• 플레이어 캐릭터 지정이 해제됩니다');
      lines.push('\n계속할까요? (복구할 수 없습니다)');
      if (!confirm(lines.join('\n'))) return;
    }

    setDeletingId(asset.id);
    try {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Storage 파일 삭제 (실패해도 DB·스토어는 계속 진행)
      // URL은 .../object/public/{bucket}/{path} (신규) 또는
      // .../object/sign/{bucket}/{path}?token=... (구 데이터) 형태 —
      // remove()에는 버킷 이후의 경로만 전달해야 한다
      const storagePath = (() => {
        const m = asset.dracoUrl.match(/\/object\/(?:public|sign)\/assets\/([^?]+)/);
        try { return m ? decodeURIComponent(m[1]) : null; } catch { return m ? m[1] : null; }
      })();
      if (storagePath) {
        const thumbPath = storagePath.replace(/\.glb$/i, '_thumb.png');
        const paths = thumbPath !== storagePath ? [storagePath, thumbPath] : [storagePath];
        await supabase.storage.from('assets').remove(paths).catch(() => {});
      }

      // DB 삭제
      const { error } = await supabase.from('assets').delete().eq('id', asset.id);
      if (error) throw error;

      // DB 삭제 성공 후에만 씬 반영(연쇄) — 중간 실패 시 부분 반영 방지
      if (usedCount > 0) removeObjectsByAsset(asset.id);
      if (isPlayerChar) updateEnvironment({ playerCharacterId: undefined });
      removeAsset(asset.id);

      // scenes.scene_data도 즉시 반영 (새로고침 시 삭제된 에셋이 복원되는 버그 방지).
      // 낙관적 잠금 — 다른 탭/기기가 먼저 저장했으면 conflict로 덮어쓰기 차단.
      const result = await persistCurrentScene();
      if (result.status === 'conflict') {
        addToast('에셋은 삭제됐지만, 다른 탭·기기에서 씬이 먼저 저장되어 반영하지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'error');
        return;
      }

      addToast(`"${asset.name}" 삭제됨`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패';
      addToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

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

      const asset = await uploadGlbBlob(uploadBody, file.name.replace(/\.glb$/i, ''), projectId, assetType);
      addAsset(asset);

      // scenes.scene_data 즉시 반영 (새로고침 후 에셋이 사라지는 버그 방지).
      // 낙관적 잠금 — 다른 탭/기기가 먼저 저장했으면 conflict (에셋 파일은 이미 업로드됨).
      const result = await persistCurrentScene();
      if (result.status === 'conflict') {
        addToast('에셋은 업로드됐지만, 다른 탭·기기에서 씬이 먼저 저장되어 반영하지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'error');
      }
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 카테고리 선택 */}
      <div className="px-2 pt-2 shrink-0">
        <SelectBox
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={TABS.map((t) => ({
            value: t.id,
            label: t.wip ? `${t.label} (준비 중)` : t.label,
          }))}
        />
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-2 pt-1">
        {tab === 'models' && (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="에셋 검색..."
              className="w-full bg-surface border border-border rounded-xs px-2.5 py-1 mb-2 text-[11px] text-foreground placeholder-muted focus:outline-none focus:border-primary transition-colors"
            />
            <input ref={modelInputRef} type="file" accept=".glb,image/*" multiple className="hidden" onChange={handleModelFile} />
            <div className="grid grid-cols-2 gap-2">
              <UploadButton
                uploading={uploading}
                onClick={() => modelInputRef.current?.click()}
                title="glb 선택 시 텍스처 이미지 파일도 함께(Ctrl/Cmd로 다중 선택) 고르면 자동으로 파일에 포함됩니다"
              />
              {filteredModels.map((asset) => (
                <AssetCard key={asset.id} asset={asset} icon="📦"
                  onAdd={() => addAssetObject(asset)}
                  onDelete={() => deleteAsset(asset)}
                  deleting={deletingId === asset.id}
                />
              ))}
            </div>
            {modelAssets.length === 0 && (
              <p className="text-[10px] text-muted text-center py-4 leading-relaxed">
                .glb 파일을 업로드하면<br />씬에 배치할 수 있습니다
              </p>
            )}
          </>
        )}

        {tab === 'character' && (
          <>
            <input ref={characterInputRef} type="file" accept=".glb,image/*" multiple className="hidden" onChange={handleCharacterFile} />
            <div className="grid grid-cols-2 gap-2">
              <UploadButton
                uploading={uploading}
                onClick={() => characterInputRef.current?.click()}
                label="캐릭터"
                title="glb 선택 시 텍스처 이미지 파일도 함께(Ctrl/Cmd로 다중 선택) 고르면 자동으로 파일에 포함됩니다"
              />
              {characterAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} icon="🧍"
                  onDelete={() => deleteAsset(asset)}
                  deleting={deletingId === asset.id}
                />
              ))}
            </div>
            {characterAssets.length === 0 && (
              <p className="text-[10px] text-muted text-center py-4 leading-relaxed">
                캐릭터 GLB를 업로드하세요.<br />Inspector → Player에서 씬에 적용합니다
              </p>
            )}
          </>
        )}

        {tab === 'content' && (
          <div className="grid grid-cols-2 gap-2">
            {CONTENT_ITEMS.map(({ type, label, emoji }) => (
              <button
                key={type}
                onClick={() => addContentObject(type)}
                className="h-[72px] rounded-xs bg-background border border-border hover:border-border/60 hover:bg-surface transition-all flex flex-col items-center justify-center gap-1.5"
              >
                <span className="text-xl leading-none">{emoji}</span>
                <span className="text-[9px] text-muted">{label}</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'particle' && (
          <div className="grid grid-cols-2 gap-2">
            {PARTICLE_ITEMS.map(({ preset, label, emoji }) => (
              <button
                key={preset}
                onClick={() => addParticleObject(preset)}
                className="h-[72px] rounded-xs bg-background border border-border hover:border-primary/60 hover:bg-surface transition-all flex flex-col items-center justify-center gap-1.5"
              >
                <span className="text-xl leading-none">{emoji}</span>
                <span className="text-[9px] text-muted">{label}</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'lights' && (
          <div className="grid grid-cols-2 gap-2">
            {LIGHT_ITEMS.map(({ type, label, emoji }) => (
              <button
                key={type}
                onClick={() => addLightObject(type)}
                className="h-[72px] rounded-xs bg-background border border-border hover:border-yellow-500/40 hover:bg-surface transition-all flex flex-col items-center justify-center gap-1.5"
              >
                <span className="text-xl leading-none">{emoji}</span>
                <span className="text-[9px] text-muted text-center leading-snug">{label}</span>
              </button>
            ))}
          </div>
        )}

        {currentTab.wip && (
          <div className="flex flex-col items-center justify-center gap-1.5 select-none py-10">
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
      className="h-[72px] rounded-xs border-2 border-dashed border-border flex flex-col items-center justify-center text-muted hover:border-primary hover:text-primary transition-all gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
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

function AssetCard({ asset, icon, onAdd, onDelete, deleting }: {
  asset: AssetRefSchema;
  icon: string;
  onAdd?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const isModel = !!asset.dracoUrl;

  return (
    <div
      ref={cardRef}
      className="group relative h-[72px] rounded-xs bg-background border border-border hover:border-border/60 transition-all flex flex-col items-center justify-center gap-1 overflow-hidden"
      onMouseEnter={() => {
        if (isModel && cardRef.current) setHoverRect(cardRef.current.getBoundingClientRect());
      }}
      onMouseLeave={() => { setHoverRect(null); setConfirmDelete(false); }}
    >
      {asset.thumbnailUrl ? (
        <>
          <img src={asset.thumbnailUrl} alt={asset.name} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-background/70 backdrop-blur-sm">
            <span className="text-[9px] text-foreground/80 truncate w-full text-center block">{asset.name}</span>
          </div>
        </>
      ) : (
        <>
          <span className="text-2xl leading-none">{icon}</span>
          <span className="text-[9px] text-muted truncate w-full text-center px-1">{asset.name}</span>
        </>
      )}

      {/* 호버 오버레이 */}
      {!confirmDelete && onAdd && (
        <button
          onClick={onAdd}
          className="absolute inset-0 bg-primary/0 group-hover:bg-primary/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-xs font-medium"
        >
          + 추가
        </button>
      )}

      {/* 삭제 버튼 (우상단) */}
      {onDelete && !confirmDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
          className="absolute top-1 right-1 w-5 h-5 rounded-sm bg-background/80 text-muted hover:bg-danger hover:text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-[10px] leading-none"
          title="삭제"
        >
          ✕
        </button>
      )}

      {/* 삭제 확인 */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center gap-1.5 p-1">
          <p className="text-[9px] text-foreground text-center leading-tight">삭제할까요?</p>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
              disabled={deleting}
              className="px-2 py-0.5 text-[9px] bg-danger text-white rounded-xs disabled:opacity-50"
            >
              {deleting ? '...' : '삭제'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
              className="px-2 py-0.5 text-[9px] bg-surface text-muted rounded-xs border border-border"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {hoverRect && isModel && !confirmDelete && (
        <AssetPreviewPopup url={asset.dracoUrl} name={asset.name} anchorRect={hoverRect} />
      )}
    </div>
  );
}
