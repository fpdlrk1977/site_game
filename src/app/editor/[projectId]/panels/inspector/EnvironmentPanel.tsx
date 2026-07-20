"use client";

// Environment 패널 — 오브젝트 미선택 시 씬 전역 설정(하늘·조명·안개·포스트·경계·바닥·플레이어·게임변수·HUD·팝업기본·프레임·무드·메모).
// InspectorPanel.tsx 분리 리팩터 2단계: 자체 완결 컴포넌트라 통째로 이동(동작 무변경). 공용 프리미티브는 ./ui에서 가져온다.

import { useState, useRef } from "react";
import {
  User,
  RotateCcw,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Lightbulb,
  Sprout,
  Mountain,
  Waves,
  Gem,
  Droplet,
  Palette,
  Image as ImageIcon,
  CirclePlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { useToast } from "@/hooks/useToast";
import { uploadImageTexture } from "@/lib/uploadAsset";
import { TexturePicker } from "@/components/ui/TexturePicker";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { SelectBox } from "@/components/ui/SelectBox";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { InfoHint } from "@/components/ui/InfoHint";
import { SectionHeader, GroupBox, LabeledNum, XYZRow, Toggle, NumInput } from "./ui";
import { SunDial } from "./SunDial";
import type { EnvSchema, HdrPreset, GroundPreset, PopupConfig, PostProcessPreset } from "@/types/scene";

const MOOD_PRESETS: { id: string; label: string; icon: LucideIcon; env: Partial<EnvSchema> }[] = [
  // 기본값 복귀 — HDR/라이트/노출을 DEFAULT_ENVIRONMENT 상태로 되돌린다(무드 해제).
  {
    id: "default",
    label: "Default",
    icon: RotateCcw,
    env: {
      hdrPreset: "none",
      toneMappingExposure: 1,
      lights: {
        ambientIntensity: 0.6,
        directionalIntensity: 1.2,
        directionalPosition: { x: 5, y: 10, z: 5 },
        directionalColor: "#ffffff",
        ambientColor: "#ffffff",
      },
    },
  },
  {
    id: "morning",
    label: "Morning",
    icon: Sunrise,
    env: {
      hdrPreset: "dawn",
      toneMappingExposure: 1.05,
      lights: {
        ambientIntensity: 0.55,
        directionalIntensity: 1.0,
        directionalPosition: { x: 8, y: 5, z: 6 },
        directionalColor: "#ffe4c4",
        ambientColor: "#dfe8ff",
      },
    },
  },
  {
    id: "noon",
    label: "Noon",
    icon: Sun,
    env: {
      hdrPreset: "park",
      toneMappingExposure: 1.0,
      lights: {
        ambientIntensity: 0.6,
        directionalIntensity: 1.5,
        directionalPosition: { x: 4, y: 12, z: 4 },
        directionalColor: "#fffaf0",
        ambientColor: "#ffffff",
      },
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    icon: Sunset,
    env: {
      hdrPreset: "sunset",
      toneMappingExposure: 0.95,
      lights: {
        ambientIntensity: 0.5,
        directionalIntensity: 1.0,
        directionalPosition: { x: 10, y: 3, z: 2 },
        directionalColor: "#ff9d5c",
        ambientColor: "#ffcfa8",
      },
    },
  },
  {
    id: "night",
    label: "Night",
    icon: Moon,
    env: {
      hdrPreset: "night",
      toneMappingExposure: 0.85,
      lights: {
        ambientIntensity: 0.3,
        directionalIntensity: 0.4,
        directionalPosition: { x: 3, y: 8, z: 5 },
        directionalColor: "#9db4e8",
        ambientColor: "#4a5a80",
      },
    },
  },
  {
    id: "studio",
    label: "Studio",
    icon: Lightbulb,
    env: {
      hdrPreset: "studio",
      toneMappingExposure: 1.0,
      lights: {
        ambientIntensity: 0.7,
        directionalIntensity: 1.2,
        directionalPosition: { x: 5, y: 10, z: 5 },
        directionalColor: "#ffffff",
        ambientColor: "#ffffff",
      },
    },
  },
];

// 팝업 기본 크기 입력 — 숫자 드래그(NumInput) + 단위(px/vw/vh) 드롭다운.
// 값은 "800px" 형태 CSS 문자열로 저장, 0/미설정 = 자동(반응형 기본값).
function SizeField({
  label,
  value,
  onChange,
  onCommit,
  fallback = 0,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  onCommit: () => void;
  fallback?: number; // 미설정 시 표시할 기본 숫자(예: 600)
}) {
  const m = /^(\d+(?:\.\d+)?)(px|vw|vh)$/.exec((value ?? "").trim());
  const num = m ? parseFloat(m[1]) : fallback;
  const unit = m ? m[2] : "px";
  const emit = (n: number, u: string) => onChange(n > 0 ? `${n}${u}` : undefined);
  return (
    <label className="block">
      <span className="text-[10px] text-muted/70 dark:text-muted/10 block mb-1">{label}</span>
      <div className="flex gap0">
        <div className="flex-1 [&_input]:rounded-r-none">
          <NumInput value={num} onChange={(n) => emit(n, unit)} onCommit={onCommit} min={0} precision={0} dragStep={5} prefix={false} />
        </div>
        <div className="w-14 shrink-0 [&>button]:rounded-l-none [&>button]:gap-0 [&>button]:w-auto">
          <SelectBox
            value={unit}
            onChange={(u) => {
              emit(num, u);
              onCommit();
            }}
            options={[
              { value: "px", label: "px" },
              { value: "vw", label: "vw" },
              { value: "vh", label: "vh" },
            ]}
            className="px-2 py-1 text-[11px] border border-border rounded-xs text-muted/80 dark:bg-muted/10"
          />
        </div>
      </div>
    </label>
  );
}

// ── Environment 패널 (오브젝트 미선택 시) ──────────────────────
export function EnvironmentPanel() {
  const { environment, updateEnvironment, pushHistory, assets, addAsset, projectId, setBoundaryShapeOpen, requestSaveStartView } = useSceneStore();
  const { addToast } = useToast();
  const [notesOpen, setNotesOpen] = useState(false);
  // 표시용(보여주기만) 섹션의 화살표 접기 상태 — enable 스위치 섹션(Ground/Fog/Player)은 제외.
  const [envCollapsed, setEnvCollapsed] = useState<Set<string>>(new Set(["interaction", "post", "frame", "popup", "gamelogic", "startview"]));
  const envToggle = (k: string) =>
    setEnvCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const envOpen = (k: string) => !envCollapsed.has(k);
  const [groundTexUploading, setGroundTexUploading] = useState(false);
  const groundTexInputRef = useRef<HTMLInputElement>(null);
  const [boundaryTexUploading, setBoundaryTexUploading] = useState(false);
  const boundaryTexInputRef = useRef<HTMLInputElement>(null);
  const env = environment;

  // 공용 — 이미지를 Textures 에셋으로 등록(uploadImageTexture) + 씬 assets에 추가 → 라이브러리에서 재사용·관리 가능.
  //   ground·boundary가 예전엔 직접 스토리지 업로드(에셋 미등록)라 관리가 안 됐던 것을 통합.
  const uploadTextureAsset = async (file: File): Promise<string | null> => {
    if (!projectId) return null;
    if (file.size > 8 * 1024 * 1024) {
      addToast("Image is too large. Max 8MB.", "error");
      return null;
    }
    try {
      const asset = await uploadImageTexture(file, projectId);
      addAsset(asset);
      return asset.dracoUrl;
    } catch (err) {
      addToast("Texture upload failed", "error");
      console.error(err);
      return null;
    }
  };

  const handleGroundTexUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setGroundTexUploading(true);
    const url = await uploadTextureAsset(file);
    if (url) {
      updateEnvironment({ ground: { ...env.ground!, textureUrl: url } });
      pushHistory();
    }
    setGroundTexUploading(false);
  };

  const handleBoundaryTexUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBoundaryTexUploading(true);
    const url = await uploadTextureAsset(file);
    if (url) {
      updateEnvironment({ boundaryWall: { ...(env.boundaryWall ?? {}), style: "texture", textureUrl: url } });
      pushHistory();
    }
    setBoundaryTexUploading(false);
  };

  // 경계 이미지 범용 업로더 — 면별 텍스처/스카이박스가 공유. 에셋 등록 후 URL 반환.
  const uploadBoundaryImage = (file: File): Promise<string | null> => uploadTextureAsset(file);

  // 면별 텍스처/스카이박스 업로드 대상 라우팅 — 단일 파일 입력을 target으로 공유.
  const [bwUploadTarget, setBwUploadTarget] = useState<"front" | "back" | "left" | "right" | "skybox" | null>(null);
  const [bwUploading, setBwUploading] = useState(false);
  const bwUploadRef = useRef<HTMLInputElement>(null);
  const triggerBwUpload = (target: "front" | "back" | "left" | "right" | "skybox") => {
    setBwUploadTarget(target);
    bwUploadRef.current?.click();
  };
  const handleBwFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = bwUploadTarget;
    setBwUploadTarget(null);
    if (!file || !target) return;
    setBwUploading(true);
    const url = await uploadBoundaryImage(file);
    setBwUploading(false);
    if (!url) return;
    const cur = env.boundaryWall ?? {};
    if (target === "skybox") updateEnvironment({ boundaryWall: { ...cur, skyboxUrl: url } });
    else updateEnvironment({ boundaryWall: { ...cur, faceTextures: { ...(cur.faceTextures ?? {}), [target]: url } } });
    pushHistory();
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Start View — 게시(둘러보기) 진입 시 카메라 위치·시선 */}
      <GroupBox>
        <SectionHeader
          title="Start View"
          hint="게시된 뷰어(둘러보기)에 방문자가 처음 들어왔을 때 보이는 카메라 위치·방향. 지정 안 하면 씬 전체가 담기게 자동 맞춤됩니다. 에디터에서 원하는 각도로 카메라를 맞춘 뒤 '현재 시점으로 저장'을 누르세요."
          isOpen={envOpen("startview")}
          onToggle={() => envToggle("startview")}
        />
        {envOpen("startview") && (
          <div className="px-3 pb-4 space-y-2">
            <p className="text-[10px] text-muted/70 dark:text-muted">
              {environment.startView
                ? "시작 뷰가 저장돼 있어요. 방문자는 이 위치·방향에서 시작합니다."
                : "저장된 시작 뷰가 없어요. 방문자는 자동 전체맞춤 뷰에서 시작합니다."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { requestSaveStartView(); addToast("현재 시점을 시작 뷰로 저장했어요"); }}
                className="flex-1 px-2 py-1.5 rounded-xs bg-primary text-white text-[11px] font-medium hover:bg-primary/90 transition-colors"
              >
                📷 현재 시점으로 저장
              </button>
              {environment.startView && (
                <button
                  onClick={() => { updateEnvironment({ startView: undefined }); pushHistory(); addToast("시작 뷰를 초기화했어요 (자동 맞춤)"); }}
                  className="px-2 py-1.5 rounded-xs border border-border text-muted text-[11px] hover:text-foreground hover:border-primary transition-colors"
                >
                  초기화
                </button>
              )}
            </div>
            <p className="text-[9px] text-muted/50">플레이(걷기) 모드는 캐릭터 팔로우 카메라라 이 설정과 무관합니다 — 둘러보기 모드 진입 뷰에만 적용됩니다.</p>
          </div>
        )}
      </GroupBox>

      {/* Camera — 둘러보기 카메라 설정(시야각·줌/회전 제한·자동회전) */}
      <GroupBox>
        <SectionHeader
          title="Camera"
          hint="게시된 뷰어의 둘러보기 카메라 동작. 시야각(FOV), 줌(가까이/멀리) 범위, 내려다보는 각도 제한, 자동 회전(턴테이블)을 정해 방문자가 이상한 각도로 못 가게 합니다. 플레이(걷기) 모드는 캐릭터 카메라라 별개."
          isOpen={envOpen("camera")}
          onToggle={() => envToggle("camera")}
        />
        {envOpen("camera") && (
          <div className="px-3 pb-4 space-y-2">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">Field of view (시야각)</span>
                <InfoHint text="작을수록 망원(멀리 압축), 클수록 광각(넓게·왜곡). 기본 60°. 시작 뷰를 저장하면 그때 값이 우선됩니다." />
              </div>
              <RangeSlider
                value={env.exploreCamera?.fov ?? 60}
                onChange={(v) => updateEnvironment({ exploreCamera: { ...env.exploreCamera, fov: v } })}
                onCommit={pushHistory}
                min={20} max={90} step={1} showValue precision={0}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <LabeledNum
                  label="가까이 한도(m)"
                  value={env.exploreCamera?.minDistance ?? 1}
                  // 멀리 한도를 넘지 못하게(뒤집히면 뷰어 카메라가 잠김) — Fog Near/Far와 동일 패턴.
                  onChange={(v) => updateEnvironment({ exploreCamera: { ...env.exploreCamera, minDistance: Math.min(Math.max(0.1, v), (env.exploreCamera?.maxDistance ?? 200) - 0.1) } })}
                  onCommit={pushHistory} min={0.1} max={50} precision={1} dragStep={0.5}
                />
              </div>
              <div className="flex-1">
                <LabeledNum
                  label="멀리 한도(m)"
                  value={env.exploreCamera?.maxDistance ?? 200}
                  onChange={(v) => updateEnvironment({ exploreCamera: { ...env.exploreCamera, maxDistance: Math.max(v, (env.exploreCamera?.minDistance ?? 1) + 0.1) } })}
                  onCommit={pushHistory} min={1} max={1000} precision={0} dragStep={5}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">카메라가 내려갈 수 있는 높이</span>
                <InfoHint text="카메라를 아래로 돌릴 수 있는 한계입니다. 90°(기본)=눈높이(지평선)까지 내려갈 수 있음. 값을 줄일수록 카메라가 위쪽에 묶여 '내려다보는' 시점만 남고, 30° 아래로 내리면 사실상 탑다운으로 고정돼 상하 회전이 거의 안 됩니다." />
              </div>
              <RangeSlider
                value={env.exploreCamera?.maxPolarDeg ?? 89}
                onChange={(v) => updateEnvironment({ exploreCamera: { ...env.exploreCamera, maxPolarDeg: v } })}
                onCommit={pushHistory}
                min={10} max={90} step={1} showValue precision={0}
              />
              {/* 값이 작을수록 카메라가 머리 위로 묶인다 — 의미가 직관과 반대라 실제로 오해가 발생했음. */}
              {(env.exploreCamera?.maxPolarDeg ?? 89) < 45 && (
                <p className="text-[9px] text-amber-500 mt-1">
                  ⚠️ 값이 낮아 카메라가 위쪽에 묶입니다 — 방문자가 거의 탑다운 시점에서 시작하고 상하 회전이 막혀요. 정면 시점을 원하면 90°에 가깝게 두세요.
                </p>
              )}
            </div>
            <label className="flex items-center justify-between cursor-pointer pt-1">
              <span className="text-[10px] text-muted/70 dark:text-muted">자동 회전 (턴테이블)</span>
              <Toggle
                value={env.exploreCamera?.autoRotate === true}
                onChange={(v) => { updateEnvironment({ exploreCamera: { ...env.exploreCamera, autoRotate: v } }); pushHistory(); }}
              />
            </label>
            {env.exploreCamera?.autoRotate && (
              <div>
                <span className="text-[10px] text-muted/70 dark:text-muted block mb-1">회전 속도</span>
                <RangeSlider
                  value={env.exploreCamera?.autoRotateSpeed ?? 1}
                  onChange={(v) => updateEnvironment({ exploreCamera: { ...env.exploreCamera, autoRotateSpeed: v } })}
                  onCommit={pushHistory}
                  min={0.2} max={5} step={0.1} showValue precision={1}
                />
              </div>
            )}
            <p className="text-[9px] text-muted/50">에디터엔 미반영 — 게시/둘러보기 뷰어에 적용됩니다.</p>
          </div>
        )}
      </GroupBox>

      {/* Frame — 게시 뷰어 고정 화면 비율 */}
      <GroupBox>
        <SectionHeader
          title="Frame"
          hint="게시된 뷰어의 고정 화면 비율. '자유'는 브라우저를 꽉 채우고, 비율을 정하면 그 틀로 레터박스(가운데 정렬 + 배경 여백)해요. 에디터엔 미반영 — 게시/공유 화면에 적용됩니다."
          isOpen={envOpen("frame")}
          onToggle={() => envToggle("frame")}
        />
        {envOpen("frame") && (
          <div className="px-3 pb-4">
            <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block mb-1">화면 비율</span>
            <SelectBox
              value={String(env.frameAspect && env.frameAspect > 0 ? env.frameAspect : 0)}
              onChange={(v) => {
                const n = Number(v);
                updateEnvironment({ frameAspect: n > 0 ? n : undefined });
                pushHistory();
              }}
              options={[
                { value: "0", label: "자유 (브라우저 채움)" },
                { value: String(16 / 9), label: "16:9 (가로 와이드)" },
                { value: String(4 / 3), label: "4:3 (가로)" },
                { value: "1", label: "1:1 (정사각)" },
                { value: String(9 / 16), label: "9:16 (세로 모바일)" },
                { value: String(3 / 4), label: "3:4 (세로)" },
              ]}
            />
          </div>
        )}
      </GroupBox>

      {/* Sky */}
      <GroupBox>
        <SectionHeader title="Sky" isOpen={envOpen("sky")} onToggle={() => envToggle("sky")} />
        {envOpen("sky") && (
          <div className="px-3 pb-3 space-y-2">
            {/* 모드 탭 */}
            {(() => {
              const useHdr = (env.hdrPreset ?? "none") !== "none";
              const mode = useHdr ? "hdr" : env.sky.type === "sky" ? "sky" : "color";
              const HDR_PRESETS: { id: HdrPreset; label: string }[] = [
                { id: "sunset", label: "Sunset" },
                { id: "dawn", label: "Dawn" },
                { id: "night", label: "Night" },
                { id: "forest", label: "Forest" },
                { id: "park", label: "Park" },
                { id: "city", label: "City" },
                { id: "warehouse", label: "Factory" },
                { id: "apartment", label: "Indoor" },
                { id: "lobby", label: "Lobby" },
                { id: "studio", label: "Studio" },
              ];
              return (
                <>
                  <div className="flex gap-2">
                    <SelectBox
                      value={mode}
                      onChange={(v) => {
                        const t = v as "color" | "sky" | "hdr";
                        if (t === "hdr") {
                          updateEnvironment({ hdrPreset: env.hdrPreset && env.hdrPreset !== "none" ? env.hdrPreset : "sunset" });
                        } else {
                          updateEnvironment({ sky: { ...env.sky, type: t }, hdrPreset: "none" });
                        }
                        pushHistory();
                      }}
                      options={[
                        { value: "color", label: "Solid color" },
                        { value: "sky", label: "Sky" },
                        { value: "hdr", label: "HDR" },
                      ]}
                    />

                    {mode === "color" && (
                      <ColorPicker
                        value={env.sky.value}
                        onChange={(hex) => updateEnvironment({ sky: { ...env.sky, value: hex } })}
                        onCommit={pushHistory}
                      />
                    )}

                    {mode === "hdr" && (
                      <SelectBox
                        value={env.hdrPreset ?? "sunset"}
                        onChange={(v) => {
                          updateEnvironment({ hdrPreset: v as HdrPreset });
                          pushHistory();
                        }}
                        options={HDR_PRESETS.map(({ id, label }) => ({ value: id, label }))}
                      />
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </GroupBox>

      {/* Ground */}
      <GroupBox>
        <div className="relative">
          <SectionHeader
            title="Ground"
            hint="The floor plane. A preset, or a solid color / image texture. The floor is opaque, so if an object's bottom sinks below it, it gets hidden and looks cut off (auto floor-snap prevents this)."
          />
          <label className="flex items-center justify-between cursor-pointer absolute top-4.5 right-4">
            <Toggle
              value={env.ground?.enabled ?? false}
              onChange={(v) => {
                updateEnvironment({ ground: { ...env.ground, color: env.ground?.color ?? "#4a7c59", enabled: v } });
                pushHistory();
              }}
            />
          </label>
        </div>
        {env.ground?.enabled && (
          <div className="px-3 pb-3 space-y-2">
            {(() => {
              const GROUND_PRESETS: { id: GroundPreset; label: string; icon: LucideIcon }[] = [
                { id: "grass", label: "Grass", icon: Sprout },
                { id: "dirt", label: "Dirt", icon: Mountain },
                { id: "sand", label: "Sand", icon: Waves },
                { id: "stone", label: "Stone", icon: Gem },
                { id: "water", label: "Water", icon: Droplet },
                { id: "color", label: "Color", icon: Palette },
                { id: "texture", label: "Texture", icon: ImageIcon },
              ];
              // 레거시 'custom'/미설정은 textureUrl 유무로 texture/color로 표시(하위호환).
              const raw = env.ground!.preset ?? "custom";
              const mode = raw === "custom" ? (env.ground!.textureUrl ? "texture" : "color") : raw;
              return (
                <>
                  {/* 프리셋 */}
                  <SelectBox
                    value={mode}
                    onChange={(v) => {
                      updateEnvironment({ ground: { ...env.ground!, preset: v as GroundPreset } });
                      pushHistory();
                    }}
                    options={GROUND_PRESETS.map(({ id, label, icon: Icon }) => ({ value: id, label, icon: <Icon size={14} /> }))}
                  />
                  {/* Color 모드 — 컬러 선택 필드 */}
                  {mode === "color" && (
                    <ColorPicker
                      value={env.ground!.color}
                      onChange={(hex) => updateEnvironment({ ground: { ...env.ground!, color: hex } })}
                      onCommit={pushHistory}
                    />
                  )}
                  {/* Texture 모드 — 업로드 버튼 / 미리보기 */}
                  {mode === "texture" && (
                    <div className="space-y-2">
                      {/* 라이브러리 픽커 — 기존 텍스처 재사용 + 업로드(에셋 등록). 오브젝트 텍스처와 동일 UI. */}
                      <TexturePicker
                        value={env.ground?.textureUrl ?? ""}
                        textures={assets.filter((a) => a.type === "texture").map((a) => ({ id: a.id, name: a.name, url: a.dracoUrl }))}
                        onChange={(url) => {
                          updateEnvironment({ ground: { ...env.ground!, textureUrl: url || undefined } });
                          pushHistory();
                        }}
                        onUpload={() => groundTexInputRef.current?.click()}
                        uploading={groundTexUploading}
                      />
                      {env.ground?.textureUrl && (
                        <img src={env.ground.textureUrl} alt="ground texture" className="w-full h-16 object-cover rounded-xs border border-border" />
                      )}
                      <input
                        ref={groundTexInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleGroundTexUpload}
                      />
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </GroupBox>

      <GroupBox>
        {/* Fog */}
        <div className="relative">
          <SectionHeader title="Fog" />
          <label className="flex items-center justify-between cursor-pointer absolute top-4.5 right-4">
            {/* <span className=" text-[11px] text-muted">Enable Fog</span> */}
            <Toggle
              value={env.fog.enabled}
              onChange={(v) => {
                updateEnvironment({ fog: { ...env.fog, enabled: v } });
                pushHistory();
              }}
            />
          </label>
        </div>
        {env.fog.enabled && (
          <div className="px-3 pb-3">
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-muted/70 dark:text-muted block mb-1">Color</span>
                {((env.hdrPreset ?? 'none') === 'none' && env.sky.type !== 'sky') ? (
                  // 단색 배경이면 fog 색을 하늘색에 자동 일치(수평선이 매끄럽게 사라짐) → 색 지정 대신 안내.
                  <div className="text-[10px] text-muted/60 border border-border/60 rounded-xs px-2 py-2 leading-snug">
                    하늘색에 <b>자동</b>으로 맞춰집니다 (수평선이 매끄럽게 사라짐). 색을 바꾸려면 <b>Sky 색</b>을 바꾸세요.
                  </div>
                ) : (
                  <ColorPicker
                    value={env.fog.color}
                    onChange={(hex) => updateEnvironment({ fog: { ...env.fog, color: hex } })}
                    onCommit={pushHistory}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-muted/70 dark:text-muted block mb-1">Mode</span>
                <SelectBox
                  value={env.fog.mode ?? "linear"}
                  onChange={(v) => {
                    updateEnvironment({ fog: { ...env.fog, mode: v as "linear" | "exp" } });
                    pushHistory();
                  }}
                  options={[
                    { value: "linear", label: "Linear (Near–Far range)" },
                    { value: "exp", label: "Exp (density — even depth)" },
                  ]}
                />
              </div>
            </div>
            {(env.fog.mode ?? "linear") === "exp" ? (
              <div className="mt-2">
                <LabeledNum
                  label="Density"
                  value={env.fog.density ?? 0.02}
                  onChange={(v) => updateEnvironment({ fog: { ...env.fog, density: v } })}
                  onCommit={pushHistory}
                  min={0}
                  max={0.3}
                  precision={3}
                  dragStep={0.002}
                />
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="mt-2">
                  <LabeledNum
                    label="Near"
                    value={env.fog.near}
                    onChange={(v) => updateEnvironment({ fog: { ...env.fog, near: Math.min(v, env.fog.far) } })}
                    onCommit={pushHistory}
                    min={1}
                    max={200}
                    precision={0}
                    dragStep={1}
                  />
                </div>
                <div className="mt-2">
                  <LabeledNum
                    label="Far"
                    value={env.fog.far}
                    onChange={(v) => updateEnvironment({ fog: { ...env.fog, far: Math.max(v, env.fog.near) } })}
                    onCommit={pushHistory}
                    min={10}
                    max={500}
                    precision={0}
                    dragStep={2}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </GroupBox>

      {/* Mood — 분위기 프리셋 (HDR+라이트+노출 한 번에) */}
      <GroupBox>
        <div className="relative">
          <SectionHeader
            title="Mood"
            hint="분위기 프리셋(조명·배경·노출 한 번에). 스위치를 켜면 기본 morning, 끄면 default(무드 해제). 켜진 상태에서 다른 무드도 고를 수 있어요."
          />
          {/* Mood on/off — ON=morning 적용, OFF=default(해제). Fog처럼 헤더 우측 스위치 */}
          <label className="flex items-center justify-between cursor-pointer absolute top-4.5 right-4">
            <Toggle
              value={!!env.mood && env.mood !== "default"}
              onChange={(v) => {
                const id = v ? "morning" : "default";
                const m = MOOD_PRESETS.find((p) => p.id === id);
                if (m) {
                  updateEnvironment({ ...m.env, mood: id });
                  pushHistory();
                }
              }}
            />
          </label>
        </div>
        {!!env.mood && env.mood !== "default" && (
          <div className="px-3 pb-3">
            <SelectBox
              value={env.mood ?? "morning"}
              onChange={(id) => {
                const m = MOOD_PRESETS.find((p) => p.id === id);
                if (m) {
                  updateEnvironment({ ...m.env, mood: id });
                  pushHistory();
                }
              }}
              options={MOOD_PRESETS.filter((m) => m.id !== "default").map((m) => ({ value: m.id, label: m.label, icon: <m.icon size={14} /> }))}
              placeholder="Select mood..."
            />
          </div>
        )}
      </GroupBox>

      {/* Lights */}
      <GroupBox>
        <div className="relative">
        <SectionHeader
          title="Lights"
          hint="Scene-wide lighting. The switch toggles the sun (directional light + shadows); ambient fill stays on. Set the sun direction on the dial below, or grab the sun sphere in the viewport."
        />
        {/* 태양(방향광) on/off — 화살표(접기) 대신 헤더 스위치. 끄면 그림자·태양 기즈모도 꺼지고 ambient/IBL만. */}
        <label className="flex items-center cursor-pointer absolute top-4.5 right-4" title="Sun on/off">
          <Toggle value={env.lights.sunEnabled !== false} onChange={(v) => { updateEnvironment({ lights: { ...env.lights, sunEnabled: v } }); pushHistory(); }} />
        </label>
        {(
          <div className="px-3 space-y-1 pb-4">
            <div className="flex gap-2">
              <div>
                <LabeledNum
                  label="Ambient"
                  value={env.lights.ambientIntensity}
                  onChange={(v) => updateEnvironment({ lights: { ...env.lights, ambientIntensity: v } })}
                  onCommit={pushHistory}
                  min={0}
                  max={3}
                  precision={2}
                  dragStep={0.02}
                />
              </div>
              {env.lights.sunEnabled !== false && (
                <div>
                  <LabeledNum
                    label="Sun"
                    value={env.lights.directionalIntensity}
                    onChange={(v) => updateEnvironment({ lights: { ...env.lights, directionalIntensity: v } })}
                    onCommit={pushHistory}
                    min={0}
                    max={5}
                    precision={1}
                    dragStep={0.05}
                  />
                </div>
              )}
            </div>
            {env.lights.sunEnabled !== false && (
              <div className="pt-1">
                <SunDial
                  position={env.lights.directionalPosition}
                  onChange={(pos) => updateEnvironment({ lights: { ...env.lights, directionalPosition: pos } })}
                  onCommit={pushHistory}
                />
              </div>
            )}
            {/* 라이트 색(warm/cool) — 태양·환경광 색조. 미설정=흰색. 노을은 따뜻하게, 밤은 차갑게 등 무드 연출. */}
            <div className="flex gap-2 pt-1">
              {env.lights.sunEnabled !== false && (
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-muted/70 dark:text-muted">Sun Color</span>
                  <ColorPicker
                    value={env.lights.directionalColor ?? "#ffffff"}
                    onChange={(hex) => updateEnvironment({ lights: { ...env.lights, directionalColor: hex } })}
                    onCommit={pushHistory}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-muted/70 dark:text-muted">Ambient Color</span>
                <ColorPicker
                  value={env.lights.ambientColor ?? "#ffffff"}
                  onChange={(hex) => updateEnvironment({ lights: { ...env.lights, ambientColor: hex } })}
                  onCommit={pushHistory}
                />
              </div>
            </div>
            {/* 노출(Exposure) — 씬 전체 밝기. 1=기본. 안내는 아이콘 툴팁으로. */}
            <div className="pt-1">
              <div className="flex items-center gap-1 mb-1/2">
                <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">Exposure</span>
                <InfoHint text="Overall scene brightness. Uses Linear tone mapping so colors render as set. If some areas blow out to white, lower the exposure." />
              </div>
              <RangeSlider
                value={env.toneMappingExposure ?? 1}
                onChange={(v) => updateEnvironment({ toneMappingExposure: v })}
                onCommit={pushHistory}
                min={0.3}
                max={2}
                step={0.02}
                showValue
                precision={2}
              />
            </div>
            {/* 그림자 농도 — 태양(directionalLight) 그림자 진하기(shadow.intensity). 1=진함·0.5=옅음·0=없음. */}
            {env.lights.sunEnabled !== false && (
              <div className="pt-1">
                <div className="flex items-center gap-1 mb-1/2">
                  <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide">Shadow Density</span>
                  <InfoHint text="Darkness of the sun's cast shadows. 1 = dark, 0.5 = soft/faint, 0 = no shadow. Per-object shadows are on/off only; this controls the whole scene." />
                </div>
                <RangeSlider
                  value={env.lights.shadowIntensity ?? 1}
                  onChange={(v) => updateEnvironment({ lights: { ...env.lights, shadowIntensity: v } })}
                  onCommit={pushHistory}
                  min={0}
                  max={1}
                  step={0.05}
                  showValue
                  precision={2}
                />
              </div>
            )}
            {/* 접지 그림자 — 오브젝트가 바닥에 붙은 느낌. 기본 꺼짐, 켜서 확인 */}
            <label className="flex items-center justify-between cursor-pointer pt-2">
              <span className="text-[10px] text-muted/70 dark:text-muted">Contact Shadows</span>
              <Toggle
                value={env.contactShadows === true}
                onChange={(v) => {
                  updateEnvironment({ contactShadows: v });
                  pushHistory();
                }}
              />
            </label>
          </div>
        )}
        </div>
      </GroupBox>

      {/* Interaction — 뷰어 상호작용 어포던스 */}
      <GroupBox>
        <SectionHeader
          title="Interaction"
          hint="Shows a floating hint ring above objects that have click/hover events, signaling they're interactive. Explore mode only; you can turn it off for a cleaner scene."
          isOpen={envOpen("interaction")}
          onToggle={() => envToggle("interaction")}
        />
        {envOpen("interaction") && (
          <div className="px-3 pb-4 space-y-1">
            {/* 클릭/호버 이벤트가 있는 오브젝트 위에 힌트 링 표시 (탐색 모드 뷰어/임베드에서만) */}
            <label className="flex items-center justify-between cursor-pointer pb-1">
              <span className="text-[10px] text-muted/70 dark:text-muted">Show interaction hints</span>
              <Toggle
                value={env.showInteractionHints !== false}
                onChange={(v) => {
                  updateEnvironment({ showInteractionHints: v });
                  pushHistory();
                }}
              />
            </label>
            {/* 상호작용 근접 범위 기본값 — interact(E)/approach·E 프롬프트·하이라이트 공유 */}
            <div className="pt-2">
              <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block mb-1/2">Default interaction range (m)</span>
              <RangeSlider
                value={env.interactRange ?? 3}
                onChange={(v) => updateEnvironment({ interactRange: Math.max(0.5, v) })}
                onCommit={pushHistory}
                min={0.5}
                max={10}
                step={0.1}
                showValue
                precision={1}
              />
              {/* <p className="text-[10px] text-muted/60 leading-relaxed mt-1">
                In play mode, the E prompt, highlight and approach trigger fire when the character gets this close. A per-object range overrides this
                value.
              </p> */}
            </div>
          </div>
        )}
      </GroupBox>

      {/* 팝업 기본값 — 씬 전역 show_popup 스타일 (개별 이벤트가 우선) */}
      <GroupBox>
        <SectionHeader
          title="Popup defaults"
          hint="Scene-wide default position, size and background for show_popup popups. Values set on an individual event take priority over these defaults."
          isOpen={envOpen("popup")}
          onToggle={() => envToggle("popup")}
        />
        {envOpen("popup") && (
          <div className="px-3 pb-4 space-y-1.5">
            {(() => {
              const dp = env.defaultPopup ?? {};
              const setDP = (patch: Partial<typeof dp>) => updateEnvironment({ defaultPopup: { ...dp, ...patch } });
              return (
                <>
                  <label className="block">
                    <span className="text-[10px] text-muted/70 dark:text-muted block mb-1">위치</span>
                    <SelectBox
                      value={dp.position ?? "center"}
                      onChange={(v) => {
                        setDP({ position: v as PopupConfig["position"] });
                        pushHistory();
                      }}
                      options={[
                        { value: "center", label: "중앙 모달 (기본)" },
                        { value: "bottom", label: "하단 시트" },
                        { value: "left", label: "왼쪽 패널" },
                        { value: "right", label: "오른쪽 패널" },
                      ]}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <SizeField label="기본 너비" value={dp.width} onChange={(v) => setDP({ width: v })} onCommit={pushHistory} fallback={600} />
                    <SizeField label="기본 높이" value={dp.height} onChange={(v) => setDP({ height: v })} onCommit={pushHistory} fallback={600} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-muted/70 w-12 block mb-1">기본 배경색</span>
                    <ColorPicker
                      value={dp.bg || "#ffffff"}
                      onChange={(hex) => setDP({ bg: hex })}
                      onCommit={pushHistory}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </GroupBox>

      {/* Player */}
      <GroupBox>
        <div className="relative">
          <SectionHeader
            title="Player"
            hint="플레이(걷기) 모드의 캐릭터·속도·점프. 스위치를 켜면 걷기(플레이) 모드, 끄면 둘러보기 전용 씬이 됩니다."
          />
          {/* 걷기(플레이) 모드 on/off — Fog처럼 헤더 우측 스위치 (텍스트 없이 스위치만) */}
          <label className="flex items-center justify-between cursor-pointer absolute top-4.5 right-4">
            <Toggle
              value={!env.disableWalk}
              onChange={(v) => {
                updateEnvironment({ disableWalk: !v });
                pushHistory();
              }}
            />
          </label>
        </div>
        {!env.disableWalk && (
          <div className="px-3 pb-4 space-y-1">
            <>
              {/* 뷰어 기본 진입 모드 — 접속 시 탐색/플레이 중 무엇으로 시작할지 */}
              <div className="pb-1">
                <span className="text-[10px] text-muted/70 dark:text-muted block mb-1.5 tracking-wide">기본 진입 모드</span>
                <SelectBox
                  value={env.defaultMode ?? "explore"}
                  onChange={(v) => {
                    updateEnvironment({ defaultMode: v as "explore" | "play" });
                    pushHistory();
                  }}
                  options={[
                    { value: "explore", label: "탐색 (둘러보기)" },
                    { value: "play", label: "플레이 (걸어다니기)" },
                  ]}
                />
                {/* <p className="text-[10px] text-muted/60 mt-1.5">뷰어 접속·씬 이동 시 시작할 모드. 플레이면 바로 캐릭터로 시작합니다.</p> */}
              </div>
              {(() => {
                const characterAssets = assets.filter((a) => a.type === "character");
                return (
                  <>
                    <div>
                      <span className="text-[10px] text-muted/70 dark:text-muted block mb-1.5 tracking-wide">캐릭터</span>
                      <SelectBox
                        value={env.playerCharacterId ?? ""}
                        onChange={(v) => {
                          updateEnvironment({ playerCharacterId: v || undefined });
                          pushHistory();
                        }}
                        iconSize={32}
                        options={[
                          { value: "", label: "기본 캡슐", icon: <User className="text-muted" /> },
                          ...characterAssets.map((a) => ({
                            value: a.id,
                            label: a.name,
                            icon: a.thumbnailUrl ? <img src={a.thumbnailUrl} alt="" className="rounded-xs" /> : <User className="text-muted" />,
                          })),
                        ]}
                      />
                      {characterAssets.length === 0 && (
                        <p className="text-[10px] text-muted/60 mt-1.5">Asset Browser → Character 탭에서 GLB를 업로드하세요</p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      {env.playerCharacterId && (
                        <div>
                          <LabeledNum
                            label="Scale"
                            value={env.playerCharacterScale ?? 1}
                            onChange={(v) => updateEnvironment({ playerCharacterScale: v })}
                            onCommit={pushHistory}
                            min={0.1}
                            max={3}
                            precision={2}
                            dragStep={0.02}
                          />
                        </div>
                      )}
                      <div>
                        <LabeledNum
                          label="Speed"
                          value={env.playerSpeed ?? 5}
                          onChange={(v) => updateEnvironment({ playerSpeed: v })}
                          onCommit={pushHistory}
                          min={1}
                          max={20}
                          precision={1}
                          dragStep={0.1}
                        />
                      </div>
                      <div>
                        <LabeledNum
                          label="Jump"
                          value={env.playerJumpForce ?? 12}
                          onChange={(v) => updateEnvironment({ playerJumpForce: v })}
                          onCommit={pushHistory}
                          min={2}
                          max={30}
                          precision={0}
                          dragStep={0.5}
                        />
                      </div>
                    </div>
                    {/* Spawn Point — 캐릭터 시작 위치. 독립 섹션이었으나 Player에 포함(Speed/Jump 아래) */}
                    <div className="pt-1">
                      <XYZRow
                        label="Spawn Point"
                        x={env.playerStartPosition?.x ?? 0}
                        y={env.playerStartPosition?.y ?? 0}
                        z={env.playerStartPosition?.z ?? 0}
                        onChangeX={(v) => updateEnvironment({ playerStartPosition: { ...(env.playerStartPosition ?? { x: 0, y: 0, z: 0 }), x: v } })}
                        onChangeY={(v) =>
                          updateEnvironment({ playerStartPosition: { ...(env.playerStartPosition ?? { x: 0, y: 0, z: 0 }), y: Math.max(0, v) } })
                        }
                        onChangeZ={(v) => updateEnvironment({ playerStartPosition: { ...(env.playerStartPosition ?? { x: 0, y: 0, z: 0 }), z: v } })}
                        onCommit={pushHistory}
                        dragStep={0.5}
                      />
                      {env.playerStartPosition && (
                        <button
                          onClick={() => {
                            updateEnvironment({ playerStartPosition: undefined });
                            pushHistory();
                          }}
                          className="w-full mt-1 py-1 rounded-xs border border-dashed text-[10px] text-danger border-danger/50 hover:bg-danger/2 transition-colors cursor-pointer"
                        >
                          스폰 포인트 초기화
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </>
          </div>
        )}
      </GroupBox>

      {/* Boundary */}
      <GroupBox>
        <div className="relative">
          <SectionHeader
            title="Boundary"
            hint="플레이 이동 제한 영역. 스위치를 켜면 기본 3 크기의 정사각 경계가 생기고, 가로(X)·세로(Z)로 크기를 조절해요. 벽 스타일(단색·텍스처)로 방/전시장처럼 감쌀 수 있어요."
          />
          {/* 경계 on/off — 켜면 기본 3 정사각 경계, 끄면 경계 없음 (Fog처럼 헤더 우측 스위치) */}
          <label className="flex items-center justify-between cursor-pointer absolute top-4.5 right-4">
            <Toggle
              value={(env.boundary ?? 0) > 0}
              onChange={(v) => {
                updateEnvironment(v ? { boundary: 3, boundaryZ: 3 } : { boundary: undefined, boundaryZ: undefined });
                pushHistory();
              }}
            />
          </label>
        </div>
        {(env.boundary ?? 0) > 0 && (
          <div className="px-3 pb-4">
            {/* 모양 — 사각형 / 원형 */}
            <div className="mb-2">
              <span className="text-[10px] text-muted/70 dark:text-muted block mb-1 tracking-wide">Shape</span>
              <SelectBox
                value={env.boundaryShape ?? "rect"}
                onChange={(v) => {
                  updateEnvironment({ boundaryShape: v === "rect" ? undefined : (v as "circle" | "polygon") });
                  pushHistory();
                }}
                options={[
                  { value: "rect", label: "사각형" },
                  { value: "circle", label: "원형" },
                  { value: "polygon", label: "커스텀 (다각형)" },
                ]}
              />
            </div>
            {(env.boundaryShape ?? "rect") === "polygon" ? (
              <div className="space-y-1.5">
                <button
                  onClick={() => setBoundaryShapeOpen(true)}
                  className="w-full py-2 rounded-xs bg-primary/15 text-primary border border-primary/30 text-[11px] font-medium hover:bg-primary/25 transition-colors"
                >
                  {env.boundaryPolygon && env.boundaryPolygon.length >= 3 ? `모양 편집 (${env.boundaryPolygon.length}점)` : "＋ 모양 그리기 (위에서)"}
                </button>
                {/* <p className="text-[10px] text-muted/60">위에서 내려다본 씬 위에 꼭짓점을 찍어 자유 경계를 그려요. 텍스처는 변마다 반복됩니다.</p> */}
              </div>
            ) : (env.boundaryShape ?? "rect") === "circle" ? (
              <>
                <LabeledNum
                  label="Round"
                  value={env.boundary ?? 0}
                  onChange={(v) => updateEnvironment(v === 0 ? { boundary: undefined } : { boundary: v })}
                  onCommit={pushHistory}
                  min={0}
                  max={200}
                  precision={0}
                  dragStep={1}
                />
                {/* <p className="text-[10px] text-muted/60 mt-0.5">0 = 경계 없음 · 중심에서 원 둘레까지 거리(반지름). 원형은 텍스처를 한 장으로 감싸요.</p> */}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledNum
                    label="Horizontal(X)"
                    value={env.boundary ?? 0}
                    onChange={(v) => updateEnvironment(v === 0 ? { boundary: undefined, boundaryZ: undefined } : { boundary: v })}
                    onCommit={pushHistory}
                    min={0}
                    max={200}
                    precision={0}
                    dragStep={1}
                  />
                  <LabeledNum
                    label="Vertical(Z)"
                    value={env.boundaryZ ?? env.boundary ?? 0}
                    onChange={(v) => updateEnvironment({ boundaryZ: v === 0 ? undefined : v })}
                    onCommit={pushHistory}
                    min={0}
                    max={200}
                    precision={0}
                    dragStep={1}
                  />
                </div>
                {/* <p className="text-[10px] text-muted/60 mt-0.5">0 = 경계 없음 · 중심에서 벽까지 거리(반경). 세로=가로면 정사각.</p> */}
              </>
            )}

            {(env.boundary ?? 0) > 0 &&
              (() => {
                const bw = env.boundaryWall ?? {};
                const style = bw.style ?? "none";
                const setBw = (patch: Partial<NonNullable<EnvSchema["boundaryWall"]>>) => updateEnvironment({ boundaryWall: { ...bw, ...patch } });
                return (
                  <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                    <div>
                      <span className="text-[10px] text-muted/70 dark:text-muted block mb-1 tracking-wide">Wall style</span>
                      <SelectBox
                        value={style}
                        onChange={(v) => {
                          setBw({ style: v as "none" | "color" | "texture" | "skybox" });
                          pushHistory();
                        }}
                        options={[
                          { value: "none", label: "투명 (영역만)" },
                          { value: "color", label: "단색 벽" },
                          { value: "texture", label: "텍스처 벽" },
                          { value: "skybox", label: "스카이박스 (360° 파노라마)" },
                        ]}
                      />
                    </div>
                    {/* 면별/스카이박스 업로드 공용 파일 입력 */}
                    <input ref={bwUploadRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleBwFileUpload} />
                    {style === "color" && (
                      <div className="flex items-center gap-2 text-[10px] text-muted/70">
                        <span className="shrink-0 text-muted/70 dark:text-muted">Color</span>
                        <ColorPicker
                          value={bw.color ?? "#8899aa"}
                          onChange={(hex) => setBw({ color: hex })}
                          onCommit={pushHistory}
                          className="flex-1"
                        />
                      </div>
                    )}
                    {style === "texture" && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-muted/70 dark:text-muted block tracking-wide">Texture</span>
                        {/* 라이브러리 픽커 — 기존 텍스처 재사용 + 업로드(에셋 등록) */}
                        <TexturePicker
                          value={bw.textureUrl ?? ""}
                          textures={assets.filter((a) => a.type === "texture").map((a) => ({ id: a.id, name: a.name, url: a.dracoUrl }))}
                          onChange={(url) => {
                            setBw({ textureUrl: url || undefined });
                            pushHistory();
                          }}
                          onUpload={() => boundaryTexInputRef.current?.click()}
                          uploading={boundaryTexUploading}
                        />
                        {bw.textureUrl && (
                          <img src={bw.textureUrl} alt="boundary texture" className="w-full h-16 object-cover rounded-xs border border-border" />
                        )}
                        <input
                          ref={boundaryTexInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleBoundaryTexUpload}
                        />
                        {/* 면별 텍스처 — 지정한 면만 개별 이미지, 나머지는 위 기본 텍스처 사용 */}
                        <span className="text-[10px] text-muted/70 dark:text-muted block tracking-wide pt-1">Textures by face (optional)</span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(
                            [
                              ["front", "Front"],
                              ["back", "Back"],
                              ["left", "Left"],
                              ["right", "Right"],
                            ] as const
                          ).map(([face, label]) => {
                            const url = bw.faceTextures?.[face];
                            return (
                              <div key={face} className="relative rounded-xs overflow-hidden border border-border group h-12 bg-surface">
                                {url ? (
                                  <img src={url} alt={label} className="w-full h-full object-cover" />
                                ) : (
                                  <button
                                    onClick={() => triggerBwUpload(face)}
                                    disabled={bwUploading}
                                    className="w-full h-full flex flex-col items-center justify-center text-[10px] text-foreground hover:text-muted hover:bg-background bg-muted/5 dark:bg-muted/10 transition-colors disabled:opacity-50"
                                  >
                                    <CirclePlus size={14} className="text-muted/50" />
                                    <span>{label}</span>
                                  </button>
                                )}
                                {url && (
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                    <span className="absolute top-0.5 left-1 text-[9px] text-white/90 drop-shadow">{label}</span>
                                    <button
                                      onClick={() => triggerBwUpload(face)}
                                      className="bg-black/70 text-white rounded px-1.5 py-0.5 text-[9px] hover:bg-primary/80"
                                    >
                                      교체
                                    </button>
                                    <button
                                      onClick={() => {
                                        setBw({ faceTextures: { ...bw.faceTextures, [face]: undefined } });
                                        pushHistory();
                                      }}
                                      className="bg-black/70 text-white rounded px-1.5 py-0.5 text-[9px] hover:bg-danger/80"
                                    >
                                      ×
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {style === "skybox" && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-muted/70 dark:text-muted block tracking-wide">Panorama Images (equirectangular 2:1)</span>
                        {bw.skyboxUrl ? (
                          <div className="relative rounded-xs overflow-hidden border border-border group">
                            <img src={bw.skyboxUrl} alt="skybox" className="w-full h-16 object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                              <button
                                onClick={() => triggerBwUpload("skybox")}
                                className="bg-black/70 text-white rounded px-2 py-1 text-[10px] hover:bg-primary/80"
                              >
                                교체
                              </button>
                              <button
                                onClick={() => {
                                  setBw({ skyboxUrl: undefined });
                                  pushHistory();
                                }}
                                className="bg-black/70 text-white rounded px-2 py-1 text-[10px] hover:bg-danger/80"
                              >
                                제거
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => triggerBwUpload("skybox")}
                            disabled={bwUploading}
                            className="w-full py-2.5 rounded-xs border border-dashed border-border bg-surface text-foreground hover:text-muted hover:bg-background text-[10px] transition-all disabled:opacity-50 whitespace-pre-line"
                          >
                            {bwUploading ? "Uploading..." : "360° 파노라마 업로드\n좌우로 이어지는 equirectangular 이미지"}
                          </button>
                        )}
                        {/* <p className="text-[10px] text-muted/70">벽 대신 씬 전체를 감쌉니다. 4면 벽·천장 설정은 무시돼요.</p> */}
                      </div>
                    )}
                    {(style === "color" || style === "texture") && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <LabeledNum
                            label="Height"
                            value={bw.height ?? 8}
                            onChange={(v) => setBw({ height: v })}
                            onCommit={pushHistory}
                            min={0.5}
                            max={50}
                            precision={1}
                            dragStep={0.5}
                          />
                          <LabeledNum
                            label="Opacity"
                            value={bw.opacity ?? 1}
                            onChange={(v) => setBw({ opacity: v })}
                            onCommit={pushHistory}
                            min={0}
                            max={1}
                            precision={2}
                            dragStep={0.05}
                          />
                        </div>
                        <label className="flex items-center justify-between gap-2 text-[10px] text-muted/70 pt-0.5">
                          <span>천장 포함 (완전한 방)</span>
                          <Toggle
                            value={bw.ceiling === true}
                            onChange={(v) => {
                              setBw({ ceiling: v });
                              pushHistory();
                            }}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2 text-[10px] text-muted/70">
                          <span>그라데이션 (위로 갈수록 투명)</span>
                          <Toggle
                            value={bw.gradient === true}
                            onChange={(v) => {
                              setBw({ gradient: v });
                              pushHistory();
                            }}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2 text-[10px] text-muted/70">
                          <span>안쪽에서만 보이기 (밖에선 투명)</span>
                          <Toggle
                            value={bw.oneSided === true}
                            onChange={(v) => {
                              setBw({ oneSided: v });
                              pushHistory();
                            }}
                          />
                        </label>
                        {/* <p className="text-[10px] text-muted/70">에디터엔 반투명 미리보기(양면) · 실제 룩은 뷰어에서 확인</p> */}
                      </>
                    )}
                  </div>
                );
              })()}
          </div>
        )}
      </GroupBox>

      {/* Post Processing */}
      <GroupBox>
        <SectionHeader
          title="Post Processing"
          hint="화면 전체 필터. 프리셋 또는 개별 효과. 개별 효과(SSAO/블룸/비네트 등)를 하나라도 올리면 프리셋 대신 그 조합으로 렌더돼요. SSAO=구석 음영(묵직함)."
          isOpen={envOpen("post")}
          onToggle={() => envToggle("post")}
        />
        {envOpen("post") && (
          <div className="px-3 pb-4 space-y-2">
            <div>
              <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block mb-1">Preset</span>
              <SelectBox
                value={env.postProcessing?.preset ?? "none"}
                onChange={(v) => {
                  updateEnvironment({ postProcessing: { preset: v as PostProcessPreset } });
                  pushHistory();
                }}
                options={(
                  [
                    ["none", "None"],
                    ["cinematic", "Cinematic"],
                    ["dreamy", "Dreamy"],
                    ["vintage", "Vintage"],
                    ["sharp", "Sharp"],
                  ] as [PostProcessPreset, string][]
                ).map(([value, label]) => ({ value, label }))}
              />
            </div>
            {/* 개별 효과 (고급) — 하나라도 0이 아니면 프리셋 대신 이 조합으로 렌더 */}
            {(() => {
              const fx = env.effects ?? {};
              const setFx = (k: keyof NonNullable<EnvSchema["effects"]>, v: number) => updateEnvironment({ effects: { ...fx, [k]: v } });
              const rows: { k: keyof NonNullable<EnvSchema["effects"]>; label: string; min: number; max: number; step: number; def: number }[] = [
                { k: "ssao", label: "SSAO (구석 음영)", min: 0, max: 1, step: 0.02, def: 0 },
                { k: "bloom", label: "Bloom (빛번짐)", min: 0, max: 3, step: 0.05, def: 0 },
                { k: "dof", label: "DoF (초점 흐림)", min: 0, max: 1, step: 0.02, def: 0 },
                { k: "vignette", label: "Vignette (가장자리)", min: 0, max: 1, step: 0.02, def: 0 },
                { k: "brightness", label: "Brightness (밝기)", min: -0.5, max: 0.5, step: 0.01, def: 0 },
                { k: "contrast", label: "Contrast (대비)", min: -0.5, max: 0.5, step: 0.01, def: 0 },
                { k: "saturation", label: "Saturation (채도)", min: -1, max: 1, step: 0.02, def: 0 },
              ];
              return (
                <div className="pt-2 border-t border-border/60 space-y-1.5">
                  <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block">개별 효과 (고급)</span>
                  {rows.map(({ k, label, min, max, step, def }) => (
                    <LabeledNum
                      key={k}
                      label={label}
                      value={fx[k] ?? def}
                      onChange={(v) => setFx(k, v)}
                      onCommit={pushHistory}
                      min={min}
                      max={max}
                      precision={2}
                      dragStep={step}
                    />
                  ))}
                  <p className="text-[10px] text-muted/70">모두 0이면 위 Preset이 적용됩니다.</p>
                </div>
              );
            })()}
          </div>
        )}
      </GroupBox>

      {/* 게임 로직(게임 변수·전역 규칙·HUD)은 GNB 'Logic' 탭으로 이동 → panels/LogicPanel */}

      {/* 씬 메모 */}
      <GroupBox>
        <SectionHeader title="Memo" isOpen={notesOpen} onToggle={() => setNotesOpen((v) => !v)} />
        {notesOpen && (
          <div className="px-3 pb-4">
            <textarea
              value={env.notes ?? ""}
              onChange={(e) => updateEnvironment({ notes: e.target.value })}
              onBlur={pushHistory}
              placeholder="씬에 대한 메모를 입력하세요..."
              rows={4}
              className="w-full bg-muted/5 dark:bg-muted/10 border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-foreground placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        )}
      </GroupBox>
    </div>
  );
}
