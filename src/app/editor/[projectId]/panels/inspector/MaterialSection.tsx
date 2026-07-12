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
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function MaterialSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory, projectId, addAsset, assets, materialAssets, addMaterialAsset, detachMaterial } = useSceneStore();
  const { addToast } = useToast();
  const [objTexUploading, setObjTexUploading] = useState(false);
  const objTexInputRef = useRef<HTMLInputElement>(null);
  const [texPanelOpen, setTexPanelOpen] = useState(false);
  const handleObjectTexUpload = async (objId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !projectId) return;
    if (file.size > 8 * 1024 * 1024) {
      addToast('이미지가 너무 큽니다. 최대 8MB까지 지원합니다.', 'error');
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
      addToast('텍스처 업로드 실패', 'error');
      console.error(err);
    } finally {
      setObjTexUploading(false);
    }
  };
  return (
          <GroupBox>
            <SectionHeader title="Material" hint="색상·자체발광·거칠기·금속성. 프리미티브(박스/구체/원기둥 등)와 텍스트 콘텐츠에 적용돼요." isOpen={open} onToggle={onToggle} />
            {open && (() => {
              const matRef = obj.materialId ? (materialAssets.find((m) => m.id === obj.materialId) ?? null) : null;
              return (
              <div className="px-3 pb-4 space-y-2">
                {matRef && (
                  <div className="rounded-xs bg-primary/10 border border-primary/30 p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-primary"><Palette size={13} /> 재질 에셋 <b className="font-semibold">{matRef.name}</b></div>
                    <p className="text-[10px] text-muted/60 leading-snug">공유 재질이에요 — 편집은 Materials 탭에서 하면 이 재질을 쓰는 모든 오브젝트에 반영돼요. 이 오브젝트만 따로 바꾸려면 연결을 끊으세요.</p>
                    <button onClick={() => detachMaterial(obj.id)} className="w-full py-1 rounded-xs border border-border text-muted hover:text-foreground hover:border-primary/50 text-[10px] transition-all">연결 끊기 (독립 재질로)</button>
                  </div>
                )}
                {!matRef && (<>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Color</span>
                    <div className="px-2 flex items-center border border-border rounded-xs">
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
                      className="w-full px-2.5 py-1.5  text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className='flex-1'>
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Emissive</span>
                    <div className="px-2 flex items-center border border-border rounded-xs">
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
                      className="w-full px-2.5 py-1.5 text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
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
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block">물리 재질 (고급)</span>
                    <LabeledNum label="Clearcoat (코팅 광택)" value={obj.material?.clearcoat ?? 0}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, clearcoat: v } })} onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.02} />
                    <LabeledNum label="Sheen (천 광택)" value={obj.material?.sheen ?? 0}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, sheen: v } })} onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.02} />
                    <LabeledNum label="Transmission (투과/유리)" value={obj.material?.transmission ?? 0}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, transmission: v } })} onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.02} />
                    {(obj.material?.transmission ?? 0) > 0 && (
                      <LabeledNum label="IOR (굴절률)" value={obj.material?.ior ?? 1.5}
                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, ior: v } })} onCommit={pushHistory}
                        min={1} max={2.4} precision={2} dragStep={0.02} />
                    )}
                    <p className="text-[10px] text-muted/50">투과(Transmission)를 올리면 유리처럼 투명해져요. 셋 다 0이면 기본(standard) 재질입니다.</p>
                  </div>
                )}

                {/* Texture — 표면에 이미지 매핑(포스터/사진/로고). 프리미티브만(텍스트 콘텐츠 제외) */}
                {obj.primitiveShape && !obj.content && (() => {
                  const texActive = texPanelOpen || !!obj.material?.textureUrl;
                  return (
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Texture (이미지)</span>
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
                            <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
                              <input type="checkbox" checked={!!obj.material?.textureRepeat}
                                onChange={(e) => { updateObject(obj.id, { material: { ...obj.material, textureRepeat: e.target.checked ? { x: 2, y: 2 } : undefined } }); pushHistory(); }} />
                              타일 반복 (패턴)
                            </label>
                            {obj.material?.textureRepeat && (
                              <div className="flex gap-2">
                                <LabeledNum label="가로 반복" value={obj.material.textureRepeat.x}
                                  onChange={(v) => updateObject(obj.id, { material: { ...obj.material, textureRepeat: { x: Math.max(1, v), y: obj.material?.textureRepeat?.y ?? 1 } } })}
                                  onCommit={pushHistory} min={1} max={20} precision={0} dragStep={1} />
                                <LabeledNum label="세로 반복" value={obj.material.textureRepeat.y}
                                  onChange={(v) => updateObject(obj.id, { material: { ...obj.material, textureRepeat: { x: obj.material?.textureRepeat?.x ?? 1, y: Math.max(1, v) } } })}
                                  onCommit={pushHistory} min={1} max={20} precision={0} dragStep={1} />
                              </div>
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
                    onClick={() => { const id = addMaterialAsset(obj.name || '재질', obj.material ?? {}); useSceneStore.getState().assignMaterialAsset([obj.id], id); }}
                    className="w-full py-1.5 rounded-xs border border-border text-muted hover:text-primary hover:border-primary/50 text-[11px] transition-all"
                  >
                    이 재질을 에셋으로 저장 (공유)
                  </button>
                )}
              </div>
              );
            })()}
          </GroupBox>
  );
}
