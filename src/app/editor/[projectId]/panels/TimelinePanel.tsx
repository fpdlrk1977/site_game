'use client';

// 하단 타임라인 패널 (P4 고급 모드) — 전체폭 바닥 패널.
// 좌측 라벨(오브젝트별 트랙 행, 선택 동기 + 트랙 추가) + 눈금자 + 레인별 키프레임(◆) + 재생헤드(스크럽) + 트랜스포트.
// 포즈/트랙 추가·삭제는 전부 여기서(인스펙터 아님). 데이터/런타임은 간단 모드와 공유.

import { useRef, useState, useEffect } from 'react';
import { Play, Square, Repeat, Plus, Trash2 } from 'lucide-react';
import { useSceneStore, CHARACTER_PREVIEW_ID } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import type { ObjectNodeSchema, AnimKeyframe, EasingType } from '@/types/scene';

const snap = (o: ObjectNodeSchema): Omit<AnimKeyframe, 'time'> => ({ position: { ...o.position }, rotation: { ...o.rotation }, scale: { ...o.scale } });
const EASE_OPTS: { value: EasingType; label: string }[] = [
  { value: 'linear', label: '일정' },
  { value: 'easeInOut', label: '부드럽게' },
  { value: 'easeIn', label: '천천히 시작' },
  { value: 'easeOut', label: '천천히 끝' },
  { value: 'backOut', label: '살짝 뒤로' },
  { value: 'bounceOut', label: '튕김' },
];
const eqV = (a: { x: number; y: number; z: number } | undefined, b: { x: number; y: number; z: number }) =>
  !a || (Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3 && Math.abs(a.z - b.z) < 1e-3);

export function TimelinePanel() {
  const {
    animMode, animClips, selectedId, objects, animScrub, setAnimScrub,
    animPreview, startAnimPreview, stopAnimPreview, poseEdit, setPoseEdit, goToPose,
    updateAnimClip, pushHistory, selectObject, addTrackToClip,
  } = useSceneStore();
  const lanesRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: 'scrub' | 'key'; idx?: number; startX: number; moved: boolean } | null>(null);
  const [dragScale, setDragScale] = useState<number | null>(null); // 키 드래그 중 스케일 동결(눈금자 안 흔들리게)
  const [ctx, setCtx] = useState<{ x: number; y: number; t: number } | null>(null); // 우클릭 컨텍스트 메뉴
  const [playT, setPlayT] = useState<number | null>(null); // 재생 중 재생헤드 시간(스윕)

  const clip = animClips.find((c) => c.rootId === selectedId || c.tracks.some((t) => t.objectId === selectedId));

  // 재생 중 재생헤드 스윕 — 경과 시간으로 playT를 rAF로 갱신(표시용, ClipPreview 구동과 별개).
  const previewingThis = animMode === 'timeline' && !!clip && animPreview?.clipId === clip.id;
  useEffect(() => {
    if (!previewingThis) { setPlayT(null); return; }
    let raf = 0;
    const tick = () => {
      const ap = useSceneStore.getState().animPreview;
      const c = ap ? useSceneStore.getState().animClips.find((x) => x.id === ap.clipId) : undefined;
      if (!ap || !c) { setPlayT(null); return; }
      let t = (performance.now() - ap.startedAt) / 1000;
      if (c.loop) t = c.duration > 0 ? t % c.duration : 0;
      else if (t >= c.duration) t = c.duration;
      setPlayT(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [previewingThis]);

  if (animMode !== 'timeline' || !clip) return null;

  const poseTimes = (clip.tracks[0]?.keys ?? []).map((k) => k.time);
  // 표시 스케일 — 0.5 스텝 반올림 + 여유. 키 드래그 중엔 동결(dragScale)해서 눈금자가 안 흔들리게.
  const maxT = dragScale ?? Math.max(0.5, Math.ceil((clip.duration + 0.3) * 2) / 2);
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / maxT) * 100))}%`;

  // 현재 편집 포즈 — 명시 poseEdit 우선, 없으면 root 트랙 트랜스폼 일치 추정
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
  // 재생헤드 선(라인)은 스크럽 또는 재생 중에만 표시(재생 시 좌→우 스윕). 평소엔 선택된 ◆(앰버)이 현재 포즈.
  const headT = scrubbing ? animScrub!.t : (playT != null ? playT : null);

  // ── 포즈 연산 ──
  const addPoseAt = (rawT: number) => {
    const time = Math.round(rawT * 100) / 100;
    const tracks = clip.tracks.map((tr) => {
      const o = objects.find((x) => x.id === tr.objectId);
      const base = o ? snap(o) : (tr.keys[tr.keys.length - 1] ? { position: tr.keys[tr.keys.length - 1].position, rotation: tr.keys[tr.keys.length - 1].rotation, scale: tr.keys[tr.keys.length - 1].scale } : { position: undefined, rotation: undefined, scale: undefined });
      const keys = [...tr.keys.filter((k) => Math.abs(k.time - time) > 1e-3), { time, ...base }].sort((a, b) => a.time - b.time);
      return { ...tr, keys };
    });
    const dur = Math.max(0.1, ...tracks.flatMap((tr) => tr.keys.map((k) => k.time)));
    updateAnimClip(clip.id, { tracks, duration: dur });
    pushHistory();
    const idx = tracks[0].keys.findIndex((k) => Math.abs(k.time - time) < 1e-3);
    setPoseEdit(clip.id, idx); // 새 키를 편집 중으로 → 오브젝트 옮기면 오토키로 반영
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
  // 구간(키 i → i+1) 이징 설정 — 모든 트랙의 key[i]에 적용(정렬형). ''=클립 기본으로 폴백.
  const setKeyEasing = (i: number, ez: string) => {
    const val = (ez || undefined) as EasingType | undefined;
    const tracks = clip.tracks.map((tr) => ({ ...tr, keys: tr.keys.map((k, ki) => (ki === i ? { ...k, easing: val } : k)) }));
    updateAnimClip(clip.id, { tracks });
    pushHistory();
  };
  const retime = (i: number, val: number) => {
    const lo = i > 0 ? poseTimes[i - 1] + 0.01 : 0;
    const hi = i < poseTimes.length - 1 ? poseTimes[i + 1] - 0.01 : Infinity;
    const t = Math.round(Math.min(hi, Math.max(lo, val)) * 100) / 100;
    const tracks = clip.tracks.map((tr) => ({ ...tr, keys: tr.keys.map((k, ki) => (ki === i ? { ...k, time: t } : k)) }));
    const dur = Math.max(0.1, ...tracks.flatMap((tr) => tr.keys.map((k) => k.time)));
    updateAnimClip(clip.id, { tracks, duration: dur });
  };

  // ── 포인터 ──
  const tFromX = (clientX: number) => {
    const el = lanesRef.current; if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(maxT, ((clientX - r.left) / r.width) * maxT));
  };
  const beginScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // 좌클릭만 스크럽(우클릭=컨텍스트 메뉴)
    dragRef.current = { mode: 'scrub', startX: e.clientX, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setAnimScrub(clip.id, Math.min(clip.duration, tFromX(e.clientX)));
  };
  const beginKey = (e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = { mode: 'key', idx, startX: e.clientX, moved: false };
    setDragScale(maxT); // 이 드래그 동안 스케일 동결
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    if (d.mode === 'scrub') { setAnimScrub(clip.id, Math.min(clip.duration, tFromX(e.clientX))); return; }
    if (Math.abs(e.clientX - d.startX) > 3) d.moved = true;
    if (d.moved && d.idx != null) retime(d.idx, tFromX(e.clientX));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (d.mode === 'scrub') setAnimScrub(clip.id, null);
    else { if (d.moved) pushHistory(); else if (d.idx != null) goToPose(clip.id, d.idx); setDragScale(null); }
    dragRef.current = null;
  };
  const onCtx = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, t: tFromX(e.clientX) });
  };

  const trackedIds = new Set(clip.tracks.map((t) => t.objectId));
  const addable = objects.filter((o) => o.parentId == null && o.id !== CHARACTER_PREVIEW_ID && !trackedIds.has(o.id));

  const ticks: number[] = [];
  for (let tt = 0; tt <= maxT + 1e-6; tt += 0.5) ticks.push(Math.round(tt * 10) / 10);

  return (
    <div className="w-full h-full flex flex-col text-foreground select-none">
      {/* 트랜스포트 바 */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
        <button onClick={() => (previewing ? stopAnimPreview() : startAnimPreview(clip.id))} disabled={poseTimes.length < 2 && !previewing}
          title={previewing ? '정지' : '재생'} className={`w-7 h-7 rounded-xs flex items-center justify-center transition-colors disabled:opacity-40 ${previewing ? 'bg-red-500/15 text-red-500' : 'bg-primary text-white hover:bg-primary/90'}`}>{previewing ? <Square size={12} /> : <Play size={12} />}</button>
        <button onClick={() => { updateAnimClip(clip.id, { loop: !clip.loop }); pushHistory(); }} title="반복(loop)"
          className={`w-7 h-7 rounded-xs flex items-center justify-center border transition-colors ${clip.loop ? 'bg-primary/15 text-primary border-primary/40' : 'bg-background text-muted border-border hover:text-foreground'}`}><Repeat size={12} /></button>
        <span className="font-mono text-[11px] tabular-nums ml-1">{readoutT.toFixed(2)}<span className="text-muted"> / {clip.duration.toFixed(2)}s</span></span>
        <div className="flex-1 min-w-0 text-center truncate text-[11px] text-muted">{clip.name} · {poseTimes.length} keys</div>
        {curPoseIdx >= 0 && poseTimes.length > 1 && (
          <button onClick={() => removePose(curPoseIdx)} title={`포즈 ${curPoseIdx + 1} 삭제`} className="w-7 h-7 rounded-xs flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-500/10"><Trash2 size={12} /></button>
        )}
        <button onClick={addPoseEnd} title="끝에 키프레임 추가 (현재 상태 캡처) · 눈금자 우클릭=원하는 시간에" className="h-7 px-2.5 rounded-xs bg-primary/15 text-primary border border-primary/30 text-[11px] font-medium hover:bg-primary/25 flex items-center gap-1"><Plus size={12} /> 키프레임</button>
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

      {/* 본문: 라벨 + 레인 */}
      <div className="flex-1 flex min-h-0">
        {/* 라벨 컬럼 — 오브젝트별 트랙(선택 동기) + 트랙 추가 */}
        <div className="w-40 shrink-0 border-r border-border flex flex-col">
          <div className="h-6 border-b border-border shrink-0" />
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
            {addable.length > 0 && (
              <div className="px-2 py-1.5">
                <SelectBox value="" onChange={(id) => { if (id) { addTrackToClip(clip.id, id); selectObject(id); } }} placeholder="+ 오브젝트" options={addable.map((o) => ({ value: o.id, label: o.name }))} />
              </div>
            )}
          </div>
        </div>

        {/* 레인 — 눈금자 + 트랙별 키프레임 + 재생헤드 */}
        <div className="flex-1 relative overflow-hidden">
          <div className="h-6 relative border-b border-border">
            {ticks.map((tk) => (
              <div key={tk} className="absolute top-0 h-full border-l border-primary/15" style={{ left: pct(tk) }}>
                <span className="absolute top-1 left-1 text-[9px] font-mono text-muted/60">{tk}s</span>
              </div>
            ))}
          </div>
          <div ref={lanesRef} onPointerDown={beginScrub} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={onCtx} className="relative touch-none cursor-crosshair">
            {clip.tracks.map((t) => {
              const sel = t.objectId === selectedId;
              return (
                <div key={t.objectId} className={`h-7 relative border-b border-border/50 ${sel ? 'bg-amber-500/10' : ''}`}>
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-primary/15" />
                  {t.keys.map((k, i) => (
                    <button key={i} onPointerDown={(e) => beginKey(e, i)}
                      title={`포즈 ${i + 1} · ${k.time.toFixed(2)}s (클릭=이동, 드래그=시간)`}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 rounded-[1px] cursor-grab active:cursor-grabbing ${i === curPoseIdx ? 'bg-amber-500' : 'bg-primary border border-primary/60 hover:brightness-110'}`}
                      style={{ left: pct(k.time), ...(i === curPoseIdx ? { boxShadow: '0 0 0 3px rgba(245,166,35,.25)' } : {}) }} />
                  ))}
                </div>
              );
            })}
          </div>
          {headT != null && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500 pointer-events-none z-10" style={{ left: pct(headT) }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-amber-500" />
            </div>
          )}
        </div>
      </div>

      {/* 우클릭 컨텍스트 메뉴 — 그 시간에 키프레임 추가 */}
      {ctx && (
        <>
          <div className="fixed inset-0 z-[100]" onPointerDown={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }} />
          <div className="fixed z-[101] bg-surface border border-border rounded-sm shadow-float py-1 text-[11px]" style={{ left: ctx.x, top: ctx.y }}>
            <button onClick={() => { addPoseAt(ctx.t); setCtx(null); }} className="w-full text-left px-3 py-1.5 hover:bg-primary/10 hover:text-primary flex items-center gap-1.5">
              <Plus size={12} /> 여기에 키프레임 추가 <span className="text-muted font-mono">{ctx.t.toFixed(2)}s</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
