'use client';

// 다중선택 패널 — 2개+ 오브젝트 선택 시 인스펙터. 일괄편집 · 거리 표시.
//
// 2026-07-29 브릭 전환: **짓기 도구(Merge·Boolean·정렬·Tidy/Distribute)를 은퇴**했다.
// 이것들은 "박스를 서로 맞추려고" 있던 것들인데, 격자 조립이 그 문제 자체를 없앴다.
// (기존 씬의 결과물은 그대로 열린다 — 만드는 도구만 사라졌다)
import { SlidersHorizontal } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { SectionHeader, Toggle } from './ui';

export function MultiSelectPanel() {
  const { objects, selectedIds, batchUpdateObjects, pushHistory } = useSceneStore();
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
          <SectionHeader title="Batch edit" icon={<SlidersHorizontal size={14} />} />
          <div className="px-3 py-3 space-y-3">
            {allHaveMaterial && (
              <div>
                <span className="text-[10px] font-semibold text-muted tracking-wide block mb-1">Color (apply to all)</span>
                <div className="flex items-center gap-2">
                  <ColorPicker
                    value={firstColor}
                    onChange={(hex) => batchUpdateObjects(selectedIds, (o) => ({ material: { ...o.material, color: hex } }))}
                    onCommit={pushHistory}
                    title="Apply color to all selected"
                    className="w-36 h-8"
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
        </div>
      </aside>
  );
}
