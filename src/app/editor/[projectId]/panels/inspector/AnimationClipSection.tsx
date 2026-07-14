'use client';

// 애니메이션 클립(키프레임) 저작 — ANIMATION.md Phase 1 (간단/포즈 모드).
// 오브젝트(또는 그룹)를 원하는 자세로 옮긴 뒤 "포즈 추가"로 트랜스폼을 키프레임으로 캡처.
// 재생은 이벤트 액션 play_clip으로(뷰어/플레이). 에디터 내 미리보기·타임라인은 Phase 2~3.

import { MathUtils } from 'three';
import { Film, Plus, Trash2, Undo2 } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, Toggle } from './ui';
import type { ObjectNodeSchema, AnimClip, AnimKeyframe } from '@/types/scene';

const snap = (o: ObjectNodeSchema): Omit<AnimKeyframe, 'time'> => ({
  position: { ...o.position }, rotation: { ...o.rotation }, scale: { ...o.scale },
});

export function AnimationClipSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { animClips, objects, addAnimClip, updateAnimClip, removeAnimClip, updateObject, pushHistory } = useSceneStore();
  const clip = animClips.find((c) => c.rootId === obj.id);
  // Phase 1: 선택 오브젝트 자체를 애니(그룹이면 그룹 전체가 하나로 회전/이동 — 경첩은 그룹 오프셋으로).
  //   자식 개별 애니(멀티트랙)는 Phase 2.
  const trackObjs = [obj];

  const createClip = () => {
    const tracks = trackObjs.map((o) => ({ objectId: o.id, keys: [{ time: 0, ...snap(o) }] }));
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
  };

  // 특정 포즈 삭제 — 모든 트랙에서 그 인덱스 키 제거
  const removePose = (idx: number) => {
    if (!clip) return;
    const tracks = clip.tracks.map((t) => ({ ...t, keys: t.keys.filter((_, i) => i !== idx) }));
    const maxT = Math.max(0.1, ...tracks.flatMap((t) => t.keys.map((k) => k.time)));
    updateAnimClip(clip.id, { tracks, duration: maxT });
    pushHistory();
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

  // 오브젝트들을 첫 포즈(key0)로 되돌림 — 에디터에서 시작 상태 확인
  const toFirstPose = () => {
    if (!clip) return;
    for (const t of clip.tracks) {
      const k = t.keys[0];
      if (k) updateObject(t.objectId, { ...(k.position ? { position: k.position } : {}), ...(k.rotation ? { rotation: k.rotation } : {}), ...(k.scale ? { scale: k.scale } : {}) });
    }
    pushHistory();
  };

  // 포즈(=키) 시간 목록 (첫 트랙 기준)
  const poseTimes = clip ? (clip.tracks[0]?.keys ?? []).map((k) => k.time) : [];

  return (
    <GroupBox>
      <SectionHeader
        title="Animation"
        hint="오브젝트(또는 그룹)를 원하는 자세로 옮긴 뒤 '포즈 추가'로 키프레임 캡처 → 포즈들이 순서대로 재생됩니다. 재생은 이벤트의 '애니 재생(play_clip)' 액션으로 걸어요(플레이/뷰어). 타임라인 편집은 후속."
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

              <span className="text-[10px] font-semibold text-muted/50 tracking-wide block">포즈 (키프레임) · {trackObjs.length}개 오브젝트</span>
              <div className="space-y-1">
                {poseTimes.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 bg-surface border border-border rounded-xs px-2 py-1">
                    <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="flex-1 text-[11px] text-foreground">포즈 {i + 1}</span>
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
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={addPose} className="py-1.5 rounded-xs bg-primary/15 text-primary border border-primary/30 text-[10.5px] font-medium hover:bg-primary/25 transition-colors flex items-center justify-center gap-1"><Plus size={12} /> 포즈 추가</button>
                <button onClick={toFirstPose} title="오브젝트를 첫 포즈로 되돌림" className="py-1.5 rounded-xs bg-surface border border-border text-muted text-[10.5px] hover:text-foreground transition-colors flex items-center justify-center gap-1"><Undo2 size={12} /> 시작 포즈로</button>
              </div>
              <p className="text-[10px] text-muted/50 leading-snug">오브젝트를 옮기고 <b>포즈 추가</b>를 반복하면 그 순서로 움직입니다.{obj.isGroup ? ' 그룹은 전체가 하나로 움직여요(경첩 회전 가능).' : ' 회전축은 오브젝트 중심 — 경첩(모서리 회전)은 그룹을 쓰세요.'}</p>

              <p className="text-[10px] text-muted/60 pt-1">총 길이 <b className="text-foreground font-mono">{clip.duration}s</b> <span className="text-muted/40">— 마지막 포즈 시간으로 자동</span></p>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">이징</span>
                  <SelectBox value={clip.easing ?? 'easeInOut'} onChange={(e) => { updateAnimClip(clip.id, { easing: e as AnimClip['easing'] }); pushHistory(); }} options={[{ value: 'easeInOut', label: '부드럽게' }, { value: 'linear', label: '일정하게' }]} />
                </div>
                <label className="flex items-center justify-between cursor-pointer self-end pb-1.5">
                  <span className="text-[10px] font-semibold text-muted/60">반복(loop)</span>
                  <Toggle value={clip.loop === true} onChange={(v) => { updateAnimClip(clip.id, { loop: v }); pushHistory(); }} />
                </label>
              </div>
              <p className="text-[10px] text-primary/70 bg-primary/10 border border-primary/20 rounded-xs px-2 py-1.5 leading-snug">재생하려면 이벤트(Events)에서 <b>트리거 → 애니 재생(play_clip)</b>으로 이 애니를 선택하세요. (반복 애니는 '시작 시(scene_start)' 트리거)</p>
            </>
          )}
        </div>
      )}
    </GroupBox>
  );
}
