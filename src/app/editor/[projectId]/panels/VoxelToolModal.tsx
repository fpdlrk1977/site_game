'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Boxes, X, Plus, Minus } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { useToast } from '@/hooks/useToast';
import { persistCurrentScene } from '@/lib/saveScene';
import { uploadGlbBlob } from '@/lib/uploadAsset';
import { buildVoxelGlb, type Voxel } from '@/lib/voxelModel';

const SIZE = 340;                       // 2D 페인터 픽셀(고정) — 칸 크기는 그리드 수에 맞춰 자동 조정
const GRID_SIZES = [8, 16, 24, 32];     // 사용자가 고를 수 있는 그리드 한 변(칸 수)

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
  const projectId = useSceneStore((s) => s.projectId);
  const addAsset = useSceneStore((s) => s.addAsset);
  const addAssetObject = useSceneStore((s) => s.addAssetObject);
  const { addToast } = useToast();

  const [voxels, setVoxels] = useState<Record<string, string>>({});
  const [color, setColor] = useState('#22c55e');
  const [layer, setLayer] = useState(0);      // 현재 Y 레이어
  const [busy, setBusy] = useState(false);
  const [gridN, setGridN] = useState(16);     // 그리드 한 변(칸 수) — 사용자 선택
  const CELL = SIZE / gridN;                  // 칸 픽셀(그리드 수에 맞춰 자동)
  const paintMode = useRef<'paint' | 'erase' | null>(null); // 드래그 중 동작(좌=칠하기, 우=지우기)

  // 그리드 크기 변경 — 줄이면 범위 밖 복셀은 버린다
  const changeGrid = (n: number) => {
    setGridN(n);
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

  useEffect(() => {
    if (open) { setVoxels({}); setLayer(0); setGridN(16); setPanelPos(null); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, setOpen]);

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

  // 아래층(y=layer-1)을 현재층에 그대로 복사 — 똑같이 쌓기(기둥·벽) 한 번에
  const copyBelow = () => {
    if (layer === 0) return;
    setVoxels((prev) => {
      const next = { ...prev };
      for (const [k, c] of Object.entries(prev)) {
        const [x, y, z] = k.split(',').map(Number);
        if (y === layer - 1) next[key(x, layer, z)] = c;
      }
      return next;
    });
  };

  const count = Object.keys(voxels).length;

  const create = async () => {
    if (count === 0) { addToast('큐브를 하나 이상 배치하세요.', 'error'); return; }
    if (!projectId) return;
    setBusy(true);
    try {
      const vox: Voxel[] = Object.entries(voxels).map(([k, c]) => {
        const [x, y, z] = k.split(',').map(Number);
        return { x, y, z, color: c };
      });
      const baked = await buildVoxelGlb(vox);
      if (!baked) { addToast('생성 실패', 'error'); return; }
      const asset = await uploadGlbBlob(baked.blob, '복셀 모델', projectId, 'model');
      addAsset(asset);
      addAssetObject(asset);
      const result = await persistCurrentScene();
      if (result.status === 'conflict') addToast('만들었지만 다른 탭·기기에서 씬이 먼저 저장돼 반영하지 못했어요. 새로고침 후 다시 시도해 주세요.', 'error');
      else addToast(`복셀 모델 생성 (${baked.count}칸)`, 'success');
      setOpen(false);
    } catch (err) {
      addToast(`복셀 생성 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, 'error');
    } finally {
      setBusy(false);
    }
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
        className="fixed z-50 bg-surface border border-border rounded-2xl shadow-2xl p-4 w-[720px] max-w-[95vw]"
        style={panelPos ? { left: panelPos.x, top: panelPos.y } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div className="flex items-center justify-between mb-2.5 cursor-move select-none" onMouseDown={onHeaderDown}>
          <span className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Boxes size={14} /> 복셀 — 큐브를 쌓아 만들기</span>
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
          <button onClick={() => setLayer((l) => Math.max(0, l - 1))} className="w-6 h-6 rounded-xs bg-background text-muted hover:text-foreground flex items-center justify-center"><Minus size={13} /></button>
          <span className="text-[11px] font-mono text-foreground w-5 text-center">{layer}</span>
          <button onClick={() => setLayer((l) => l + 1)} className="w-6 h-6 rounded-xs bg-background text-muted hover:text-foreground flex items-center justify-center"><Plus size={13} /></button>
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
          <div className="flex-1" />
          <button onClick={() => { setVoxels({}); setLayer(0); }} className="px-2 py-1 rounded-xs bg-background text-muted hover:text-foreground text-[11px]">전체 지우기</button>
        </div>

        <div className="flex gap-3">
          {/* 2D 그리드 페인터(현재 레이어) */}
          <div className="shrink-0">
            <svg
              width={SIZE} height={SIZE}
              className="rounded-xs border border-border bg-background touch-none select-none text-foreground"
              onMouseLeave={() => { paintMode.current = null; }}
              onMouseUp={() => { paintMode.current = null; }}
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
              {/* 히트 영역(투명) — 클릭·드래그 페인팅 */}
              {Array.from({ length: gridN }).map((_, gx) =>
                Array.from({ length: gridN }).map((_, gz) => (
                  <rect
                    key={`h${gx}-${gz}`}
                    x={gx * CELL} y={gz * CELL} width={CELL} height={CELL}
                    fill="transparent"
                    onMouseDown={(e) => { e.preventDefault(); const m = e.button === 2 ? 'erase' : 'paint'; paintMode.current = m; paintCell(gx, gz, m); }}
                    onMouseEnter={() => { if (paintMode.current) paintCell(gx, gz, paintMode.current); }}
                  />
                )),
              )}
            </svg>
            <p className="text-[10px] text-muted/70 mt-1 text-center">좌클릭 칠하기 · 우클릭 지우기 · 점선=아래층(위에 쌓으면 정렬)</p>
          </div>

          {/* 3D 미리보기 */}
          <div className="flex-1 rounded-xs border border-border overflow-hidden bg-background" style={{ height: SIZE }}>
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
            큐브를 쌓아 도트 감성 3D 모델을 만들어요. 완성하면 하나의 GLB 에셋으로 구워져 씬에 배치됩니다.
          </p>
          <button onClick={create} disabled={busy || count === 0}
            className="px-4 py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? '만드는 중…' : `만들기 (${count})`}
          </button>
        </div>
      </div>

      {dragging && (
        <div className="fixed inset-0 z-[60] cursor-move" onMouseMove={onDragMove} onMouseUp={endDrag} onMouseLeave={endDrag} />
      )}
    </>
  );
}
