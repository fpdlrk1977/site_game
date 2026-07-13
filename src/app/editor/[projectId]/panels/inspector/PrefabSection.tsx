'use client';

// Prefab (단일) 섹션 — 원본 정의화 / 인스턴스 동기화·override·Apply·Revert. 접힘 없음.
// 조건(인스턴스 아니고 프리팹화 불가)이면 컴포넌트가 스스로 null 반환.
import { Component, X } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { SectionHeader, GroupBox } from './ui';
import type { ObjectNodeSchema, PrefabOverrideGroup } from '@/types/scene';

// 프리팹 override 그룹 → 라벨
const OVERRIDE_LABELS: Record<PrefabOverrideGroup, string> = {
  transform: 'Transform',
  material: 'Material',
  events: 'Events',
  motion: 'Motion',
  physics: 'Physics',
  content: 'Content',
  light: 'Light',
  particle: 'Particle',
  name: 'Name',
  visibility: 'Visibility',
  dialogue: 'Dialogue',
};

export function PrefabSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { objects, prefabs, createPrefab, applyInstanceToPrefab, revertInstance } = useSceneStore();
  const { addToast } = useToast();
          const prefabDef = obj.prefabId ? prefabs.find((p) => p.id === obj.prefabId) : undefined;
          const isInstance = !!obj.prefabInstanceId && !!prefabDef;
          const canCreate = !isInstance && !obj.parentId; // 루트 오브젝트/그룹만 프리팹화
          if (!isInstance && !canCreate) return null;

          const instanceRoot = isInstance
            ? objects.find((o) => o.prefabInstanceId === obj.prefabInstanceId && o.prefabNodeKey === prefabDef!.rootKey)
            : undefined;
          const overrides = isInstance
            ? [...new Set(
                objects
                  .filter((o) => o.prefabInstanceId === obj.prefabInstanceId)
                  .flatMap((o) => o.prefabOverrides ?? []),
              )]
            : [];
          const instanceCount = prefabDef
            ? new Set(objects.filter((o) => o.prefabId === prefabDef.id).map((o) => o.prefabInstanceId)).size
            : 0;

          return (
            <GroupBox>
              <SectionHeader title="Prefab" icon={<Component size={12} />} hint="Group objects into a reusable master. Editing the master updates every instance (sync); changing a value on one instance detaches only that field (override)." isOpen={open} onToggle={onToggle} />
              {open && <div className="px-3 pb-4 space-y-2">
                {!isInstance && canCreate && (
                  <>
                    <button
                      onClick={() => { createPrefab(); addToast('Created a prefab', 'success'); }}
                      className="w-full py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
                    >
<span className="inline-flex items-center gap-1.5"><Component size={13} /> Make prefab</span>
                    </button>
                    <p className="text-[10px] text-muted/50">Registers this object{obj.isGroup ? ' (group)' : ''} as a master. Instances you place later update together when you edit the master.</p>
                  </>
                )}
                {isInstance && instanceRoot && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-primary font-semibold flex-1 truncate flex items-center gap-1.5"><Component size={12} className="shrink-0" /> {prefabDef!.name}</span>
                      <span className="text-[10px] text-muted shrink-0">{instanceCount} instances</span>
                    </div>
                    {overrides.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-muted">Fields that differ from the master:</p>
                        <div className="flex flex-wrap gap-1">
                          {overrides.map((g) => (
                            <button
                              key={g}
                              onClick={() => { revertInstance(instanceRoot.id, g); addToast(`'${OVERRIDE_LABELS[g]}' reverted to master`, 'success'); }}
                              title="Click to revert just this field to the master"
                              className="px-1.5 py-0.5 rounded-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] hover:bg-amber-500/25 transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              {OVERRIDE_LABELS[g]} <X size={10} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted/50">Identical to the master.</p>
                    )}
                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        onClick={() => { applyInstanceToPrefab(instanceRoot.id); addToast('Applied to master (other instances updated)', 'success'); }}
                        title="Apply this instance's current state to the master → other instances update too (their overrides kept)"
                        className="py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
                      >
                        Apply to master
                      </button>
                      <button
                        onClick={() => { revertInstance(instanceRoot.id); addToast('Reverted to master', 'success'); }}
                        disabled={overrides.length === 0}
                        title="Discard all overrides on this instance and restore master values"
                        className="py-1.5 rounded-xs bg-surface border border-border text-foreground hover:text-muted hover:bg-background text-[11px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Revert to master
                      </button>
                    </div>
                    <p className="text-[10px] text-muted/50">Position, rotation and scale always stay per-instance (never synced).</p>
                  </>
                )}
              </div>}
            </GroupBox>
          );
}
