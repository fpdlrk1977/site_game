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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { Tooltip } from "@/components/ui/Tooltip";
import type { PrimitiveShape } from "@/types/scene";

const SEP = <div className="w-px h-4 bg-border/60 shrink-0" />;

const SHAPES: { shape: PrimitiveShape; label: string; icon: LucideIcon }[] = [
  { shape: "box", label: "박스", icon: Box },
  { shape: "sphere", label: "구체", icon: Circle },
  { shape: "cylinder", label: "원기둥", icon: Cylinder },
  { shape: "frustum", label: "각뿔대", icon: Cone },
  { shape: "loft", label: "로프트", icon: Hexagon },
  { shape: "plane", label: "평면", icon: Square },
];

const SNAP_STEPS = [0.25, 0.5, 1, 2];

// 완성형 프리셋(게임 재료) — id는 objectPresets.ts와 매칭
const PRESET_ITEMS: { id: string; label: string; icon: LucideIcon; node?: boolean; actuator?: boolean }[] = [
  { id: "wheel", label: "바퀴 (굴러가는)", icon: Disc },
  { id: "door", label: "문 (E로 열림)", icon: DoorClosed },
  { id: "coin", label: "동전 (점수 +1)", icon: Coins },
  { id: "robot_arm", label: "로봇팔 (다관절)", icon: Bot, node: true },
  { id: "hinged_door", label: "여닫이문 (경첩)", icon: DoorOpen, node: true },
  { id: "elevator", label: "엘리베이터 (오르내림)", icon: ArrowUpDown, node: true },
  { id: "revolving_door", label: "회전문", icon: RotateCw, node: true },
  { id: "gears", label: "기어 한 쌍", icon: Settings, node: true },
  { id: "actuator", label: "모터 (연결해서 돌리기)", icon: Cog, actuator: true },
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
    { mode: "translate" as const, icon: <Move size={13} />, title: "이동 (W)" },
    { mode: "rotate" as const, icon: <RotateCcw size={13} />, title: "회전 (E)" },
    { mode: "scale" as const, icon: <Maximize2 size={13} />, title: "스케일 (R)" },
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
        <Tooltip content={transformSpace === "world" ? "월드 → 로컬" : "로컬 → 월드"}>
          <button
            onClick={() => setTransformSpace(transformSpace === "world" ? "local" : "world")}
            className="w-7 h-7 flex items-center justify-center rounded-xs text-muted hover:text-foreground hover:bg-background transition-all"
          >
            {transformSpace === "world" ? <Globe size={13} /> : <Crosshair size={13} />}
          </button>
        </Tooltip>

        {SEP}

        {/* 스냅 — 드롭다운 (아이콘 + 화살표) */}
        <div className="relative">
          <Tooltip content={snapEnabled ? `스냅 켜짐 (${snapTranslate})` : "스냅 꺼짐"}>
            <button
              onClick={() => setOpenMenu(openMenu === "snap" ? null : "snap")}
              className={`h-7 pl-1.5 pr-1 rounded-xs flex items-center gap-0.5 transition-all ${
                snapEnabled ? "bg-success text-white shadow-md shadow-success/30" : "text-muted hover:text-foreground hover:bg-background"
              }`}
            >
              <Magnet size={13} />
              <ChevronDown size={11} className={openMenu === "snap" ? "rotate-180 transition-transform" : "transition-transform"} />
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
                <Magnet size={13} /> {snapEnabled ? "스냅 켜짐" : "스냅 꺼짐"}
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
                <Magnet size={13} /> 오브젝트 스냅 {objectSnap ? "켜짐" : "꺼짐"}
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
                <selectedShapeDef.icon size={14} />
              </button>
            </Tooltip>
            {/* 화살표: 드롭다운 열기 (다른 드롭다운과 동일하게 우측) */}
            <button
              onClick={() => setOpenMenu(openMenu === "shapes" ? null : "shapes")}
              title="도형 선택"
              className={`h-7 w-4 rounded-r-xs flex items-center justify-center transition-all ${
                openMenu === "shapes" ? "bg-primary text-white" : "text-muted hover:text-foreground hover:bg-background"
              }`}
            >
              <ChevronDown size={11} className={openMenu === "shapes" ? "rotate-180 transition-transform" : "transition-transform"} />
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
                    <Icon size={14} className="text-muted" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Tooltip content="펜 툴 — 2D 그려서 3D 만들기 (돌출·회전체)">
            <button
              onClick={() => setPenToolOpen(true)}
              className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-primary hover:bg-background transition-all"
            >
              <PenTool size={14} />
            </button>
          </Tooltip>
          <Tooltip content="복셀 — 큐브를 쌓아 만들기 (도트 감성)">
            <button
              onClick={() => setVoxelToolOpen(true)}
              className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-primary hover:bg-background transition-all"
            >
              <Boxes size={14} />
            </button>
          </Tooltip>
          {/* 프리셋 — 완성형 게임 재료(바퀴/문/동전) */}
          <div className="relative flex items-center">
            <Tooltip content="프리셋 — 완성형 게임 재료 (바퀴·문·동전)">
              <button
                onClick={() => setOpenMenu(openMenu === "presets" ? null : "presets")}
                className={`w-7 h-7 rounded-xs flex items-center justify-center transition-all ${
                  openMenu === "presets" ? "bg-primary text-white" : "text-muted hover:text-primary hover:bg-background"
                }`}
              >
                <Sparkles size={14} />
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
                    <Icon size={14} className="text-muted" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {SEP}

        {/* 와이어프레임 */}
        <Tooltip content={wireframeMode ? "솔리드 모드" : "와이어프레임"}>
          <button
            onClick={toggleWireframe}
            className={`w-7 h-7 rounded-xs flex items-center justify-center transition-all ${
              wireframeMode ? "bg-cyan-600 text-white shadow-md shadow-cyan-500/20" : "text-muted hover:text-foreground hover:bg-background"
            }`}
          >
            {wireframeMode ? <Layers size={13} /> : <Box size={13} />}
          </button>
        </Tooltip>

        {/* 기준 격자 평면 순환 (바닥 XZ → 벽 XY → 벽 YZ) */}
        <Tooltip content={`격자 평면: ${gridPlane.toUpperCase()} (클릭해 전환)`}>
          <button
            onClick={cycleGridPlane}
            className="h-7 pl-1.5 pr-1.5 rounded-xs flex items-center gap-1 text-muted hover:text-foreground hover:bg-background transition-all"
          >
            <Grid3x3 size={13} />
            <span className="text-[9px] font-mono font-semibold">{gridPlane.toUpperCase()}</span>
          </button>
        </Tooltip>

        {/* 이전/다음(Undo/Redo) 버튼 숨김 — 주석 처리 (단축키 Ctrl+Z / Ctrl+Y 는 유지)
        {SEP}
        <div className="flex items-center bg-background/50 rounded-xs p-0.5 gap-0.5">
          <Tooltip content="실행 취소 (Ctrl+Z)">
            <button
              onClick={undo}
              className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-foreground hover:bg-background transition-all"
            >
              <Undo2 size={13} />
            </button>
          </Tooltip>
          <Tooltip content="다시 실행 (Ctrl+Y)">
            <button
              onClick={redo}
              className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-foreground hover:bg-background transition-all"
            >
              <Redo2 size={13} />
            </button>
          </Tooltip>
        </div>
        */}

        {/* 카메라 북마크 버튼 숨김 — 주석 처리
        {SEP}
        <div className="relative">
          <Tooltip content="카메라 북마크">
            <button
              onClick={() => setOpenMenu(openMenu === 'bookmark' ? null : 'bookmark')}
              className="h-7 pl-1.5 pr-1 rounded-xs flex items-center gap-0.5 text-muted hover:text-foreground hover:bg-background transition-all"
            >
              <Camera size={13} />
              <ChevronDown size={11} className={openMenu === 'bookmark' ? 'rotate-180 transition-transform' : 'transition-transform'} />
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
                        <Camera size={12} /> 뷰 {slot} {saved ? '' : '(비어 있음)'}
                      </button>
                      <Tooltip content={saved ? '현재 뷰로 재저장' : '현재 뷰 저장'}>
                        <button
                          onClick={() => requestSaveBookmark(slot)}
                          className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-foreground hover:bg-background transition-all"
                        >
                          <Save size={12} />
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
          <Tooltip content={canAlign ? "정렬" : "2개 이상 선택"}>
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
              <AlignCenter size={13} />
            </button>
          </Tooltip>
          {openMenu === "align" && canAlign && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-surface border border-border rounded-xs shadow-dropdown z-50 p-2 min-w-[160px]">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-1 mb-1.5">정렬</div>
              {[
                { axis: "x" as const, label: "X", min: "좌", ctr: "중", max: "우" },
                { axis: "y" as const, label: "Y", min: "하", ctr: "중", max: "상" },
                { axis: "z" as const, label: "Z", min: "전", ctr: "중", max: "후" },
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
