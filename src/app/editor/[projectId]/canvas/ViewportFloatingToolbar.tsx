"use client";

import { useState, useRef, useEffect } from "react";
import {
  Move,
  RotateCcw,
  Maximize2,
  Globe,
  Crosshair,
  Box,
  Layers,
  Grid3x3,
  Sparkles,
  Disc,
  DoorClosed,
  DoorOpen,
  Coins,
  Bot,
  Cog,
  ArrowUpDown,
  RotateCw,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { Tooltip } from "@/components/ui/Tooltip";

const SEP = <div className="w-px h-4 bg-border/60 shrink-0" />;

// 완성형 프리셋(게임 재료) — id는 objectPresets.ts와 매칭
const PRESET_ITEMS: { id: string; label: string; icon: LucideIcon; node?: boolean; actuator?: boolean }[] = [
  { id: "wheel", label: "Wheel (rolling)", icon: Disc },
  { id: "door", label: "Door (E to open)", icon: DoorClosed },
  { id: "coin", label: "Coin (+1 score)", icon: Coins },
  { id: "robot_arm", label: "Robot Arm (multi-joint)", icon: Bot, node: true },
  { id: "hinged_door", label: "Hinged Door", icon: DoorOpen, node: true },
  { id: "elevator", label: "Elevator", icon: ArrowUpDown, node: true },
  { id: "revolving_door", label: "Revolving Door", icon: RotateCw, node: true },
  { id: "gears", label: "Gears", icon: Settings, node: true },
  { id: "actuator", label: "Motor (connect & rotate)", icon: Cog, actuator: true },
];

type Menu = "presets" | null;

export function ViewportFloatingToolbar() {
  const {
    transformMode,
    transformSpace,
    wireframeMode,
    gridPlane,
    cycleGridPlane,
    setTransformMode,
    setTransformSpace,
    toggleWireframe,
    beginPlacement,
    requestCameraView,
    requestFocusAll,
  } = useSceneStore();

  const [openMenu, setOpenMenu] = useState<Menu>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  const MODE_BTNS = [
    { mode: "translate" as const, icon: <Move size={16} />, title: "Move (W)" },
    { mode: "rotate" as const, icon: <RotateCcw size={16} />, title: "Rotate (E)" },
    { mode: "scale" as const, icon: <Maximize2 size={16} />, title: "Scale (R)" },
  ];

  return (
    <div ref={rootRef} className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-surface/95 backdrop-blur-sm border border-border/80 rounded-xs shadow-floating pointer-events-auto select-none">
        {/* Transform 모드 */}
        <div className="flex items-center bg-background/50 rounded-xs p-0.5 gap-0.5">
          {MODE_BTNS.map(({ mode, icon, title }) => (
            <Tooltip key={mode} content={title}>
              <button
                onClick={() => setTransformMode(mode)}
                className={`w-7 h-7 rounded-xs flex items-center justify-center transition-all ${
                  transformMode === mode
                    ? "bg-primary text-white shadow-md shadow-primary/30"
                    : "text-muted hover:text-foreground hover:bg-background"
                }`}
              >
                {icon}
              </button>
            </Tooltip>
          ))}
        </div>

        {/* 좌표계 */}
        <Tooltip content={transformSpace === "world" ? "World → Local" : "Local → World"}>
          <button
            onClick={() => setTransformSpace(transformSpace === "world" ? "local" : "world")}
            className="w-7 h-7 flex items-center justify-center rounded-xs text-muted hover:text-foreground hover:bg-background transition-all"
          >
            {transformSpace === "world" ? <Globe size={16} /> : <Crosshair size={16} />}
          </button>
        </Tooltip>

        {SEP}

        {/* 짓기 도구(스냅·도형 추가·펜툴·복셀)는 2026-07-29 브릭 전환으로 은퇴 —
            격자 조립이 "박스를 서로 맞추는" 문제 자체를 없앴다. 프리셋(모터 부품)은 남긴다. */}
        <div className="flex items-center gap-0">
          {/* 프리셋 — 완성형 게임 재료(바퀴/문/동전) */}
          <div className="relative flex items-center">
            <Tooltip content="Presets — ready-made game parts (wheel/door/coin)">
              <button
                onClick={() => setOpenMenu(openMenu === "presets" ? null : "presets")}
                className={`w-7 h-7 rounded-xs flex items-center justify-center transition-all ${
                  openMenu === "presets" ? "bg-primary text-white" : "text-muted hover:text-primary hover:bg-background"
                }`}
              >
                <Sparkles size={16} />
              </button>
            </Tooltip>
            {openMenu === "presets" && (
              <div className="absolute top-full left-0 mt-2 bg-surface border border-border rounded-xs shadow-dropdown z-50 p-1 min-w-[160px]">
                {PRESET_ITEMS.map(({ id, label, icon: Icon, node, actuator }) => (
                  <button
                    key={id}
                    onClick={() => {
                      if (actuator) beginPlacement({ kind: "actuator" });
                      else beginPlacement({ kind: node ? "nodePreset" : "preset", presetId: id });
                      setOpenMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xs text-[11px] text-foreground hover:bg-background transition-colors"
                  >
                    <Icon size={16} className="text-foreground" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {SEP}

        {/* 와이어프레임 */}
        <Tooltip content={wireframeMode ? "Solid mode" : "Wireframe"}>
          <button
            onClick={toggleWireframe}
            className={`w-7 h-7 rounded-xs flex items-center justify-center transition-all ${
              wireframeMode ? "bg-cyan-600 text-white shadow-md shadow-cyan-500/20" : "text-muted hover:text-foreground hover:bg-background"
            }`}
          >
            {wireframeMode ? <Layers size={16} /> : <Box size={16} />}
          </button>
        </Tooltip>

        {/* 시점 프리셋 — Top/Front/Side (정렬 확인·배치용) */}
        <div className="flex items-center bg-background/50 rounded-xs p-0.5 gap-0.5">
          {([['top', 'T', 'Top view (위에서 · 평행)'], ['front', 'F', 'Front view (앞에서 · 평행)'], ['right', 'S', 'Side view (옆에서 · 평행)']] as const).map(([view, label, tip]) => (
            <Tooltip key={view} content={tip}>
              <button
                onClick={() => requestCameraView(view)}
                className="w-7 h-7 rounded-xs flex items-center justify-center text-[11px] font-bold text-muted hover:text-foreground hover:bg-background transition-all"
              >
                {label}
              </button>
            </Tooltip>
          ))}
          <Tooltip content="3D view (원근 · 전체 맞춤)">
            <button
              onClick={() => requestFocusAll()}
              className="w-8 h-7 rounded-xs flex items-center justify-center text-[10px] font-bold text-muted hover:text-foreground hover:bg-background transition-all"
            >
              3D
            </button>
          </Tooltip>
        </div>

        {/* 기준 격자 평면 순환 (바닥 XZ → 벽 XY → 벽 YZ) */}
        <Tooltip content={`Grid plane: ${gridPlane.toUpperCase()} (click to switch)`}>
          <button
            onClick={cycleGridPlane}
            className="h-7 pl-1.5 pr-1.5 rounded-xs flex items-center gap-1 text-muted hover:text-foreground hover:bg-background transition-all"
          >
            <Grid3x3 size={16} />
            <span className="text-[9px] font-mono font-semibold">{gridPlane.toUpperCase()}</span>
          </button>
        </Tooltip>

        {/* 이전/다음(Undo/Redo) 버튼 숨김 — 주석 처리 (단축키 Ctrl+Z / Ctrl+Y 는 유지)
        {SEP}
        <div className="flex items-center bg-background/50 rounded-xs p-0.5 gap-0.5">
          <Tooltip content="Undo (Ctrl+Z)">
            <button
              onClick={undo}
              className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-foreground hover:bg-background transition-all"
            >
              <Undo2 size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Redo (Ctrl+Y)">
            <button
              onClick={redo}
              className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-foreground hover:bg-background transition-all"
            >
              <Redo2 size={16} />
            </button>
          </Tooltip>
        </div>
        */}

        {/* 카메라 북마크 버튼 숨김 — 주석 처리
        {SEP}
        <div className="relative">
          <Tooltip content="Camera bookmarks">
            <button
              onClick={() => setOpenMenu(openMenu === 'bookmark' ? null : 'bookmark')}
              className="h-7 pl-1.5 pr-1 rounded-xs flex items-center gap-0.5 text-muted hover:text-foreground hover:bg-background transition-all"
            >
              <Camera size={16} />
              <ChevronDown size={12} className={openMenu === 'bookmark' ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
          </Tooltip>
          {openMenu === 'bookmark' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-surface border border-border rounded-xs shadow-dropdown z-50 p-2 min-w-[170px]">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-1 mb-1.5">카메라 북마크</div>
              <div className="space-y-1">
                {[1, 2, 3, 4, 5].map((slot) => {
                  const saved = !!cameraBookmarks[slot];
                  return (
                    <div key={slot} className="flex items-center gap-1">
                      <button
                        onClick={() => { if (saved) { requestRecallBookmark(slot); setOpenMenu(null); } }}
                        disabled={!saved}
                        className={`flex-1 flex items-center gap-2 h-7 px-2 rounded-xs text-[11px] transition-all ${
                          saved ? 'text-foreground hover:bg-primary hover:text-white' : 'text-muted/40 cursor-not-allowed'
                        }`}
                      >
                        <Camera size={14} /> 뷰 {slot} {saved ? '' : '(비어 있음)'}
                      </button>
                      <Tooltip content={saved ? '현재 뷰로 재저장' : '현재 뷰 저장'}>
                        <button
                          onClick={() => requestSaveBookmark(slot)}
                          className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-foreground hover:bg-background transition-all"
                        >
                          <Save size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        */}

      </div>
    </div>
  );
}
