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
      if (!result) { addToast('합칠 프리미티브가 없어요 (GLB/콘텐츠/라이트는 병합 대상이 아닙니다).', 'error'); return; }
      const asset = await uploadGlbBlob(result.blob, '합친 오브젝트', projectId, 'model');
      mergeIntoAsset(rootIds, asset, result.center, '합친 오브젝트');
      const save = await persistCurrentScene();
      if (save.status === 'conflict') addToast('합쳤지만 다른 탭·기기에서 씬이 먼저 저장돼 반영하지 못했어요. 새로고침 후 다시 시도해 주세요.', 'error');
      else addToast(`${result.count}개를 하나로 합쳤어요`, 'success');
    } catch (err) {
      addToast(`합치기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, 'error');
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
      if (!result) { addToast('두 프리미티브에만 적용할 수 있어요 (GLB/콘텐츠/라이트 제외).', 'error'); return; }
      const asset = await uploadGlbBlob(result.blob, 'Boolean 결과', projectId, 'model');
      mergeIntoAsset([baseId, toolId], asset, result.center, 'Boolean 결과');
      const save = await persistCurrentScene();
      if (save.status === 'conflict') addToast('처리했지만 다른 탭·기기에서 씬이 먼저 저장돼 반영하지 못했어요. 새로고침 후 다시 시도해 주세요.', 'error');
      else addToast('Boolean 연산 완료', 'success');
    } catch (err) {
      addToast(`Boolean 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, 'error');
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
      <aside className="flex flex-col bg-sidebar border-l border-border overflow-hidden h-full">
        <div className="px-3 py-2 border-b border-border shrink-0">
          <span className=" text-[11px] font-semibold text-muted tracking-wide">{selectedIds.length}개 선택됨</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-3 space-y-3">
            <p className="text-[10px] text-muted">Shift+클릭으로 오브젝트를 추가 선택하세요.</p>

            {/* 2개 선택 시 거리 표시 */}
            {distance !== null && (
              <div className="bg-background border border-border rounded-xs px-3 py-2">
                <p className="text-[10px] text-muted mb-0.5">선택 오브젝트 간 거리</p>
                <p className="text-base font-bold text-foreground tabular-nums">{distance.toFixed(2)} m</p>
              </div>
            )}
          </div>

          {/* 일괄 편집 */}
          <SectionHeader title="일괄 편집" icon={<SlidersHorizontal size={12} />} />
          <div className="px-3 py-3 space-y-3">
            {allHaveMaterial && (
              <div>
                <span className="text-[10px] font-semibold text-muted tracking-wide block mb-1">Color (전체 적용)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    defaultValue={firstColor}
                    onChange={(e) => batchUpdateObjects(selectedIds, (o) => ({ material: { ...o.material, color: e.target.value } }))}
                    onBlur={pushHistory}
                    className="w-8 h-8 rounded-xs border border-border bg-background cursor-pointer p-0.5"
                  />
                  <span className="text-[10px] text-muted">선택된 모든 오브젝트에 적용</span>
                </div>
              </div>
            )}
            <label className="flex items-center justify-between cursor-pointer">
              <span className=" text-[11px] text-muted">Visible (전체)</span>
              <Toggle
                value={allVisible}
                onChange={(v) => { batchUpdateObjects(selectedIds, () => ({ visible: v })); pushHistory(); }}
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className=" text-[11px] text-muted">Physics Enabled (전체)</span>
              <Toggle
                value={selectedIds.every((id) => objects.find((x) => x.id === id)?.physics.enabled === true)}
                onChange={(v) => { batchUpdateObjects(selectedIds, (o) => ({ physics: { ...o.physics, enabled: v } })); pushHistory(); }}
              />
            </label>
          </div>

          {/* 합치기(Merge) — 여러 프리미티브를 하나의 GLB 객체로 */}
          <SectionHeader title="합치기" icon={<Combine size={12} />} />
          <div className="px-3 py-3 space-y-2">
            <button
              onClick={() => handleMerge(selectedIds)}
              disabled={merging}
              className="w-full py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              {merging ? '합치는 중…' : <><Combine size={13} /> 하나로 합치기</>}
            </button>
            <p className="text-[10px] text-muted/50">선택한 프리미티브를 <b>진짜 하나의 객체</b>로 병합해 새 에셋으로 만들어요. 병합 후엔 개별 편집이 안 되며 되돌리기(Ctrl+Z)로 취소할 수 있어요. (GLB·콘텐츠·라이트는 병합 제외)</p>
          </div>

          {/* Boolean — 정확히 2개 선택 시. base=먼저 선택, tool=나중 선택 */}
          {selectedIds.length === 2 && (
            <>
              <SectionHeader title="Boolean" icon="◑" />
              <div className="px-3 py-3 space-y-2">
                <div className="grid grid-cols-3 gap-1">
                  <button onClick={() => handleBoolean(selectedIds[0], selectedIds[1], 'union')} disabled={merging}
                    className="py-1.5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[10px] transition-colors disabled:opacity-50" title="두 형태를 합칩니다">합집합</button>
                  <button onClick={() => handleBoolean(selectedIds[0], selectedIds[1], 'subtract')} disabled={merging}
                    className="py-1.5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[10px] transition-colors disabled:opacity-50" title="먼저 선택한 것에서 나중 것을 뺍니다(구멍 뚫기)">빼기</button>
                  <button onClick={() => handleBoolean(selectedIds[0], selectedIds[1], 'intersect')} disabled={merging}
                    className="py-1.5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[10px] transition-colors disabled:opacity-50" title="두 형태가 겹치는 부분만 남깁니다">교집합</button>
                </div>
                <p className="text-[10px] text-muted/50">
                  <b>빼기</b>는 <b>{objects.find((o) => o.id === selectedIds[0])?.name ?? '첫 번째'}</b>(먼저 선택)에서 <b>{objects.find((o) => o.id === selectedIds[1])?.name ?? '두 번째'}</b>(나중 선택)를 뺍니다. 예: 몸체에서 실린더를 빼 바퀴 자리 구멍. 결과는 새 에셋이 되고 Ctrl+Z로 취소돼요.
                </p>
              </div>
            </>
          )}

          {/* 정렬 */}
          <SectionHeader title="정렬" icon={<AlignCenter size={12} />} />
          <div className="px-3 py-3 space-y-3">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <div key={axis}>
                <p className="text-[10px] font-semibold text-muted tracking-wide mb-1.5">{axis.toUpperCase()}축 정렬</p>
                <div className="grid grid-cols-3 gap-1">
                  {(['min', 'center', 'max'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => alignSelected(axis, mode)}
                      className="py-1 rounded-xs text-[10px] bg-background text-muted hover:bg-surface hover:text-foreground transition-colors"
                    >
                      {mode === 'min' ? '최소' : mode === 'center' ? '중앙' : '최대'}
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
