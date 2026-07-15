'use client';

// 하단 타임라인 패널 (P4 고급 모드) — 전체폭 바닥 패널. 뷰포트(창) 모델.
//   레인은 항상 패널 폭 고정(거대 DOM·가로 스크롤 없음). 창 = [viewStart, viewStart+viewDur].
//   휠=줌(viewDur만 변경, 눈금 단위 자동 적응) · 눈금자 드래그=팬(viewStart 이동) · 보이는 것만 그림(가벼움).
//   레인 드래그=스크럽, ◆ 클릭=이동/드래그=시간, 우클릭=그 시간에 키. 데이터/런타임은 간단 모드와 공유.

import { useRef, useState, useEffect } from 'react';
import { Play, Square, Repeat, Plus, SkipBack } from 'lucide-react';
import { useSceneStore, CHARACTER_PREVIEW_ID } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import type { ObjectNodeSchema, AnimKeyframe, EasingType } from '@/types/scene';

const snap = (o: ObjectNodeSchema): Omit<AnimKeyframe, 'time'> => ({ position: { ...o.position }, rotation: { ...o.rotation }, scale: { ...o.scale } });
const EASE_OPTS: { value: EasingType; label: string }[] = [
  { value: 'linear', label: '일정' }, { value: 'easeInOut', label: '부드럽게' }, { value: 'easeIn', label: '천천히 시작' },
  { value: 'easeOut', label: '천천히 끝' }, { value: 'backOut', label: '살짝 뒤로' }, { value: 'bounceOut', label: '튕김' },
];
const NICE_STEPS = [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800]; // 눈금 단위 후보 — 최소 0.5s(더 작게 안 나눔)
const MIN_DUR = 10, MAX_DUR = 36000; // 창이 담는 시간 최소/최대. 최대 확대=10s 창(0.5s 눈금) ~ 최대 10시간(사실상 무한).
// 시간 라벨 — 시:분:초(1시간+), 분:초(1분+, 소수 초 포함 예 2:57.25), 초(1분 미만).
const fmtTick = (t: number): string => {
  if (t >= 3600) { const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.round(t % 60); return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
  if (t >= 60) { const m = Math.floor(t / 60); const s = Math.round((t % 60) * 100) / 100; const ss = Number.isInteger(s) ? String(s).padStart(2, '0') : s.toFixed(2).padStart(5, '0'); return `${m}:${ss}`; }
  return `${Math.round(t * 100) / 100}s`;
};
const eqV = (a: { x: number; y: number; z: number } | undefined, b: { x: number; y: number; z: number }) =>
  !a || (Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3 && Math.abs(a.z - b.z) < 1e-3);

export function TimelinePanel() {
  const {
    animMode, animClips, selectedId, objects, animScrub, setAnimScrub,
    animPreview, startAnimPreview, stopAnimPreview, poseEdit, setPoseEdit, goToPose,
    updateAnimClip, pushHistory, selectObject, addTrackToClip,
  } = useSceneStore();
  const areaRef = useRef<HTMLDivElement>(null);   // 고정폭 레인 영역(px↔시간 기준)
  const dragRef = useRef<{ mode: 'scrub' | 'key' | 'pan'; idx?: number; startX: number; startVal: number; moved: boolean } | null>(null);
  const viewRef = useRef({ start: 0, dur: 5, cw: 600 });  // 네이티브 휠 핸들러가 현재 창을 읽기 위한 ref
  const delPoseRef = useRef<(() => void) | null>(null);   // 선택 키프레임 삭제(Del 키) — 렌더마다 갱신
  const [ctx, setCtx] = useState<{ x: number; y: number; t: number } | null>(null);
  const [playT, setPlayT] = useState<number | null>(null);
  const [viewStart, setViewStart] = useState(0);  // 창 시작 시간(초)
  const [viewDur, setViewDur] = useState(5);      // 창이 담는 시간(초)
  const [containerW, setContainerW] = useState(600); // 레인 영역 폭(px)
  const [hoverT, setHoverT] = useState<number | null>(null);

  const clip = animClips.find((c) => c.rootId === selectedId || c.tracks.some((t) => t.objectId === selectedId));
  const previewingThis = animMode === 'timeline' && !!clip && animPreview?.clipId === clip.id;
  const clipId = clip?.id;

  // 재생 중 재생헤드 스윕
  useEffect(() => {
    if (!previewingThis) { setPlayT(null); return; }
    let raf = 0;
    const tick = () => {
      const ap = useSceneStore.getState().animPreview;
      const c = ap ? useSceneStore.getState().animClips.find((x) => x.id === ap.clipId) : undefined;
      if (!ap || !c) { setPlayT(null); return; }
      let t = (performance.now() - ap.startedAt) / 1000;
      if (c.loop) t = c.duration > 0 ? t % c.duration : 0; else if (t >= c.duration) t = c.duration;
      setPlayT(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [previewingThis]);

  // 레인 영역 폭 추적
  useEffect(() => {
    const el = areaRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    setContainerW(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 클립 바뀌면 창을 그 클립에 맞춰 초기화(줌은 편집 중엔 유지)
  useEffect(() => { setViewStart(0); setViewDur(Math.max((useSceneStore.getState().animClips.find((c) => c.id === clipId)?.duration ?? 1) + 1, MIN_DUR)); }, [clipId]);

  // 휠 줌 — viewDur만 변경(커서 밑 시간 고정). preventDefault 위해 native non-passive.
  useEffect(() => {
    const el = areaRef.current; if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const pps = v.cw / v.dur;
      // 가로 휠(트랙패드 스와이프)=팬, 세로 휠=줌
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { setViewStart((s) => Math.max(0, s + e.deltaX / pps)); return; }
      // 줌 기준 = 왼쪽 끝(x:0). viewStart 고정, viewDur만 변경 → 0s가 고정되고 오른쪽으로 늘었다 줄었다.
      setViewDur(Math.max(MIN_DUR, Math.min(MAX_DUR, v.dur * (e.deltaY < 0 ? 1 / 1.25 : 1.25))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Del/Backspace — 선택된 키프레임 삭제(캡처 단계로 EditorClient의 오브젝트 삭제보다 먼저 가로챔).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const del = delPoseRef.current;
      if (del) { e.preventDefault(); e.stopImmediatePropagation(); del(); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, []);

  if (animMode !== 'timeline' || !clip) return null;

  viewRef.current = { start: viewStart, dur: viewDur, cw: containerW };
  const poseTimes = (clip.tracks[0]?.keys ?? []).map((k) => k.time);
  const pxPerSec = containerW / viewDur;
  const pxAt = (t: number) => (t - viewStart) * pxPerSec; // 창 기준 px 위치(레인 폭 고정)

  let curPoseIdx = -1;
  if (poseEdit?.clipId === clip.id && poseEdit.idx < poseTimes.length) curPoseIdx = poseEdit.idx;
  else {
    const rt = clip.tracks[0];
    const ro = rt && objects.find((o) => o.id === rt.objectId);
    curPoseIdx = rt && ro ? rt.keys.findIndex((k) => eqV(k.position, ro.position) && eqV(k.rotation, ro.rotation) && eqV(k.scale, ro.scale)) : -1;
  }

  const scrubbing = animScrub?.clipId === clip.id;
  const previewing = animPreview?.clipId === clip.id;
  const readoutT = scrubbing ? animScrub!.t : (playT != null ? playT : (curPoseIdx >= 0 ? poseTimes[curPoseIdx] : 0));
  const headT = scrubbing ? animScrub!.t : (playT != null ? playT : null);

  // ── 포즈 연산 ──
  const addPoseAt = (rawT: number) => {
    const time = Math.round(Math.max(0, rawT) * 100) / 100;
    const tracks = clip.tracks.map((tr) => {
      const o = objects.find((x) => x.id === tr.objectId);
      const last = tr.keys[tr.keys.length - 1];
      const base = o ? snap(o) : (last ? { position: last.position, rotation: last.rotation, scale: last.scale } : { position: undefined, rotation: undefined, scale: undefined });
      const keys = [...tr.keys.filter((k) => Math.abs(k.time - time) > 1e-3), { time, ...base }].sort((a, b) => a.time - b.time);
      return { ...tr, keys };
    });
    const dur = Math.max(0.1, ...tracks.flatMap((tr) => tr.keys.map((k) => k.time)));
    updateAnimClip(clip.id, { tracks, duration: dur });
    pushHistory();
    setPoseEdit(clip.id, tracks[0].keys.findIndex((k) => Math.abs(k.time - time) < 1e-3));
  };
  const addPoseEnd = () => addPoseAt(Math.max(0, ...poseTimes) + 1);
  const removePose = (i: number) => {
    if (poseTimes.length <= 1) return;
    const tracks = clip.tracks.map((t) => ({ ...t, keys: t.keys.filter((_, ki) => ki !== i) }));
    const dur = Math.max(0.1, ...tracks.flatMap((t) => t.keys.map((k) => k.time)));
    updateAnimClip(clip.id, { tracks, duration: dur });
    pushHistory();
    setPoseEdit(clip.id, null);
  };
  const setKeyEasing = (i: number, ez: string) => {
    const val = (ez || undefined) as EasingType | undefined;
    updateAnimClip(clip.id, { tracks: clip.tracks.map((tr) => ({ ...tr, keys: tr.keys.map((k, ki) => (ki === i ? { ...k, easing: val } : k)) })) });
    pushHistory();
  };
  const retime = (i: number, val: number) => {
    const lo = i > 0 ? poseTimes[i - 1] + 0.01 : 0;
    const hi = i < poseTimes.length - 1 ? poseTimes[i + 1] - 0.01 : Infinity;
    const t = Math.round(Math.min(hi, Math.max(lo, val)) * 100) / 100;
    const tracks = clip.tracks.map((tr) => ({ ...tr, keys: tr.keys.map((k, ki) => (ki === i ? { ...k, time: t } : k)) }));
    updateAnimClip(clip.id, { tracks, duration: Math.max(0.1, ...tracks.flatMap((tr) => tr.keys.map((k) => k.time))) });
  };

  // ── 포인터 ── 시간 = viewStart + (x)/pxPerSec
  const tFromX = (clientX: number) => {
    const el = areaRef.current; if (!el) return 0;
    return Math.max(0, viewStart + (clientX - el.getBoundingClientRect().left) / pxPerSec);
  };
  const beginScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { mode: 'scrub', startX: e.clientX, startVal: 0, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setAnimScrub(clip.id, Math.max(0, Math.min(viewStart + viewDur, tFromX(e.clientX)))); // 창 끝까지 커서 따라감(끝 지나면 마지막 포즈 유지)
  };
  const beginKey = (e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = { mode: 'key', idx, startX: e.clientX, startVal: 0, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const beginPan = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { mode: 'pan', startX: e.clientX, startVal: viewStart, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) { setHoverT(tFromX(e.clientX)); return; }
    if (Math.abs(e.clientX - d.startX) > 2) d.moved = true;
    if (d.mode === 'scrub') setAnimScrub(clip.id, Math.max(0, Math.min(viewStart + viewDur, tFromX(e.clientX))));
    else if (d.mode === 'key' && d.moved && d.idx != null) retime(d.idx, tFromX(e.clientX));
    else if (d.mode === 'pan') setViewStart(Math.max(0, d.startVal - (e.clientX - d.startX) / pxPerSec)); // 잡고 끌기(오른쪽=과거)
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (d.mode === 'scrub') setAnimScrub(clip.id, null);
    else if (d.mode === 'key') { if (d.moved) pushHistory(); else if (d.idx != null) goToPose(clip.id, d.idx); }
    dragRef.current = null;
  };
  const onCtx = (e: React.MouseEvent) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, t: tFromX(e.clientX) }); };
  const goHome = () => setViewStart(0);

  const trackedIds = new Set(clip.tracks.map((t) => t.objectId));
  const addable = objects.filter((o) => o.parentId == null && o.id !== CHARACTER_PREVIEW_ID && !trackedIds.has(o.id));

  // 눈금 — 보이는 창 [viewStart, viewStart+viewDur]만. 간격은 nice-step(~60px). 개수 항상 바운드.
  const tickStep = NICE_STEPS.find((s) => s * pxPerSec >= 44) ?? NICE_STEPS[NICE_STEPS.length - 1];
  const viewEnd = viewStart + viewDur;
  const ticks: number[] = [];
  for (let tt = Math.max(0, Math.floor(viewStart / tickStep) * tickStep); tt <= viewEnd + tickStep; tt += tickStep) {
    ticks.push(Math.round(tt * 1000) / 1000);
    if (ticks.length > 60) break;
  }
  const visKey = (t: number) => t >= viewStart - viewDur * 0.05 && t <= viewEnd + viewDur * 0.05; // 창 근처만 그림

  // Del 대상 — 명시적으로 클릭 선택한 키프레임만(트랜스폼 일치 폴백 제외 → 오브젝트 삭제와 안 헷갈림).
  const explicitPose = poseEdit?.clipId === clip.id && poseEdit.idx < poseTimes.length ? poseEdit.idx : -1;
  delPoseRef.current = explicitPose >= 0 && poseTimes.length > 1 ? () => removePose(explicitPose) : null;

  return (
    <div className="w-full h-full flex flex-col text-foreground select-none">
      {/* 트랜스포트 바 */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
        <button onClick={goHome} title="처음으로 (0s)" className="w-7 h-7 rounded-xs flex items-center justify-center border border-border bg-background text-muted hover:text-foreground"><SkipBack size={12} /></button>
        <button onClick={() => (previewing ? stopAnimPreview() : startAnimPreview(clip.id))} disabled={poseTimes.length < 2 && !previewing}
          title={previewing ? '정지' : '재생'} className={`w-7 h-7 rounded-xs flex items-center justify-center transition-colors disabled:opacity-40 ${previewing ? 'bg-red-500/15 text-red-500' : 'bg-primary text-white hover:bg-primary/90'}`}>{previewing ? <Square size={12} /> : <Play size={12} />}</button>
        <button onClick={() => { updateAnimClip(clip.id, { loop: !clip.loop }); pushHistory(); }} title="반복(loop)"
          className={`w-7 h-7 rounded-xs flex items-center justify-center border transition-colors ${clip.loop ? 'bg-primary/15 text-primary border-primary/40' : 'bg-background text-muted border-border hover:text-foreground'}`}><Repeat size={12} /></button>
        <span className="font-mono text-[11px] tabular-nums ml-1">{fmtTick(readoutT)}<span className="text-muted"> / {fmtTick(clip.duration)}</span></span>
        <div className="flex-1 min-w-0 text-center truncate text-[11px] text-muted">{clip.name} · {poseTimes.length} keys · <span className="text-muted/60">휠=줌, 눈금자 드래그=이동, ◆선택 후 Del=삭제</span></div>
        <button onClick={addPoseEnd} title="끝에 키프레임 추가 · 눈금자 우클릭=원하는 시간에" className="h-7 px-2.5 rounded-xs bg-primary/15 text-primary border border-primary/30 text-[11px] font-medium hover:bg-primary/25 flex items-center gap-1"><Plus size={12} /> 키프레임</button>
        {curPoseIdx >= 0 && curPoseIdx < poseTimes.length - 1 && (
          <div className="w-32 shrink-0" title={`포즈 ${curPoseIdx + 1}→${curPoseIdx + 2} 구간 곡선`}>
            <SelectBox value={clip.tracks[0]?.keys[curPoseIdx]?.easing ?? ''} onChange={(e) => setKeyEasing(curPoseIdx, e)}
              options={[{ value: '', label: '구간: 기본' }, ...EASE_OPTS.map((o) => ({ value: o.value, label: `구간: ${o.label}` }))]} />
          </div>
        )}
        <div className="w-28 shrink-0" title="클립 기본 곡선">
          <SelectBox value={clip.easing ?? 'easeInOut'} onChange={(e) => { updateAnimClip(clip.id, { easing: e as EasingType }); pushHistory(); }} options={EASE_OPTS.map((o) => ({ value: o.value, label: `기본: ${o.label}` }))} />
        </div>
      </div>

      {/* 본문: 라벨 + 레인(고정폭 뷰포트) */}
      <div className="flex-1 flex min-h-0">
        <div className="w-40 shrink-0 border-r border-border flex flex-col">
          {/* 상단(눈금자 위치) — 오브젝트(트랙) 추가 */}
          <div className="h-6 border-b border-border shrink-0 flex items-center px-1.5 bg-muted/[0.03]">
            {addable.length > 0 ? (
              <SelectBox value="" onChange={(id) => { if (id) { addTrackToClip(clip.id, id); selectObject(id); } }} placeholder="+ 오브젝트" options={addable.map((o) => ({ value: o.id, label: o.name }))} />
            ) : <span className="text-[9px] text-muted/40">트랙</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {clip.tracks.map((t) => {
              const to = objects.find((o) => o.id === t.objectId);
              const sel = t.objectId === selectedId;
              return (
                <button key={t.objectId} onClick={() => selectObject(t.objectId)}
                  className={`w-full h-7 flex items-center gap-1.5 px-3 text-left text-[11px] border-b border-border/50 transition-colors ${sel ? 'bg-amber-500/15 text-foreground shadow-[inset_2px_0_0_#f59e0b]' : 'text-muted hover:text-foreground'}`}
                  title="선택 — 이 오브젝트 편집(트랙 동기)">
                  <span className="w-1.5 h-1.5 rounded-[1px] rotate-45 shrink-0" style={{ background: t.pivot ? '#f59e0b' : 'var(--color-primary)' }} />
                  <span className="truncate flex-1">{to?.name ?? '(삭제됨)'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 레인 영역 — 고정폭. 눈금자=팬, 레인=스크럽. 보이는 것만 그림. */}
        <div ref={areaRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setHoverT(null)} className="flex-1 relative overflow-hidden min-w-0">
          {/* 눈금자(드래그=팬) */}
          <div onPointerDown={beginPan} onContextMenu={onCtx} className="h-6 relative border-b border-border cursor-grab active:cursor-grabbing bg-muted/[0.03]">
            {ticks.map((tk) => (
              <div key={tk} className="absolute top-0 h-full border-l border-primary/15 pointer-events-none" style={{ left: `${pxAt(tk)}px` }}>
                <span className="absolute top-1 left-1 text-[9px] font-mono text-muted/60 whitespace-nowrap">{fmtTick(tk)}</span>
              </div>
            ))}
          </div>
          {/* 레인(드래그=스크럽) */}
          <div onPointerDown={beginScrub} onContextMenu={onCtx} className="absolute left-0 right-0 cursor-crosshair" style={{ top: 24, bottom: 0 }}>
            {clip.tracks.map((t) => {
              const sel = t.objectId === selectedId;
              return (
                <div key={t.objectId} className={`h-7 relative border-b border-border/50 ${sel ? 'bg-amber-500/10' : ''}`}>
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-primary/15" />
                  {t.keys.map((k, i) => visKey(k.time) && (
                    <button key={i} onPointerDown={(e) => beginKey(e, i)}
                      title={`포즈 ${i + 1} · ${fmtTick(k.time)} (클릭=이동, 드래그=시간)`}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 rounded-[1px] cursor-grab active:cursor-grabbing ${i === curPoseIdx ? 'bg-amber-500' : 'bg-primary border border-primary/60 hover:brightness-110'}`}
                      style={{ left: `${pxAt(k.time)}px`, ...(i === curPoseIdx ? { boxShadow: '0 0 0 3px rgba(245,166,35,.25)' } : {}) }} />
                  ))}
                </div>
              );
            })}
          </div>
          {/* 호버 가이드 + 라벨 */}
          {hoverT != null && !dragRef.current && headT == null && hoverT >= viewStart && hoverT <= viewEnd && (
            <div className="absolute top-0 bottom-0 w-px bg-foreground/25 pointer-events-none z-[6]" style={{ left: `${pxAt(hoverT)}px` }}>
              <span className="absolute top-0.5 left-1 px-1 rounded-sm bg-foreground text-background text-[9px] font-mono whitespace-nowrap">{fmtTick(hoverT)}</span>
            </div>
          )}
          {/* 재생헤드 */}
          {headT != null && headT >= viewStart && headT <= viewEnd && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500 pointer-events-none z-10" style={{ left: `${pxAt(headT)}px` }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-amber-500" />
            </div>
          )}
        </div>
      </div>

      {/* 우클릭 컨텍스트 메뉴 */}
      {ctx && (
        <>
          <div className="fixed inset-0 z-[100]" onPointerDown={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }} />
          <div className="fixed z-[101] bg-surface border border-border rounded-sm shadow-float py-1 text-[11px]" style={{ left: ctx.x, top: ctx.y }}>
            <button onClick={() => { addPoseAt(ctx.t); setCtx(null); }} className="w-full text-left px-3 py-1.5 hover:bg-primary/10 hover:text-primary flex items-center gap-1.5">
              <Plus size={12} /> 여기에 키프레임 추가 <span className="text-muted font-mono">{fmtTick(ctx.t)}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
