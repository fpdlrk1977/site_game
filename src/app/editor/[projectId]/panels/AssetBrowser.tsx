'use client';

import { useRef, useState } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import { persistCurrentScene } from '@/lib/saveScene';
import { tryEmbedTextures } from '@/lib/glbEmbed';
import { uploadGlbBlob, uploadAudioFile, uploadImageTexture } from '@/lib/uploadAsset';
import { AssetPreviewPopup } from './AssetPreviewPopup';
import { SelectBox } from '@/components/ui/SelectBox';
import type { AssetRefSchema, ContentType, ParticlePreset, LightType, HdrPreset, MaterialOverride } from '@/types/scene';

type Tab = 'models' | 'character' | 'content' | 'particle' | 'lights' | 'materials' | 'textures' | 'hdr' | 'audio';

const TABS: { id: Tab; label: string; wip?: boolean }[] = [
  { id: 'models',    label: 'Models' },
  { id: 'character', label: 'Character' },
  { id: 'content',   label: 'Content' },
  { id: 'particle',  label: 'Particle' },
  { id: 'lights',    label: 'Lights' },
  { id: 'materials', label: 'Materials' },
  { id: 'textures',  label: 'Textures' },
  { id: 'hdr',       label: 'HDR' },
  { id: 'audio',     label: 'Audio' },
];

// 재질 프리셋 — 선택한 프리미티브의 표면 질감(roughness/metalness/발광)을 한 번에 바꾼다. 색은 유지.
// emissive: '#000000'=발광 없음, 'SELF'=오브젝트 현재 색으로 자체 발광(네온).
const MATERIAL_PRESETS: { id: string; label: string; mat: Pick<MaterialOverride, 'roughness' | 'metalness' | 'emissive'>; swatch: string }[] = [
  { id: 'reset',   label: '기본',       mat: { roughness: 0.5,  metalness: 0.1, emissive: '#000000' }, swatch: 'linear-gradient(135deg,#cbd5e1,#94a3b8)' },
  { id: 'matte',   label: '무광',       mat: { roughness: 0.95, metalness: 0,   emissive: '#000000' }, swatch: 'linear-gradient(135deg,#9aa4b2,#6b7280)' },
  { id: 'glossy',  label: '유광',       mat: { roughness: 0.1,  metalness: 0,   emissive: '#000000' }, swatch: 'linear-gradient(135deg,#eef4fb 0%,#8b97a8 55%,#dbe3ee 100%)' },
  { id: 'plastic', label: '플라스틱',   mat: { roughness: 0.4,  metalness: 0,   emissive: '#000000' }, swatch: 'linear-gradient(135deg,#c7d0dc,#7f8a99)' },
  { id: 'metal',   label: '금속',       mat: { roughness: 0.3,  metalness: 1,   emissive: '#000000' }, swatch: 'linear-gradient(135deg,#eef2f6 0%,#9fa9b6 45%,#5c6470 100%)' },
  { id: 'chrome',  label: '크롬',       mat: { roughness: 0.04, metalness: 1,   emissive: '#000000' }, swatch: 'linear-gradient(135deg,#ffffff 0%,#8fa0b3 40%,#3f4855 70%,#e6ecf3 100%)' },
  { id: 'rubber',  label: '고무',       mat: { roughness: 1,    metalness: 0,   emissive: '#000000' }, swatch: 'linear-gradient(135deg,#4b5563,#1f2937)' },
  { id: 'glow',    label: '네온(발광)', mat: { roughness: 0.5,  metalness: 0,   emissive: 'SELF'    }, swatch: 'linear-gradient(135deg,#fde68a,#f472b6)' },
];

// HDR 환경(IBL + 배경) 프리셋 타일 — 씬 전역 hdrPreset을 설정. 'none'=끄기(단색/하늘로 복귀).
const HDR_TILES: { id: HdrPreset; label: string; emoji: string; swatch: string }[] = [
  { id: 'none',      label: '끄기',    emoji: '⛶',  swatch: 'linear-gradient(135deg,#e5e7eb,#cbd5e1)' },
  { id: 'sunset',    label: 'Sunset',  emoji: '🌇', swatch: 'linear-gradient(135deg,#ff9d5c,#c2410c)' },
  { id: 'dawn',      label: 'Dawn',    emoji: '🌅', swatch: 'linear-gradient(135deg,#fbc2eb,#a6c1ee)' },
  { id: 'night',     label: 'Night',   emoji: '🌙', swatch: 'linear-gradient(135deg,#1e293b,#0f172a)' },
  { id: 'forest',    label: 'Forest',  emoji: '🌲', swatch: 'linear-gradient(135deg,#4ade80,#166534)' },
  { id: 'park',      label: 'Park',    emoji: '🌳', swatch: 'linear-gradient(135deg,#bbf7d0,#60a5fa)' },
  { id: 'city',      label: 'City',    emoji: '🏙', swatch: 'linear-gradient(135deg,#94a3b8,#475569)' },
  { id: 'warehouse', label: 'Factory', emoji: '🏭', swatch: 'linear-gradient(135deg,#a8a29e,#57534e)' },
  { id: 'apartment', label: 'Indoor',  emoji: '🛋', swatch: 'linear-gradient(135deg,#fde9c8,#c8a97e)' },
  { id: 'lobby',     label: 'Lobby',   emoji: '🏛', swatch: 'linear-gradient(135deg,#f1e4cf,#b0a184)' },
  { id: 'studio',    label: 'Studio',  emoji: '💡', swatch: 'linear-gradient(135deg,#f8fafc,#cbd5e1)' },
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
  const { projectId, assets, environment, addAsset, addAssetObject, addContentObject, addParticleObject, addLightObject, removeAsset, removeObjectsByAsset, updateEnvironment, updateObject, pushHistory } = useSceneStore();
  const [tab, setTab] = useState<Tab>('models');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { addToast } = useToast();
  const modelInputRef = useRef<HTMLInputElement>(null);
  const characterInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null);

  // 라이브러리 텍스처를 현재 선택한 프리미티브 오브젝트(들)에 적용.
  const applyTextureToSelection = (url: string) => {
    const st = useSceneStore.getState();
    const targets = st.selectedIds.filter((id) => {
      const o = st.objects.find((x) => x.id === id);
      return o?.primitiveShape && !o.content;
    });
    if (targets.length === 0) {
      addToast('먼저 프리미티브(박스·구체 등)를 선택하세요.', 'error');
      return;
    }
    for (const id of targets) {
      const cur = st.objects.find((o) => o.id === id)?.material;
      updateObject(id, { material: { ...cur, textureUrl: url } });
    }
    pushHistory();
    addToast(`텍스처 적용 (${targets.length}개)`, 'success');
  };

  // 재질 프리셋을 선택한 프리미티브(들)에 적용. 색·텍스처는 유지하고 질감만 바꾼다.
  const applyMaterialToSelection = (preset: typeof MATERIAL_PRESETS[number]) => {
    const st = useSceneStore.getState();
    const targets = st.selectedIds.filter((id) => {
      const o = st.objects.find((x) => x.id === id);
      return o?.primitiveShape && !o.content;
    });
    if (targets.length === 0) {
      addToast('먼저 프리미티브(박스·구체 등)를 선택하세요.', 'error');
      return;
    }
    for (const id of targets) {
      const cur = st.objects.find((o) => o.id === id)?.material;
      const emissive = preset.mat.emissive === 'SELF' ? (cur?.color ?? '#ffffff') : preset.mat.emissive;
      updateObject(id, { material: { ...cur, roughness: preset.mat.roughness, metalness: preset.mat.metalness, emissive } });
    }
    pushHistory();
    addToast(`${preset.label} 재질 적용 (${targets.length}개)`, 'success');
  };

  // HDR 환경 프리셋 적용(씬 전역). none이면 끄기(단색/하늘 배경으로 복귀).
  const applyHdr = (id: HdrPreset) => {
    updateEnvironment({ hdrPreset: id });
    pushHistory();
  };

  const handleTextureFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(e.target.files ?? [])[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      addToast('이미지 파일(JPG·PNG·WEBP)을 선택해주세요.', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) { addToast('이미지가 너무 큽니다. 최대 8MB까지 지원합니다.', 'error'); return; }
    if (!projectId) return;
    setUploading(true);
    try {
      const asset = await uploadImageTexture(file, projectId);
      addAsset(asset);
      const result = await persistCurrentScene();
      if (result.status === 'conflict') addToast('텍스처는 업로드됐지만 다른 탭·기기에서 씬이 먼저 저장돼 반영하지 못했어요. 새로고침 후 다시 시도해 주세요.', 'error');
      else addToast('텍스처 업로드 완료', 'success');
    } catch (err) {
      addToast(`텍스처 업로드 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, 'error');
    } finally {
      setUploading(false);
    }
  };

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

  const handleAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(e.target.files ?? [])[0];
    e.target.value = '';
    if (!file) return;
    if (!/^audio\//.test(file.type) && !/\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name)) {
      addToast('오디오 파일(mp3·wav·ogg 등)을 선택해주세요.', 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) { addToast('오디오가 너무 큽니다. 최대 20MB까지 지원합니다.', 'error'); return; }
    if (!projectId) return;
    setUploading(true);
    try {
      const asset = await uploadAudioFile(file, projectId);
      addAsset(asset);
      const result = await persistCurrentScene();
      if (result.status === 'conflict') addToast('오디오는 업로드됐지만 다른 탭·기기에서 씬이 먼저 저장돼 반영하지 못했어요. 새로고침 후 다시 시도해 주세요.', 'error');
      else addToast('오디오 업로드 완료', 'success');
    } catch (err) {
      addToast(`오디오 업로드 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const modelAssets = assets.filter((a) => a.type !== 'character' && a.type !== 'audio' && a.type !== 'texture');
  const characterAssets = assets.filter((a) => a.type === 'character');
  const audioAssets = assets.filter((a) => a.type === 'audio');
  const textureAssets = assets.filter((a) => a.type === 'texture');
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

        {tab === 'audio' && (
          <>
            <input ref={audioInputRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac" className="hidden" onChange={handleAudioFile} />
            <button
              onClick={() => audioInputRef.current?.click()}
              disabled={uploading}
              className="w-full h-10 rounded-xs border-2 border-dashed border-border flex items-center justify-center gap-1.5 text-muted hover:border-primary hover:text-primary transition-all text-[11px] disabled:opacity-40 disabled:cursor-not-allowed mb-2"
            >
              {uploading ? <span className="animate-pulse">업로드 중…</span> : <><span className="text-base leading-none">+</span> 오디오 업로드 (mp3·wav·ogg)</>}
            </button>
            <div className="space-y-1.5">
              {audioAssets.map((asset) => (
                <AudioRow key={asset.id} asset={asset} onDelete={() => deleteAsset(asset)} deleting={deletingId === asset.id} />
              ))}
            </div>
            {audioAssets.length === 0 && (
              <p className="text-[10px] text-muted text-center py-4 leading-relaxed">
                오디오를 업로드하면<br />이벤트 <b>소리 재생(play_sound)</b>에서 고를 수 있어요.
              </p>
            )}
          </>
        )}

        {tab === 'textures' && (
          <>
            <input ref={textureInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleTextureFile} />
            <div className="grid grid-cols-2 gap-2">
              <UploadButton uploading={uploading} onClick={() => textureInputRef.current?.click()} label="이미지" title="JPG·PNG·WEBP 이미지를 업로드해 재사용할 수 있습니다" />
              {textureAssets.map((asset) => (
                <TextureCard key={asset.id} asset={asset}
                  onApply={() => applyTextureToSelection(asset.dracoUrl)}
                  onDelete={() => deleteAsset(asset)}
                  deleting={deletingId === asset.id}
                />
              ))}
            </div>
            {textureAssets.length === 0 && (
              <p className="text-[10px] text-muted text-center py-4 leading-relaxed">
                이미지를 업로드하면<br />프리미티브를 선택하고 클릭해 표면에 입힐 수 있어요.
              </p>
            )}
          </>
        )}

        {tab === 'materials' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {MATERIAL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyMaterialToSelection(preset)}
                  className="group relative h-[72px] rounded-xs bg-background border border-border hover:border-primary/60 transition-all overflow-hidden flex flex-col items-center justify-center gap-1.5"
                  title={`선택한 프리미티브에 '${preset.label}' 재질 적용`}
                >
                  <span className="w-8 h-8 rounded-full border border-border/50 shadow-inner" style={{ background: preset.swatch }} />
                  <span className="text-[9px] text-muted">{preset.label}</span>
                  <span className="absolute inset-0 bg-primary/0 group-hover:bg-primary/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-[11px] font-medium">
                    적용
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted text-center py-4 leading-relaxed">
              프리미티브(박스·구체 등)를 선택하고<br />재질을 클릭하면 질감이 바뀝니다. <b>색은 유지</b>돼요.
            </p>
          </>
        )}

        {tab === 'hdr' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {HDR_TILES.map((tile) => {
                const active = (environment.hdrPreset ?? 'none') === tile.id;
                return (
                  <button
                    key={tile.id}
                    onClick={() => applyHdr(tile.id)}
                    className={`relative h-[72px] rounded-xs overflow-hidden border transition-all flex flex-col items-center justify-center gap-1 ${active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-border/60'}`}
                    style={{ background: tile.swatch }}
                    title={`환경(HDR): ${tile.label}`}
                  >
                    <span className="text-lg leading-none drop-shadow">{tile.emoji}</span>
                    <span className="text-[9px] text-white font-medium drop-shadow px-1 py-0.5 rounded-sm bg-black/25">{tile.label}</span>
                    {active && <span className="absolute top-1 right-1 text-[10px] text-white bg-primary rounded-full w-4 h-4 flex items-center justify-center">✓</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted text-center py-4 leading-relaxed">
              HDR 환경은 씬 전체의 <b>배경·반사·조명</b>을 바꿉니다.<br />세부 조정은 Environment 패널에서.
            </p>
          </>
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

function AudioRow({ asset, onDelete, deleting }: { asset: AssetRefSchema; onDelete: () => void; deleting?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(asset.dracoUrl);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) { audioRef.current.pause(); audioRef.current.currentTime = 0; setPlaying(false); }
    else { audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };
  return (
    <div className="flex items-center gap-2 bg-background border border-border rounded-xs px-2 py-1.5">
      <button
        onClick={toggle}
        className="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary hover:bg-primary/25 flex items-center justify-center text-[11px] transition-colors"
        title={playing ? '정지' : '미리듣기'}
      >
        {playing ? '■' : '▶'}
      </button>
      <span className="flex-1 text-[11px] text-foreground truncate" title={asset.name}>🎵 {asset.name}</span>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="w-5 h-5 shrink-0 rounded-sm text-muted hover:text-red-500 flex items-center justify-center text-[11px] transition-colors disabled:opacity-40"
        title="삭제"
      >
        {deleting ? '…' : '✕'}
      </button>
    </div>
  );
}

function TextureCard({ asset, onApply, onDelete, deleting }: {
  asset: AssetRefSchema;
  onApply: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  return (
    <div className="group relative h-[72px] rounded-xs bg-background border border-border hover:border-border/60 transition-all overflow-hidden">
      <img src={asset.thumbnailUrl ?? asset.dracoUrl} alt={asset.name} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-background/70 backdrop-blur-sm">
        <span className="text-[9px] text-foreground/80 truncate w-full text-center block" title={asset.name}>{asset.name}</span>
      </div>
      {/* 클릭 = 선택 오브젝트에 적용 */}
      <button
        onClick={onApply}
        className="absolute inset-0 bg-primary/0 group-hover:bg-primary/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white text-xs font-medium"
        title="선택한 프리미티브에 텍스처 적용"
      >
        적용
      </button>
      {/* 삭제 */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        disabled={deleting}
        className="absolute top-1 right-1 w-5 h-5 rounded-sm bg-background/70 text-muted hover:text-red-500 flex items-center justify-center text-[11px] opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40 z-10"
        title="삭제"
      >
        {deleting ? '…' : '✕'}
      </button>
    </div>
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
