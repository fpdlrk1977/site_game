'use client';

// 펜 툴 — 2D 프로파일을 그려서 3D(돌출/회전체) 오브젝트로 만든다.
//  · 돌출(Extrude): 닫힌 단면을 두께만큼 밀어 세운 기둥(별 기둥 등)
//  · 회전체(Lathe): 반쪽 단면을 Y축 기준 360° 회전(도자기·컵·와인잔). 좌우 무관(절대값=반경).
//  · 곡선(Smooth) 토글: 찍은 점들을 지나는 부드러운 스플라인. 점은 드래그로 조정 가능.
import { useState, useEffect, useRef } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';

const SIZE = 460;         // 캔버스(모달) 크기 ↑
const CENTER = SIZE / 2;
const SCALE = 150;        // px per world-unit
const GRID = 20;          // 그리드 격자 간격(px) — 촘촘하게

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
  const [hover, setHover] = useState<Pt | null>(null);
  const dragRef = useRef<{ idx: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const closedRef = useRef(closed);
  useEffect(() => { closedRef.current = closed; }, [closed]);
  const SNAP = 14; // 첫 점 근처 클릭 시 닫기(px)

  // 되돌리기 한 단계 — 닫혀 있으면 먼저 열고, 아니면 마지막 점 제거.
  const undoStep = () => { if (closedRef.current) setClosed(false); else setPoints((p) => p.slice(0, -1)); };

  // 열 때마다 기본 상태로 초기화(탭=돌출, 점 비움)
  useEffect(() => {
    if (open) { setMode('extrude'); setPoints([]); setClosed(false); setSmooth(false); setDepth(0.5); setHover(null); }
  }, [open]);

  // 회전체 모드에선 점을 항상 축 오른쪽으로 반사(WYSIWYG: 점·프리뷰·결과가 일치, 좌우 헷갈림 제거).
  const reflectRight = (p: Pt): Pt => ({ x: CENTER + Math.abs(p.x - CENTER), y: p.y });
  const enterLathe = () => { setMode('lathe'); setClosed(false); setPoints((prev) => prev.map(reflectRight)); };
  const nearFirst = (p: Pt) => points.length >= 2 && Math.hypot(p.x - points[0].x, p.y - points[0].y) < SNAP;

  // 모달 열려있을 때 Ctrl+Z = 마지막 점 취소(전역 에디터 undo 대신). capture로 먼저 가로챈다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); e.stopPropagation();
        undoStep();
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
    if (closed) return; // 닫힌 경로엔 점 추가 안 함(점 드래그만)
    const p = svgXY(e);
    // 첫 점 근처 클릭 → 경로 닫기(포토샵식). 그 외엔 점 추가.
    if (nearFirst(p)) { setClosed(true); return; }
    setPoints((prev) => [...prev, mode === 'lathe' ? reflectRight(p) : p]);
  };
  const onPointDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation(); // 점 추가 방지
    // 아직 안 닫혔고 첫 점을 클릭하면 = 경로 닫기(점을 직접 클릭해도 닫히게). 닫힌 뒤엔 드래그로 조정.
    if (idx === 0 && !closed && points.length >= 2) { setClosed(true); return; }
    dragRef.current = { idx, moved: false };
  };
  const onSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = svgXY(e);
    setHover(p);
    if (!dragRef.current) return;
    dragRef.current.moved = true;
    const q = mode === 'lathe' ? reflectRight(p) : p;
    const idx = dragRef.current.idx;
    setPoints((prev) => prev.map((pt, i) => (i === idx ? q : pt)));
  };
  const onSvgUp = () => { dragRef.current = null; };

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
  const clearAll = () => { setPoints([]); setClosed(false); };

  // 미리보기 라인 — smooth면 스플라인 샘플, 아니면 원점들. closed면 폐곡선.
  const previewPts = smooth ? smoothPts(points, closed) : points;
  const polyStr = previewPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const closedStr = closed && previewPts.length > 2 ? `${polyStr} ${previewPts[0].x.toFixed(1)},${previewPts[0].y.toFixed(1)}` : polyStr;
  const showSnap = !closed && hover !== null && nearFirst(hover);

  // 격자를 중앙축 기준으로 그려 십자 기준선과 정렬(격자선 하나가 CENTER에 정확히 오게).
  const gridLines = [];
  for (let v = CENTER % GRID, k = 0; v < SIZE; v += GRID, k++) {
    gridLines.push(<line key={`gx${k}`} x1={v} y1={0} x2={v} y2={SIZE} stroke="#27272a" strokeWidth={0.5} />);
    gridLines.push(<line key={`gy${k}`} x1={0} y1={v} x2={SIZE} y2={v} stroke="#27272a" strokeWidth={0.5} />);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={close}>
      <div className="bg-surface border border-border rounded-2xl shadow-2xl p-4 w-[520px] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[13px] font-semibold text-foreground">✏ 펜 툴 — 2D 그려서 3D 만들기</span>
          <button onClick={close} className="text-muted hover:text-foreground text-sm px-1">✕</button>
        </div>

        <div className="flex gap-1.5 mb-2">
          <div className="grid grid-cols-2 gap-1 flex-1">
            {(['extrude', 'lathe'] as const).map((m) => (
              <button key={m} onClick={() => (m === 'lathe' ? enterLathe() : setMode('extrude'))}
                className={`py-1.5 rounded-xs text-[11px] transition-colors ${mode === m ? 'bg-primary text-white' : 'bg-background text-muted hover:text-foreground'}`}
              >{m === 'extrude' ? '돌출 (Extrude)' : '회전체 (Lathe)'}</button>
            ))}
          </div>
          <button onClick={() => setSmooth((v) => !v)}
            className={`px-3 rounded-xs text-[11px] transition-colors ${smooth ? 'bg-primary text-white' : 'bg-background text-muted hover:text-foreground'}`}
            title="찍은 점들을 지나는 부드러운 곡선으로"
          >{smooth ? '곡선 ✓' : '곡선'}</button>
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
          <line x1={0} y1={CENTER} x2={SIZE} y2={CENTER} stroke="#3f3f46" strokeWidth={1} />
          <line x1={CENTER} y1={0} x2={CENTER} y2={SIZE} stroke={mode === 'lathe' ? '#7c3aed' : '#3f3f46'} strokeWidth={mode === 'lathe' ? 2 : 1} />
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
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 5.5 : 4.5} fill={i === 0 ? '#7c3aed' : '#a78bfa'} stroke="#fff" strokeWidth={1.2}
              className="cursor-grab" onMouseDown={(e) => onPointDown(e, i)} />
          ))}
        </svg>

        <p className="text-[10px] text-muted/70 mt-1.5 leading-relaxed">
          {mode === 'extrude'
            ? '점을 찍어 단면을 그린 뒤 첫 점(보라)을 다시 클릭해 닫으세요(3점+). 두께만큼 세워집니다(별·하트 기둥).'
            : '세로축 오른쪽에 반쪽 단면을 그리세요(2점+, 왼쪽 클릭은 오른쪽에 맞춰짐·점선=회전 미러). 첫 점을 클릭해 닫으면 도넛·링이 돼요.'}
          {' '}점은 드래그로 조정. <b>Ctrl+Z</b>=점 취소{closed ? ' · 닫힘✓' : ''}.
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
    </div>
  );
}
