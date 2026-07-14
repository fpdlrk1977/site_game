'use client';

// 애니메이션 클립(키프레임) 저작 — ANIMATION.md Phase 1 (간단/포즈 모드).
// 오브젝트(또는 그룹)를 원하는 자세로 옮긴 뒤 "포즈 추가"로 트랜스폼을 키프레임으로 캡처.
// 재생은 이벤트 액션 play_clip으로(뷰어/플레이). 에디터 내 미리보기·타임라인은 Phase 2~3.

import { MathUtils } from 'three';
import { Film, Plus, Trash2, Undo2 } from 'lucide-react';
import { pivotOffset } from '@/lib/animPivot';
import { localBBox } from '@/lib/objectBBox';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, Toggle } from './ui';
import type { ObjectNodeSchema, AnimClip, AnimKeyframe } from '@/types/scene';

const snap = (o: ObjectNodeSchema): Omit<AnimKeyframe, 'time'> => ({
  position: { ...o.position }, rotation: { ...o.rotation }, scale: { ...o.scale },
});

export function AnimationClipSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { animClips, objects, assets, addAnimClip, updateAnimClip, removeAnimClip, updateObject, pushHistory } = useSceneStore();
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

  // 지정 포즈(=키 인덱스)로 오브젝트를 이동 — 캡처한 그대로(위치·회전·크기)를 에디터에 반영해 확인.
  //   경첩 회전은 저작 시점에 이미 position에 반영(baked)되므로 여기서 그대로 보여주면 재생과 일치(WYSIWYG).
  const goToPose = (idx: number) => {
    if (!clip) return;
    for (const t of clip.tracks) {
      const k = t.keys[idx];
      if (k) updateObject(t.objectId, { ...(k.position ? { position: k.position } : {}), ...(k.rotation ? { rotation: k.rotation } : {}), ...(k.scale ? { scale: k.scale } : {}) });
    }
    pushHistory();
  };
  const toFirstPose = () => goToPose(0);

  // 포즈(=키) 시간 목록 (첫 트랙 기준)
  const poseTimes = clip ? (clip.tracks[0]?.keys ?? []).map((k) => k.time) : [];

  // 현재 오브젝트가 어느 포즈와 일치하는지 — 클릭(goToPose)으로 이동하면 그 포즈를 하이라이트.
  const eqV = (a: { x: number; y: number; z: number } | undefined, b: { x: number; y: number; z: number }) =>
    !a || (Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3 && Math.abs(a.z - b.z) < 1e-3);
  const curPoseIdx = clip
    ? (clip.tracks[0]?.keys ?? []).findIndex((k) => eqV(k.position, obj.position) && eqV(k.rotation, obj.rotation) && eqV(k.scale, obj.scale))
    : -1;

  // 회전축(피벗) 프리셋 — 오브젝트 원점 기준 스케일드 모서리. 단일 오브젝트 전용.
  //   실제 지오메트리 bbox(스케일 전)를 스케일해 진짜 모서리를 잡는다 → GLB·비단위·원점이 중심이 아닌
  //   오브젝트도 정확(예전엔 0.5×scale 고정이라 중심 쪽으로 당겨졌음). bbox 미로딩 시 단위 박스 폴백.
  const s = obj.scale;
  const lb = localBBox(objects, assets, obj.id);
  const bx = lb ? { minx: lb.min.x, maxx: lb.max.x, miny: lb.min.y, maxy: lb.max.y, minz: lb.min.z, maxz: lb.max.z }
                : { minx: -0.5, maxx: 0.5, miny: -0.5, maxy: 0.5, minz: -0.5, maxz: 0.5 };
  const pivotPresets: { id: string; label: string; pivot?: { x: number; y: number; z: number } }[] = [
    { id: 'center', label: '중심', pivot: undefined },
    { id: 'left', label: '좌 −X', pivot: { x: bx.minx * s.x, y: 0, z: 0 } },
    { id: 'right', label: '우 +X', pivot: { x: bx.maxx * s.x, y: 0, z: 0 } },
    { id: 'front', label: '앞 −Z', pivot: { x: 0, y: 0, z: bx.minz * s.z } },
    { id: 'back', label: '뒤 +Z', pivot: { x: 0, y: 0, z: bx.maxz * s.z } },
    { id: 'bottom', label: '아래 −Y', pivot: { x: 0, y: bx.miny * s.y, z: 0 } },
    { id: 'top', label: '위 +Y', pivot: { x: 0, y: bx.maxy * s.y, z: 0 } },
  ];
  // 회전축(경첩) 변경 — 키프레임 position을 재-bake해 기존 포즈들도 새 경첩으로 즉시 스윙(retroactive, WYSIWYG).
  //   old pivot 스윙을 빼고 new pivot 스윙을 더함 → 중심 회전으로 되돌리는 것(center)도 가역.
  const setPivot = (newPivot?: { x: number; y: number; z: number }) => {
    if (!clip) return;
    const oldPivot = clip.pivot;
    const tracks = clip.tracks.map((t) => ({
      ...t,
      keys: t.keys.map((k) => {
        if (!k.position || !k.rotation) return k;
        let pos = { ...k.position };
        if (oldPivot) { const o = pivotOffset(oldPivot, k.rotation); pos = { x: pos.x - o.x, y: pos.y - o.y, z: pos.z - o.z }; }
        if (newPivot) { const o = pivotOffset(newPivot, k.rotation); pos = { x: pos.x + o.x, y: pos.y + o.y, z: pos.z + o.z }; }
        return { ...k, position: pos };
      }),
    }));
    updateAnimClip(clip.id, { pivot: newPivot, pivotBaked: newPivot ? true : undefined, tracks });
    pushHistory();
  };

  const isPivot = (p?: { x: number; y: number; z: number }) => {
    const cur = clip?.pivot;
    if (!p) return !cur;
    if (!cur) return false;
    return Math.abs(p.x - cur.x) < 1e-4 && Math.abs(p.y - cur.y) < 1e-4 && Math.abs(p.z - cur.z) < 1e-4;
  };

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
                  <div key={i} className={`flex items-center gap-2 rounded-xs px-2 py-1 border transition-colors ${i === curPoseIdx ? 'bg-primary/10 border-primary/50' : 'bg-surface border-border'}`}>
                    <button onClick={() => goToPose(i)} title="이 포즈로 이동 — 캡처한 상태를 에디터에서 확인" className="flex items-center gap-2 flex-1 min-w-0 text-left group/pose">
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
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={addPose} className="py-1.5 rounded-xs bg-primary/15 text-primary border border-primary/30 text-[10.5px] font-medium hover:bg-primary/25 transition-colors flex items-center justify-center gap-1"><Plus size={12} /> 포즈 추가</button>
                <button onClick={toFirstPose} title="오브젝트를 첫 포즈로 되돌림" className="py-1.5 rounded-xs bg-surface border border-border text-muted text-[10.5px] hover:text-foreground transition-colors flex items-center justify-center gap-1"><Undo2 size={12} /> 시작 포즈로</button>
              </div>
              <p className="text-[10px] text-muted/50 leading-snug">오브젝트를 옮기고 <b>포즈 추가</b>를 반복하면 그 순서로 움직입니다.{obj.isGroup ? ' 그룹은 전체가 하나로 움직여요(경첩 회전 가능).' : ' 문·뚜껑처럼 모서리 기준으로 열려면 아래 회전축을 그 모서리로 정하세요.'}</p>

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
              {!obj.isGroup && (
                <div className="pt-0.5">
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">회전축 (경첩)</span>
                  <div className="grid grid-cols-4 gap-1">
                    {pivotPresets.map((p) => (
                      <button key={p.id} onClick={() => setPivot(p.pivot)}
                        className={`py-1 rounded-xs text-[9px] transition-colors ${isPivot(p.pivot) ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-muted/50 mt-1">뷰포트의 <b className="text-amber-500">노란 표식</b>이 회전축입니다. 축을 정하면 <b>회전 기즈모가 그 모서리를 경첩처럼</b> 돌립니다 — 문·뚜껑을 그대로 돌려 포즈로 잡으세요. (기본=중심)</p>
                </div>
              )}
              <p className="text-[10px] text-primary/70 bg-primary/10 border border-primary/20 rounded-xs px-2 py-1.5 leading-snug">재생하려면 이벤트(Events)에서 <b>트리거 → 애니 재생(play_clip)</b>으로 이 애니를 선택하세요. (반복 애니는 '시작 시(scene_start)' 트리거)</p>
            </>
          )}
        </div>
      )}
    </GroupBox>
  );
}
