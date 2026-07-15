'use client';

// Material 섹션 — 색/거칠기/금속/발광/물리재질 + 텍스처(업로드·타일) + 재질 에셋(저장·연결끊기).
// 프리미티브·텍스트 콘텐츠 오브젝트. 텍스처 업로드 헬퍼도 함께 이동.
// texPanelOpen 리셋 useEffect는 InspectorInner가 selectedId로 remount되므로 불필요 → 제거(remount가 리셋).
import { useState, useRef } from 'react';
import { Palette } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { uploadImageTexture } from '@/lib/uploadAsset';
import { TexturePicker } from '@/components/ui/TexturePicker';
import { SelectBox } from '@/components/ui/SelectBox';
import { InlineEditName } from '@/components/ui/InlineEditName';
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function MaterialSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory, projectId, addAsset, assets, materialAssets, addMaterialAsset, renameMaterialAsset, detachMaterial, openVoxelEdit } = useSceneStore();
  const isVoxel = obj.primitiveShape === 'voxel'; // 복셀은 칸마다 정점색 → material.color 무의미(복셀 수정에서 변경)
  const { addToast } = useToast();
  const [objTexUploading, setObjTexUploading] = useState(false);
  const objTexInputRef = useRef<HTMLInputElement>(null);
  const [texPanelOpen, setTexPanelOpen] = useState(false);
  const handleObjectTexUpload = async (objId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !projectId) return;
    if (file.size > 8 * 1024 * 1024) {
      addToast('Image is too large. Max 8MB.', 'error');
      return;
    }
    setObjTexUploading(true);
    try {
      // 에셋 DB에 등록(type:'texture') → Textures 라이브러리에서 재사용 가능 + 스토리지 정리 대상으로 추적됨.
      const asset = await uploadImageTexture(file, projectId);
      addAsset(asset);
      const cur = useSceneStore.getState().objects.find((o) => o.id === objId)?.material;
      updateObject(objId, { material: { ...cur, textureUrl: asset.dracoUrl } });
      pushHistory();
    } catch (err) {
      addToast('Texture upload failed', 'error');
      console.error(err);
    } finally {
      setObjTexUploading(false);
    }
  };
  return (
          <GroupBox>
            <SectionHeader title="Material" hint="Color, emissive, roughness and metalness. Applies to primitives (box, sphere, cylinder…) and text content." isOpen={open} onToggle={onToggle} />
            {open && (() => {
              const matRef = obj.materialId ? (materialAssets.find((m) => m.id === obj.materialId) ?? null) : null;
              return (
              <div className="px-3 pb-4 space-y-2">
                {matRef && (
                  <div className="rounded-xs bg-primary/10 border border-primary/30 p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-primary"><Palette size={13} className="shrink-0" /><span className="shrink-0">Material asset</span>
                      <InlineEditName value={matRef.name} onCommit={(n) => renameMaterialAsset(matRef.id, n)}
                        title="이름 변경" placeholder="재질 이름"
                        className="flex-1 min-w-0 bg-transparent font-semibold text-primary rounded-sm px-1 -mx-1 border border-transparent hover:border-primary/30 focus:border-primary/50 focus:outline-none transition-colors" />
                    </div>
                    <p className="text-[10px] text-muted/60 leading-snug">Shared material — edit it in the Materials tab to update every object using it. To change only this object, detach it.</p>
                    <button onClick={() => detachMaterial(obj.id)} className="w-full py-1 rounded-xs border border-border text-muted hover:text-foreground hover:border-primary/50 text-[10px] transition-all">Detach (make independent)</button>
                  </div>
                )}
                {!matRef && (<>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Color</span>
                    {isVoxel ? (
                      <div>
                        <div title="복셀은 칸마다 색이 정해져 있어요. 색은 '복셀 수정'에서 바꿔주세요."
                          className="px-2 flex items-center border border-border rounded-xs bg-muted/5 dark:bg-muted/10 opacity-50 cursor-not-allowed">
                          <input type="color" value="#ffffff" disabled className="w-5 h-5 cursor-not-allowed" />
                          <input type="text" value="#ffffff" disabled className="w-full px-2.5 py-1 text-[11px] text-foreground bg-transparent cursor-not-allowed" />
                        </div>
                        <button onClick={() => openVoxelEdit(obj.id)} className="text-[10px] text-primary/80 hover:text-primary mt-1 transition-colors">복셀 수정 열기 →</button>
                      </div>
                    ) : (
                    <div className="px-2 flex items-center border border-border rounded-xs bg-muted/5 dark:bg-muted/10">
                      <input
                        type="color"
                        value={obj.material?.color ?? '#a78bfa'}
                        onChange={(e) => updateObject(obj.id, { material: { ...obj.material, color: e.target.value } })}
                        onBlur={pushHistory}
                        className="w-5 h-5 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={obj.material?.color ?? '#a78bfa'}
                        onChange={(e) => updateObject(obj.id, { material: { ...obj.material, color: e.target.value } })}
                        onBlur={pushHistory}
                      className="w-full px-2.5 py-1  text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    )}
                  </div>

                  <div className='flex-1'>
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Emissive</span>
                    <div className="px-2 flex items-center border border-border rounded-xs bg-muted/5 dark:bg-muted/10">
                      <input
                        type="color"
                        value={obj.material?.emissive ?? '#000000'}
                        onChange={(e) => updateObject(obj.id, { material: { ...obj.material, emissive: e.target.value } })}
                        onBlur={pushHistory}
                        className="w-5 h-5 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={obj.material?.emissive ?? '#000000'}
                        onChange={(e) => updateObject(obj.id, { material: { ...obj.material, emissive: e.target.value } })}
                        onBlur={pushHistory}
                      className="w-full px-2.5 py-1 text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className='flex gap-2'>
                  <div>
                    <LabeledNum
                      label="Roughness"
                      value={obj.material?.roughness ?? 0.5}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, roughness: v } })}
                      onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.005}
                    />
                  </div>
                  <div>
                    <LabeledNum
                      label="Metalness"
                      value={obj.material?.metalness ?? 0.1}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, metalness: v } })}
                      onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.005}
                    />
                  </div>
                </div>

                {/* 물리 재질(MeshPhysicalMaterial) — 클리어코트/시인/투과. 하나라도 올리면 physical 재질로 렌더(프리미티브만) */}
                {obj.primitiveShape && !obj.content && (
                  <div className="pt-2 border-t border-border/50 space-y-1.5">
                    <span className="text-[10px] text-muted tracking-wide block">Physical material (advanced)</span>
                    <div className="flex gap-2 pt-1">
                      <LabeledNum label="Clearcoat" value={obj.material?.clearcoat ?? 0}
                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, clearcoat: v } })} onCommit={pushHistory}
                        min={0} max={1} precision={2} dragStep={0.02} />
                      <LabeledNum label="Sheen" value={obj.material?.sheen ?? 0}
                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, sheen: v } })} onCommit={pushHistory}
                        min={0} max={1} precision={2} dragStep={0.02} />
                      <LabeledNum label="Transmission" value={obj.material?.transmission ?? 0}
                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, transmission: v } })} onCommit={pushHistory}
                        min={0} max={1} precision={2} dragStep={0.02} />
                      {(obj.material?.transmission ?? 0) > 0 && (
                        <LabeledNum label="IOR" value={obj.material?.ior ?? 1.5}
                          onChange={(v) => updateObject(obj.id, { material: { ...obj.material, ior: v } })} onCommit={pushHistory}
                          min={1} max={2.4} precision={2} dragStep={0.02} />
                      )}
                    </div>
                    <p className="text-[10px] text-muted/50">Raise Transmission to make it glass-like transparent. With all three at 0 it uses the standard material.</p>
                  </div>
                )}

                {/* Texture — 표면에 이미지 매핑(포스터/사진/로고). 프리미티브만(텍스트 콘텐츠 제외) */}
                {obj.primitiveShape && !obj.content && (() => {
                  const texActive = texPanelOpen || !!obj.material?.textureUrl;
                  return (
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Texture</span>
                      <Toggle value={texActive} onChange={(on) => {
                        setTexPanelOpen(on);
                        if (!on) { updateObject(obj.id, { material: { ...obj.material, textureUrl: undefined, textureRepeat: undefined } }); pushHistory(); }
                      }} />
                    </div>
                    <input ref={objTexInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleObjectTexUpload(obj.id, e)} />

                    {texActive && (
                      <>
                        {/* 썸네일 그리드 드롭다운 픽커(맨 아래 업로드 포함) */}
                        <TexturePicker
                          value={obj.material?.textureUrl ?? ''}
                          textures={assets.filter((a) => a.type === 'texture').map((a) => ({ id: a.id, name: a.name, url: a.dracoUrl }))}
                          onChange={(url) => { updateObject(obj.id, { material: { ...obj.material, textureUrl: url || undefined, textureRepeat: url ? obj.material?.textureRepeat : undefined } }); pushHistory(); }}
                          onUpload={() => objTexInputRef.current?.click()}
                          uploading={objTexUploading}
                        />

                        {/* 적용된 텍스처 미리보기 + 타일 반복 */}
                        {obj.material?.textureUrl && (
                          <>
                            <img src={obj.material.textureUrl} alt="texture" className="w-full h-16 object-cover rounded-xs border border-border" />
                            {/* Mapping — 면마다 / 보자기(한 장) / 무늬 반복 */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Mapping</span>
                              <SelectBox
                                value={obj.material?.textureMapping ?? 'face'}
                                onChange={(v) => { updateObject(obj.id, { material: { ...obj.material, textureMapping: v === 'face' ? undefined : (v as 'wrap' | 'pattern') } }); pushHistory(); }}
                                options={[
                                  { value: 'face', label: 'Per-face (면마다)' },
                                  { value: 'wrap', label: 'Wrap (보자기·한 장)' },
                                  { value: 'pattern', label: 'Pattern (무늬 반복)' },
                                ]}
                                fullWidth={false}
                                gray
                              />
                            </div>
                            {obj.material?.textureMapping === 'pattern' && (
                              <>
                                <LabeledNum label="Pattern Scale" value={obj.material?.triplanarScale ?? 1}
                                  onChange={(v) => updateObject(obj.id, { material: { ...obj.material, triplanarScale: Math.max(0.05, v) } })}
                                  onCommit={pushHistory} min={0.05} max={10} precision={2} dragStep={0.05} />
                                <p className="text-[10px] text-muted/50">무늬가 표면 전체에 이음새 없이 반복돼요. 값이 클수록 무늬가 작아지고 촘촘해집니다.</p>
                              </>
                            )}
                            {obj.material?.textureMapping === 'wrap' && (
                              <p className="text-[10px] text-muted/50">구에 텍스처를 넣은 것처럼 한 장을 사방에 덮어요. 앞은 중앙, 옆은 당겨지고, 위/아래는 극점으로 모여 하나의 그림처럼 감쌉니다.</p>
                            )}
                            {(obj.material?.textureMapping ?? 'face') === 'face' && (
                              <>
                                <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
                                  <input type="checkbox" checked={!!obj.material?.textureRepeat}
                                    onChange={(e) => { updateObject(obj.id, { material: { ...obj.material, textureRepeat: e.target.checked ? { x: 2, y: 2 } : undefined } }); pushHistory(); }} />
                                  Tile repeat (pattern)
                                </label>
                                {obj.material?.textureRepeat && (
                                  <div className="flex gap-2">
                                    <LabeledNum label="Repeat X" value={obj.material.textureRepeat.x}
                                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, textureRepeat: { x: Math.max(1, v), y: obj.material?.textureRepeat?.y ?? 1 } } })}
                                      onCommit={pushHistory} min={1} max={20} precision={0} dragStep={1} />
                                    <LabeledNum label="Repeat Y" value={obj.material.textureRepeat.y}
                                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, textureRepeat: { x: obj.material?.textureRepeat?.x ?? 1, y: Math.max(1, v) } } })}
                                      onCommit={pushHistory} min={1} max={20} precision={0} dragStep={1} />
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                  );
                })()}
                </>)}
                {!matRef && (
                  <button
                    onClick={() => { const id = addMaterialAsset(obj.name || 'Material', obj.material ?? {}); useSceneStore.getState().assignMaterialAsset([obj.id], id); }}
                    className="w-full py-1.5 rounded-xs bg-surface border border-border text-foreground hover:text-muted hover:bg-background text-[11px] transition-all"
                  >
                    Save this material as an asset (shared)
                  </button>
                )}
              </div>
              );
            })()}
          </GroupBox>
  );
}
