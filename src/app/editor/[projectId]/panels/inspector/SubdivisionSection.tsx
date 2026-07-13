'use client';

// Subdivision 섹션 — 표면 세분화(부드러운 유기적 곡면). 프리미티브 전용. 접힘 없음.
import { useSceneStore } from '@/store/sceneStore';
import { SectionHeader, GroupBox, LabeledNum } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function SubdivisionSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  return (
          <GroupBox>
            <SectionHeader title="Subdivision" hint="Splits the surface into a smooth organic shape (like Blender's Subdivision Surface). Higher level = rounder but far more faces and heavier (max 3)." isOpen={open} onToggle={onToggle} dot={(obj.geom?.subdivisions ?? 0) > 0} />
            {open && <div className="px-3 pb-4">
              <LabeledNum label="Level (0 = original)" value={obj.geom?.subdivisions ?? 0}
                onChange={(v) => updateObject(obj.id, { geom: { ...obj.geom, subdivisions: Math.round(v) } })} onCommit={pushHistory}
                min={0} max={3} precision={0} dragStep={1} />
            </div>}
          </GroupBox>
  );
}
