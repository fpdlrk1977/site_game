'use client';

// Prefab (단일) 섹션 — 원본 정의화 / 인스턴스 동기화·override·Apply·Revert. 접힘 없음.
// 조건(인스턴스 아니고 프리팹화 불가)이면 컴포넌트가 스스로 null 반환.
import { Component, X } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { SectionHeader, GroupBox } from './ui';
import type { ObjectNodeSchema, PrefabOverrideGroup } from '@/types/scene';

// 프리팹 override 그룹 → 한글 라벨
const OVERRIDE_LABELS: Record<PrefabOverrideGroup, string> = {
  transform: '위치/회전/크기',
  material: '재질',
  events: '이벤트',
  motion: '모션',
  physics: '물리',
  content: '콘텐츠',
  light: '조명',
  particle: '파티클',
  name: '이름',
  visibility: '표시',
  dialogue: '대화',
};

export function PrefabSection({ obj }: { obj: ObjectNodeSchema }) {
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
              <SectionHeader title="Prefab" icon={<Component size={12} />} hint="여러 오브젝트를 재사용 가능한 원본으로 묶어요. 원본을 고치면 모든 인스턴스가 함께 바뀌고(동기화), 인스턴스별로 값을 바꾸면 그 항목만 원본을 안 따릅니다(override)." />
              <div className="px-3 pb-4 space-y-2">
                {!isInstance && canCreate && (
                  <>
                    <button
                      onClick={() => { createPrefab(); addToast('프리팹으로 만들었어요', 'success'); }}
                      className="w-full py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
                    >
<span className="inline-flex items-center gap-1.5"><Component size={13} /> 프리팹으로 만들기</span>
                    </button>
                    <p className="text-[10px] text-muted/50">이 오브젝트{obj.isGroup ? '(그룹)' : ''}를 원본으로 등록합니다. 이후 복제한 인스턴스는 원본 수정 시 함께 바뀌어요.</p>
                  </>
                )}
                {isInstance && instanceRoot && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-primary font-semibold flex-1 truncate flex items-center gap-1.5"><Component size={12} className="shrink-0" /> {prefabDef!.name}</span>
                      <span className="text-[10px] text-muted shrink-0">인스턴스 {instanceCount}개</span>
                    </div>
                    {overrides.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-muted">이 인스턴스에서 원본과 다른 항목:</p>
                        <div className="flex flex-wrap gap-1">
                          {overrides.map((g) => (
                            <button
                              key={g}
                              onClick={() => { revertInstance(instanceRoot.id, g); addToast(`'${OVERRIDE_LABELS[g]}' 원본으로 되돌림`, 'success'); }}
                              title="클릭하면 이 항목만 원본으로 되돌립니다"
                              className="px-1.5 py-0.5 rounded-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] hover:bg-amber-500/25 transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              {OVERRIDE_LABELS[g]} <X size={10} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted/50">원본과 동일한 인스턴스입니다.</p>
                    )}
                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        onClick={() => { applyInstanceToPrefab(instanceRoot.id); addToast('원본에 반영했어요 (다른 인스턴스도 갱신)', 'success'); }}
                        title="이 인스턴스의 현재 상태를 원본에 반영 → 다른 인스턴스도 갱신됩니다(각자 override는 유지)"
                        className="py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
                      >
                        원본에 반영
                      </button>
                      <button
                        onClick={() => { revertInstance(instanceRoot.id); addToast('원본으로 되돌렸어요', 'success'); }}
                        disabled={overrides.length === 0}
                        title="이 인스턴스의 모든 override를 버리고 원본 값으로 되돌립니다"
                        className="py-1.5 rounded-xs border border-border text-muted hover:border-primary/60 hover:text-primary text-[11px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        원본으로 되돌리기
                      </button>
                    </div>
                    <p className="text-[10px] text-muted/50">위치/회전/크기는 항상 인스턴스별로 유지돼요(동기화 대상 아님).</p>
                  </>
                )}
              </div>
            </GroupBox>
          );
}
