'use client';

// 다중선택 패널 — 2개+ 오브젝트 선택 시 인스펙터. 일괄편집·거리·합치기(Merge)·Boolean·정렬.
// InspectorPanel 분리 리팩터: isMultiSelect 반환 브랜치 + async 핸들러(handleMerge/handleBoolean)를 통째 이동.
import { useState } from 'react';
import { SlidersHorizontal, Combine, AlignCenter } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { buildMergedGlb } from '@/lib/mergeObjects';
import { buildBooleanGlb, type BooleanOp } from '@/lib/booleanObjects';
import { uploadGlbBlob } from '@/lib/uploadAsset';
import { persistCurrentScene } from '@/lib/saveScene';
import { SectionHeader, Toggle } from './ui';

export function MultiSelectPanel() {
  const { objects, selectedIds, projectId, batchUpdateObjects, alignSelected, mergeIntoAsset, pushHistory } = useSceneStore();
  const { addToast } = useToast();
  const [merging, setMerging] = useState(false);
  // 여러 프리미티브를 하나의 GLB 에셋으로 굽는다(Merge). 원본 제거 + 에셋 오브젝트 1개로 대체.
  const handleMerge = async (rootIds: string[]) => {
    if (!projectId || merging) return;
    setMerging(true);
    try {
      const result = await buildMergedGlb(useSceneStore.getState().objects, rootIds);
      if (!result) { addToast("No primitives to merge (GLB, content and lights aren't merged).", 'error'); return; }
      const asset = await uploadGlbBlob(result.blob, 'Merged object', projectId, 'model');
      mergeIntoAsset(rootIds, asset, result.center, 'Merged object');
      const save = await persistCurrentScene();
      if (save.status === 'conflict') addToast("Merged, but another tab or device saved the scene first so it couldn't be applied. Refresh and try again.", 'error');
      else addToast(`Merged ${result.count} into one`, 'success');
    } catch (err) {
      addToast(`Merge failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setMerging(false);
    }
  };

  // Boolean(합집합/차집합/교집합) — base ∘ tool. subtract는 먼저 선택한 것(base)에서 나중 것(tool)을 뺀다.
  const handleBoolean = async (baseId: string, toolId: string, op: BooleanOp) => {
    if (!projectId || merging) return;
    setMerging(true);
    try {
      const result = await buildBooleanGlb(useSceneStore.getState().objects, baseId, toolId, op);
      if (!result) { addToast('Only works on two primitives (GLB, content and lights excluded).', 'error'); return; }
      const asset = await uploadGlbBlob(result.blob, 'Boolean result', projectId, 'model');
      mergeIntoAsset([baseId, toolId], asset, result.center, 'Boolean result');
      const save = await persistCurrentScene();
      if (save.status === 'conflict') addToast("Done, but another tab or device saved the scene first so it couldn't be applied. Refresh and try again.", 'error');
      else addToast('Boolean operation complete', 'success');
    } catch (err) {
      addToast(`Boolean failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setMerging(false);
    }
  };
    // 2개 선택 시 거리 계산
    let distance: number | null = null;
    if (selectedIds.length === 2) {
      const [a, b] = selectedIds.map((id) => objects.find((o) => o.id === id));
      if (a && b) {
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const dz = a.position.z - b.position.z;
        distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }

    const allHaveMaterial = selectedIds.every((id) => {
      const o = objects.find((x) => x.id === id);
      return o && !o.assetId && !o.particle;
    });
    const firstColor = (() => {
      const o = objects.find((x) => x.id === selectedIds[0]);
      return o?.material?.color ?? '#a78bfa';
    })();
    const allVisible = selectedIds.every((id) => objects.find((x) => x.id === id)?.visible !== false);

    return (
      <aside className="flex flex-col overflow-hidden h-full">
        <div className="px-3 py-2 border-b border-border shrink-0">
          <span className=" text-[11px] font-semibold text-muted tracking-wide">{selectedIds.length} selected</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-3 space-y-3">
            <p className="text-[10px] text-muted">Shift-click to add more objects to the selection.</p>

            {/* 2개 선택 시 거리 표시 */}
            {distance !== null && (
              <div className="bg-background border border-border rounded-xs px-3 py-2">
                <p className="text-[10px] text-muted mb-0.5">Distance between objects</p>
                <p className="text-base font-bold text-foreground tabular-nums">{distance.toFixed(2)} m</p>
              </div>
            )}
          </div>

          {/* 일괄 편집 */}
          <SectionHeader title="Batch edit" icon={<SlidersHorizontal size={12} />} />
          <div className="px-3 py-3 space-y-3">
            {allHaveMaterial && (
              <div>
                <span className="text-[10px] font-semibold text-muted tracking-wide block mb-1">Color (apply to all)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    defaultValue={firstColor}
                    onChange={(e) => batchUpdateObjects(selectedIds, (o) => ({ material: { ...o.material, color: e.target.value } }))}
                    onBlur={pushHistory}
                    className="w-8 h-8 rounded-xs border border-border bg-background cursor-pointer p-0.5"
                  />
                  <span className="text-[10px] text-muted">Applies to all selected objects</span>
                </div>
              </div>
            )}
            <label className="flex items-center justify-between cursor-pointer">
              <span className=" text-[11px] text-muted">Visible (all)</span>
              <Toggle
                value={allVisible}
                onChange={(v) => { batchUpdateObjects(selectedIds, () => ({ visible: v })); pushHistory(); }}
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className=" text-[11px] text-muted">Physics Enabled (all)</span>
              <Toggle
                value={selectedIds.every((id) => objects.find((x) => x.id === id)?.physics.enabled === true)}
                onChange={(v) => { batchUpdateObjects(selectedIds, (o) => ({ physics: { ...o.physics, enabled: v } })); pushHistory(); }}
              />
            </label>
          </div>

          {/* 합치기(Merge) — 여러 프리미티브를 하나의 GLB 객체로 */}
          <SectionHeader title="Merge" icon={<Combine size={12} />} />
          <div className="px-3 py-3 space-y-2">
            <button
              onClick={() => handleMerge(selectedIds)}
              disabled={merging}
              className="w-full py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              {merging ? 'Merging…' : <><Combine size={13} /> Merge into one</>}
            </button>
            <p className="text-[10px] text-muted/50">Merges the selected primitives into <b>a single real object</b> as a new asset. After merging you can&apos;t edit them individually; undo (Ctrl+Z) reverts it. (GLB, content and lights are excluded)</p>
          </div>

          {/* Boolean — 정확히 2개 선택 시. base=먼저 선택, tool=나중 선택 */}
          {selectedIds.length === 2 && (
            <>
              <SectionHeader title="Boolean" icon="◑" />
              <div className="px-3 py-3 space-y-2">
                <div className="grid grid-cols-3 gap-1">
                  <button onClick={() => handleBoolean(selectedIds[0], selectedIds[1], 'union')} disabled={merging}
                    className="py-1.5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[10px] transition-colors disabled:opacity-50" title="Combine the two shapes">Union</button>
                  <button onClick={() => handleBoolean(selectedIds[0], selectedIds[1], 'subtract')} disabled={merging}
                    className="py-1.5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[10px] transition-colors disabled:opacity-50" title="Subtract the second from the first (cut a hole)">Subtract</button>
                  <button onClick={() => handleBoolean(selectedIds[0], selectedIds[1], 'intersect')} disabled={merging}
                    className="py-1.5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[10px] transition-colors disabled:opacity-50" title="Keep only where the two shapes overlap">Intersect</button>
                </div>
                <p className="text-[10px] text-muted/50">
                  <b>Subtract</b> removes <b>{objects.find((o) => o.id === selectedIds[1])?.name ?? 'the second'}</b> (selected last) from <b>{objects.find((o) => o.id === selectedIds[0])?.name ?? 'the first'}</b> (selected first). e.g. subtract a cylinder from a body to cut a wheel well. The result becomes a new asset; Ctrl+Z undoes it.
                </p>
              </div>
            </>
          )}

          {/* 정렬 */}
          <SectionHeader title="Align" icon={<AlignCenter size={12} />} />
          <div className="px-3 py-3 space-y-3">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <div key={axis}>
                <p className="text-[10px] font-semibold text-muted tracking-wide mb-1.5">{axis.toUpperCase()} axis</p>
                <div className="grid grid-cols-3 gap-1">
                  {(['min', 'center', 'max'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => alignSelected(axis, mode)}
                      className="py-1 rounded-xs text-[10px] bg-background text-muted hover:bg-surface hover:text-foreground transition-colors"
                    >
                      {mode === 'min' ? 'Min' : mode === 'center' ? 'Center' : 'Max'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    );
}
