'use client';

// 펜 툴 — 2D 프로파일을 그려서 3D(돌출/회전체) 오브젝트로 만든다.
//  · 돌출(Extrude): 닫힌 단면을 두께만큼 밀어 세운 기둥(별 기둥 등)
//  · 회전체(Lathe): 반쪽 단면을 Y축 기준 360° 회전(도자기·컵·와인잔). 좌우 무관(절대값=반경).
//  · 곡선(Smooth) 토글: 찍은 점들을 지나는 부드러운 스플라인. 점은 드래그로 조정 가능.
import { useState, useEffect, useRef } from 'react';
import { PenTool, X, Check } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';

const SIZE = 460;         // 캔버스(모달) 크기 ↑
const CENTER = SIZE / 2;
const SCALE = 150;        // px per world-unit
const GRID = 8;          // 그리드 격자 간격(px) — 더 촘촘하게

type Pt = { x: number; y: number };

// Catmull-Rom 스플라인 — 점들을 지나는 부드러운 곡선을 촘촘한 점들로 샘플.
function smoothPts(pts: Pt[], closed: boolean, samples = 14): Pt[] {
  const n = pts.length;
  if (n < 3) return pts;
  const get = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out: Pt[] = [];
  const seg = closed ? n : n - 1;
  for (let i = 0; i < seg; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

export function PenToolModal() {
  const open = useSceneStore((s) => s.penToolOpen);
  const setOpen = useSceneStore((s) => s.setPenToolOpen);
  const addProfileObject = useSceneStore((s) => s.addProfileObject);
  const { addToast } = useToast();

  const [mode, setMode] = useState<'extrude' | 'lathe'>('extrude');
  const [points, setPoints] = useState<Pt[]>([]);
  const [closed, setClosed] = useState(false);
  const [depth, setDepth] = useState(0.5);
  const [smooth, setSmooth] = useState(false);
  const [snapGrid, setSnapGrid] = useState(true);
  const [hover, setHover] = useState<Pt | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set()); // 다중 선택된 점 인덱스
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null); // Shift+드래그 선택 사각형
  const dragRef = useRef<{ startMouse: Pt; origins: Map<number, Pt>; moved: boolean } | null>(null);
  const boxRef = useRef<Pt | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const closedRef = useRef(closed);
  const selectedRef = useRef(selected);
  useEffect(() => { closedRef.current = closed; }, [closed]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const SNAP = 14; // 첫 점 근처 클릭 시 닫기(px)

  // 패널 드래그(헤더 잡고 이동) — overlay 없이 씬 위에 떠 있는 작업 팝업.
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null); // null=중앙
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelDrag = useRef<{ ox: number; oy: number } | null>(null);
  const onHeaderDown = (e: React.MouseEvent) => {
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    panelDrag.current = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    setPanelPos({ x: r.left, y: r.top }); // 중앙정렬 → 절대좌표로 전환(점프 방지)
    setDragging(true);
  };
  const onDragMove = (e: React.MouseEvent) => {
    if (!panelDrag.current) return;
    setPanelPos({ x: e.clientX - panelDrag.current.ox, y: e.clientY - panelDrag.current.oy });
  };
  const endDrag = () => { panelDrag.current = null; setDragging(false); };

  // 되돌리기 한 단계 — 닫혀 있으면 먼저 열고, 아니면 마지막 점 제거.
  const undoStep = () => { if (closedRef.current) setClosed(false); else setPoints((p) => p.slice(0, -1)); };

  // 열 때마다 기본 상태로 초기화(탭=돌출, 점 비움)
  useEffect(() => {
    if (open) { setMode('extrude'); setPoints([]); setClosed(false); setSmooth(false); setDepth(0.5); setHover(null); setSelected(new Set()); setBox(null); setPanelPos(null); }
  }, [open]);

  // 회전체 모드에선 점을 항상 축 오른쪽으로 반사(WYSIWYG: 점·프리뷰·결과가 일치, 좌우 헷갈림 제거).
  const reflectRight = (p: Pt): Pt => ({ x: CENTER + Math.abs(p.x - CENTER), y: p.y });
  const nearFirst = (p: Pt) => points.length >= 2 && Math.hypot(p.x - points[0].x, p.y - points[0].y) < SNAP;
  // 격자 스냅 — 켜지면 점을 가장 가까운 격자 교차점에 붙인다(중앙축 기준 격자라 정확히 정렬).
  const snapV = (v: number) => CENTER + Math.round((v - CENTER) / GRID) * GRID;
  const place = (p: Pt): Pt => {
    const s = snapGrid ? { x: snapV(p.x), y: snapV(p.y) } : p;
    return mode === 'lathe' ? reflectRight(s) : s;
  };

  // 모달 열려있을 때 Ctrl+Z = 마지막 점 취소(전역 에디터 undo 대신). capture로 먼저 가로챈다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); e.stopPropagation();
        undoStep();
      } else if (e.key === 'Delete' && selectedRef.current.size > 0) {
        e.preventDefault(); e.stopPropagation();
        const sel = selectedRef.current;
        setPoints((prev) => prev.filter((_, i) => !sel.has(i)));
        setSelected(new Set());
        setClosed(false);
      } else if (e.key === 'Escape') {
        e.preventDefault(); close();
      }
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

  const onSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = svgXY(e);
    // Shift+드래그(또는 닫힌 상태에서 빈 곳 드래그) → 박스 선택 시작
    if (e.shiftKey) { boxRef.current = p; setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); return; }
    if (closed) { setSelected(new Set()); return; } // 닫힌 경로: 빈 곳 클릭=선택 해제(점 드래그만)
    if (nearFirst(p)) { setClosed(true); return; }
    setPoints((prev) => [...prev, place(p)]);
    setSelected(new Set());
  };
  const onPointDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation(); // 점 추가 방지
    if (idx === 0 && !closed && points.length >= 2) { setClosed(true); return; }
    // 이미 선택된 점을 잡으면 선택된 전부를, 아니면 그 점만(선택 교체) 드래그.
    let set = selected;
    if (!selected.has(idx)) { set = new Set([idx]); setSelected(set); }
    const origins = new Map<number, Pt>();
    set.forEach((i) => origins.set(i, points[i]));
    dragRef.current = { startMouse: svgXY(e), origins, moved: false };
  };
  const onSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = svgXY(e);
    setHover(p);
    // 박스 선택 진행
    if (boxRef.current) {
      const s = boxRef.current;
      setBox({ x0: Math.min(s.x, p.x), y0: Math.min(s.y, p.y), x1: Math.max(s.x, p.x), y1: Math.max(s.y, p.y) });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    d.moved = true;
    // 격자 스냅이면 델타를 격자 단위로 스냅(선택 점들의 상대 배치 유지)
    let dx = p.x - d.startMouse.x, dy = p.y - d.startMouse.y;
    if (snapGrid) { dx = Math.round(dx / GRID) * GRID; dy = Math.round(dy / GRID) * GRID; }
    setPoints((prev) => prev.map((pt, i) => {
      const o = d.origins.get(i);
      if (!o) return pt;
      const np = { x: o.x + dx, y: o.y + dy };
      return mode === 'lathe' ? reflectRight(np) : np;
    }));
  };
  const onSvgUp = () => {
    // 박스 선택 종료 → 사각형 안 점들 선택
    if (boxRef.current && box) {
      const inBox = new Set<number>();
      points.forEach((pt, i) => { if (pt.x >= box.x0 && pt.x <= box.x1 && pt.y >= box.y0 && pt.y <= box.y1) inBox.add(i); });
      setSelected(inBox);
    }
    boxRef.current = null;
    setBox(null);
    dragRef.current = null;
  };

  const toProfile = (raw: Pt[]) =>
    raw.map((p) => {
      const wy = -(p.y - CENTER) / SCALE;
      const wx = (p.x - CENTER) / SCALE;
      return mode === 'lathe' ? { x: Math.abs(wx), y: wy } : { x: wx, y: wy };
    });

  const create = () => {
    if (mode === 'extrude' && points.length < 3) { addToast('돌출은 점 3개 이상 필요해요.', 'error'); return; }
    if (mode === 'lathe' && points.length < 2) { addToast('회전체는 점 2개 이상 필요해요.', 'error'); return; }
    if (mode === 'extrude' && !closed) { addToast('첫 점을 클릭해 경로를 닫아주세요.', 'error'); return; }
    const raw = smooth ? smoothPts(points, closed) : points;
    addProfileObject(mode, toProfile(raw), depth, closed);
    addToast(`${mode === 'lathe' ? '회전체' : '돌출'} 오브젝트 생성`, 'success');
    setPoints([]); setClosed(false); setOpen(false);
  };
  const close = () => { setPoints([]); setClosed(false); setOpen(false); };
  const clearAll = () => { setPoints([]); setClosed(false); setSelected(new Set()); setBox(null); };
  // 탭(돌출/회전체) 전환 시 전체 지우기 — 두 모드는 그리는 방식이 달라 이전 점을 이어 그리면 혼란.
  const switchMode = (m: 'extrude' | 'lathe') => { if (m === mode) return; setMode(m); clearAll(); };

  // 미리보기 라인 — smooth면 스플라인 샘플, 아니면 원점들. closed면 폐곡선.
  const previewPts = smooth ? smoothPts(points, closed) : points;
  const polyStr = previewPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const closedStr = closed && previewPts.length > 2 ? `${polyStr} ${previewPts[0].x.toFixed(1)},${previewPts[0].y.toFixed(1)}` : polyStr;
  const showSnap = !closed && hover !== null && nearFirst(hover);

  // 격자를 중앙축 기준으로 그려 십자 기준선과 정렬(격자선 하나가 CENTER에 정확히 오게). 격자선은 은은하게(50% 알파).
  const gridLines = [];
  for (let v = CENTER % GRID, k = 0; v < SIZE; v += GRID, k++) {
    if (Math.abs(v - CENTER) < 0.5) continue; // 중앙선은 아래 십자축이 담당
    gridLines.push(<line key={`gx${k}`} x1={v} y1={0} x2={v} y2={SIZE} stroke="#3f3f46" strokeWidth={0.5} opacity={0.1} />);
    gridLines.push(<line key={`gy${k}`} x1={0} y1={v} x2={SIZE} y2={v} stroke="#3f3f46" strokeWidth={0.5} opacity={0.1} />);
  }

  return (
    <>
      <div
        ref={panelRef}
        className="fixed z-50 bg-surface border border-border rounded-sm shadow-2xl p-4 w-[760px] max-w-[95vw]"
        style={panelPos
          ? { left: panelPos.x, top: panelPos.y }
          : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div
          className="flex items-center justify-between mb-2.5 cursor-move select-none"
          onMouseDown={onHeaderDown}
        >
          <span className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><PenTool size={14} /> 펜 툴 — 2D 그려서 3D 만들기</span>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={close} className="text-muted hover:text-foreground px-1 cursor-pointer"><X size={15} /></button>
        </div>

        <div className="flex gap-1.5 mb-2">
          <div className="grid grid-cols-2 gap-1 flex-1">
            {(['extrude', 'lathe'] as const).map((m) => (
              <button key={m} onClick={() => switchMode(m)}
                className={`py-1.5 rounded-xs text-[11px] transition-colors ${mode === m ? 'bg-primary text-white' : 'bg-background text-muted hover:text-foreground'}`}
              >{m === 'extrude' ? '돌출 (Extrude)' : '회전체 (Lathe)'}</button>
            ))}
          </div>
          <button onClick={() => setSmooth((v) => !v)}
            className={`px-2.5 rounded-xs text-[11px] transition-colors ${smooth ? 'bg-primary text-white' : 'bg-background text-muted hover:text-foreground'}`}
            title="찍은 점들을 지나는 부드러운 곡선으로"
          ><span className="inline-flex items-center gap-1">곡선 {smooth && <Check size={11} />}</span></button>
          <button onClick={() => setSnapGrid((v) => !v)}
            className={`px-2.5 rounded-xs text-[11px] transition-colors ${snapGrid ? 'bg-primary text-white' : 'bg-background text-muted hover:text-foreground'}`}
            title="점을 격자 교차점에 붙여 정확히 그리기"
          ><span className="inline-flex items-center gap-1">스냅 {snapGrid && <Check size={11} />}</span></button>
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
          <line x1={0} y1={CENTER} x2={SIZE} y2={CENTER} stroke="#ccc" strokeWidth={0.5} />
          <line x1={CENTER} y1={0} x2={CENTER} y2={SIZE} stroke={mode === 'lathe' ? '#7c3aed' : '#ccc'} strokeWidth={mode === 'lathe' ? 1 : 1} />
          {/* 회전체: 축 반대편에 흐린 미러 — 실제 회전 단면(대칭)을 보여준다 */}
          {mode === 'lathe' && previewPts.length > 1 && (
            <polyline points={previewPts.map((p) => `${(2 * CENTER - p.x).toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.4} />
          )}
          {previewPts.length > 1 && (
            <polyline points={closedStr} fill={closed ? 'rgba(167,139,250,0.18)' : 'none'} stroke="#a78bfa" strokeWidth={2} strokeLinejoin="round" />
          )}
          {/* 첫 점 근처 호버 시 닫기 스냅 표시 */}
          {showSnap && points.length > 0 && (
            <circle cx={points[0].x} cy={points[0].y} r={SNAP} fill="none" stroke="#7c3aed" strokeWidth={2} strokeDasharray="3 3" />
          )}
          {/* Shift+드래그 선택 사각형 */}
          {box && (
            <rect x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0}
              fill="rgba(34,211,238,0.12)" stroke="#22d3ee" strokeWidth={1} strokeDasharray="4 3" />
          )}
          {points.map((p, i) => {
            const sel = selected.has(i);
            return (
              <circle key={i} cx={p.x} cy={p.y} r={sel ? 6 : i === 0 ? 5.5 : 4.5}
                fill={sel ? '#22d3ee' : i === 0 ? '#7c3aed' : '#a78bfa'}
                stroke="#fff" strokeWidth={1.2}
                className="cursor-grab" onMouseDown={(e) => onPointDown(e, i)} />
            );
          })}
        </svg>

        <p className="text-[10px] text-muted/70 mt-1.5 leading-relaxed">
          {mode === 'extrude'
            ? '점을 찍어 단면을 그린 뒤 첫 점(보라)을 다시 클릭해 닫으세요(3점+). 두께만큼 세워집니다(별·하트 기둥).'
            : '세로축 오른쪽에 반쪽 단면을 그리세요(2점+, 왼쪽 클릭은 오른쪽에 맞춰짐·점선=회전 미러). 첫 점을 클릭해 닫으면 도넛·링이 돼요.'}
          {' '}점 드래그로 조정. <b>Shift+드래그</b>=여러 점 선택→함께 이동, <b>Delete</b>=선택 삭제, <b>Ctrl+Z</b>=점 취소{closed ? ' · 닫힘' : ''}.
        </p>

        {mode === 'extrude' && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-muted shrink-0">두께</span>
            <input type="range" min={0.1} max={2} step={0.05} value={depth} onChange={(e) => setDepth(+e.target.value)} className="flex-1 accent-primary" />
            <span className="text-[10px] text-muted tabular-nums w-8 text-right">{depth.toFixed(2)}</span>
          </div>
        )}

        <div className="flex gap-1.5 mt-3">
          <button onClick={undoStep} disabled={points.length === 0}
            className="flex-1 py-1.5 rounded-xs bg-background text-muted hover:text-foreground text-[11px] transition-colors disabled:opacity-40">{closed ? '닫기 취소' : '점 취소'} (Ctrl+Z)</button>
          <button onClick={clearAll} disabled={points.length === 0}
            className="flex-1 py-1.5 rounded-xs bg-background text-muted hover:text-foreground text-[11px] transition-colors disabled:opacity-40">전체 지우기</button>
          <button onClick={create}
            className="flex-1 py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors">만들기 ({points.length})</button>
        </div>
      </div>

      {/* 드래그 중에만 뜨는 투명 캡처 레이어(overlay 아님 — 이동 종료 시 사라짐) */}
      {dragging && (
        <div
          className="fixed inset-0 z-[60] cursor-move"
          onMouseMove={onDragMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        />
      )}
    </>
  );
}
