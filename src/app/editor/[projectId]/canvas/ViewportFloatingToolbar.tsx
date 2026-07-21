"use client";

import { useState, useRef, useEffect } from "react";
import {
  Move,
  RotateCcw,
  Maximize2,
  Globe,
  Crosshair,
  Magnet,
  Box,
  Layers,
  Undo2,
  Redo2,
  AlignCenter,
  Camera,
  Circle,
  Cylinder,
  Cone,
  Hexagon,
  Square,
  PenTool,
  Boxes,
  ChevronDown,
  Save,
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
  Donut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { Tooltip } from "@/components/ui/Tooltip";
import type { PrimitiveShape } from "@/types/scene";

const SEP = <div className="w-px h-4 bg-border/60 shrink-0" />;

const SHAPES: { shape: PrimitiveShape; label: string; icon: LucideIcon }[] = [
  { shape: "box", label: "Box", icon: Box },
  { shape: "sphere", label: "Sphere", icon: Circle },
  { shape: "cylinder", label: "Cylinder", icon: Cylinder },
  { shape: "frustum", label: "Frustum", icon: Cone },
  { shape: "loft", label: "Loft", icon: Hexagon },
  { shape: "plane", label: "Plane", icon: Square },
  { shape: "torus", label: "Torus", icon: Donut },
];

const SNAP_STEPS = [0.25, 0.5, 1, 2];

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

type Menu = "align" | "snap" | "bookmark" | "shapes" | "presets" | null;

export function ViewportFloatingToolbar() {
  const {
    transformMode,
    transformSpace,
    snapEnabled,
    snapTranslate,
    wireframeMode,
    selectedIds,
    cameraBookmarks,
    gridPlane,
    cycleGridPlane,
    objectSnap,
    toggleObjectSnap,
    setTransformMode,
    setTransformSpace,
    setSnap,
    toggleWireframe,
    beginPlacement,
    requestCameraView,
    requestFocusAll,
    undo,
    redo,
    alignSelected,
    requestSaveBookmark,
    requestRecallBookmark,
    setPenToolOpen,
    setVoxelToolOpen,
  } = useSceneStore();

  const [openMenu, setOpenMenu] = useState<Menu>(null);
  // 스플릿 버튼: 아이콘은 마지막에 고른 도형(기본 박스), 클릭 시 바로 그 도형 배치. 화살표는 목록 열기.
  const [selectedShape, setSelectedShape] = useState<PrimitiveShape>("box");
  const selectedShapeDef = SHAPES.find((s) => s.shape === selectedShape) ?? SHAPES[0];
  const rootRef = useRef<HTMLDivElement>(null);
  const canAlign = selectedIds.length >= 2;

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

        {/* 스냅 — 드롭다운 (아이콘 + 화살표) */}
        <div className="relative">
          <Tooltip content={snapEnabled ? `Snap on (${snapTranslate})` : "Snap off"}>
            <button
              onClick={() => setOpenMenu(openMenu === "snap" ? null : "snap")}
              className={`h-7 pl-1.5 pr-1 rounded-xs flex items-center gap-0.5 transition-all ${
                snapEnabled ? "bg-success text-white shadow-md shadow-success/30" : "text-muted hover:text-foreground hover:bg-background"
              }`}
            >
              <Magnet size={16} />
              <ChevronDown size={12} className={openMenu === "snap" ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
          </Tooltip>
          {openMenu === "snap" && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-surface border border-border rounded-xs shadow-dropdown z-50 p-2 min-w-[150px]">
              <button
                onClick={() => setSnap(!snapEnabled)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xs text-[11px] transition-all mb-1.5 ${
                  snapEnabled ? "bg-success/15 text-success" : "text-muted hover:bg-background"
                }`}
              >
                <Magnet size={16} /> {snapEnabled ? "Snap on" : "Snap off"}
              </button>
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-1 mb-1">간격</div>
              <div className="grid grid-cols-4 gap-1">
                {SNAP_STEPS.map((step) => (
                  <button
                    key={step}
                    onClick={() => setSnap(true, step)}
                    className={`h-7 rounded-xs text-[10px] font-mono transition-all ${
                      snapEnabled && snapTranslate === step ? "bg-primary text-white" : "text-muted hover:text-foreground hover:bg-background"
                    }`}
                  >
                    {step}
                  </button>
                ))}
              </div>
              {/* 오브젝트 스냅(자석) — 그리드 스냅과 독립 */}
              <button
                onClick={toggleObjectSnap}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xs text-[11px] transition-all mt-2 ${
                  objectSnap ? "bg-primary/15 text-primary" : "text-muted hover:bg-background"
                }`}
              >
                <Magnet size={16} /> Object snap {objectSnap ? "on" : "off"}
              </button>
              <p className="text-[9px] text-muted/50 px-1 mt-1 leading-snug">이동 시 다른 오브젝트의 모서리·중심에 자석처럼 붙어요.</p>
            </div>
          )}
        </div>

        {SEP}

        {/* 도형 추가 — 스플릿 버튼: 좌측 화살표=목록 열기 / 아이콘=선택된 도형 즉시 배치(기본 박스) */}
        <div className="flex items-center gap-0">
          <div className="relative flex items-center">
            {/* 아이콘: 현재 선택된 도형을 바로 추가 */}
            <Tooltip content={`${selectedShapeDef.label} 추가 (클릭 후 위치 지정)`}>
              <button
                onClick={() => beginPlacement({ kind: "shape", shape: selectedShape })}
                className="w-7 h-7 rounded-l-xs flex items-center justify-center text-muted hover:text-foreground hover:bg-background transition-all"
              >
                <selectedShapeDef.icon size={16} />
              </button>
            </Tooltip>
            {/* 화살표: 드롭다운 열기 (다른 드롭다운과 동일하게 우측) */}
            <button
              onClick={() => setOpenMenu(openMenu === "shapes" ? null : "shapes")}
              title="Shapes"
              className={`h-7 w-4 rounded-r-xs flex items-center justify-center transition-all ${
                openMenu === "shapes" ? "bg-primary text-white" : "text-muted hover:text-foreground hover:bg-background"
              }`}
            >
              <ChevronDown size={12} className={openMenu === "shapes" ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {openMenu === "shapes" && (
              <div className="absolute top-full left-0 mt-2 bg-surface border border-border rounded-xs shadow-dropdown z-50 p-1 min-w-[130px]">
                {SHAPES.map(({ shape, label, icon: Icon }) => (
                  <button
                    key={shape}
                    onClick={() => {
                      setSelectedShape(shape);
                      beginPlacement({ kind: "shape", shape });
                      setOpenMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xs text-[11px] transition-colors ${
                      shape === selectedShape ? "bg-primary/15 text-foreground" : "text-foreground hover:bg-background"
                    }`}
                  >
                    <Icon size={16} className="text-foreground" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Tooltip content="Pen tool — draw 2D to make 3D (extrude/lathe)">
            <button
              onClick={() => setPenToolOpen(true)}
              className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-primary hover:bg-background transition-all"
            >
              <PenTool size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Voxel — stack cubes to build">
            <button
              onClick={() => setVoxelToolOpen(true)}
              className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-primary hover:bg-background transition-all"
            >
              <Boxes size={16} />
            </button>
          </Tooltip>
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

        {SEP}

        {/* 정렬 */}
        <div className="relative">
          <Tooltip content={canAlign ? "Align" : "Select 2+"}>
            <button
              onClick={() => setOpenMenu(openMenu === "align" ? null : "align")}
              disabled={!canAlign}
              className={`w-7 h-7 rounded-xs flex items-center justify-center transition-all ${
                canAlign
                  ? openMenu === "align"
                    ? "bg-primary text-white"
                    : "text-muted hover:text-foreground hover:bg-background"
                  : "text-muted/30 cursor-not-allowed"
              }`}
            >
              <AlignCenter size={16} />
            </button>
          </Tooltip>
          {openMenu === "align" && canAlign && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-surface border border-border rounded-xs shadow-dropdown z-50 p-2 min-w-[160px]">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-1 mb-1.5">정렬</div>
              {[
                { axis: "x" as const, label: "X", min: "L", ctr: "C", max: "R" },
                { axis: "y" as const, label: "Y", min: "Btm", ctr: "Mid", max: "Top" },
                { axis: "z" as const, label: "Z", min: "Fr", ctr: "Mid", max: "Bk" },
              ].map(({ axis, label, min, ctr, max }) => (
                <div key={axis} className="flex items-center gap-1.5 py-0.5">
                  <span className="text-[10px] font-mono text-muted w-4 shrink-0">{label}</span>
                  <div className="flex items-center bg-background rounded-xs p-0.5 gap-0.5 flex-1">
                    {[
                      { mode: "min" as const, label: min },
                      { mode: "center" as const, label: ctr },
                      { mode: "max" as const, label: max },
                    ].map(({ mode, label: ml }) => (
                      <button
                        key={mode}
                        onClick={() => {
                          alignSelected(axis, mode);
                          setOpenMenu(null);
                        }}
                        className="flex-1 h-6 rounded text-[10px] font-medium text-muted hover:bg-primary hover:text-white transition-all"
                      >
                        {ml}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
