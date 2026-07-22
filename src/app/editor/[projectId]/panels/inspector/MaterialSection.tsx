"use client";

// Material 섹션 — 색/거칠기/금속/발광/물리재질 + 텍스처(업로드·타일) + 재질 에셋(저장·연결끊기).
// 프리미티브·텍스트 콘텐츠 오브젝트. 텍스처 업로드 헬퍼도 함께 이동.
// texPanelOpen 리셋 useEffect는 InspectorInner가 selectedId로 remount되므로 불필요 → 제거(remount가 리셋).
import { useState, useRef } from "react";
import { Palette } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { useToast } from "@/hooks/useToast";
import { uploadImageTexture } from "@/lib/uploadAsset";
import { TexturePicker } from "@/components/ui/TexturePicker";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { SelectBox } from "@/components/ui/SelectBox";
import { InlineEditName } from "@/components/ui/InlineEditName";
import { SectionHeader, GroupBox, LabeledNum, Toggle } from "./ui";
import { MATCAP_PRESETS } from "@/lib/matcap";
import { PATTERN_PRESETS, PATTERN_PREFIX } from "@/lib/patternTextures";
import { MaterialPreview } from "./MaterialPreview";
import type { ObjectNodeSchema } from "@/types/scene";

// 재사용 맵 슬롯 — 토글 + 썸네일 픽커(업로드/재사용). normal/roughness/metalness 공용. onPick=재질에 쓰기+커밋.
function MapSlot({
  label,
  hint,
  url,
  textures,
  projectId,
  onPick,
  addAsset,
  addToast,
  children,
}: {
  label: string;
  hint?: string;
  url: string | undefined;
  textures: { id: string; name: string; url: string }[];
  projectId: string | null | undefined;
  onPick: (url: string | undefined) => void;
  addAsset: (a: Awaited<ReturnType<typeof uploadImageTexture>>) => void;
  addToast: (msg: string, kind?: "error" | "success" | "info") => void;
  children?: React.ReactNode;
}) {
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = open || !!url;
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !projectId) return;
    if (file.size > 8 * 1024 * 1024) {
      addToast("Image is too large. Max 8MB.", "error");
      return;
    }
    setUploading(true);
    try {
      const asset = await uploadImageTexture(file, projectId);
      addAsset(asset);
      onPick(asset.dracoUrl);
    } catch (err) {
      addToast(`${label} upload failed`, "error");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="pt-2 border-t border-border/50 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">{label}</span>
        <Toggle
          value={active}
          onChange={(on) => {
            setOpen(on);
            if (!on) onPick(undefined);
          }}
        />
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUpload} />
      {active && (
        <>
          {/* 내장 패턴 프리셋 — 이미지 없이 바로 테스트 */}
          <div className="flex flex-wrap gap-1">
            {PATTERN_PRESETS.map((p) => {
              const on = url === `${PATTERN_PREFIX}${p.id}`;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(`${PATTERN_PREFIX}${p.id}`)}
                  className={`px-1.5 py-0.5 rounded-xs text-[9px] border transition-colors ${on ? "bg-primary text-white border-primary" : "bg-background text-muted border-border hover:text-foreground"}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <TexturePicker
            value={url && url.startsWith(PATTERN_PREFIX) ? "" : (url ?? "")}
            textures={textures}
            onChange={(u) => onPick(u || undefined)}
            onUpload={() => inputRef.current?.click()}
            uploading={uploading}
          />
          {url && children}
          {hint && <p className="text-[10px] text-muted/60 leading-snug">{hint}</p>}
        </>
      )}
    </div>
  );
}

export function MaterialSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const {
    updateObject,
    pushHistory,
    projectId,
    addAsset,
    assets,
    materialAssets,
    addMaterialAsset,
    renameMaterialAsset,
    detachMaterial,
    openVoxelEdit,
  } = useSceneStore();
  const isVoxel = obj.primitiveShape === "voxel"; // 복셀은 칸마다 정점색 → material.color 무의미(복셀 수정에서 변경)
  const { addToast } = useToast();
  const [objTexUploading, setObjTexUploading] = useState(false);
  const objTexInputRef = useRef<HTMLInputElement>(null);
  const [texPanelOpen, setTexPanelOpen] = useState(false);
  const handleObjectTexUpload = async (objId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !projectId) return;
    if (file.size > 8 * 1024 * 1024) {
      addToast("Image is too large. Max 8MB.", "error");
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
      addToast("Texture upload failed", "error");
      console.error(err);
    } finally {
      setObjTexUploading(false);
    }
  };
  return (
    <GroupBox>
      <SectionHeader
        title="Material"
        icon={<Palette size={14} />}
        hint="Color, emissive, roughness and metalness. Applies to primitives (box, sphere, cylinder…) and text content."
        isOpen={open}
        onToggle={onToggle}
      />
      {open &&
        (() => {
          const matRef = obj.materialId ? (materialAssets.find((m) => m.id === obj.materialId) ?? null) : null;
          return (
            <div className="px-3 pb-4 space-y-2">
              {/* 재질 미리보기 — 씬 조명과 무관한 고정 스튜디오 구. 프리미티브(복셀 제외)만. */}
              {obj.primitiveShape && !isVoxel && <MaterialPreview mat={matRef ? matRef.material : obj.material} />}
              {matRef && (
                <div className="rounded-xs bg-primary/10 border border-primary/30 p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-primary">
                    <Palette size={13} className="shrink-0" />
                    <span className="shrink-0">Material asset</span>
                    <InlineEditName
                      value={matRef.name}
                      onCommit={(n) => renameMaterialAsset(matRef.id, n)}
                      title="이름 변경"
                      placeholder="재질 이름"
                      className="flex-1 min-w-0 bg-transparent font-semibold text-primary rounded-sm px-1 -mx-1 border border-transparent hover:border-primary/30 focus:border-primary/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-muted/60 leading-snug">
                    Shared material — edit it in the Materials tab to update every object using it. To change only this object, detach it.
                  </p>
                  <button
                    onClick={() => detachMaterial(obj.id)}
                    className="w-full py-1 rounded-xs border border-border text-muted hover:text-foreground bg-surface hover:border-primary/50 text-[10px] transition-all"
                  >
                    Detach (make independent)
                  </button>
                </div>
              )}
              {!matRef && (
                <>
                  {/* 셰이딩 종류 — Standard(PBR) / Toon(카툰). 프리미티브만. */}
                  {obj.primitiveShape && !obj.content && !isVoxel && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">Shading</span>
                      <div className="flex items-center gap-2">
                        {(obj.material?.shading ?? "standard") === "toon" && (
                          <LabeledNum
                            label="Steps"
                            value={obj.material?.toonSteps ?? 3}
                            onChange={(v) => updateObject(obj.id, { material: { ...obj.material, toonSteps: Math.round(v) } })}
                            onCommit={pushHistory}
                            min={2}
                            max={6}
                            precision={0}
                            dragStep={1}
                          />
                        )}
                        <SelectBox
                          value={obj.material?.shading ?? "standard"}
                          onChange={(v) => {
                            updateObject(obj.id, {
                              material: {
                                ...obj.material,
                                shading: v === "standard" ? undefined : (v as "toon" | "matcap"),
                                // matcap 처음 켤 때 기본 프리셋
                                ...(v === "matcap" && !obj.material?.matcapPreset ? { matcapPreset: "studio" as const } : {}),
                              },
                            });
                            pushHistory();
                          }}
                          options={[
                            { value: "standard", label: "Standard (PBR)" },
                            { value: "toon", label: "Toon (카툰)" },
                            { value: "matcap", label: "Matcap" },
                          ]}
                          fullWidth={false}
                          gray
                        />
                      </div>
                    </div>
                  )}
                  {/* Matcap 프리셋 선택 */}
                  {obj.material?.shading === "matcap" && (
                    <div className="flex flex-wrap gap-1.5">
                      {MATCAP_PRESETS.map((mp) => {
                        const on = (obj.material?.matcapPreset ?? "studio") === mp.id;
                        return (
                          <button
                            key={mp.id}
                            type="button"
                            onClick={() => {
                              updateObject(obj.id, { material: { ...obj.material, matcapPreset: mp.id } });
                              pushHistory();
                            }}
                            className={`px-2 py-1 rounded-xs text-[10px] border transition-colors ${on ? "bg-primary text-white border-primary" : "bg-background text-muted border-border hover:text-foreground"}`}
                          >
                            {mp.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Matcap 커스텀 업로드 — 있으면 프리셋 무시 */}
                  {obj.material?.shading === "matcap" && (
                    <MapSlot
                      label="Custom matcap (overrides preset)"
                      hint="Upload a matcap sphere image to use instead of the presets."
                      url={obj.material?.matcapUrl}
                      textures={assets.filter((a) => a.type === "texture").map((a) => ({ id: a.id, name: a.name, url: a.dracoUrl }))}
                      projectId={projectId}
                      addAsset={addAsset}
                      addToast={addToast}
                      onPick={(url) => {
                        updateObject(obj.id, { material: { ...obj.material, matcapUrl: url } });
                        pushHistory();
                      }}
                    />
                  )}
                  {(obj.material?.shading ?? "standard") === "toon" && (
                    <p className="text-[10px] text-muted/60 leading-snug">
                      Toon = flat cel shading. Roughness/Metalness/Reflection/Physical are ignored; Color, Emissive, Texture, Gradient and Rim glow still apply.
                    </p>
                  )}
                  {obj.material?.shading === "matcap" && (
                    <p className="text-[10px] text-muted/60 leading-snug">
                      Matcap = baked studio look (lighting-independent). Color tints the matcap (set white for the pure preset). Roughness/Metalness/Gradient/Rim are ignored; Normal map still applies.
                    </p>
                  )}

                  {/* 외곽선(2D/만화) — Toon과 함께 쓰면 셀셰이딩. 프리미티브만. */}
                  {obj.primitiveShape && !obj.content && !isVoxel && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">Outline (2D)</span>
                      <div className="flex items-center gap-2">
                        {obj.material?.outline && (
                          <>
                            <LabeledNum
                              label="Width"
                              value={obj.material?.outlineWidth ?? 4}
                              onChange={(v) => updateObject(obj.id, { material: { ...obj.material, outlineWidth: v } })}
                              onCommit={pushHistory}
                              min={0.5}
                              max={20}
                              precision={1}
                              dragStep={0.5}
                            />
                            <ColorPicker
                              value={obj.material?.outlineColor ?? "#000000"}
                              onChange={(hex) => updateObject(obj.id, { material: { ...obj.material, outlineColor: hex } })}
                              onCommit={pushHistory}
                              showHex={false}
                              title="Outline color"
                            />
                          </>
                        )}
                        <Toggle
                          value={obj.material?.outline ?? false}
                          onChange={(on) => {
                            updateObject(obj.id, { material: { ...obj.material, outline: on || undefined } });
                            pushHistory();
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 엣지(폴리곤) 라인 오버레이 — 표면 위 폴리곤 모서리 라인. */}
                  {obj.primitiveShape && !obj.content && !isVoxel && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">Edges (polygon)</span>
                      <div className="flex items-center gap-2">
                        {obj.material?.edges && (
                          <>
                            <LabeledNum
                              label="Width"
                              value={obj.material?.edgesWidth ?? 1.5}
                              onChange={(v) => updateObject(obj.id, { material: { ...obj.material, edgesWidth: v } })}
                              onCommit={pushHistory}
                              min={0.5}
                              max={10}
                              precision={1}
                              dragStep={0.5}
                            />
                            <ColorPicker
                              value={obj.material?.edgesColor ?? "#000000"}
                              onChange={(hex) => updateObject(obj.id, { material: { ...obj.material, edgesColor: hex } })}
                              onCommit={pushHistory}
                              showHex={false}
                              title="Edge color"
                            />
                          </>
                        )}
                        <Toggle
                          value={obj.material?.edges ?? false}
                          onChange={(on) => {
                            updateObject(obj.id, { material: { ...obj.material, edges: on || undefined } });
                            pushHistory();
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block mb-1">Color</span>
                      {isVoxel ? (
                        <div>
                          <div
                            title="복셀은 칸마다 색이 정해져 있어요. 색은 '복셀 수정'에서 바꿔주세요."
                            className="px-2 flex items-center border border-border rounded-xs bg-muted/5 dark:bg-muted opacity-50 cursor-not-allowed"
                          >
                            <input type="color" value="#ffffff" disabled className="w-5 h-5 cursor-not-allowed" />
                            <input
                              type="text"
                              value="#ffffff"
                              disabled
                              className="w-full px-2.5 py-1 text-[11px] text-foreground bg-transparent cursor-not-allowed"
                            />
                          </div>
                          <button
                            onClick={() => openVoxelEdit(obj.id)}
                            className="text-[10px] text-primary/80 hover:text-primary mt-1 transition-colors"
                          >
                            복셀 수정 열기 →
                          </button>
                        </div>
                      ) : (
                        <ColorPicker
                          value={obj.material?.color ?? "#a78bfa"}
                          onChange={(hex) => updateObject(obj.id, { material: { ...obj.material, color: hex } })}
                          onCommit={pushHistory}
                          showHex
                          title="Base color"
                          className="w-full"
                          allowGradient
                          gradient={obj.material?.gradient ?? null}
                          onGradientChange={(g) => updateObject(obj.id, { material: { ...obj.material, gradient: g ?? undefined } })}
                        />
                      )}
                    </div>

                    <div className="flex-1">
                      <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block mb-1">Emissive</span>
                      <ColorPicker
                        value={obj.material?.emissive ?? "#000000"}
                        onChange={(hex) => updateObject(obj.id, { material: { ...obj.material, emissive: hex } })}
                        onCommit={pushHistory}
                        showHex
                        title="Emissive (glow) color"
                        className="w-full px-2 justify-start"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div>
                      <LabeledNum
                        label="Roughness"
                        value={obj.material?.roughness ?? 0.5}
                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, roughness: v } })}
                        onCommit={pushHistory}
                        min={0}
                        max={1}
                        precision={2}
                        dragStep={0.005}
                      />
                    </div>
                    <div>
                      <LabeledNum
                        label="Metalness"
                        value={obj.material?.metalness ?? 0.1}
                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, metalness: v } })}
                        onCommit={pushHistory}
                        min={0}
                        max={1}
                        precision={2}
                        dragStep={0.005}
                      />
                    </div>
                  </div>

                  {/* 일반 추가 파라미터 — 불투명도(반투명)·발광 세기. standard·physical 공통. */}
                  <div className="flex gap-2">
                    <div>
                      <LabeledNum
                        label="Opacity"
                        value={obj.material?.opacity ?? 1}
                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, opacity: v } })}
                        onCommit={pushHistory}
                        min={0}
                        max={1}
                        precision={2}
                        dragStep={0.02}
                      />
                    </div>
                    <div>
                      <LabeledNum
                        label="Emissive intensity"
                        value={obj.material?.emissiveIntensity ?? (obj.material?.emissive && obj.material.emissive !== "#000000" ? 1 : 0)}
                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, emissiveIntensity: v } })}
                        onCommit={pushHistory}
                        min={0}
                        max={8}
                        precision={2}
                        dragStep={0.05}
                      />
                    </div>
                  </div>

                  {/* 물리 재질(MeshPhysicalMaterial) — 클리어코트/시인/투과/무지개빛/이방성. 하나라도 올리면 physical 재질로 렌더(프리미티브만) */}
                  {obj.primitiveShape && !obj.content && (
                    <div className="pt-2 border-t border-border/50 space-y-1.5">
                      <span className="text-[10px] text-foreground tracking-wide block">Physical material (advanced)</span>

                      {/* Anisotropy(이방성 반사) — 브러시 금속/헤어라인. (Reflection(env)=envMapIntensity는 씬 환경 반사에선
                          three가 scene.environmentIntensity로 덮어써 무시하므로 제거 — 반사 강도는 Metalness/Roughness/HDR로 조절) */}
                      <div className="flex gap-2 pt-1">
                        <LabeledNum
                          label="Anisotropy"
                          value={obj.material?.anisotropy ?? 0}
                          onChange={(v) => updateObject(obj.id, { material: { ...obj.material, anisotropy: v } })}
                          onCommit={pushHistory}
                          min={0}
                          max={1}
                          precision={2}
                          dragStep={0.02}
                        />
                      </div>

                      {/* 클리어코트(코팅 광택) + 코팅 거칠기 */}
                      <div className="flex gap-2 pt-1">
                        <LabeledNum
                          label="Clearcoat"
                          value={obj.material?.clearcoat ?? 0}
                          onChange={(v) => updateObject(obj.id, { material: { ...obj.material, clearcoat: v } })}
                          onCommit={pushHistory}
                          min={0}
                          max={1}
                          precision={2}
                          dragStep={0.02}
                        />
                        {(obj.material?.clearcoat ?? 0) > 0 && (
                          <LabeledNum
                            label="Coat rough"
                            value={obj.material?.clearcoatRoughness ?? 0.1}
                            onChange={(v) => updateObject(obj.id, { material: { ...obj.material, clearcoatRoughness: v } })}
                            onCommit={pushHistory}
                            min={0}
                            max={1}
                            precision={2}
                            dragStep={0.02}
                          />
                        )}
                      </div>

                      {/* 시인(천/벨벳 광택) + 거칠기 + 색 */}
                      <div className="flex gap-2 pt-1 items-end">
                        <LabeledNum
                          label="Sheen"
                          value={obj.material?.sheen ?? 0}
                          onChange={(v) => updateObject(obj.id, { material: { ...obj.material, sheen: v } })}
                          onCommit={pushHistory}
                          min={0}
                          max={1}
                          precision={2}
                          dragStep={0.02}
                        />
                        {(obj.material?.sheen ?? 0) > 0 && (
                          <>
                            <LabeledNum
                              label="Sheen rough"
                              value={obj.material?.sheenRoughness ?? 1}
                              onChange={(v) => updateObject(obj.id, { material: { ...obj.material, sheenRoughness: v } })}
                              onCommit={pushHistory}
                              min={0}
                              max={1}
                              precision={2}
                              dragStep={0.02}
                            />
                            <div className="shrink-0">
                              <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block mb-1">Sheen color</span>
                              <ColorPicker
                                value={obj.material?.sheenColor ?? obj.material?.color ?? "#ffffff"}
                                onChange={(hex) => updateObject(obj.id, { material: { ...obj.material, sheenColor: hex } })}
                                onCommit={pushHistory}
                                showHex={false}
                                title="Sheen color"
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {/* 무지개빛(비눗방울·기름막) + 굴절률 */}
                      <div className="flex gap-2 pt-1">
                        <LabeledNum
                          label="Iridescence"
                          value={obj.material?.iridescence ?? 0}
                          onChange={(v) => updateObject(obj.id, { material: { ...obj.material, iridescence: v } })}
                          onCommit={pushHistory}
                          min={0}
                          max={1}
                          precision={2}
                          dragStep={0.02}
                        />
                        {(obj.material?.iridescence ?? 0) > 0 && (
                          <LabeledNum
                            label="Irid. IOR"
                            value={obj.material?.iridescenceIOR ?? 1.3}
                            onChange={(v) => updateObject(obj.id, { material: { ...obj.material, iridescenceIOR: v } })}
                            onCommit={pushHistory}
                            min={1}
                            max={2.4}
                            precision={2}
                            dragStep={0.02}
                          />
                        )}
                      </div>

                      {/* 투과(유리) + IOR + 두께 + 감쇠(틴트) */}
                      <div className="flex gap-2 pt-1">
                        <LabeledNum
                          label="Transmission"
                          value={obj.material?.transmission ?? 0}
                          onChange={(v) => updateObject(obj.id, { material: { ...obj.material, transmission: v } })}
                          onCommit={pushHistory}
                          min={0}
                          max={1}
                          precision={2}
                          dragStep={0.02}
                        />
                        {(obj.material?.transmission ?? 0) > 0 && (
                          <>
                            <LabeledNum
                              label="IOR"
                              value={obj.material?.ior ?? 1.5}
                              onChange={(v) => updateObject(obj.id, { material: { ...obj.material, ior: v } })}
                              onCommit={pushHistory}
                              min={1}
                              max={2.4}
                              precision={2}
                              dragStep={0.02}
                            />
                            <LabeledNum
                              label="Thickness"
                              value={obj.material?.thickness ?? 1}
                              onChange={(v) => updateObject(obj.id, { material: { ...obj.material, thickness: v } })}
                              onCommit={pushHistory}
                              min={0}
                              max={10}
                              precision={2}
                              dragStep={0.05}
                            />
                          </>
                        )}
                      </div>
                      {(obj.material?.transmission ?? 0) > 0 && (
                        <div className="flex gap-2 pt-1 items-end">
                          <div className="shrink-0">
                            <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block mb-1">Glass tint</span>
                            <ColorPicker
                              value={obj.material?.attenuationColor ?? "#ffffff"}
                              onChange={(hex) => updateObject(obj.id, { material: { ...obj.material, attenuationColor: hex } })}
                              onCommit={pushHistory}
                              showHex={false}
                              title="Glass tint (attenuation color)"
                            />
                          </div>
                          <LabeledNum
                            label="Tint dist"
                            value={obj.material?.attenuationDistance ?? 1}
                            onChange={(v) => updateObject(obj.id, { material: { ...obj.material, attenuationDistance: v <= 0 ? 0.01 : v } })}
                            onCommit={pushHistory}
                            min={0.01}
                            max={20}
                            precision={2}
                            dragStep={0.1}
                          />
                        </div>
                      )}
                      <p className="text-[10px] text-muted/70 dark:text-muted">
                        Raise Transmission for glass. Iridescence = soap-bubble sheen, Anisotropy = brushed metal. All at 0 → standard material.
                      </p>
                    </div>
                  )}

                  {/* 스타일라이즈드 — 가장자리 발광(Fresnel/Rim). 켜면 셰이더 주입, 끄면(0) 비용 0 */}
                  {obj.primitiveShape && !obj.content && (
                    <div className="pt-2 border-t border-border/50 space-y-1.5">
                      <span className="text-[10px] text-foreground tracking-wide block">Rim glow (Fresnel)</span>
                      <div className="flex gap-2 pt-1 items-end">
                        <LabeledNum
                          label="Rim intensity"
                          value={obj.material?.fresnelIntensity ?? 0}
                          onChange={(v) => updateObject(obj.id, { material: { ...obj.material, fresnelIntensity: v } })}
                          onCommit={pushHistory}
                          min={0}
                          max={5}
                          precision={2}
                          dragStep={0.05}
                        />
                        {(obj.material?.fresnelIntensity ?? 0) > 0 && (
                          <>
                            <LabeledNum
                              label="Rim width"
                              value={obj.material?.fresnelPower ?? 3}
                              onChange={(v) => updateObject(obj.id, { material: { ...obj.material, fresnelPower: v } })}
                              onCommit={pushHistory}
                              min={0.2}
                              max={8}
                              precision={2}
                              dragStep={0.1}
                            />
                            <div className="shrink-0">
                              <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block mb-1">Rim color</span>
                              <ColorPicker
                                value={obj.material?.fresnelColor ?? "#ffffff"}
                                onChange={(hex) => updateObject(obj.id, { material: { ...obj.material, fresnelColor: hex } })}
                                onCommit={pushHistory}
                                showHex={false}
                                title="Rim glow color"
                              />
                            </div>
                          </>
                        )}
                      </div>
                      <p className="text-[10px] text-muted/70 dark:text-muted">
                        Glowing edge (view angle). Higher width = thinner edge. Great for sci-fi/holograms.
                      </p>
                    </div>
                  )}

                  {/* Texture — 표면에 이미지 매핑(포스터/사진/로고). 프리미티브만(텍스트 콘텐츠 제외) */}
                  {obj.primitiveShape &&
                    !obj.content &&
                    (() => {
                      const texActive = texPanelOpen || !!obj.material?.textureUrl;
                      return (
                        <div className="pt-2 border-t border-border/50 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">Texture</span>
                            <Toggle
                              value={texActive}
                              onChange={(on) => {
                                setTexPanelOpen(on);
                                if (!on) {
                                  updateObject(obj.id, { material: { ...obj.material, textureUrl: undefined, textureRepeat: undefined } });
                                  pushHistory();
                                }
                              }}
                            />
                          </div>
                          <input
                            ref={objTexInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => handleObjectTexUpload(obj.id, e)}
                          />

                          {texActive && (
                            <>
                              {/* 썸네일 그리드 드롭다운 픽커(맨 아래 업로드 포함) */}
                              <TexturePicker
                                value={obj.material?.textureUrl ?? ""}
                                textures={assets.filter((a) => a.type === "texture").map((a) => ({ id: a.id, name: a.name, url: a.dracoUrl }))}
                                onChange={(url) => {
                                  updateObject(obj.id, {
                                    material: {
                                      ...obj.material,
                                      textureUrl: url || undefined,
                                      textureRepeat: url ? obj.material?.textureRepeat : undefined,
                                    },
                                  });
                                  pushHistory();
                                }}
                                onUpload={() => objTexInputRef.current?.click()}
                                uploading={objTexUploading}
                              />

                              {/* 적용된 텍스처 미리보기 + 타일 반복 */}
                              {obj.material?.textureUrl && (
                                <>
                                  <img
                                    src={obj.material.textureUrl}
                                    alt="texture"
                                    className="w-full h-16 object-cover rounded-xs border border-border"
                                  />
                                  {/* Mapping — 면마다 / 보자기(한 장) / 무늬 반복 */}
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">Mapping</span>
                                    <SelectBox
                                      value={obj.material?.textureMapping ?? "face"}
                                      onChange={(v) => {
                                        updateObject(obj.id, {
                                          material: { ...obj.material, textureMapping: v === "face" ? undefined : (v as "wrap" | "pattern") },
                                        });
                                        pushHistory();
                                      }}
                                      options={[
                                        { value: "face", label: "Per-face (면마다)" },
                                        { value: "wrap", label: "Wrap (보자기·한 장)" },
                                        { value: "pattern", label: "Pattern (무늬 반복)" },
                                      ]}
                                      fullWidth={false}
                                      gray
                                    />
                                  </div>
                                  {obj.material?.textureMapping === "pattern" && (
                                    <>
                                      <LabeledNum
                                        label="Pattern Scale"
                                        value={obj.material?.triplanarScale ?? 1}
                                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, triplanarScale: Math.max(0.05, v) } })}
                                        onCommit={pushHistory}
                                        min={0.05}
                                        max={10}
                                        precision={2}
                                        dragStep={0.05}
                                      />
                                      {/* <p className="text-[10px] text-muted/50">
                                        무늬가 표면 전체에 이음새 없이 반복돼요. 값이 클수록 무늬가 작아지고 촘촘해집니다.
                                      </p> */}
                                    </>
                                  )}
                                  {obj.material?.textureMapping === "wrap" && (
                                    <p className="text-[10px] text-muted/50">
                                      {/* 구에 텍스처를 넣은 것처럼 한 장을 사방에 덮어요. 앞은 중앙, 옆은 당겨지고, 위/아래는 극점으로 모여 하나의
                                      그림처럼 감쌉니다. */}
                                    </p>
                                  )}
                                  {(obj.material?.textureMapping ?? "face") === "face" && (
                                    <>
                                      <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={!!obj.material?.textureRepeat}
                                          onChange={(e) => {
                                            updateObject(obj.id, {
                                              material: { ...obj.material, textureRepeat: e.target.checked ? { x: 2, y: 2 } : undefined },
                                            });
                                            pushHistory();
                                          }}
                                        />
                                        Tile repeat (pattern)
                                      </label>
                                      {obj.material?.textureRepeat && (
                                        <div className="flex gap-2">
                                          <LabeledNum
                                            label="Repeat X"
                                            value={obj.material.textureRepeat.x}
                                            onChange={(v) =>
                                              updateObject(obj.id, {
                                                material: {
                                                  ...obj.material,
                                                  textureRepeat: { x: Math.max(1, v), y: obj.material?.textureRepeat?.y ?? 1 },
                                                },
                                              })
                                            }
                                            onCommit={pushHistory}
                                            min={1}
                                            max={20}
                                            precision={0}
                                            dragStep={1}
                                          />
                                          <LabeledNum
                                            label="Repeat Y"
                                            value={obj.material.textureRepeat.y}
                                            onChange={(v) =>
                                              updateObject(obj.id, {
                                                material: {
                                                  ...obj.material,
                                                  textureRepeat: { x: obj.material?.textureRepeat?.x ?? 1, y: Math.max(1, v) },
                                                },
                                              })
                                            }
                                            onCommit={pushHistory}
                                            min={1}
                                            max={20}
                                            precision={0}
                                            dragStep={1}
                                          />
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

                  {/* PBR 맵(normal/roughness/metalness) — 표면 디테일. 프리미티브만. 타일링은 color 텍스처와 공유. */}
                  {obj.primitiveShape && !obj.content && (() => {
                    const texList = assets.filter((a) => a.type === "texture").map((a) => ({ id: a.id, name: a.name, url: a.dracoUrl }));
                    const pick = (patch: Partial<NonNullable<ObjectNodeSchema["material"]>>) => {
                      updateObject(obj.id, { material: { ...obj.material, ...patch } });
                      pushHistory();
                    };
                    return (
                      <>
                        <MapSlot
                          label="Normal map (bump)"
                          hint="Use a blue-toned normal map. Shares tiling with the color texture."
                          url={obj.material?.normalUrl}
                          textures={texList}
                          projectId={projectId}
                          addAsset={addAsset}
                          addToast={addToast}
                          onPick={(url) => pick({ normalUrl: url, ...(url ? {} : { normalScale: undefined }) })}
                        >
                          <LabeledNum
                            label="Bump strength"
                            value={obj.material?.normalScale ?? 1}
                            onChange={(v) => updateObject(obj.id, { material: { ...obj.material, normalScale: v } })}
                            onCommit={pushHistory}
                            min={0}
                            max={3}
                            precision={2}
                            dragStep={0.05}
                          />
                        </MapSlot>
                        {(obj.material?.shading ?? "standard") === "standard" && (
                          <>
                            <MapSlot
                              label="Roughness map"
                              hint="Grayscale — bright = rougher. Multiplies the Roughness value."
                              url={obj.material?.roughnessUrl}
                              textures={texList}
                              projectId={projectId}
                              addAsset={addAsset}
                              addToast={addToast}
                              onPick={(url) => pick({ roughnessUrl: url })}
                            />
                            <MapSlot
                              label="Metalness map"
                              hint="Grayscale — bright = metallic. Multiplies the Metalness value."
                              url={obj.material?.metalnessUrl}
                              textures={texList}
                              projectId={projectId}
                              addAsset={addAsset}
                              addToast={addToast}
                              onPick={(url) => pick({ metalnessUrl: url })}
                            />
                          </>
                        )}
                        {/* AO / Displacement — 조명 기반 셰이딩(matcap 제외) */}
                        {obj.material?.shading !== "matcap" && (
                          <>
                            <MapSlot
                              label="AO map (crevice shade)"
                              hint="Grayscale — dark = shadowed crevices."
                              url={obj.material?.aoUrl}
                              textures={texList}
                              projectId={projectId}
                              addAsset={addAsset}
                              addToast={addToast}
                              onPick={(url) => pick({ aoUrl: url, ...(url ? {} : { aoIntensity: undefined }) })}
                            >
                              <LabeledNum
                                label="AO intensity"
                                value={obj.material?.aoIntensity ?? 1}
                                onChange={(v) => updateObject(obj.id, { material: { ...obj.material, aoIntensity: v } })}
                                onCommit={pushHistory}
                                min={0}
                                max={2}
                                precision={2}
                                dragStep={0.05}
                              />
                            </MapSlot>
                            <MapSlot
                              label="Displacement map (height)"
                              hint="Pushes vertices — needs geometry detail (raise Subdivision to see it on boxes)."
                              url={obj.material?.displacementUrl}
                              textures={texList}
                              projectId={projectId}
                              addAsset={addAsset}
                              addToast={addToast}
                              onPick={(url) => pick({ displacementUrl: url, ...(url ? {} : { displacementScale: undefined }) })}
                            >
                              <LabeledNum
                                label="Height"
                                value={obj.material?.displacementScale ?? 0.1}
                                onChange={(v) => updateObject(obj.id, { material: { ...obj.material, displacementScale: v } })}
                                onCommit={pushHistory}
                                min={0}
                                max={2}
                                precision={2}
                                dragStep={0.02}
                              />
                            </MapSlot>
                          </>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
              {!matRef && (
                <button
                  onClick={() => {
                    const id = addMaterialAsset(obj.name || "Material", obj.material ?? {});
                    useSceneStore.getState().assignMaterialAsset([obj.id], id);
                  }}
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
