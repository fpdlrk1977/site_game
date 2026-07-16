'use client';

// 경계 다각형 편집기 — 펜툴 패턴 기반. 위에서 내려다본(top-down) 씬 풋프린트(오브젝트 사각형)를
//   배경으로 깔고, 그 위에 꼭짓점을 찍어 닫힌 다각형 경계를 그린다. 좌표는 월드 XZ에 매핑.
import { useState, useEffect, useRef } from 'react';
import { Spline, X } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { worldBBox } from '@/lib/objectBBox';

const SIZE = 460;
const CENTER = SIZE / 2;
type Pt = { x: number; y: number };

export function BoundaryShapeModal() {
  const open = useSceneStore((s) => s.boundaryShapeOpen);
  const setOpen = useSceneStore((s) => s.setBoundaryShapeOpen);
  const updateEnvironment = useSceneStore((s) => s.updateEnvironment);
  const pushHistory = useSceneStore((s) => s.pushHistory);
  const { addToast } = useToast();

  const [points, setPoints] = useState<Pt[]>([]);
  const [closed, setClosed] = useState(false);
  const [snap, setSnap] = useState(true);
  const [hover, setHover] = useState<Pt | null>(null);
  const [scale, setScale] = useState(15);        // px per world-unit (열 때 씬에 맞춰 계산)
  const [footprints, setFootprints] = useState<{ x: number; y: number; w: number; h: number; name: string }[]>([]);
  const [spawn, setSpawn] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ idx: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const closedRef = useRef(closed);
  useEffect(() => { closedRef.current = closed; }, [closed]);
  const SNAP = 14;

  // 패널 드래그(헤더) — overlay 없이 씬 위에 뜬 작업 팝업.
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

  const undoStep = () => { if (closedRef.current) setClosed(false); else setPoints((p) => p.slice(0, -1)); };

  // 열 때: 씬 범위에 맞춰 스케일 계산 + 오브젝트 풋프린트/스폰 수집 + 기존 다각형 로드.
  useEffect(() => {
    if (!open) return;
    const { objects, assets, environment } = useSceneStore.getState();
    let ext = Math.max(environment.boundary ?? 0, 6);
    const fps: { x: number; y: number; w: number; h: number; name: string }[] = [];
    const raw: { minx: number; minz: number; maxx: number; maxz: number; name: string }[] = [];
    for (const o of objects) {
      if (o.parentId) continue; // 루트만
      const bb = worldBBox(objects, assets, o.id);
      if (!bb || bb.isEmpty()) continue;
      ext = Math.max(ext, Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z));
      raw.push({ minx: bb.min.x, minz: bb.min.z, maxx: bb.max.x, maxz: bb.max.z, name: o.name });
    }
    const poly = environment.boundaryPolygon;
    if (poly) for (const p of poly) ext = Math.max(ext, Math.abs(p.x), Math.abs(p.z));
    const sp = environment.playerStartPosition;
    if (sp) ext = Math.max(ext, Math.abs(sp.x), Math.abs(sp.z));
    const view = Math.max(ext * 1.25, 6);
    const sc = CENTER / view;
    setScale(sc);
    setFootprints(raw.map((r) => ({
      x: CENTER + r.minx * sc, y: CENTER + r.minz * sc,
      w: (r.maxx - r.minx) * sc, h: (r.maxz - r.minz) * sc, name: r.name,
    })));
    setSpawn(sp ? { x: CENTER + sp.x * sc, y: CENTER + sp.z * sc } : null);
    if (environment.boundaryShape === 'polygon' && poly && poly.length >= 3) {
      setPoints(poly.map((p) => ({ x: CENTER + p.x * sc, y: CENTER + p.z * sc })));
      setClosed(true);
    } else {
      setPoints([]); setClosed(false);
    }
    setHover(null); setPanelPos(null);
  }, [open]);

  // Ctrl+Z(점 취소)·Delete(마지막)·Esc — 전역 에디터 단축키보다 먼저 가로챈다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undoStep(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const svgXY = (e: React.MouseEvent): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE };
  };
  // 스냅 — 월드 1m 격자에 붙임.
  const snapPt = (p: Pt): Pt => {
    if (!snap) return p;
    const wx = Math.round((p.x - CENTER) / scale);
    const wz = Math.round((p.y - CENTER) / scale);
    return { x: CENTER + wx * scale, y: CENTER + wz * scale };
  };
  const nearFirst = (p: Pt) => points.length >= 2 && Math.hypot(p.x - points[0].x, p.y - points[0].y) < SNAP;

  const onSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = svgXY(e);
    if (closed) return;              // 닫힌 뒤엔 점 드래그만
    if (nearFirst(p)) { setClosed(true); return; }
    setPoints((prev) => [...prev, snapPt(p)]);
  };
  const onPointDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (idx === 0 && !closed && points.length >= 3) { setClosed(true); return; } // 첫 점 = 닫기
    dragRef.current = { idx, moved: false };
  };
  const onSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = svgXY(e);
    setHover(p);
    const d = dragRef.current;
    if (!d) return;
    d.moved = true;
    const np = snapPt(p);
    setPoints((prev) => prev.map((pt, i) => (i === d.idx ? np : pt)));
  };
  const onSvgUp = () => { dragRef.current = null; };

  const apply = () => {
    if (points.length < 3) { addToast('점 3개 이상 찍어 다각형을 그려주세요.', 'error'); return; }
    if (!closed) { addToast('첫 점을 클릭해 경로를 닫아주세요.', 'error'); return; }
    const poly = points.map((p) => ({ x: +((p.x - CENTER) / scale).toFixed(3), z: +((p.y - CENTER) / scale).toFixed(3) }));
    const radius = Math.max(1, ...poly.map((p) => Math.hypot(p.x, p.z)));
    updateEnvironment({ boundaryShape: 'polygon', boundaryPolygon: poly, boundary: Math.ceil(radius) });
    pushHistory();
    addToast(`경계 다각형 적용 (${poly.length}점)`, 'success');
    setOpen(false);
  };

  const polyStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const closedStr = closed && points.length > 2 ? `${polyStr} ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}` : polyStr;
  const showSnapRing = !closed && hover !== null && nearFirst(hover);

  // 월드 격자 — 스케일에 맞춰 간격 자동(화면에서 ~28px 이상 되게).
  let gw = 1; while (gw * scale < 28) gw *= gw < 5 ? 5 : 2;
  const gridLines: React.ReactNode[] = [];
  for (let w = -Math.ceil(CENTER / scale / gw) * gw; ; w += gw) {
    const px = CENTER + w * scale;
    if (px > SIZE) break;
    if (px < 0) continue;
    const axis = Math.abs(w) < 1e-6;
    gridLines.push(<line key={`gx${w}`} x1={px} y1={0} x2={px} y2={SIZE} stroke={axis ? '#8899aa' : '#3f3f46'} strokeWidth={axis ? 1 : 0.5} opacity={axis ? 0.5 : 0.12} />);
    gridLines.push(<line key={`gy${w}`} x1={0} y1={px} x2={SIZE} y2={px} stroke={axis ? '#8899aa' : '#3f3f46'} strokeWidth={axis ? 1 : 0.5} opacity={axis ? 0.5 : 0.12} />);
  }

  return (
    <>
      <div
        ref={panelRef}
        className="fixed z-50 bg-surface border border-border rounded-sm shadow-2xl p-4 w-[520px] max-w-[95vw]"
        style={panelPos ? { left: panelPos.x, top: panelPos.y } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div className="flex items-center justify-between mb-2.5 cursor-move select-none" onMouseDown={onHeaderDown}>
          <span className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Spline size={14} /> 경계 모양 — 위에서 그리기</span>
          <div className="flex items-center gap-2">
            <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setSnap((v) => !v)}
              className={`px-2 py-0.5 rounded-xs text-[10px] transition-colors ${snap ? 'bg-primary text-white' : 'bg-background text-muted hover:text-foreground'}`}>스냅</button>
            <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)} className="text-muted hover:text-foreground px-1 cursor-pointer"><X size={15} /></button>
          </div>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          onMouseDown={onSvgDown}
          onMouseMove={onSvgMove}
          onMouseUp={onSvgUp}
          onMouseLeave={onSvgUp}
          className="w-full rounded-xs bg-background border border-border cursor-crosshair select-none"
          style={{ aspectRatio: '1 / 1' }}
        >
          {gridLines}
          {/* 씬 오브젝트 풋프린트(위에서 본 사각형) */}
          {footprints.map((f, i) => (
            <rect key={`fp${i}`} x={f.x} y={f.y} width={Math.max(2, f.w)} height={Math.max(2, f.h)}
              fill="#60a5fa" fillOpacity={0.14} stroke="#60a5fa" strokeOpacity={0.4} strokeWidth={1} rx={2} />
          ))}
          {/* 스폰 지점 */}
          {spawn && (
            <g>
              <circle cx={spawn.x} cy={spawn.y} r={5} fill="#22c55e" stroke="#fff" strokeWidth={1.2} />
              <text x={spawn.x + 8} y={spawn.y + 3} fontSize={9} fill="#22c55e">시작</text>
            </g>
          )}
          {/* 다각형 미리보기 */}
          {points.length > 1 && (
            <polyline points={closedStr} fill={closed ? 'rgba(245,158,11,0.14)' : 'none'} stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round" />
          )}
          {showSnapRing && points.length > 0 && (
            <circle cx={points[0].x} cy={points[0].y} r={SNAP} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" />
          )}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 5.5 : 4.5}
              fill={i === 0 ? '#d97706' : '#f59e0b'} stroke="#fff" strokeWidth={1.2}
              className="cursor-grab" onMouseDown={(e) => onPointDown(e, i)} />
          ))}
        </svg>

        <p className="text-[10px] text-muted/70 mt-1.5 leading-relaxed">
          파란 사각형 = 오브젝트(위에서 본 위치), 초록 점 = 시작 지점. 점을 찍어 경계를 그리고 <b>첫 점(진한 주황)</b>을 다시 클릭해 닫으세요(3점+). 점 드래그로 조정, <b>Ctrl+Z</b>=점 취소, 스냅=1m 격자.
        </p>

        <div className="flex gap-1.5 mt-3">
          <button onClick={undoStep} disabled={points.length === 0}
            className="flex-1 py-1.5 rounded-xs bg-background text-muted hover:text-foreground text-[11px] transition-colors disabled:opacity-40">{closed ? '닫기 취소' : '점 취소'} (Ctrl+Z)</button>
          <button onClick={() => { setPoints([]); setClosed(false); }} disabled={points.length === 0}
            className="flex-1 py-1.5 rounded-xs bg-background text-muted hover:text-foreground text-[11px] transition-colors disabled:opacity-40">전체 지우기</button>
          <button onClick={apply}
            className="flex-1 py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors">적용 ({points.length})</button>
        </div>
      </div>

      {dragging && (
        <div className="fixed inset-0 z-[60] cursor-move" onMouseMove={onDragMove} onMouseUp={endDrag} onMouseLeave={endDrag} />
      )}
    </>
  );
}
