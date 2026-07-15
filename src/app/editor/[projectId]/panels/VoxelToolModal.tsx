'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Boxes, X, Plus, Minus } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { useToast } from '@/hooks/useToast';
import type { Voxel } from '@/lib/voxelGeometry';

const SIZE = 340;                       // 2D 페인터 픽셀(고정) — 칸 크기는 그리드 수에 맞춰 자동 조정
const GRID_SIZES = [8, 16, 24, 32, 48, 64]; // 사용자가 고를 수 있는 그리드 한 변(칸 수)
const CELL_SIZES = [1, 0.5, 0.25];      // 한 칸의 로컬 크기(미터) — 작을수록 같은 발판에서 더 촘촘(고해상도)

const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#94a3b8', '#1f2937', '#000000'];

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

// 복셀 3D 미리보기 — 개별 큐브 메쉬(수백 개까지 무난). 그리드 중심(gridN/2) 고정 + 바닥 y=0.
// (bbox 중심으로 옮기면 블록 추가 때마다 모델이 움직여 헷갈림 → 그리드 기준 고정)
function VoxelPreview({ voxels, layer, gridN }: { voxels: Record<string, string>; layer: number; gridN: number }) {
  const half = gridN / 2;
  const items = useMemo(() => Object.entries(voxels).map(([k, color]) => {
    const [x, y, z] = k.split(',').map(Number);
    return { x, y, z, color };
  }), [voxels]);
  return (
    <group>
      {items.map((v) => (
        <mesh key={`${v.x},${v.y},${v.z}`} position={[v.x + 0.5 - half, v.y + 0.5, v.z + 0.5 - half]} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={v.color} roughness={0.75} metalness={0} />
        </mesh>
      ))}
      {/* 현재 편집 층 표시 — 지금 칠하는 높이(Y)의 바닥면을 반투명 판으로 */}
      <mesh position={[0, layer + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[gridN, gridN]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function VoxelToolModal() {
  const open = useSceneStore((s) => s.voxelToolOpen);
  const setOpen = useSceneStore((s) => s.setVoxelToolOpen);
  const addVoxelObject = useSceneStore((s) => s.addVoxelObject);
  const updateVoxelObject = useSceneStore((s) => s.updateVoxelObject);
  const editId = useSceneStore((s) => s.voxelEditId); // null=새로 만들기, 아니면 그 오브젝트 재편집
  const { addToast } = useToast();

  const [voxels, setVoxels] = useState<Record<string, string>>({});
  const [color, setColor] = useState('#22c55e');
  const [layer, setLayer] = useState(0);      // 현재 Y 레이어
  const [gridN, setGridN] = useState(16);     // 그리드 한 변(칸 수) — 사용자 선택
  const [cellSize, setCellSize] = useState(1); // 한 칸의 로컬 크기(미터) — 고해상도용
  const CELL = SIZE / gridN;                  // 칸 픽셀(그리드 수에 맞춰 자동)
  const paintMode = useRef<'paint' | 'erase' | null>(null); // 드래그 중 동작(좌=칠하기, 우=지우기)

  // ── 2D 페인터 확대/이동(viewBox) ── 휠=확대(커서 기준) · Space/가운데버튼 드래그=이동 ──
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: SIZE, h: SIZE }); // 보이는 영역(base 좌표)
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const [spaceHeld, setSpaceHeld] = useState(false); // Space 눌림(커서 표시용)
  const spaceRef = useRef(false);
  const panRef = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const resetView = () => setView({ x: 0, y: 0, w: SIZE, h: SIZE });
  // 화면 클릭 좌표(clientX/Y) → 그리드 칸 번호. viewBox(확대/이동)를 반영해 환산.
  const clientToCell = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { gx: -1, gz: -1 };
    const bx = view.x + ((clientX - r.left) / r.width) * view.w;
    const bz = view.y + ((clientY - r.top) / r.height) * view.h;
    return { gx: Math.floor(bx / CELL), gz: Math.floor(bz / CELL) };
  };

  // ── 로컬 undo/redo (모달 전용) — Ctrl+Z가 에디터가 아니라 여기서 먹게 ──
  const voxelsRef = useRef(voxels);           // 최신 voxels 미러(스냅샷용)
  useEffect(() => { voxelsRef.current = voxels; }, [voxels]);
  const undoRef = useRef<Record<string, string>[]>([]);
  const redoRef = useRef<Record<string, string>[]>([]);
  const lastCellRef = useRef<{ x: number; z: number } | null>(null); // shift 직선용 마지막 찍은 칸
  const pushUndo = () => { undoRef.current.push({ ...voxelsRef.current }); if (undoRef.current.length > 200) undoRef.current.shift(); redoRef.current = []; };
  const doUndo = () => { const p = undoRef.current.pop(); if (p === undefined) return; redoRef.current.push({ ...voxelsRef.current }); setVoxels(p); lastCellRef.current = null; };
  const doRedo = () => { const n = redoRef.current.pop(); if (n === undefined) return; undoRef.current.push({ ...voxelsRef.current }); setVoxels(n); lastCellRef.current = null; };

  // 그리드 크기 변경 — 줄이면 범위 밖 복셀은 버린다
  const changeGrid = (n: number) => {
    pushUndo();
    setGridN(n);
    resetView();
    setVoxels((prev) => {
      const next: Record<string, string> = {};
      for (const [k, c] of Object.entries(prev)) {
        const [x, , z] = k.split(',').map(Number);
        if (x < n && z < n) next[k] = c;
      }
      return next;
    });
  };

  // 패널 드래그(헤더) — overlay 없이 씬 위에 뜨는 작업 팝업
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelDrag = useRef<{ ox: number; oy: number } | null>(null);
  const onHeaderDown = (e: React.MouseEvent) => {
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    panelDrag.current = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    setPanelPos({ x: r.left, y: r.top });
    setDragging(true);
  };
  const onDragMove = (e: React.MouseEvent) => {
    if (!panelDrag.current) return;
    setPanelPos({ x: e.clientX - panelDrag.current.ox, y: e.clientY - panelDrag.current.oy });
  };
  const endDrag = () => { panelDrag.current = null; setDragging(false); };

  // 열 때: 재편집이면 저장된 복셀 로드, 아니면 빈 상태로 초기화.
  useEffect(() => {
    if (!open) return;
    const { voxelEditId, objects } = useSceneStore.getState();
    const eobj = voxelEditId ? objects.find((o) => o.id === voxelEditId) : null;
    const evox = eobj?.geom?.voxels;
    if (evox && evox.length) {
      const dict: Record<string, string> = {};
      let maxCoord = 0;
      for (const v of evox) { dict[key(v.x, v.y, v.z)] = v.color; maxCoord = Math.max(maxCoord, v.x, v.z); }
      const g = GRID_SIZES.find((n) => maxCoord < n) ?? GRID_SIZES[GRID_SIZES.length - 1]; // 좌표가 다 들어가는 최소 그리드
      setVoxels(dict); setGridN(g); setCellSize(eobj?.geom?.cellSize ?? 1); setLayer(0); setPanelPos(null);
    } else {
      setVoxels({}); setLayer(0); setGridN(16); setCellSize(1); setPanelPos(null);
    }
    resetView();
    undoRef.current = []; redoRef.current = []; lastCellRef.current = null; // 히스토리 초기화
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // 캡처 단계에서 처리 → Ctrl+Z가 window 버블 단계의 에디터 undo로 새는 것을 막음.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
      if (e.key === ' ') { if (!spaceRef.current) { spaceRef.current = true; setSpaceHeld(true); } e.preventDefault(); return; } // Space=이동 모드(버튼 활성/스크롤 방지)
      const ctrl = e.ctrlKey || e.metaKey;
      const z = e.key === 'z' || e.key === 'Z';
      if (ctrl && z && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); doUndo(); return; }
      if (ctrl && ((z && e.shiftKey) || e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); doRedo(); return; }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') { spaceRef.current = false; setSpaceHeld(false); } };
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => { window.removeEventListener('keydown', onKey, { capture: true }); window.removeEventListener('keyup', onKeyUp, { capture: true }); };
  }, [open, setOpen]);

  // 휠 확대(커서 기준) — React onWheel은 passive라 preventDefault가 안 먹어(페이지 스크롤됨) 네이티브 non-passive로 붙인다.
  useEffect(() => {
    if (!open) return;
    const el = svgRef.current;
    if (!el) return;
    const cellPx = SIZE / gridN;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const rx = (e.clientX - r.left) / r.width;   // 화면 내 비율 0~1
      const rz = (e.clientY - r.top) / r.height;
      const v = viewRef.current;
      const cx = v.x + rx * v.w;                    // 커서의 base 좌표(확대 고정점)
      const cz = v.y + rz * v.h;
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85; // 휠 위=확대
      const minW = Math.max(cellPx * 2, SIZE / 40);
      const nw = Math.min(SIZE, Math.max(minW, v.w * factor));
      const nh = nw;                                // 정사각 유지
      const nvx = Math.min(SIZE - nw, Math.max(0, cx - rx * nw)); // 그리드 밖 방지
      const nvz = Math.min(SIZE - nh, Math.max(0, cz - rz * nh));
      setView({ x: nvx, y: nvz, w: nw, h: nh });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, gridN]);

  if (!open) return null;

  const paintCell = (gx: number, gz: number, mode: 'paint' | 'erase') => {
    const k = key(gx, layer, gz);
    setVoxels((prev) => {
      const next = { ...prev };
      if (mode === 'erase') delete next[k];
      else next[k] = color;
      return next;
    });
  };

  // 여러 칸 일괄 적용(직선 라인용) — 한 번의 setVoxels로 배치.
  const applyCells = (cells: { x: number; z: number }[], mode: 'paint' | 'erase') => {
    setVoxels((prev) => {
      const next = { ...prev };
      for (const c of cells) {
        if (c.x < 0 || c.z < 0 || c.x >= gridN || c.z >= gridN) continue;
        const k = key(c.x, layer, c.z);
        if (mode === 'erase') delete next[k]; else next[k] = color;
      }
      return next;
    });
  };
  // 두 칸 사이 직선 경로의 칸들(Bresenham) — shift+클릭 일괄 채우기.
  const lineCells = (x0: number, z0: number, x1: number, z1: number) => {
    const cells: { x: number; z: number }[] = [];
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz, x = x0, z = z0;
    for (;;) {
      cells.push({ x, z });
      if (x === x1 && z === z1) break;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x += sx; }
      if (e2 < dx) { err += dx; z += sz; }
    }
    return cells;
  };
  // 배치된 모든 복셀을 현재 색으로 일괄 재채색(재편집 시 색만 바꾸고 싶을 때).
  const recolorAll = () => {
    if (Object.keys(voxelsRef.current).length === 0) return;
    pushUndo();
    setVoxels((prev) => { const n: Record<string, string> = {}; for (const k of Object.keys(prev)) n[k] = color; return n; });
  };

  // 아래층(y=layer-1)을 현재층에 그대로 복사 — 똑같이 쌓기(기둥·벽) 한 번에
  const copyBelow = () => {
    if (layer === 0) return;
    pushUndo();
    setVoxels((prev) => {
      const next = { ...prev };
      for (const [k, c] of Object.entries(prev)) {
        const [x, y, z] = k.split(',').map(Number);
        if (y === layer - 1) next[key(x, layer, z)] = c;
      }
      return next;
    });
  };

  const onSvgDown = (e: React.MouseEvent) => {
    // 이동(pan): 가운데버튼 또는 Space+드래그
    if (e.button === 1 || spaceRef.current) {
      e.preventDefault();
      panRef.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const { gx, gz } = clientToCell(e.clientX, e.clientY);
    if (gx < 0 || gz < 0 || gx >= gridN || gz >= gridN) return;
    const m: 'paint' | 'erase' = e.button === 2 ? 'erase' : 'paint';
    pushUndo();
    if (e.shiftKey && lastCellRef.current) {
      applyCells(lineCells(lastCellRef.current.x, lastCellRef.current.z, gx, gz), m);
      paintMode.current = null; // 라인은 원샷
    } else {
      paintMode.current = m;
      paintCell(gx, gz, m);
    }
    lastCellRef.current = { x: gx, z: gz };
  };
  const onSvgMove = (e: React.MouseEvent) => {
    if (panRef.current) {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return;
      const dx = ((e.clientX - panRef.current.px) / r.width) * view.w;
      const dz = ((e.clientY - panRef.current.py) / r.height) * view.h;
      const nvx = Math.min(SIZE - view.w, Math.max(0, panRef.current.vx - dx));
      const nvz = Math.min(SIZE - view.h, Math.max(0, panRef.current.vy - dz));
      setView((v) => ({ ...v, x: nvx, y: nvz }));
      return;
    }
    if (paintMode.current) {
      const { gx, gz } = clientToCell(e.clientX, e.clientY);
      if (gx < 0 || gz < 0 || gx >= gridN || gz >= gridN) return;
      paintCell(gx, gz, paintMode.current);
      lastCellRef.current = { x: gx, z: gz };
    }
  };
  const onSvgUp = () => { paintMode.current = null; panRef.current = null; };

  const count = Object.keys(voxels).length;

  // B안: GLB 굽기·업로드 없이 live 프리미티브(primitiveShape 'voxel')로 생성/재편집.
  const create = () => {
    if (count === 0) { addToast('큐브를 하나 이상 배치하세요.', 'error'); return; }
    const vox: Voxel[] = Object.entries(voxels).map(([k, c]) => {
      const [x, y, z] = k.split(',').map(Number);
      return { x, y, z, color: c };
    });
    if (editId) {
      updateVoxelObject(editId, vox, cellSize);
      addToast(`복셀 수정됨 (${vox.length}칸)`, 'success');
    } else {
      addVoxelObject(vox, cellSize);
      addToast(`복셀 생성 (${vox.length}칸)`, 'success');
    }
    setOpen(false);
  };

  // 쌓기 도우미 — 아래층 발자국(정렬 참고용)
  const belowAny = new Set<string>(); // 현재층보다 아래 어느 높이든 블록이 있는 (x,z)
  const below1 = new Set<string>();   // 바로 아래층(y=layer-1)의 (x,z)
  for (const k of Object.keys(voxels)) {
    const [x, y, z] = k.split(',').map(Number);
    if (y < layer) belowAny.add(`${x},${z}`);
    if (y === layer - 1) below1.add(`${x},${z}`);
  }

  return (
    <>
      <div
        ref={panelRef}
        className="fixed z-50 bg-surface border border-border rounded-sm shadow-2xl p-4 w-[740px] max-w-[95vw]"
        style={panelPos ? { left: panelPos.x, top: panelPos.y } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div className="flex items-center justify-between mb-2.5 cursor-move select-none" onMouseDown={onHeaderDown}>
          <span className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Boxes size={14} /> {editId ? '복셀 — 수정' : '복셀 — 큐브를 쌓아 만들기'}</span>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)} className="text-muted hover:text-foreground px-1 cursor-pointer"><X size={15} /></button>
        </div>

        {/* 컨트롤 */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {/* 색 — 커스텀 컬러픽커 + 프리셋 SelectBox(각 항목에 색 스와치) */}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border border-border" />
          <SelectBox
            value={color}
            onChange={(v) => setColor(v)}
            fullWidth={false}
            options={[
              ...(PALETTE.includes(color) ? [] : [{ value: color, label: color, icon: <span className="w-full h-full rounded-sm block" style={{ background: color }} /> }]),
              ...PALETTE.map((c) => ({ value: c, label: c, icon: <span className="w-full h-full rounded-sm block" style={{ background: c }} /> })),
            ]}
          />
          <div className="w-px h-5 bg-border/60" />
          {/* 레이어 */}
          <span className="text-[11px] text-muted">높이 Y</span>
          <button onClick={() => { lastCellRef.current = null; setLayer((l) => Math.max(0, l - 1)); }} className="w-6 h-6 rounded-xs bg-background text-muted hover:text-foreground flex items-center justify-center"><Minus size={13} /></button>
          <span className="text-[11px] font-mono text-foreground w-5 text-center">{layer}</span>
          <button onClick={() => { lastCellRef.current = null; setLayer((l) => l + 1); }} className="w-6 h-6 rounded-xs bg-background text-muted hover:text-foreground flex items-center justify-center"><Plus size={13} /></button>
          <button onClick={copyBelow} disabled={layer === 0 || below1.size === 0}
            className="px-2 py-1 rounded-xs bg-background text-muted hover:text-foreground text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
            title="바로 아래층을 현재층에 그대로 복사(기둥·벽 쌓기)">아래 복사</button>
          <div className="w-px h-5 bg-border/60" />
          {/* 그리드 크기 */}
          <span className="text-[11px] text-muted">크기</span>
          <SelectBox
            value={String(gridN)}
            onChange={(v) => changeGrid(Number(v))}
            options={GRID_SIZES.map((n) => ({ value: String(n), label: `${n}×${n}` }))}
            fullWidth={false}
          />
          {/* 셀 해상도 — 한 칸의 로컬 크기(작을수록 촘촘) */}
          <span className="text-[11px] text-muted" title="한 칸의 크기(m). 작을수록 같은 발판에서 더 촘촘한 고해상도 복셀.">해상도</span>
          <SelectBox
            value={String(cellSize)}
            onChange={(v) => setCellSize(Number(v))}
            options={CELL_SIZES.map((s) => ({ value: String(s), label: s === 1 ? '1 (기본)' : `${s} 칸` }))}
            fullWidth={false}
          />
          <div className="flex-1" />
          <button onClick={recolorAll} disabled={count === 0}
            className="px-2 py-1 rounded-xs bg-background text-muted hover:text-foreground text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
            title="배치된 모든 칸을 현재 색으로 다시 칠하기(색만 변경)">전체 채색</button>
          <button onClick={() => { pushUndo(); lastCellRef.current = null; setVoxels({}); setLayer(0); }} className="px-2 py-1 rounded-xs bg-background text-muted hover:text-foreground text-[11px]">전체 지우기</button>
        </div>

        <div className="flex gap-3">
          {/* 2D 그리드 페인터(현재 레이어) */}
          <div className="shrink-0" style={{ width: SIZE }}>
            <div className="rounded-xs border border-border overflow-hidden bg-background" style={{ width: SIZE, height: SIZE }}>
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              className="block w-full h-full touch-none select-none text-foreground"
              style={{ cursor: spaceHeld || panRef.current ? 'grab' : 'crosshair' }}
              onMouseDown={onSvgDown}
              onMouseMove={onSvgMove}
              onMouseLeave={onSvgUp}
              onMouseUp={onSvgUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* 아래 어느 층이든 블록이 있는 칸(발자국) — 옅은 음영 */}
              {[...belowAny].map((k) => {
                const [x, z] = k.split(',').map(Number);
                if (voxels[key(x, layer, z)]) return null;
                return <rect key={`ba${k}`} x={x * CELL} y={z * CELL} width={CELL} height={CELL} fill="currentColor" opacity={0.1} />;
              })}
              {/* 현재 레이어 셀(실제 색) */}
              {Object.entries(voxels).map(([k, c]) => {
                const [x, y, z] = k.split(',').map(Number);
                if (y !== layer) return null;
                return <rect key={k} x={x * CELL} y={z * CELL} width={CELL} height={CELL} fill={c} />;
              })}
              {/* 바로 아래층 외곽선 — 여기 위에 쌓으면 정렬됨 */}
              {[...below1].map((k) => {
                const [x, z] = k.split(',').map(Number);
                if (voxels[key(x, layer, z)]) return null;
                return <rect key={`b1${k}`} x={x * CELL + 1} y={z * CELL + 1} width={CELL - 2} height={CELL - 2} fill="none" stroke="#8b5cf6" strokeOpacity={0.6} strokeWidth={1.2} strokeDasharray="3 2" />;
              })}
              {/* 그리드 라인 — 매 칸 + 4칸마다 굵은 구분선 (배경보다 진한 전경색) */}
              {Array.from({ length: gridN + 1 }).map((_, i) => {
                const major = i % 4 === 0;
                const op = major ? 0.15 : 0.1;
                const w = major ? 1.3 : 1;
                return (
                  <g key={`line${i}`}>
                    <line x1={i * CELL} y1={0} x2={i * CELL} y2={SIZE} stroke="currentColor" strokeOpacity={op} strokeWidth={w} />
                    <line x1={0} y1={i * CELL} x2={SIZE} y2={i * CELL} stroke="currentColor" strokeOpacity={op} strokeWidth={w} />
                  </g>
                );
              })}
              {/* 클릭/드래그 페인팅은 svg 레벨 핸들러(onSvgDown/Move) + clientToCell이 담당 —
                  칸마다 투명 rect를 깔던 방식을 없애 고해상도(64칸)에서도 가볍고 확대/이동과 호환. */}
            </svg>
            </div>
            <p className="text-[10px] text-muted/70 mt-1 text-center">좌클릭 칠하기 · 우클릭 지우기 · Shift+클릭=직선 · 휠=확대 · Space/가운데버튼=이동 · Ctrl+Z 되돌리기</p>
          </div>

          {/* 3D 미리보기 — 2D 페인터와 동일한 정사각형(SIZE×SIZE) */}
          <div className="shrink-0 rounded-xs border border-border overflow-hidden bg-background" style={{ width: SIZE, height: SIZE }}>
            <Canvas shadows camera={{ position: [gridN * 0.85, gridN * 0.75, gridN * 0.85], fov: 45 }}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[10, 20, 10]} intensity={1.4} castShadow />
              {/* 무한 그리드 — 화면 끝까지 깔려 잘린 느낌 제거(멀리서 페이드) */}
              <Grid
                cellSize={1} cellThickness={0.6} cellColor="#334155"
                sectionSize={4} sectionThickness={1} sectionColor="#475569"
                infiniteGrid fadeDistance={gridN * 3} fadeStrength={1.5}
                position={[0, 0, 0]}
              />
              <VoxelPreview voxels={voxels} layer={layer} gridN={gridN} />
              <OrbitControls makeDefault enablePan={false} target={[0, gridN / 4, 0]} />
            </Canvas>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center gap-2 mt-3">
          <p className="flex-1 text-[10px] text-muted/70 leading-relaxed">
            큐브를 쌓아 도트 감성 3D 모델을 만들어요. 언제든 오브젝트 리스트에서 우클릭해 다시 수정할 수 있어요.
          </p>
          <button onClick={create} disabled={count === 0}
            className="px-4 py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {editId ? '수정 적용' : '만들기'} ({count})
          </button>
        </div>
      </div>

      {dragging && (
        <div className="fixed inset-0 z-[60] cursor-move" onMouseMove={onDragMove} onMouseUp={endDrag} onMouseLeave={endDrag} />
      )}
    </>
  );
}
