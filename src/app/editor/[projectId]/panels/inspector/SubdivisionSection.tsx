'use client';

// Subdivision 섹션 — 표면 세분화(부드러운 유기적 곡면). 프리미티브 전용.
// 헤더 스위치로 켜고(켜면 기본 레벨 1), 1/2/3 버튼으로 레벨 선택(슬라이더 대신 — 정수 단계라 버튼이 명확).
import { useSceneStore } from '@/store/sceneStore';
import { SectionHeader, GroupBox, Toggle } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function SubdivisionSection({ obj }: { obj: ObjectNodeSchema }) {
  const { updateObject, pushHistory } = useSceneStore();
  const level = obj.geom?.subdivisions ?? 0;
  const enabled = level > 0;
  const setLevel = (n: number) => { updateObject(obj.id, { geom: { ...obj.geom, subdivisions: n } }); pushHistory(); };
  return (
        <GroupBox>
          <div className="relative">
            <SectionHeader title="Subdivision" hint="Splits the surface into a smooth organic shape (like Blender's Subdivision Surface). Higher level = rounder but far more faces and heavier (max 3)." />
            <label className="flex items-center cursor-pointer absolute top-3 right-4">
              <Toggle value={enabled} onChange={(v) => setLevel(v ? 1 : 0)} />
            </label>
            {enabled && (
              <div className="px-3 pb-3 pt-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Level</span>
                <div className="flex gap-1">
                  {[1, 2, 3].map((n) => (
                    <button key={n} onClick={() => setLevel(n)}
                      className={`w-6 h-6 rounded-[3px] text-[11px] font-semibold border transition-colors ${level === n ? 'bg-accent text-white border-accent' : 'bg-background text-muted border-border hover:text-foreground'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </GroupBox>
  );
}
