'use client';

// Subdivision 섹션 — 표면 세분화(부드러운 유기적 곡면). 프리미티브 전용. 접힘 없음.
import { useSceneStore } from '@/store/sceneStore';
import { SectionHeader, GroupBox, LabeledNum } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function SubdivisionSection({ obj }: { obj: ObjectNodeSchema }) {
  const { updateObject, pushHistory } = useSceneStore();
  return (
          <GroupBox>
            <SectionHeader title="Subdivision" hint="표면을 쪼개 부드러운 유기적 곡면으로 만들어요(블렌더 Subdivision Surface). 레벨↑ = 더 둥글지만 면이 급증해 무거워져요(최대 3)." />
            <div className="px-3 pb-4">
              <LabeledNum label="레벨 (0 = 원본)" value={obj.geom?.subdivisions ?? 0}
                onChange={(v) => updateObject(obj.id, { geom: { ...obj.geom, subdivisions: Math.round(v) } })} onCommit={pushHistory}
                min={0} max={3} precision={0} dragStep={1} />
              <p className="text-[10px] text-muted/50 mt-1">각진 박스도 레벨을 올리면 둥글둥글해져요. 성능상 3까지.</p>
            </div>
          </GroupBox>
  );
}
