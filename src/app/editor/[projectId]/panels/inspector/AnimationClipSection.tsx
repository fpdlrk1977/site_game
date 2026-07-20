'use client';

// 애니메이션 클립(키프레임) 저작 — ANIMATION.md.
// 오브젝트를 원하는 자세로 옮긴 뒤 "포즈 추가"로 트랜스폼을 키프레임 캡처. 여러 오브젝트(트랙)를 한 클립에
// 담아 함께 움직일 수 있다(양문·자동차 등, P3). 경첩 회전축은 트랙(오브젝트)별로 지정.
// 재생은 이벤트 액션 play_clip 또는 ▶ 미리보기(뷰포트).

import { useEffect } from 'react';
import { MathUtils } from 'three';
import { Film, Plus, Trash2, Undo2, Play, Square, X } from 'lucide-react';
import { pivotOffset } from '@/lib/animPivot';
import { localBBox } from '@/lib/objectBBox';
import { useSceneStore, CHARACTER_PREVIEW_ID } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, Toggle } from './ui';
import { PivotPicker } from './PivotPicker';
import type { ObjectNodeSchema, AnimClip, AnimKeyframe, Vector3 } from '@/types/scene';

const snap = (o: ObjectNodeSchema): Omit<AnimKeyframe, 'time'> => ({
  position: { ...o.position }, rotation: { ...o.rotation }, scale: { ...o.scale },
});

export function AnimationClipSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { animClips, objects, assets, addAnimClip, updateAnimClip, removeAnimClip, addTrackToClip, removeTrackFromClip,
    selectObject, pushHistory, animPreview, startAnimPreview, stopAnimPreview, poseEdit, setPoseEdit, goToPose,
    animMode, setAnimMode } = useSceneStore();
  // 선택 오브젝트가 root이거나 트랙 중 하나면 이 클립을 편집한다(다중 트랙 오브젝트 어디서든 접근 가능).
  const clip = animClips.find((c) => c.rootId === obj.id || c.tracks.some((t) => t.objectId === obj.id));
  const myTrack = clip?.tracks.find((t) => t.objectId === obj.id);
  // 클립의 트랙 오브젝트들(표시/카운트용). 클립 없으면 생성 대상은 [obj].
  const trackObjs = clip
    ? clip.tracks.map((t) => objects.find((o) => o.id === t.objectId)).filter((o): o is ObjectNodeSchema => !!o)
    : [obj];

  // 이 섹션이 사라질 때(다른 오브젝트 선택 등) 진행 중이던 이 클립 미리보기 정지 → 뷰포트에 고아 재생 방지.
  useEffect(() => {
    const cid = clip?.id;
    return () => {
      const st = useSceneStore.getState();
      if (cid && st.animPreview?.clipId === cid) st.stopAnimPreview();
    };
  }, [clip?.id]);

  const createClip = () => {
    const tracks = [{ objectId: obj.id, keys: [{ time: 0, ...snap(obj) }] }];
    addAnimClip({ id: MathUtils.generateUUID(), name: `${obj.name} 애니`, duration: 1, tracks, rootId: obj.id, easing: 'easeInOut' });
  };

  const addPose = () => {
    if (!clip) return;
    const maxT = Math.max(0, ...clip.tracks.flatMap((t) => t.keys.map((k) => k.time)));
    const newT = Math.round((maxT + 1) * 100) / 100;
    const tracks = clip.tracks.map((t) => {
      const o = objects.find((x) => x.id === t.objectId);
      return o ? { ...t, keys: [...t.keys, { time: newT, ...snap(o) }] } : t;
    });
    updateAnimClip(clip.id, { tracks, duration: newT });
    pushHistory();
    // 편집 포즈 해제 — 방금 캡처한 포즈는 스냅샷. 이후 이동은 자유(오토키 안 함) → 다시 옮겨 '포즈 추가'로 다음 포즈.
    //   (그 포즈를 고치려면 클릭해서 편집 중으로 만든 뒤 이동.) 하이라이트는 트랜스폼 일치로 표시됨.
    setPoseEdit(clip.id, null);
  };

  // 특정 포즈 삭제 — 모든 트랙에서 그 인덱스 키 제거
  const removePose = (idx: number) => {
    if (!clip) return;
    const tracks = clip.tracks.map((t) => ({ ...t, keys: t.keys.filter((_, i) => i !== idx) }));
    const maxT = Math.max(0.1, ...tracks.flatMap((t) => t.keys.map((k) => k.time)));
    updateAnimClip(clip.id, { tracks, duration: maxT });
    pushHistory();
    setPoseEdit(clip.id, null); // 인덱스가 바뀌므로 편집 포즈 해제
  };

  // 포즈 시간 편집 — 순서 유지(앞뒤 포즈 사이로 클램프). 길이는 마지막 포즈 시간으로 자동.
  const setPoseTime = (idx: number, val: number) => {
    if (!clip) return;
    const times = (clip.tracks[0]?.keys ?? []).map((k) => k.time);
    const lo = idx > 0 ? times[idx - 1] + 0.01 : 0;
    const hi = idx < times.length - 1 ? times[idx + 1] - 0.01 : Infinity;
    const t = Math.round(Math.min(hi, Math.max(lo, val)) * 100) / 100;
    const tracks = clip.tracks.map((tr) => ({ ...tr, keys: tr.keys.map((k, i) => (i === idx ? { ...k, time: t } : k)) }));
    const maxT = Math.max(0.1, ...tracks.flatMap((tr) => tr.keys.map((k) => k.time)));
    updateAnimClip(clip.id, { tracks, duration: maxT });
  };

  // 지정 포즈로 모든 트랙 오브젝트 이동 + 그 포즈를 '편집 중'으로 지정(스토어) → 이후 오브젝트를 옮기면 오토키로 자동 반영.
  const toPose = (idx: number) => { if (clip) goToPose(clip.id, idx); };
  const toFirstPose = () => toPose(0);

  // 포즈(=키) 시간 목록 (첫 트랙 기준 — 모든 트랙 키 시간 정렬됨)
  const poseTimes = clip ? (clip.tracks[0]?.keys ?? []).map((k) => k.time) : [];

  // 현재 편집 포즈 — 명시적 poseEdit 우선(오브젝트 이동/선택전환에도 유지). 없으면 root 트랙 트랜스폼 일치로 추정.
  const eqV = (a: { x: number; y: number; z: number } | undefined, b: { x: number; y: number; z: number }) =>
    !a || (Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3 && Math.abs(a.z - b.z) < 1e-3);
  let curPoseIdx = -1;
  if (clip) {
    if (poseEdit?.clipId === clip.id && poseEdit.idx < poseTimes.length) {
      curPoseIdx = poseEdit.idx;
    } else {
      const rootTrack = clip.tracks[0];
      const rootObj = rootTrack && objects.find((o) => o.id === rootTrack.objectId);
      curPoseIdx = rootTrack && rootObj
        ? rootTrack.keys.findIndex((k) => eqV(k.position, rootObj.position) && eqV(k.rotation, rootObj.rotation) && eqV(k.scale, rootObj.scale))
        : -1;
    }
  }

  // 회전축(피벗) 프리셋 — 선택 오브젝트 원점 기준 스케일드 모서리(실제 로컬 bbox 기반). 트랙별.
  const s = obj.scale;
  const lb = localBBox(objects, assets, obj.id);
  const bx = lb ? { minx: lb.min.x, maxx: lb.max.x, miny: lb.min.y, maxy: lb.max.y, minz: lb.min.z, maxz: lb.max.z }
                : { minx: -0.5, maxx: 0.5, miny: -0.5, maxy: 0.5, minz: -0.5, maxz: 0.5 };
  // 오브젝트 앵커와 동일한 코너 피커(PivotPicker) 사용 → 정규화(0~1 코너) ↔ 애니 피벗(원점 기준 스케일드 로컬 오프셋) 변환.
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const invLerp = (a: number, b: number, v: number) => (Math.abs(b - a) < 1e-6 ? 0.5 : (v - a) / (b - a));
  const snap01 = (t: number) => (Math.abs(t) < 0.25 ? 0 : Math.abs(t - 1) < 0.25 ? 1 : 0.5);
  // 정규화 코너 → 애니 피벗 오프셋. 중심(undefined)=회전 중심(피벗 없음).
  const normToAnimPivot = (p?: Vector3) => p
    ? { x: lerp(bx.minx, bx.maxx, p.x) * s.x, y: lerp(bx.miny, bx.maxy, p.y) * s.y, z: lerp(bx.minz, bx.maxz, p.z) * s.z }
    : undefined;
  // 애니 피벗 오프셋 → 정규화(피커 하이라이트용). 코너로 딱 떨어지면 그 코너, 아니면(레거시 면/중심) 미표시.
  const animPivotToNorm = (o?: { x: number; y: number; z: number }): Vector3 | undefined => o
    ? { x: snap01(invLerp(bx.minx, bx.maxx, s.x ? o.x / s.x : 0)), y: snap01(invLerp(bx.miny, bx.maxy, s.y ? o.y / s.y : 0)), z: snap01(invLerp(bx.minz, bx.maxz, s.z ? o.z / s.z : 0)) }
    : undefined;
  // 유효 피벗 = 트랙 피벗, 없으면 (내가 root면) 레거시 클립레벨 폴백. (리로드 전 in-memory 레거시 클립 대비)
  const effPivot = myTrack?.pivot ?? (clip && clip.rootId === obj.id ? clip.pivot : undefined);
  // 회전축(경첩) 변경 — 선택 오브젝트 '트랙'의 키만 재-bake(retroactive, WYSIWYG·가역). 다른 트랙 무영향.
  //   레거시 클립레벨 pivot이 있었으면 트랙으로 이관하며 클립레벨은 정리(이중 적용 방지).
  const setPivot = (newPivot?: { x: number; y: number; z: number }) => {
    if (!clip) return;
    const oldPivot = effPivot;
    const tracks = clip.tracks.map((t) => {
      if (t.objectId !== obj.id) return t;
      return {
        ...t,
        pivot: newPivot,
        pivotBaked: newPivot ? true : undefined,
        keys: t.keys.map((k) => {
          if (!k.position || !k.rotation) return k;
          let pos = { ...k.position };
          if (oldPivot) { const o = pivotOffset(oldPivot, k.rotation); pos = { x: pos.x - o.x, y: pos.y - o.y, z: pos.z - o.z }; }
          if (newPivot) { const o = pivotOffset(newPivot, k.rotation); pos = { x: pos.x + o.x, y: pos.y + o.y, z: pos.z + o.z }; }
          return { ...k, position: pos };
        }),
      };
    });
    const patch: Partial<AnimClip> = { tracks };
    if (clip.rootId === obj.id && clip.pivot) { patch.pivot = undefined; patch.pivotBaked = undefined; } // 레거시 클립레벨 정리
    updateAnimClip(clip.id, patch);
    pushHistory();
  };

  // 트랙으로 추가 가능한 오브젝트 — 루트(비중첩)·이미 트랙 아님·캐릭터 프리뷰 아님.
  const trackedIds = new Set(clip?.tracks.map((t) => t.objectId));
  const addable = clip
    ? objects.filter((o) => o.parentId == null && o.id !== CHARACTER_PREVIEW_ID && !trackedIds.has(o.id))
    : [];

  return (
    <GroupBox>
      <SectionHeader
        title="Animation (keyframes)"
        hint="오브젝트를 원하는 자세로 옮긴 뒤 '포즈 추가'로 키프레임 캡처 → 순서대로 재생되는 '녹화된 연출'입니다. 위치·회전·크기를 자유롭게 조합하고, 여러 오브젝트를 한 클립에 담아 함께 움직일 수 있어요(컷신·양문 등). ▶로 미리보고, 재생은 이벤트의 '애니 재생(play_clip)' 액션으로 겁니다. ↔ 문·피스톤처럼 한 축으로 여닫히거나 게임 상태(변수/이벤트)에 반응해야 하면 Actuator, 그냥 계속 둥둥/빙글이면 Motion을 쓰세요."
        isOpen={open}
        onToggle={onToggle}
        dot={!!clip}
      />
      {open && (
        <div className="px-3 pb-4 space-y-2">
          {!clip ? (
            <button onClick={createClip} className="w-full py-1.5 rounded-xs bg-primary text-white text-[11px] font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5">
              <Film size={13} /> 애니메이션 만들기{obj.isGroup ? ' (그룹)' : ''}
            </button>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <input
                  value={clip.name}
                  onChange={(e) => updateAnimClip(clip.id, { name: e.target.value })}
                  onBlur={pushHistory}
                  className="flex-1 min-w-0 bg-transparent text-[11px] font-medium text-foreground rounded-sm px-1 -mx-1 border border-transparent hover:border-border/60 focus:border-primary/50 focus:outline-none transition-colors"
                />
                <button onClick={() => { if (confirm(`'${clip.name}' 애니메이션을 삭제할까요?`)) removeAnimClip(clip.id); }} title="애니 삭제" className="shrink-0 p-1 rounded-xs text-muted/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"><Trash2 size={13} /></button>
              </div>

              {/* 에디터 미리보기 ▶ — 뷰포트에서 바로 재생(이벤트/플레이 모드 불필요). 정지 시 원상복구. */}
              {(() => {
                const previewing = animPreview?.clipId === clip.id;
                return (
                  <button
                    onClick={() => (previewing ? stopAnimPreview() : startAnimPreview(clip.id))}
                    disabled={poseTimes.length < 2 && !previewing}
                    className={`w-full py-1.5 rounded-xs text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${previewing ? 'bg-red-500/15 text-red-500 border border-red-500/40 hover:bg-red-500/25' : 'bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25'}`}
                    title={poseTimes.length < 2 ? '포즈가 2개 이상이어야 재생할 수 있어요' : previewing ? '미리보기 정지(원위치 복구)' : '뷰포트에서 미리보기'}
                  >
                    {previewing ? <><Square size={12} /> 정지</> : <><Play size={12} /> 미리보기</>}
                  </button>
                );
              })()}

              {/* 트랙(오브젝트) 목록 — 간단 모드 전용(타임라인 모드는 하단 라벨 컬럼이 담당). */}
              {animMode === 'simple' && (
              <div>
                <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block mb-1">오브젝트 (트랙) · {trackObjs.length}개</span>
                <div className="space-y-1">
                  {clip.tracks.map((t) => {
                    const to = objects.find((o) => o.id === t.objectId);
                    const isCur = t.objectId === obj.id;
                    return (
                      <div key={t.objectId} className={`flex items-center gap-1.5 rounded-xs px-2 py-1 border text-[11px] transition-colors ${isCur ? 'bg-primary/10 border-primary/50' : 'bg-surface border-border'}`}>
                        <button onClick={() => selectObject(t.objectId)} className={`flex-1 min-w-0 text-left truncate ${isCur ? 'text-primary font-medium' : 'text-foreground hover:text-primary'}`} title="선택해서 이 오브젝트의 포즈·회전축 편집">
                          {to?.name ?? '(삭제됨)'}{t.pivot ? ' · 경첩' : ''}{isCur ? ' · 편집 중' : ''}
                        </button>
                        {clip.tracks.length > 1 && (
                          <button onClick={() => removeTrackFromClip(clip.id, t.objectId)} title="이 오브젝트를 애니에서 제외" className="shrink-0 text-muted/50 hover:text-red-500"><X size={12} /></button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {addable.length > 0 && (
                  <div className="mt-1">
                    <SelectBox value="" onChange={(id) => { if (id) { addTrackToClip(clip.id, id); selectObject(id); } }} placeholder="+ 오브젝트 추가…" options={addable.map((o) => ({ value: o.id, label: o.name }))} />
                  </div>
                )}
                {trackObjs.length > 1 && (
                  <p className="text-[9.5px] text-amber-600/80 dark:text-amber-500/80 leading-snug mt-1.5">추가한 오브젝트는 처음엔 <b>정지 상태</b>예요. 각 포즈를 클릭(편집 중)한 뒤 그 오브젝트를 원하는 자세로 놓으면 <b>자동으로 그 포즈에 반영</b>됩니다.</p>
                )}
              </div>
              )}

              {/* 저작 모드 토글 — 간단(포즈 리스트, 초보) / 타임라인(시간축·스크럽, 고급). 같은 데이터, 표현만 전환. */}
              <div className="flex items-center gap-1 p-0.5 rounded-xs bg-background border border-border">
                {(['simple', 'timeline'] as const).map((m) => (
                  <button key={m} onClick={() => setAnimMode(m)}
                    className={`flex-1 py-1 rounded-[4px] text-[10px] font-medium transition-colors ${animMode === m ? 'bg-primary text-white' : 'text-muted hover:text-foreground'}`}>
                    {m === 'simple' ? '간단' : '타임라인'}
                  </button>
                ))}
              </div>

              {animMode === 'timeline' ? (
                <p className="text-[10px] text-amber-600/90 dark:text-amber-500/90 bg-amber-500/10 border border-amber-500/25 rounded-xs px-2 py-1.5 leading-snug">
                  포즈 편집은 화면 <b>하단 타임라인</b>에서 — 키프레임(◆) 클릭=이동, 드래그=시간, 빈 곳 드래그=스크럽. 여기선 트랙·회전축·이징만 설정하세요.
                </p>
              ) : (
                <>
                  {/* 간단(포즈 리스트) — 초보용 순서 목록 */}
                  <span className="text-[10px] text-muted/70 dark:text-muted tracking-wide block">포즈 (키프레임)</span>
                  <div className="space-y-1">
                    {poseTimes.map((t, i) => (
                      <div key={i} className={`flex items-center gap-2 rounded-xs px-2 py-1 border transition-colors ${i === curPoseIdx ? 'bg-primary/10 border-primary/50' : 'bg-surface border-border'}`}>
                        <button onClick={() => toPose(i)} title="이 포즈로 이동 — 이 포즈를 편집 중으로. 이후 오브젝트를 옮기면 자동 반영됩니다." className="flex items-center gap-2 flex-1 min-w-0 text-left group/pose">
                          <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 transition-colors ${i === curPoseIdx ? 'bg-primary text-white' : 'bg-primary/15 text-primary group-hover/pose:bg-primary group-hover/pose:text-white'}`}>{i + 1}</span>
                          <span className={`text-[11px] transition-colors ${i === curPoseIdx ? 'text-primary font-medium' : 'text-foreground group-hover/pose:text-primary'}`}>포즈 {i + 1}{i === curPoseIdx ? ' · 현재' : ''}</span>
                        </button>
                        <input
                          type="number" min={0} step={0.1} value={t}
                          onChange={(e) => setPoseTime(i, parseFloat(e.target.value) || 0)} onBlur={pushHistory}
                          title="이 포즈가 재생되는 시간(초)"
                          className="w-12 bg-background border border-border rounded-xs px-1.5 py-0.5 text-[10px] text-foreground tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <span className="text-[9px] text-muted/50 -ml-1">s</span>
                        {poseTimes.length > 1 && <button onClick={() => removePose(i)} title="포즈 삭제" className="text-muted/50 hover:text-red-500 shrink-0"><Trash2 size={11} /></button>}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {animMode === 'simple' && (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={addPose} className="py-1.5 rounded-xs bg-primary/15 text-primary border border-primary/30 text-[10.5px] font-medium hover:bg-primary/25 transition-colors flex items-center justify-center gap-1"><Plus size={12} /> 포즈 추가</button>
                    <button onClick={toFirstPose} title="오브젝트를 첫 포즈로 되돌림" className="py-1.5 rounded-xs bg-surface border border-border text-muted text-[10.5px] hover:text-foreground transition-colors flex items-center justify-center gap-1"><Undo2 size={12} /> 시작으로</button>
                  </div>
                  {/* <p className="text-[10px] text-muted/50 leading-snug">포즈를 클릭하면 그 포즈가 <b>편집 중</b>(하이라이트)이 되고, 이후 오브젝트를 옮기면 <b>자동으로 그 포즈에 반영</b>됩니다. 여러 오브젝트를 함께 옮겨 <b>포즈 추가</b>하면 새 포즈가 생겨요.</p> */}
                </>
              )}

              {/* 총 길이·이징·반복은 간단 모드에서만 — 타임라인 모드는 하단 트랜스포트에 있음(중복 제거). */}
              {animMode === 'simple' && (
                <>
                  <p className="text-[10px] text-muted/70 dark:text-muted pt-1">총 길이 <b className="text-foreground font-mono">{clip.duration}s</b> <span className="text-muted/70 dark:text-muted">— 마지막 포즈 시간으로 자동</span></p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">이징(곡선)</span>
                      <SelectBox value={clip.easing ?? 'easeInOut'} onChange={(e) => { updateAnimClip(clip.id, { easing: e as AnimClip['easing'] }); pushHistory(); }}
                        options={[{ value: 'linear', label: '일정' }, { value: 'easeInOut', label: '부드럽게' }, { value: 'easeIn', label: '천천히 시작' }, { value: 'easeOut', label: '천천히 끝' }, { value: 'backOut', label: '살짝 뒤로' }, { value: 'bounceOut', label: '튕김' }]} />
                    </div>
                    <label className="flex items-center justify-between cursor-pointer self-end pb-1.5">
                      <span className="text-[10px] font-semibold text-muted/60">반복(loop)</span>
                      <Toggle value={clip.loop === true} onChange={(v) => { updateAnimClip(clip.id, { loop: v }); pushHistory(); }} />
                    </label>
                  </div>
                </>
              )}
              {!obj.isGroup && (
                <div className="pt-0.5">
                  <span className="text-[10px] font-semibold text-muted/70 dark:text-muted tracking-wide block mb-1">회전축 (경첩) · <span className="text-primary">{obj.name}</span></span>
                  <PivotPicker value={animPivotToNorm(effPivot)} onChange={(p) => setPivot(normToAnimPivot(p))} hideHeader />
                  <button onClick={() => setPivot(undefined)}
                    className={`w-full py-1 rounded-xs text-[9px] transition-colors ${!effPivot ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}>
                    중심으로 (회전 중심)
                  </button>
                  <p className="text-[9px] text-muted/70 dark:text-muted mt-1">뷰포트의 <b className="text-amber-500">노란 표식</b>이 이 오브젝트의 회전축입니다. 꼭지점을 정하면 <b>회전 기즈모가 그 모서리를 경첩처럼</b> 돌립니다. (양문은 각 문을 선택해 좌/우로 따로 지정)</p>
                </div>
              )}
              <p className="text-[10px] text-primary/70 dark:text-muted bg-primary/10 border border-primary/20 rounded-xs px-2 py-1.5 leading-snug">재생하려면 이벤트(Events)에서 <b>트리거 → 애니 재생(play_clip)</b>으로 이 애니를 선택하세요. (반복 애니는 '시작 시(scene_start)' 트리거)</p>
            </>
          )}
        </div>
      )}
    </GroupBox>
  );
}
