'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Combine, Download, X, Pencil, Play,
  Palette, Music,
  SlidersHorizontal, AlignCenter, Component, Grid2x2, CircleDot, ArrowDownToLine,
} from 'lucide-react';
import { MathUtils } from 'three';
import * as THREE from 'three';
import { glbLocalBboxCache } from '@/lib/glbBboxCache';
import { worldBBox, localBBox } from '@/lib/objectBBox';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import { persistCurrentScene } from '@/lib/saveScene';
import { buildMergedGlb } from '@/lib/mergeObjects';
import { buildBooleanGlb, type BooleanOp } from '@/lib/booleanObjects';
import { uploadGlbBlob, uploadImageTexture } from '@/lib/uploadAsset';
import { SelectBox } from '@/components/ui/SelectBox';
import { TexturePicker } from '@/components/ui/TexturePicker';
import { RichContent } from '@/components/ui/RichContent';
import { PopupFrame } from '@/components/ui/PopupFrame';
import { LabeledNum, XYZRow, LiveTransformRows, SectionHeader, Toggle, GroupBox } from './inspector/ui';
import { EnvironmentPanel } from './inspector/EnvironmentPanel';
import { GlbClipPicker } from './inspector/GlbClipPicker';
import { MotionSection } from './inspector/MotionSection';
import { PhysicsSection } from './inspector/PhysicsSection';
import { LightSection } from './inspector/LightSection';
import { ContentSection } from './inspector/ContentSection';
import { ParticleSection } from './inspector/ParticleSection';
import { VisibilitySection } from './inspector/VisibilitySection';
import type { ObjectNodeSchema, EventSchema, EventCondition, EventAction, DialogueConfig, PopupConfig, PrefabOverrideGroup } from '@/types/scene';

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
import { CHARACTER_PREVIEW_ID } from '@/app/editor/[projectId]/canvas/CharacterPreview';

// ── 트리거/액션 라벨 ───────────────────────────────────────────
const TRIGGER_LABELS: Record<EventSchema['trigger'], string> = {
  click: 'Click',
  hover_enter: 'Hover In',
  hover_exit: 'Hover Out',
  area_enter: 'Area Enter',
  area_exit: 'Area Exit',
  interact: 'Interact (E)',
  approach_enter: 'Approach In (근접)',
  approach_exit: 'Approach Out',
  dialogue_end: '대사 종료 시',
  variable_changed: '변수 변경 시 (조건)',
  scene_start: '시작 시 (로드)',
  on_timer: '타이머 (반복)',
};
const ACTION_LABELS: Record<string, string> = {
  open_url: 'URL 열기',
  show_popup: '팝업',
  emit_event: '이벤트 발송',
  play_animation: '애니메이션 재생',
  go_to_scene: '씬 이동',
  show_object: '오브젝트 표시',
  hide_object: '오브젝트 숨김',
  toggle_object: '오브젝트 토글',
  focus_object: '카메라 포커스',
  reset_camera: '카메라 초기화',
  animate_object: '오브젝트 애니메이션',
  move_object: '오브젝트 이동',
  set_passable: '통과 가능(문 열기)',
  set_solid: '통과 불가(문 닫기)',
  toggle_collision: '통과 토글',
  play_sound: '사운드 재생',
  set_variable: '변수 변경 (점수 등)',
  spawn_object: '오브젝트 생성(스폰)',
  despawn_object: '오브젝트 제거(디스폰)',
  game_win: '게임 승리',
  game_lose: '게임 오버',
  run_script: '스크립트 실행',
};

// value가 대상 objectId인 액션들 (에디터에서 오브젝트 선택 드롭다운 표시)
const OBJECT_TARGET_ACTIONS = new Set(['show_object', 'hide_object', 'toggle_object', 'focus_object', 'set_passable', 'set_solid', 'toggle_collision', 'despawn_object']);

// else 분기에서 고를 수 있는 액션(간단 입력만 지원 — 팝업/스폰/스크립트 등 복합 입력은 제외).
const ELSE_ACTION_OPTIONS: { value: string; label: string }[] = [
  'show_object', 'hide_object', 'toggle_object', 'set_passable', 'set_solid', 'set_variable',
  'play_sound', 'go_to_scene', 'open_url', 'focus_object', 'reset_camera', 'despawn_object', 'game_win', 'game_lose',
].map((a) => ({ value: a, label: ACTION_LABELS[a] ?? a }));



// ── 메인 ───────────────────────────────────────────────────────
// 외부: selectedId를 key로 넘겨 오브젝트 전환 시 내부 상태 완전 초기화
export function InspectorPanel() {
  const { selectedId } = useSceneStore();
  return <InspectorInner key={selectedId ?? '__none__'} />;
}

function InspectorInner() {
  const { objects, assets, selectedId, selectedIds, projectId, sceneId, environment, prefabs, updateObject, pushHistory, alignSelected, batchUpdateObjects, arraySelected, mergeIntoAsset, createPrefab, instantiatePrefab, applyInstanceToPrefab, revertInstance, deletePrefab, requestExport, makeCloner, updateCloner, addAsset, materialAssets, addMaterialAsset, detachMaterial, variables } = useSceneStore();
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
  const obj = objects.find((o) => o.id === selectedId) as ObjectNodeSchema | undefined;
  const isMultiSelect = selectedIds.length > 1;

  // 섹션 접기 상태 — Array(반복 복제)는 가끔 쓰는 툴이라 기본 접힘
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['array']));
  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const isOpen = (key: string) => !collapsed.has(key);

  // 오브젝트 재질 텍스처 업로드 — 표면에 이미지를 입힌다(map). ground/boundary와 동일 패턴.
  const [objTexUploading, setObjTexUploading] = useState(false);
  const objTexInputRef = useRef<HTMLInputElement>(null);
  // 텍스처 영역 표시 스위치 — 텍스처가 이미 있으면 자동 표시, 없으면 스위치로 열기. 오브젝트 바뀌면 리셋.
  const [texPanelOpen, setTexPanelOpen] = useState(false);
  useEffect(() => { setTexPanelOpen(false); }, [selectedId]);
  const handleObjectTexUpload = async (objId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !projectId) return;
    if (file.size > 8 * 1024 * 1024) {
      addToast('이미지가 너무 큽니다. 최대 8MB까지 지원합니다.', 'error');
      return;
    }
    setObjTexUploading(true);
    try {
      // 에셋 DB에 등록(type:'texture') → Textures 라이브러리에서 재사용 가능 + 스토리지 정리 대상으로 추적됨.
      const asset = await uploadImageTexture(file, projectId);
      addAsset(asset);
      const cur = useSceneStore.getState().objects.find((o) => o.id === objId)?.material;
      updateObject(objId, { material: { ...cur, textureUrl: asset.dracoUrl } });
      pushHistory();
    } catch (err) {
      addToast('텍스처 업로드 실패', 'error');
      console.error(err);
    } finally {
      setObjTexUploading(false);
    }
  };

  // Events 추가 폼 상태
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newTrigger, setNewTrigger] = useState<EventSchema['trigger']>('click');
  const [newAction, setNewAction] = useState<EventSchema['action']>('show_popup');
  const [newValue, setNewValue] = useState('');
  // show_popup 팝업 설정(모드/크기/색). undefined=auto(기존 동작).
  const [newPopup, setNewPopup] = useState<PopupConfig | undefined>(undefined);
  // 조건 게이트(옵셔널) — 빈 배열이면 조건 없음(항상 발동). 다중 조건 AND/OR. GAME_LOGIC.md.
  const [newConditions, setNewConditions] = useState<EventCondition[]>([]);
  const [newLogic, setNewLogic] = useState<'and' | 'or'>('and');
  // if/else 분기(Phase 2 후속) — 조건 거짓일 때 대신 실행할 액션. undefined=없음.
  const [newElse, setNewElse] = useState<{ action: EventAction; value: string } | undefined>(undefined);
  // on_timer 트리거 설정(Phase 2). everySec 간격 반복, once면 그 시간 뒤 1회.
  const [newTimer, setNewTimer] = useState<{ everySec: number; once?: boolean }>({ everySec: 3 });
  // null이면 신규 추가, 값이 있으면 그 이벤트를 수정 중
  const [editingId, setEditingId] = useState<string | null>(null);

  // 이벤트 프리뷰 팝업
  const [previewPopup, setPreviewPopup] = useState<{ content: string; config?: PopupConfig } | null>(null);

  // 배열(Array) 복제 파라미터 — 개수(원본 포함)와 복제 간 간격
  const [arrayCount, setArrayCount] = useState(5);
  const [arrayOffset, setArrayOffset] = useState({ x: 2, y: 0, z: 0 });
  const [arrayMode, setArrayMode] = useState<'linear' | 'radial'>('linear');
  const [arrayRadius, setArrayRadius] = useState(3);
  const [arrayAxis, setArrayAxis] = useState<'x' | 'y' | 'z'>('y');

  // go_to_scene 액션용 씬 목록 — 폼을 열거나 이미 씬 이동 이벤트가 있을 때만 로드
  const [sceneList, setSceneList] = useState<{ id: string; name: string }[]>([]);
  const needScenes = showAddEvent || (obj?.events?.some((e) => e.action === 'go_to_scene') ?? false);
  useEffect(() => {
    if (!needScenes || !projectId || sceneList.length > 0) return;
    createBrowserSupabase()
      .from('scenes')
      .select('id, name')
      .eq('project_id', projectId)
      .order('created_at')
      .then(({ data }) => setSceneList(data ?? []));
  }, [needScenes, projectId, sceneList.length]);
  const sceneName = (id: string) => sceneList.find((s) => s.id === id)?.name ?? id;
  const objectName = (id: string) => objects.find((o) => o.id === id)?.name ?? id;

  if (isMultiSelect) {
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

  if (!obj) {
    const isCharSelected = selectedId === CHARACTER_PREVIEW_ID;
    return (
      <aside className="flex flex-col bg-surface border-l border-border overflow-hidden h-full">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
          <span className=" text-[11px] font-semibold text-foreground tracking-wide flex-1">
            {isCharSelected ? 'Player Character' : 'Environment'}
          </span>
        </div>
        {isCharSelected && (
          <div className="px-3 py-2 bg-primary/5 border-b border-border shrink-0">
            <p className="text-[10px] text-primary">뷰포트에서 드래그해 위치 조정 · 스케일/속성은 Player 섹션에서</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {!isCharSelected && (
            <div className="px-3 pt-3">
              <button
                onClick={() => { requestExport([], 'scene'); addToast('씬 전체 GLB 내보내기 시작', 'success'); }}
                title="씬의 모든 오브젝트를 하나의 .glb 파일로 내보내기"
                className="w-full py-1.5 rounded-xs border border-border text-muted hover:border-primary/60 hover:text-primary hover:bg-primary/5 text-[11px] transition-all inline-flex items-center justify-center gap-1.5"
              >
                <Download size={13} /> 씬 전체 GLB로 내보내기
              </button>
            </div>
          )}
          {!isCharSelected && prefabs.length > 0 && (
            <GroupBox>
              <SectionHeader title="Prefab 라이브러리" icon={<Component size={12} />} hint="이 씬의 프리팹 원본 목록. '배치'를 누르면 새 인스턴스를 씬에 추가해요. 삭제하면 정의만 지워지고 이미 배치된 오브젝트는 독립 오브젝트로 남습니다." />
              <div className="px-3 pb-4 space-y-1.5">
                {prefabs.map((p) => {
                  const count = new Set(objects.filter((o) => o.prefabId === p.id).map((o) => o.prefabInstanceId)).size;
                  return (
                    <div key={p.id} className="flex items-center gap-1.5 bg-background border border-border rounded-xs px-2 py-1.5">
                      <span className="text-[11px] text-foreground font-medium flex-1 truncate flex items-center gap-1.5" title={p.name}><Component size={12} className="shrink-0 text-muted" /> {p.name}</span>
                      <span className="text-[10px] text-muted shrink-0">{count}</span>
                      <button
                        onClick={() => { instantiatePrefab(p.id); addToast(`'${p.name}' 배치`, 'success'); }}
                        className="px-2 py-0.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[10px] font-semibold transition-colors shrink-0"
                      >
                        배치
                      </button>
                      <button
                        onClick={() => { if (confirm(`'${p.name}' 프리팹 정의를 삭제할까요?\n이미 배치된 ${count}개 인스턴스는 독립 오브젝트로 남습니다.`)) { deletePrefab(p.id); addToast('프리팹 정의 삭제됨', 'success'); } }}
                        title="프리팹 정의 삭제(인스턴스는 유지)"
                        className="px-1 py-0.5 rounded-xs text-muted hover:text-red-500 transition-colors shrink-0 flex items-center"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </GroupBox>
          )}
          <EnvironmentPanel />
        </div>
      </aside>
    );
  }

  // 그룹 자식의 position은 부모 기준 로컬 좌표라 음수 y가 정상 — 최상위 오브젝트만 바닥(y=0) 클램프
  // (GizmoController의 skipYClamp와 동일한 규칙)
  const setPos = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { position: { ...obj.position, [axis]: axis === 'y' && !obj.parentId ? Math.max(0, v) : v } });
  const setRot = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { rotation: { ...obj.rotation, [axis]: v } });
  const setScl = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { scale: { ...obj.scale, [axis]: v } });

  // GLB 밑면을 바닥(y=0)에 정렬 — 모델 로컬 bbox에 현재 회전·스케일을 적용해
  // 실제 최하단(min.y)을 구하고, position.y를 그만큼 올려 바닥에 앉힌다.
  // 바닥에 놓기 — 루트 오브젝트(GLB·프리미티브·그룹·콘텐츠 전부) 밑면을 바닥(y=0)에 정렬.
  // 월드 bbox(모든 타입 지원, 그룹은 자식 재귀)의 min.y 만큼 y를 올린다. GLB는 bbox 캐시가 있어야 정확.
  const glbUrlForSnap = obj?.assetId ? assets.find((a) => a.id === obj.assetId)?.dracoUrl : null;
  const glbUnloaded = !!obj?.assetId && (!glbUrlForSnap || !glbLocalBboxCache.has(glbUrlForSnap));
  const snapBox = obj && !obj.parentId && !glbUnloaded ? worldBBox(objects, assets, obj.id) : null;
  const canSnapToGround = !!snapBox && !snapBox.isEmpty();
  const snapToGround = () => {
    if (!obj || obj.parentId) return;
    const b = worldBBox(objects, assets, obj.id);
    if (!b || b.isEmpty()) return;
    const newY = obj.position.y - b.min.y; // 밑면이 y=0에 오도록
    if (Math.abs(newY - obj.position.y) < 1e-6) return; // 이미 바닥
    updateObject(obj.id, { position: { ...obj.position, y: newY } });
    pushHistory();
  };

  // 팝업 설정을 저장 형태로 정리 — auto(기본)이고 스타일도 없으면 undefined로 떨궈 스키마를 깨끗하게 유지.
  const cleanPopup = (p: PopupConfig | undefined): PopupConfig | undefined => {
    if (!p) return undefined;
    const mode = p.mode ?? 'auto';
    const hasPos = !!(p.position && p.position !== 'center');
    const hasAnim = !!(p.anim && p.anim !== 'auto');
    const hasChrome = p.chrome === false;
    const hasPad = !!(p.padding && p.padding.trim());
    const hasStyle = !!(p.width || p.height || p.bg || p.title?.trim() || hasPos || hasAnim || hasChrome || hasPad);
    if (mode === 'auto' && !hasStyle) return undefined;
    return {
      mode,
      ...(hasPos ? { position: p.position } : {}),
      ...(hasAnim ? { anim: p.anim } : {}),
      ...(hasChrome ? { chrome: false } : {}),
      ...(hasPad ? { padding: p.padding } : {}),
      ...(p.width ? { width: p.width } : {}),
      ...(p.height ? { height: p.height } : {}),
      ...(p.bg ? { bg: p.bg } : {}),
      ...(p.title?.trim() ? { title: p.title.trim() } : {}),
    };
  };

  const addEvent = () => {
    // 값 없이도 되는 액션: 팝업(빈 내용)·카메라초기화·승패(기본 메시지)·디스폰(자기 자신)
    const valueOptional = new Set(['show_popup', 'reset_camera', 'game_win', 'game_lose', 'despawn_object']);
    if (!newValue.trim() && !valueOptional.has(newAction)) return;
    const popupToSave = newAction === 'show_popup' ? cleanPopup(newPopup) : undefined;
    const conds = newConditions.filter((c) => c.variable);
    const timerToSave = newTrigger === 'on_timer' ? { everySec: Math.max(0.1, newTimer.everySec), ...(newTimer.once ? { once: true } : {}) } : undefined;
    // 다중조건/else는 조건이 있을 때만 의미. 저장 시 레거시 단일 condition은 비운다(conditions로 통일).
    const gate = {
      condition: undefined as EventCondition | undefined,
      conditions: conds.length > 0 ? conds : undefined,
      conditionLogic: conds.length > 1 ? newLogic : undefined,
      elseAction: conds.length > 0 && newElse ? newElse.action : undefined,
      elseValue: conds.length > 0 && newElse ? newElse.value.trim() : undefined,
    };
    if (editingId) {
      // 기존 이벤트 수정
      updateObject(obj.id, {
        events: obj.events.map((e) =>
          e.id === editingId ? { ...e, trigger: newTrigger, action: newAction, value: newValue.trim(), popup: popupToSave, timer: timerToSave, ...gate } : e,
        ),
      });
    } else {
      const ev: EventSchema = {
        id: MathUtils.generateUUID(),
        trigger: newTrigger,
        action: newAction,
        value: newValue.trim(),
        ...(popupToSave ? { popup: popupToSave } : {}),
        ...(timerToSave ? { timer: timerToSave } : {}),
        ...(gate.conditions ? { conditions: gate.conditions } : {}),
        ...(gate.conditionLogic ? { conditionLogic: gate.conditionLogic } : {}),
        ...(gate.elseAction ? { elseAction: gate.elseAction, elseValue: gate.elseValue } : {}),
      };
      updateObject(obj.id, { events: [...obj.events, ev] });
    }
    pushHistory();
    setNewValue('');
    setNewPopup(undefined);
    setNewConditions([]);
    setNewLogic('and');
    setNewElse(undefined);
    setNewTimer({ everySec: 3 });
    setEditingId(null);
    setShowAddEvent(false);
  };

  const startEdit = (ev: EventSchema) => {
    setEditingId(ev.id);
    setNewTrigger(ev.trigger);
    setNewAction(ev.action);
    setNewValue(ev.value);
    setNewPopup(ev.popup);
    // conditions[](신규) 우선, 없으면 레거시 단일 condition을 배열로 승격.
    setNewConditions(ev.conditions && ev.conditions.length ? ev.conditions : (ev.condition ? [ev.condition] : []));
    setNewLogic(ev.conditionLogic ?? 'and');
    setNewElse(ev.elseAction ? { action: ev.elseAction, value: ev.elseValue ?? '' } : undefined);
    setNewTimer(ev.timer ?? { everySec: 3 });
    setShowAddEvent(true);
  };

  const cancelEventForm = () => {
    setShowAddEvent(false);
    setNewValue('');
    setNewPopup(undefined);
    setNewConditions([]);
    setNewLogic('and');
    setNewElse(undefined);
    setNewTimer({ everySec: 3 });
    setEditingId(null);
  };

  const removeEvent = (id: string) => {
    updateObject(obj.id, { events: obj.events.filter((e) => e.id !== id) });
    pushHistory();
    if (editingId === id) cancelEventForm();
  };

  // area_enter는 physics/센서 설정 없이도 접촉 시 발동한다 (PlayCanvas가 자동 처리).
  // Is Sensor를 켜면 오브젝트가 통과 가능한 트리거 영역이 된다는 안내만 표시.
  const showAreaEnterHint = newTrigger === 'area_enter' || newTrigger === 'area_exit';
  const showInteractHint = newTrigger === 'interact';
  const showApproachHint = newTrigger === 'approach_enter' || newTrigger === 'approach_exit';

  // 대화(말풍선) — dialogue 또는 레거시 interactLabel에서 편집값을 구성
  const dlg: DialogueConfig = obj.dialogue ?? (obj.interactLabel?.trim()
    ? { lines: [obj.interactLabel.trim()], show: 'approach', advance: 'auto' }
    : { lines: [], show: 'approach', advance: 'auto' });
  const setDlg = (patch: Partial<DialogueConfig>) =>
    updateObject(obj.id, { dialogue: { ...dlg, ...patch }, interactLabel: undefined });

  // 이벤트 추가/수정 폼 — 신규는 목록 하단, 수정은 해당 항목 자리에 인라인으로 렌더한다
  const renderEventForm = () => (
    <div className="bg-surface border border-primary/40 rounded-xs p-2.5 space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Trigger</span>
          <SelectBox
            value={newTrigger}
            onChange={(v) => setNewTrigger(v as EventSchema['trigger'])}
            options={[
              { value: 'click', label: 'Click' },
              { value: 'hover_enter', label: 'Hover In' },
              { value: 'hover_exit', label: 'Hover Out' },
              { value: 'area_enter', label: 'Area Enter' },
              { value: 'area_exit', label: 'Area Exit' },
              { value: 'interact', label: 'Interact (E)' },
              { value: 'approach_enter', label: 'Approach In (근접)' },
              { value: 'approach_exit', label: 'Approach Out' },
              { value: 'dialogue_end', label: '대사 종료 시' },
              { value: 'variable_changed', label: '변수 변경 시 (조건)' },
              { value: 'scene_start', label: '시작 시 (로드)' },
              { value: 'on_timer', label: '타이머 (반복)' },
            ]}
          />
        </div>
        <div>
          <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Action</span>
          <SelectBox
            value={newAction}
            onChange={(v) => setNewAction(v as EventSchema['action'])}
            options={[
              { value: 'show_popup', label: '팝업' },
              { value: 'open_url', label: 'URL 열기' },
              { value: 'go_to_scene', label: '씬 이동' },
              { value: 'show_object', label: '오브젝트 표시' },
              { value: 'hide_object', label: '오브젝트 숨김' },
              { value: 'toggle_object', label: '오브젝트 토글' },
              { value: 'move_object', label: '오브젝트 이동' },
              { value: 'set_passable', label: '통과 가능(문 열기)' },
              { value: 'set_solid', label: '통과 불가(문 닫기)' },
              { value: 'toggle_collision', label: '통과 토글' },
              { value: 'focus_object', label: '카메라 포커스' },
              { value: 'reset_camera', label: '카메라 초기화' },
              { value: 'play_animation', label: '애니메이션 재생' },
              { value: 'animate_object', label: '오브젝트 애니메이션' },
              { value: 'play_sound', label: '사운드 재생' },
              { value: 'set_variable', label: '변수 변경 (점수 등)' },
              { value: 'spawn_object', label: '오브젝트 생성(스폰)' },
              { value: 'despawn_object', label: '오브젝트 제거(디스폰)' },
              { value: 'game_win', label: '게임 승리' },
              { value: 'game_lose', label: '게임 오버' },
              { value: 'run_script', label: '스크립트 실행 (고급)' },
              { value: 'emit_event', label: '이벤트 발송' },
            ]}
          />
        </div>
      </div>

      {showAreaEnterHint && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          캐릭터가 오브젝트에 닿으면 발동합니다. 통과 가능한 투명 트리거 영역으로
          쓰려면 Physics → Is Sensor를 켜세요.
        </p>
      )}

      {showInteractHint && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          플레이 모드에서 캐릭터가 가까이(약 3m) 가면 화면에 <b>E</b> 프롬프트가 뜨고,
          E키(모바일=버튼)를 누르면 발동합니다. NPC 대화·간판·아이템 등에 쓰세요.
          탐색 모드에선 발동하지 않습니다(대신 Click 트리거 사용).
        </p>
      )}

      {showApproachHint && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          플레이 모드에서 캐릭터가 오브젝트에 근접(약 3m)하면 <b>키 없이 자동</b>으로 발동합니다
          (In=들어올 때, Out=벗어날 때). 다가가면 NPC가 손 흔들기·사운드 재생 같은 연출에 쓰세요.
          오브젝트를 <b>솔리드로 유지</b>한 채 쓸 수 있습니다(Area와 달리 센서 불필요).
          영역 반경 기반이라 임의 구역 트리거는 Area를 쓰세요.
        </p>
      )}

      {newTrigger === 'dialogue_end' && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          이 오브젝트의 <b>대화(말풍선) 마지막 문장에 액션 버튼</b>이 뜨고, 방문자가 <b>버튼을 누르면</b> 발동합니다
          (자동으로 넘어가지 않아요). &quot;대사 끝나면 팝업 열기·씬 이동·문 열기&quot; 같은 연결에 쓰세요.
          아래 <b>대화 말풍선</b>에 대사를 먼저 채우고, 버튼 이름은 대화 설정에서 정할 수 있어요. 플레이 모드 전용.
        </p>
      )}

      {newTrigger === 'variable_changed' && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          게임 <b>변수가 바뀔 때마다</b> 아래 <b>조건</b>을 검사해, 조건이 <b>거짓→참</b>이 되는 순간 1회 발동합니다
          (예: &quot;점수 ≥ 10이 되면 문 열기&quot;). 오브젝트 위치·근접과 무관한 순수 상태 규칙이에요.
          아래 <b>조건</b>을 꼭 설정하세요. 변수는 Environment(빈 곳 클릭) → <b>게임 변수</b>에서 만듭니다.
        </p>
      )}

      {newTrigger === 'scene_start' && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          뷰어가 <b>로드될 때 1회</b> 자동 발동합니다(게임 재시작 시에도). 초기화·인트로 팝업·배경음 시작·타이머 시작에 쓰세요.
        </p>
      )}

      {newTrigger === 'on_timer' && (
        <div className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5 space-y-1.5">
          <p><b>일정 간격마다</b> 자동 발동합니다(주기적 스폰·카운트다운 등). 게임 오버되면 멈춥니다.</p>
          <div className="flex items-center gap-2">
            <span className="shrink-0">간격</span>
            <input
              type="number" min={0.1} step={0.1}
              value={newTimer.everySec}
              onChange={(e) => setNewTimer((t) => ({ ...t, everySec: Number(e.target.value) }))}
              className="w-16 bg-background border border-border rounded-xs px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="shrink-0">초</span>
            <label className="flex items-center gap-1 cursor-pointer ml-auto">
              <input type="checkbox" checked={!!newTimer.once} onChange={(e) => setNewTimer((t) => ({ ...t, once: e.target.checked }))} />
              <span>1회만</span>
            </label>
          </div>
        </div>
      )}

      <div>
        <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">
          {newAction === 'open_url' ? 'URL'
            : newAction === 'emit_event' ? '이벤트 이름'
            : newAction === 'play_animation' ? '클립 이름'
            : newAction === 'go_to_scene' ? '이동할 씬'
            : newAction === 'reset_camera' ? '설정'
            : newAction === 'animate_object' ? '대상 오브젝트 + 클립'
            : newAction === 'move_object' ? '대상 오브젝트 + 이동량'
            : newAction === 'play_sound' ? '오디오 URL'
            : newAction === 'set_variable' ? '변경할 변수'
            : newAction === 'spawn_object' ? '생성할 템플릿 오브젝트'
            : newAction === 'game_win' || newAction === 'game_lose' ? '표시할 메시지 (선택)'
            : newAction === 'run_script' ? '자바스크립트 코드'
            : OBJECT_TARGET_ACTIONS.has(newAction) ? '대상 오브젝트'
            : '팝업 내용'}
        </span>
        {(() => {
          if (newAction === 'set_variable') {
            // value = "변수명|연산|값"
            const [vn = '', op = 'add', amt = ''] = newValue.split('|');
            const setSV = (name: string, o: string, a: string) => setNewValue(`${name}|${o}|${a}`);
            const selVar = variables.find((v) => v.name === vn);
            const isBool = selVar?.type === 'boolean';
            const inputCls = 'w-full bg-surface border border-border rounded-xs px-2.5 py-1.5 text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary';
            if (variables.length === 0) {
              return (
                <p className="text-muted text-[10px] bg-surface border border-amber-500/40 rounded-xs px-2 py-1.5">
                  아직 게임 변수가 없어요. 빈 곳을 클릭해 Environment → <b>게임 변수</b>에서 먼저 변수를 만드세요.
                </p>
              );
            }
            return (
              <div className="space-y-1.5">
                <SelectBox
                  value={vn || variables[0].name}
                  onChange={(name) => setSV(name, op, amt)}
                  options={variables.map((v) => ({ value: v.name, label: `${v.name} (${v.type === 'boolean' ? '참/거짓' : '숫자'})` }))}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <SelectBox
                    value={op}
                    onChange={(o) => setSV(vn || variables[0].name, o, o === 'random' ? '1,6' : amt)}
                    options={isBool
                      ? [{ value: 'set', label: '설정 =' }, { value: 'toggle', label: '토글(반전)' }]
                      : [{ value: 'add', label: '더하기 +' }, { value: 'sub', label: '빼기 −' }, { value: 'set', label: '설정 =' }, { value: 'mul', label: '곱하기 ×' }, { value: 'random', label: '랜덤 🎲' }]}
                  />
                  {op === 'toggle' ? (
                    <div className="text-[10px] text-muted/60 flex items-center px-1">값 불필요</div>
                  ) : op === 'random' ? (
                    (() => {
                      const [lo = '1', hi = '6'] = amt.split(',');
                      return (
                        <div className="flex items-center gap-1">
                          <input type="number" value={lo} onChange={(e) => setSV(vn || variables[0].name, op, `${e.target.value},${hi}`)} placeholder="min" className={inputCls} />
                          <span className="text-[10px] text-muted/60">~</span>
                          <input type="number" value={hi} onChange={(e) => setSV(vn || variables[0].name, op, `${lo},${e.target.value}`)} placeholder="max" className={inputCls} />
                        </div>
                      );
                    })()
                  ) : isBool ? (
                    <SelectBox
                      value={amt === 'true' ? 'true' : 'false'}
                      onChange={(a) => setSV(vn || variables[0].name, op, a)}
                      options={[{ value: 'true', label: '참(true)' }, { value: 'false', label: '거짓(false)' }]}
                    />
                  ) : (
                    <input
                      type="number"
                      value={amt}
                      onChange={(e) => setSV(vn || variables[0].name, op, e.target.value)}
                      placeholder="값 (예: 1)"
                      className={inputCls}
                    />
                  )}
                </div>
                <p className="text-muted/60 text-[10px]">예: 점수 +1 → <b>더하기·1</b> / 주사위 → <b>랜덤·1~6</b> (정수 랜덤)</p>
              </div>
            );
          }
          if (newAction === 'spawn_object') {
            // value = "템플릿id|dx,dy,dz"
            const [tid = '', offStr = ''] = newValue.split('|');
            const [ox = '', oy = '', oz = ''] = offStr.split(',');
            const spawnTargets = objects.filter((o) => !o.isGroup);
            const inputCls = 'w-full bg-surface border border-border rounded-xs px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary';
            const setSpawn = (id: string, x: string, y: string, z: string) => setNewValue(`${id}|${x || 0},${y || 0},${z || 0}`);
            if (spawnTargets.length === 0) {
              return <p className="text-muted text-[10px] bg-surface border border-amber-500/40 rounded-xs px-2 py-1.5">생성할 오브젝트(템플릿)가 없어요. 먼저 오브젝트를 하나 만들어 두세요(원본은 숨겨두고 템플릿으로 씀).</p>;
            }
            return (
              <div className="space-y-1.5">
                <SelectBox
                  value={tid || spawnTargets[0].id}
                  onChange={(id) => setSpawn(id, ox, oy, oz)}
                  options={spawnTargets.map((o) => ({ value: o.id, label: o.name }))}
                />
                <div>
                  <span className="text-[10px] text-muted/50 block mb-0.5">위치 오프셋 (원본 기준 X, Y, Z)</span>
                  <div className="grid grid-cols-3 gap-1">
                    <input type="number" step={0.5} value={ox} onChange={(e) => setSpawn(tid || spawnTargets[0].id, e.target.value, oy, oz)} placeholder="X" className={inputCls} />
                    <input type="number" step={0.5} value={oy} onChange={(e) => setSpawn(tid || spawnTargets[0].id, ox, e.target.value, oz)} placeholder="Y" className={inputCls} />
                    <input type="number" step={0.5} value={oz} onChange={(e) => setSpawn(tid || spawnTargets[0].id, ox, oy, e.target.value)} placeholder="Z" className={inputCls} />
                  </div>
                </div>
                <p className="text-muted/60 text-[10px]">선택 오브젝트의 <b>복사본</b>을 생성합니다. 원본을 숨겨(Visibility) 템플릿으로 쓰면 좋아요. (그룹·자식은 미지원 — 단일 오브젝트 권장)</p>
              </div>
            );
          }
          if (newAction === 'run_script') {
            return (
              <div className="space-y-1">
                <textarea
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  rows={5}
                  placeholder={"api.add('score', 1);\nif (api.get('score') >= 10) api.win('클리어!');"}
                  className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5 text-[11px] font-mono placeholder-muted/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                />
                <p className="text-muted/60 text-[10px] leading-relaxed">
                  사용: <b>api.get/set/add</b>(변수) · <b>api.show/hide</b>(id) · <b>api.despawn</b>(id) · <b>api.popup</b>(내용) · <b>api.sound</b>(url) · <b>api.win/lose</b>(메시지) · <b>self</b>(이 오브젝트). 제작자 자신의 코드가 뷰어에서 실행됩니다.
                </p>
              </div>
            );
          }
          if (newAction === 'show_popup') {
            const p = newPopup ?? {};
            const mode = p.mode ?? 'auto';
            const setP = (patch: Partial<PopupConfig>) => setNewPopup({ ...p, ...patch });
            const inputCls = 'w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary';
            return (
              <div className="space-y-2">
                <SelectBox
                  value={mode}
                  onChange={(m) => setP({ mode: m as PopupConfig['mode'] })}
                  options={[
                    { value: 'auto', label: '자동 (텍스트·이미지·영상·YouTube)' },
                    { value: 'url', label: '웹사이트 URL (iframe 삽입)' },
                    { value: 'html', label: '커스텀 HTML (샌드박스)' },
                  ]}
                />
                {mode === 'html' ? (
                  <textarea
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={'<div style="padding:16px">안녕하세요</div>'}
                    rows={5}
                    className={`${inputCls} font-mono resize-y`}
                  />
                ) : (
                  <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={mode === 'url' ? 'https://example.com' : '텍스트 또는 이미지/영상/YouTube URL'}
                    className={inputCls}
                    onKeyDown={(e) => e.key === 'Enter' && addEvent()}
                  />
                )}
                <div className="space-y-1.5 border-t border-border/60 pt-2">
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">위치</span>
                    <SelectBox
                      value={p.position ?? 'center'}
                      onChange={(v) => setP({ position: v as PopupConfig['position'] })}
                      options={[
                        { value: 'center', label: '중앙 모달 (기본)' },
                        { value: 'bottom', label: '하단 시트' },
                        { value: 'left', label: '왼쪽 패널' },
                        { value: 'right', label: '오른쪽 패널' },
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">애니메이션</span>
                    <SelectBox
                      value={p.anim ?? 'auto'}
                      onChange={(v) => setP({ anim: v as PopupConfig['anim'] })}
                      options={[
                        { value: 'auto', label: '자동 (위치에 맞게)' },
                        { value: 'fade', label: '페이드' },
                        { value: 'scale', label: '스케일' },
                        { value: 'slide', label: '슬라이드' },
                        { value: 'none', label: '없음' },
                      ]}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block">
                      <span className="text-[10px] text-muted/50 block mb-1">너비 (선택)</span>
                      <input type="text" value={p.width ?? ''} onChange={(e) => setP({ width: e.target.value })} placeholder="예: 800px, 90vw" className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-muted/50 block mb-1">높이 (선택)</span>
                      <input type="text" value={p.height ?? ''} onChange={(e) => setP({ height: e.target.value })} placeholder="예: 600px, 80vh" className={inputCls} />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">제목 (선택)</span>
                    <input type="text" value={p.title ?? ''} onChange={(e) => setP({ title: e.target.value })} placeholder="오브젝트 이름" className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">배경색 (선택)</span>
                    <div className="flex items-center gap-1.5">
                      <input type="color" value={p.bg || '#ffffff'} onChange={(e) => setP({ bg: e.target.value })} className="w-7 h-7 rounded-xs border border-border bg-surface shrink-0 cursor-pointer" />
                      <input type="text" value={p.bg ?? ''} onChange={(e) => setP({ bg: e.target.value })} placeholder="#ffffff (기본 흰색)" className={inputCls} />
                    </div>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[10px] text-muted/50">제목·닫기 표시 (chrome)</span>
                    <Toggle value={p.chrome !== false} onChange={(v) => setP({ chrome: v })} />
                  </label>
                  {p.chrome === false && (
                    <p className="text-muted/40 text-[10px] leading-relaxed">
                      몰입형 — 제목바·하단 닫기 버튼을 숨기고 우상단 플로팅 ✕만 표시, 여백 0(iframe이 카드에 꽉 참).
                    </p>
                  )}
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">내부 여백 (선택)</span>
                    <input type="text" value={p.padding ?? ''} onChange={(e) => setP({ padding: e.target.value })} placeholder="예: 0, 24px" className={inputCls} />
                  </label>
                  {(mode === 'url' || mode === 'html') && (
                    <p className="text-muted/50 text-[10px] leading-relaxed">
                      {mode === 'url'
                        ? '일부 사이트는 보안설정(X-Frame-Options)으로 삽입이 차단될 수 있어요. 그 경우 팝업 안 ‘새 탭에서 열기’ 버튼으로 열립니다.'
                        : 'HTML은 샌드박스(iframe)로 격리 렌더돼 페이지 스타일/스크립트에 영향을 주지 않아요.'}
                    </p>
                  )}
                  <p className="text-muted/40 text-[10px] leading-relaxed">
                    비운 항목은 씬 기본 팝업 설정 → 하드 기본값 순으로 적용돼요. (Environment → 팝업 기본값)
                  </p>
                </div>
              </div>
            );
          }
          if (newAction === 'reset_camera') {
            return <p className="text-muted/60 text-[10px] py-1">값이 필요 없습니다 — 클릭 시 카메라가 초기 시점으로 복귀합니다.</p>;
          }
          if (newAction === 'animate_object') {
            // value = "대상objectId|클립이름" — 대상 오브젝트 + 그 GLB의 클립 2단 선택
            const sep = newValue.indexOf('|');
            const targetId = sep >= 0 ? newValue.slice(0, sep) : newValue;
            const clip = sep >= 0 ? newValue.slice(sep + 1) : '';
            const targetOpts = objects.filter((o) => o.id !== obj?.id).map((o) => ({ value: o.id, label: o.name }));
            const targetObj = objects.find((o) => o.id === targetId);
            const targetGlbUrl = targetObj?.assetId ? assets.find((a) => a.id === targetObj.assetId)?.dracoUrl : null;
            return (
              <div className="space-y-1.5">
                <SelectBox value={targetId} onChange={(id) => setNewValue(`${id}|${clip}`)} options={targetOpts} placeholder="대상 오브젝트 선택..." />
                {targetId && (targetGlbUrl
                  ? <GlbClipPicker url={targetGlbUrl} value={clip} onChange={(c) => setNewValue(`${targetId}|${c}`)} />
                  : <p className="text-muted/60 text-[10px] py-1">이 오브젝트엔 애니메이션(GLB)이 없습니다.</p>
                )}
              </div>
            );
          }
          if (newAction === 'move_object') {
            // value = "대상objectId|dx,dy,dz|초" — 원래 저장 위치 기준 오프셋 + 이동 시간
            const [tid = '', offsetStr = '', durStr = ''] = newValue.split('|');
            const nums = offsetStr.split(',').map((s) => parseFloat(s));
            const off = {
              x: Number.isFinite(nums[0]) ? nums[0] : 0,
              y: Number.isFinite(nums[1]) ? nums[1] : 0,
              z: Number.isFinite(nums[2]) ? nums[2] : 0,
            };
            const durParsed = parseFloat(durStr);
            const dur = Number.isFinite(durParsed) ? durParsed : 1;
            const compose = (id: string, o: { x: number; y: number; z: number }, d: number) =>
              `${id}|${o.x},${o.y},${o.z}|${d}`;
            // 자기 자신도 대상 가능 (클릭하면 스스로 움직이는 문/플랫폼 등)
            const targetOpts = objects.map((o) => ({ value: o.id, label: o.id === obj?.id ? `${o.name} (자신)` : o.name }));
            return (
              <div className="space-y-1.5">
                <SelectBox value={tid} onChange={(id) => setNewValue(compose(id, off, dur))} options={targetOpts} placeholder="대상 오브젝트 선택..." />
                {tid && (
                  <>
                    <XYZRow label="이동량" x={off.x} y={off.y} z={off.z}
                      onChangeX={(v) => setNewValue(compose(tid, { ...off, x: v }, dur))}
                      onChangeY={(v) => setNewValue(compose(tid, { ...off, y: v }, dur))}
                      onChangeZ={(v) => setNewValue(compose(tid, { ...off, z: v }, dur))}
                      onCommit={() => {}} dragStep={0.1}
                    />
                    <LabeledNum label="이동 시간(초)" value={dur}
                      onChange={(v) => setNewValue(compose(tid, off, Math.max(0, v)))}
                      onCommit={() => {}}
                      min={0} max={30} precision={1} dragStep={0.05}
                    />
                    <p className="text-muted/50 text-[10px]">
                      누적이 아니라 항상 원래 위치 기준으로 이동합니다. (0,0,0) 이벤트를 하나 더 만들면 제자리로 돌아옵니다.
                    </p>
                  </>
                )}
              </div>
            );
          }
          if (newAction === 'play_sound') {
            const audioAssets = assets.filter((a) => a.type === 'audio');
            return (
              <div className="space-y-1.5">
                {audioAssets.length > 0 && (
                  <SelectBox
                    value={audioAssets.some((a) => a.dracoUrl === newValue) ? newValue : ''}
                    onChange={setNewValue}
                    options={audioAssets.map((a) => ({ value: a.dracoUrl, label: a.name, icon: <Music size={12} /> }))}
                    placeholder="업로드한 오디오 선택..."
                  />
                )}
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="또는 https://... (mp3/wav/ogg) 직접 입력"
                  className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => e.key === 'Enter' && addEvent()}
                />
                <p className="text-muted/50 text-[10px]">트리거 발동 시 오디오를 재생합니다. Audio 탭에서 올린 파일을 고르거나 URL을 직접 넣을 수 있어요. 재생 버튼으로 미리듣기.</p>
              </div>
            );
          }
          if (newAction === 'go_to_scene') {
            const opts = sceneList.filter((s) => s.id !== sceneId).map((s) => ({ value: s.id, label: s.name }));
            return opts.length > 0 ? (
              <SelectBox value={newValue} onChange={setNewValue} options={opts} placeholder="이동할 씬 선택..." />
            ) : (
              <p className="text-muted/60 text-[10px] py-1">이동할 다른 씬이 없습니다. 먼저 씬을 추가하세요.</p>
            );
          }
          if (OBJECT_TARGET_ACTIONS.has(newAction)) {
            // 씬의 모든 오브젝트를 대상으로 — 자기 자신 포함(클릭→자기 포커스/숨김 등이 흔한 케이스)
            const opts = objects.map((o) => ({
              value: o.id,
              label: o.id === obj?.id ? `${o.name} (이 오브젝트)` : o.name,
            }));
            const isDoorAction = newAction === 'set_passable' || newAction === 'set_solid' || newAction === 'toggle_collision';
            return opts.length > 0 ? (
              <div className="space-y-1.5">
                <SelectBox value={newValue} onChange={setNewValue} options={opts} placeholder="대상 오브젝트 선택..." />
                {isDoorAction && (
                  <p className="text-muted/50 text-[10px]">
                    대상의 <b>콜라이더만</b> 켜고/끕니다(모습은 그대로). 플레이 모드에서 통과 가능/불가가 바뀌어요 —
                    문·차단봉 등에 씁니다. 애니메이션(문 열림)은 별도 이벤트로 함께 거세요. 탐색 모드엔 영향 없음.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted/60 text-[10px] py-1">대상으로 지정할 오브젝트가 없습니다.</p>
            );
          }
          const glbUrl = newAction === 'play_animation' && obj?.assetId
            ? assets.find((a) => a.id === obj.assetId)?.dracoUrl
            : null;
          return glbUrl ? (
            <GlbClipPicker url={glbUrl} value={newValue} onChange={setNewValue} />
          ) : (
            <>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={newAction === 'open_url' ? 'https://...'
                  : newAction === 'emit_event' ? 'my_event_name'
                  : newAction === 'play_animation' ? 'Armature|Walk'
                  : newAction === 'game_win' ? '예: 클리어! (비우면 기본 메시지)'
                  : newAction === 'game_lose' ? '예: 게임 오버 (비우면 기본 메시지)'
                  : '텍스트 또는 이미지/영상/YouTube URL'}
                className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === 'Enter' && addEvent()}
              />
              {newAction === 'play_animation' && (
                <p className="text-muted/50 text-[10px] mt-1">GLB 오브젝트를 선택하면 클립 목록이 자동으로 표시됩니다.</p>
              )}
            </>
          );
        })()}
      </div>

      {/* 조건 게이트 (다중 AND/OR) + else 분기 — GAME_LOGIC.md */}
      <div className="border-t border-border/60 pt-2 space-y-2">
        {newConditions.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted/50 font-semibold tracking-wide">조건 — 참일 때만 발동</span>
              {newConditions.length > 1 && (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setNewLogic('and')} className={`px-1.5 py-0.5 rounded text-[10px] ${newLogic === 'and' ? 'bg-primary text-white' : 'text-muted/60 hover:text-foreground'}`}>AND(전부)</button>
                  <button onClick={() => setNewLogic('or')} className={`px-1.5 py-0.5 rounded text-[10px] ${newLogic === 'or' ? 'bg-primary text-white' : 'text-muted/60 hover:text-foreground'}`}>OR(하나)</button>
                </div>
              )}
            </div>
            {variables.length === 0 ? (
              <p className="text-muted text-[10px] bg-surface border border-amber-500/40 rounded-xs px-2 py-1.5">
                먼저 게임 변수를 만드세요(빈 곳 클릭 → Environment → 게임 변수).
              </p>
            ) : newConditions.map((c, i) => {
              const selVar = variables.find((v) => v.name === c.variable) ?? variables[0];
              const isBool = selVar.type === 'boolean';
              const inputCls = 'w-full bg-surface border border-border rounded-xs px-2.5 py-1.5 text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary';
              const upd = (patch: Partial<EventCondition>) => setNewConditions((cs) => cs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="flex items-start gap-1">
                  <div className="flex-1 space-y-1">
                    <SelectBox
                      value={c.variable || variables[0].name}
                      onChange={(name) => upd({ variable: name })}
                      options={variables.map((v) => ({ value: v.name, label: `${v.name} (${v.type === 'boolean' ? '참/거짓' : '숫자'})` }))}
                    />
                    <div className="grid grid-cols-2 gap-1">
                      <SelectBox
                        value={c.op}
                        onChange={(op) => upd({ op: op as EventCondition['op'] })}
                        options={isBool
                          ? [{ value: '==', label: '같음 ==' }, { value: '!=', label: '다름 !=' }]
                          : [{ value: '>=', label: '이상 ≥' }, { value: '>', label: '초과 >' }, { value: '==', label: '같음 ==' }, { value: '<=', label: '이하 ≤' }, { value: '<', label: '미만 <' }, { value: '!=', label: '다름 !=' }]}
                      />
                      {isBool ? (
                        <SelectBox
                          value={c.value === true ? 'true' : 'false'}
                          onChange={(v) => upd({ value: v === 'true' })}
                          options={[{ value: 'true', label: '참(true)' }, { value: 'false', label: '거짓(false)' }]}
                        />
                      ) : (
                        <input type="number" value={typeof c.value === 'number' ? c.value : 0} onChange={(e) => upd({ value: Number(e.target.value) })} className={inputCls} />
                      )}
                    </div>
                  </div>
                  <button onClick={() => setNewConditions((cs) => cs.filter((_, j) => j !== i))} title="조건 삭제" className="p-1 mt-0.5 rounded text-muted/50 hover:text-red-500 hover:bg-red-500/10"><X size={12} /></button>
                </div>
              );
            })}
            {variables.length > 0 && (
              <button
                onClick={() => setNewConditions((cs) => [...cs, { variable: variables[0]?.name ?? '', op: '>=', value: 0 }])}
                className="text-[10px] text-primary hover:underline"
              >
                + 조건 하나 더
              </button>
            )}

            {/* else 분기 — 조건 거짓일 때 대신 실행할 액션 */}
            <div className="pt-1 border-t border-border/40">
              {newElse ? (
                <div className="bg-surface border border-border rounded-xs p-2 space-y-1.5 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted/50 font-semibold tracking-wide">아니면(else) 실행</span>
                    <button onClick={() => setNewElse(undefined)} className="text-[10px] text-muted/60 hover:text-foreground">제거</button>
                  </div>
                  <SelectBox
                    value={newElse.action}
                    onChange={(a) => setNewElse({ action: a as EventAction, value: '' })}
                    options={ELSE_ACTION_OPTIONS}
                  />
                  {(() => {
                    const inputCls = 'w-full bg-surface border border-border rounded-xs px-2.5 py-1.5 text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary';
                    if (OBJECT_TARGET_ACTIONS.has(newElse.action)) {
                      return <SelectBox value={newElse.value} onChange={(v) => setNewElse({ ...newElse, value: v })} options={objects.map((o) => ({ value: o.id, label: o.id === obj?.id ? `${o.name} (이 오브젝트)` : o.name }))} placeholder="대상 오브젝트..." />;
                    }
                    if (newElse.action === 'game_win' || newElse.action === 'game_lose' || newElse.action === 'reset_camera') {
                      return newElse.action === 'reset_camera' ? <p className="text-[10px] text-muted/60">값 불필요</p> : <input value={newElse.value} onChange={(e) => setNewElse({ ...newElse, value: e.target.value })} placeholder="메시지(선택)" className={inputCls} />;
                    }
                    return <input value={newElse.value} onChange={(e) => setNewElse({ ...newElse, value: e.target.value })} placeholder={newElse.action === 'set_variable' ? 'score|add|1' : newElse.action === 'open_url' ? 'https://...' : '값'} className={inputCls} />;
                  })()}
                  <p className="text-[10px] text-muted/50">조건이 <b>거짓</b>이면 이 액션을 대신 실행합니다(예: 참이면 문 열기 / 아니면 &quot;열쇠 필요&quot; 팝업).</p>
                </div>
              ) : (
                <button onClick={() => setNewElse({ action: 'show_object', value: '' })} className="text-[10px] text-muted/60 hover:text-primary mt-1">+ 아니면(else) 액션</button>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setNewConditions([{ variable: variables[0]?.name ?? '', op: '>=', value: 0 }])}
            disabled={variables.length === 0}
            className="text-[10px] text-primary hover:underline disabled:text-muted/40 disabled:no-underline"
          >
            + 조건 추가{variables.length === 0 ? ' (게임 변수 필요)' : newTrigger === 'variable_changed' ? ' (필수)' : ' (선택)'}
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={addEvent}
          className="flex-1 py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white  text-[11px] font-semibold transition-colors"
        >
          {editingId ? '저장' : '추가'}
        </button>
        <button
          onClick={cancelEventForm}
          className="flex-1 py-1.5 rounded-xs bg-background hover:bg-surface text-foreground  text-[11px] transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );


  return (
    <aside className="flex flex-col bg-surface border-l border-border overflow-hidden relative h-full">
      {/* 이벤트 프리뷰 팝업 오버레이 */}
      {previewPopup !== null && (() => {
        // 뷰어와 동일 병합(이벤트 config > 씬 defaultPopup)으로 모드/크기/배경을 미리보기.
        // 위치 프리셋은 에디터에선 중앙 고정으로 보여주고(실제 위치는 뷰어), 모드(iframe/html)는 실제로 렌더한다.
        const c = previewPopup.config;
        const d = environment.defaultPopup;
        const mode = c?.mode ?? 'auto';
        const isFrame = mode === 'url' || mode === 'html';
        const width = c?.width ?? d?.width;
        const height = c?.height ?? d?.height;
        const bg = c?.bg ?? d?.bg;
        const posNote = c?.position && c.position !== 'center'
          ? ` · 뷰어에선 ${({ bottom: '하단', left: '왼쪽', right: '오른쪽' } as Record<string, string>)[c.position]} 배치`
          : '';
        const cardStyle = isFrame
          ? { width: width || 'min(80vw, 720px)', height: height || 'min(70vh, 520px)', background: bg }
          : { width: width || undefined, background: bg };
        return (
          <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreviewPopup(null)}>
            <div
              className={`bg-white border border-border rounded-2xl shadow-2xl ${isFrame ? 'flex flex-col p-4 max-w-[92vw] max-h-[88vh]' : 'p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto'}`}
              style={cardStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] text-muted/60 mb-2 font-semibold tracking-wide shrink-0">팝업 미리보기{posNote}</p>
              {isFrame ? (
                <div className="flex-1 min-h-0"><PopupFrame value={previewPopup.content} config={c} /></div>
              ) : (
                <RichContent value={previewPopup.content} onLight />
              )}
              <button
                onClick={() => setPreviewPopup(null)}
                className="mt-3 shrink-0 w-full py-1.5 rounded-xs bg-primary text-white  text-[11px] font-semibold hover:bg-primary/80 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        );
      })()}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
        <span className=" text-[11px] font-semibold text-foreground tracking-wide flex-1">{obj.isGroup ? 'Inspector — 그룹' : 'Inspector'}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 이름 + GLB 내보내기 */}
        <div className="px-3 py-2 flex items-center gap-1.5">
          <input
            value={obj.name}
            onChange={(e) => updateObject(obj.id, { name: e.target.value })}
            onBlur={pushHistory}
            className="flex-1 min-w-0 bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          />
          <button
            onClick={() => { requestExport(selectedIds.length > 0 ? selectedIds : [obj.id], obj.name || 'object'); addToast('GLB 내보내기 시작', 'success'); }}
            title="이 오브젝트를 .glb 파일로 내보내기(다운로드)"
            className="shrink-0 h-[30px] px-2 rounded-xs border border-border text-muted hover:border-primary/60 hover:text-primary text-[11px] transition-all inline-flex items-center gap-1"
          >
            <Download size={12} /> GLB
          </button>
        </div>

        {/* Prefab — 원본 정의화 / 인스턴스 동기화 */}
        {(() => {
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
        })()}

        {/* Transform */}
        <GroupBox>
          <SectionHeader title="Transform" hint="위치·회전·크기. 기즈모 회전 중 Shift를 누르면 15°씩 스냅돼요. GLB는 추가 시 밑면이 바닥에 자동 정렬되고, '바닥에 놓기'로 다시 맞출 수 있어요." isOpen={isOpen('transform')} onToggle={() => toggleSection('transform')} />
          {isOpen('transform') && (
            <div className="px-3 pb-4 space-y-1">
              {/* 기즈모 드래그 중 라이브 채널로 실시간 갱신(캔버스 리렌더 없이 이 서브트리만) */}
              <LiveTransformRows obj={obj} setPos={setPos} setRot={setRot} setScl={setScl} onCommit={pushHistory} />
              {/* 실측 크기(m) — 지오메트리 로컬 bbox × 스케일. 입력 시 역산해 스케일을 맞춘다.
                  단, 로컬 크기가 1인 모양(박스·구체·원기둥·각뿔대 등)은 크기=스케일이라 중복 → 숨김.
                  로컬 크기가 1이 아닌 모양(평면·돌출·로프트)에서만 표시해 '실측'이 의미 있게 한다. */}
              {obj.primitiveShape && !obj.content && !obj.assetId && (() => {
                const lb = localBBox(objects, assets, obj.id);
                const ls = lb && !lb.isEmpty() ? lb.getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1);
                const nonUnit = Math.abs(ls.x - 1) > 0.01 || Math.abs(ls.y - 1) > 0.01 || Math.abs(ls.z - 1) > 0.01;
                if (!nonUnit) return null; // 박스류(크기=스케일)는 숨김
                const setSize = (axis: 'x' | 'y' | 'z', v: number) => setScl(axis, Math.max(0.001, v) / (ls[axis] || 1));
                return (
                  <XYZRow
                    label="크기 (m)"
                    x={+(ls.x * obj.scale.x).toFixed(3)}
                    y={+(ls.y * obj.scale.y).toFixed(3)}
                    z={+(ls.z * obj.scale.z).toFixed(3)}
                    onChangeX={(v) => setSize('x', v)}
                    onChangeY={(v) => setSize('y', v)}
                    onChangeZ={(v) => setSize('z', v)}
                    onCommit={pushHistory}
                    dragStep={0.1}
                  />
                );
              })()}
              {/* 밑면을 바닥에 정렬 — 원점이 발밑이 아니어서 바닥에 파묻히는 경우 교정(모든 루트 타입) */}
              {!obj.parentId && (
                <button
                  onClick={snapToGround}
                  disabled={!canSnapToGround}
                  title={canSnapToGround ? '오브젝트 밑면을 바닥(y=0)에 맞춤' : (glbUnloaded ? '모델 로딩 후 사용할 수 있습니다' : '바닥에 놓을 수 없습니다')}
                  className="w-full mt-1 py-1.5 rounded-xs border border-border text-muted hover:border-primary/60 hover:text-primary hover:bg-primary/5 text-[11px] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted disabled:hover:bg-transparent inline-flex items-center justify-center gap-1.5"
                >
                  <ArrowDownToLine size={13} /> 바닥에 놓기
                </button>
              )}
            </div>
          )}
        </GroupBox>

        {/* Subdivision — 표면 세분화(부드러운 유기적 곡면). 모든 프리미티브 */}
        {obj.primitiveShape && !obj.content && !obj.assetId && !obj.light && !obj.particle && (
          <GroupBox>
            <SectionHeader title="Subdivision" hint="표면을 쪼개 부드러운 유기적 곡면으로 만들어요(블렌더 Subdivision Surface). 레벨↑ = 더 둥글지만 면이 급증해 무거워져요(최대 3)." />
            <div className="px-3 pb-4">
              <LabeledNum label="레벨 (0 = 원본)" value={obj.geom?.subdivisions ?? 0}
                onChange={(v) => updateObject(obj.id, { geom: { ...obj.geom, subdivisions: Math.round(v) } })} onCommit={pushHistory}
                min={0} max={3} precision={0} dragStep={1} />
              <p className="text-[10px] text-muted/50 mt-1">각진 박스도 레벨을 올리면 둥글둥글해져요. 성능상 3까지.</p>
            </div>
          </GroupBox>
        )}

        {/* Geometry — 프리미티브 확장 파라미터(둥근 박스·각뿔대·로프트) */}
        {(obj.primitiveShape === 'box' || obj.primitiveShape === 'frustum' || obj.primitiveShape === 'loft') && (
          <GroupBox>
            <SectionHeader title="Geometry" hint="프리미티브 형태 조절. 박스는 모서리 둥글기, 각뿔대는 윗면 크기, 로프트는 아래→위 단면 크기를 층마다 조절해요." isOpen={isOpen('geometry')} onToggle={() => toggleSection('geometry')} />
            {isOpen('geometry') && (
              <div className="px-3 pb-4 space-y-2">
                {obj.primitiveShape === 'box' && (
                  <>
                    <LabeledNum
                      label="모서리 둥글기"
                      value={obj.geom?.cornerRadius ?? 0}
                      onChange={(v) => updateObject(obj.id, { geom: { ...obj.geom, cornerRadius: Math.max(0, Math.min(0.5, v)) } })}
                      onCommit={pushHistory}
                      min={0} max={0.5} precision={2} dragStep={0.01}
                    />
                    {(obj.geom?.cornerRadius ?? 0) > 0 && (
                      <LabeledNum
                        label="둥근면 부드러움"
                        value={obj.geom?.cornerSegments ?? 4}
                        onChange={(v) => updateObject(obj.id, { geom: { ...obj.geom, cornerSegments: Math.max(1, Math.min(10, Math.round(v))) } })}
                        onCommit={pushHistory}
                        min={1} max={10} precision={0} dragStep={1}
                      />
                    )}
                    <p className="text-[10px] text-muted/50">둥글기 0 = 각진 기본 박스.</p>
                  </>
                )}
                {obj.primitiveShape === 'frustum' && (
                  <>
                    <LabeledNum
                      label="윗면 크기"
                      value={obj.geom?.topScale ?? 0.5}
                      onChange={(v) => updateObject(obj.id, { geom: { ...obj.geom, topScale: Math.max(0, Math.min(1, v)) } })}
                      onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.02}
                    />
                    <p className="text-[10px] text-muted/50">0 = 뾰족한 각뿔, 1 = 박스. 아랫면 기준 윗면 배율.</p>
                  </>
                )}
                {obj.primitiveShape === 'loft' && (() => {
                  const sections = obj.geom?.sections && obj.geom.sections.length >= 2 ? obj.geom.sections : [1, 0.7, 0.4];
                  const setSections = (next: number[]) => updateObject(obj.id, { geom: { ...obj.geom, sections: next } });
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-muted/50 tracking-wide">단면 (아래 → 위)</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setSections([...sections, sections[sections.length - 1]]); pushHistory(); }}
                            disabled={sections.length >= 8}
                            className="w-5 h-5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[11px] leading-none disabled:opacity-40"
                            title="단면 추가"
                          >+</button>
                          <button
                            onClick={() => { if (sections.length > 2) { setSections(sections.slice(0, -1)); pushHistory(); } }}
                            disabled={sections.length <= 2}
                            className="w-5 h-5 rounded-xs bg-background text-muted hover:bg-surface hover:text-foreground text-[11px] leading-none disabled:opacity-40"
                            title="마지막 단면 제거"
                          >−</button>
                        </div>
                      </div>
                      {sections.map((sv, i) => (
                        <LabeledNum
                          key={i}
                          label={`단면 ${i + 1}${i === 0 ? ' (바닥)' : i === sections.length - 1 ? ' (꼭대기)' : ''}`}
                          value={sv}
                          onChange={(v) => setSections(sections.map((x, j) => (j === i ? Math.max(0, Math.min(1, v)) : x)))}
                          onCommit={pushHistory}
                          min={0} max={1} precision={2} dragStep={0.02}
                        />
                      ))}
                      <p className="text-[10px] text-muted/50">아래→위 각 층의 폭(0~1). 층을 늘려 병·꽃병·로켓·탑처럼 굴곡진 형태를 만들어요.</p>
                    </>
                  );
                })()}
              </div>
            )}
          </GroupBox>
        )}

        {/* Cloner (라이브 비파괴 배열) — 클로너 그룹일 때 파라미터를 바꾸면 복제본이 실시간 재생성 */}
        {obj.clonerConfig && (() => {
          const cfg = obj.clonerConfig!;
          const cloneCount = objects.filter((o) => o.parentId === obj.id).length;
          const setCfg = (patch: Partial<typeof cfg>) => updateCloner(obj.id, { ...cfg, ...patch });
          return (
            <GroupBox>
              <SectionHeader title="Cloner (라이브)" icon={<Grid2x2 size={12} />} hint="비파괴 배열 — 개수/간격/모드를 바꾸면 복제본이 실시간으로 다시 생성돼요. 소스(원본) 1개를 편집하면 모든 복제본에 반영됩니다. 복제본은 트리에서 클로너 그룹 아래에 뜹니다." />
              <div className="px-3 pb-4 space-y-2">
                <div className="grid grid-cols-2 gap-1">
                  {(['linear', 'radial'] as const).map((m) => (
                    <button key={m} onClick={() => { setCfg({ mode: m }); pushHistory(); }}
                      className={`py-1 rounded-xs text-[10px] transition-colors ${cfg.mode === m ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                    >{m === 'linear' ? '선형 (Linear)' : '원형 (Radial)'}</button>
                  ))}
                </div>
                <LabeledNum label="개수 (원본 포함)" value={cfg.count} onChange={(v) => setCfg({ count: Math.max(2, Math.min(200, Math.round(v))) })} onCommit={pushHistory} min={2} max={200} precision={0} dragStep={1} />
                {cfg.mode === 'linear' ? (
                  <XYZRow label="간격 (m)" x={cfg.offset.x} y={cfg.offset.y} z={cfg.offset.z}
                    onChangeX={(v) => setCfg({ offset: { ...cfg.offset, x: v } })}
                    onChangeY={(v) => setCfg({ offset: { ...cfg.offset, y: v } })}
                    onChangeZ={(v) => setCfg({ offset: { ...cfg.offset, z: v } })}
                    onCommit={pushHistory} dragStep={0.5}
                  />
                ) : (
                  <>
                    <LabeledNum label="반경 (m)" value={cfg.radius ?? 3} onChange={(v) => setCfg({ radius: Math.max(0.1, v) })} onCommit={pushHistory} min={0.1} max={100} precision={2} dragStep={0.25} />
                    <div>
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">원이 도는 축</span>
                      <div className="grid grid-cols-3 gap-1">
                        {(['x', 'y', 'z'] as const).map((ax) => (
                          <button key={ax} onClick={() => { setCfg({ axis: ax }); pushHistory(); }}
                            className={`py-1 rounded-xs text-[10px] uppercase transition-colors ${(cfg.axis ?? 'y') === ax ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                          >{ax}{ax === 'y' ? ' (바닥)' : ''}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <p className="text-[10px] text-muted/50">현재 {cloneCount}개 배치 중. 소스를 편집하면 복제본에 자동 반영돼요.</p>
              </div>
            </GroupBox>
          );
        })()}

        {/* Array — 일정 간격 반복 복제 (울타리·기둥·계단 등). 클로너 그룹엔 위 Cloner 섹션을 쓰므로 숨김. */}
        {!obj.clonerConfig && !obj.clonerClone && (
        <GroupBox>
          <SectionHeader title="Array / Cloner" hint="선택 오브젝트를 여러 개 복제 배치해요. 선형(Linear)=일정 간격 나열(울타리·기둥·계단), 원형(Radial)=중심 기준 원형 배치(시계 숫자·원형 테이블 의자). 개수는 원본 포함, 되돌리기(Ctrl+Z) 가능. '라이브 클로너'로 만들면 이후 개수·간격을 실시간으로 바꿀 수 있어요." isOpen={isOpen('array')} onToggle={() => toggleSection('array')} />
            <div className="px-3 pb-4 space-y-2">
              {/* 모드 토글 */}
              <div className="grid grid-cols-2 gap-1">
                {(['linear', 'radial'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setArrayMode(m)}
                    className={`py-1 rounded-xs text-[10px] transition-colors ${arrayMode === m ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                  >
                    {m === 'linear' ? '선형 (Linear)' : '원형 (Radial)'}
                  </button>
                ))}
              </div>
              <LabeledNum label="개수 (원본 포함)" value={arrayCount} onChange={(v) => setArrayCount(Math.max(2, Math.min(100, Math.round(v))))} onCommit={() => {}} min={2} max={100} precision={0} dragStep={1} />
              {arrayMode === 'linear' ? (
                <XYZRow label="간격 (m)" x={arrayOffset.x} y={arrayOffset.y} z={arrayOffset.z}
                  onChangeX={(v) => setArrayOffset((o) => ({ ...o, x: v }))}
                  onChangeY={(v) => setArrayOffset((o) => ({ ...o, y: v }))}
                  onChangeZ={(v) => setArrayOffset((o) => ({ ...o, z: v }))}
                  onCommit={() => {}} dragStep={0.5}
                />
              ) : (
                <>
                  <LabeledNum label="반경 (m)" value={arrayRadius} onChange={(v) => setArrayRadius(Math.max(0.1, v))} onCommit={() => {}} min={0.1} max={100} precision={2} dragStep={0.25} />
                  <div>
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">원이 도는 축</span>
                    <div className="grid grid-cols-3 gap-1">
                      {(['x', 'y', 'z'] as const).map((ax) => (
                        <button key={ax} onClick={() => setArrayAxis(ax)}
                          className={`py-1 rounded-xs text-[10px] uppercase transition-colors ${arrayAxis === ax ? 'bg-primary text-white' : 'bg-background text-muted hover:bg-surface hover:text-foreground'}`}
                        >{ax}{ax === 'y' ? ' (바닥)' : ''}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {/* 위 설정을 공유하는 두 방식 — 한 번 복제(독립) vs 라이브 클로너(계속 편집) */}
              <button
                onClick={() => {
                  arraySelected(arrayCount, arrayOffset, arrayMode === 'radial' ? { radius: arrayRadius, axis: arrayAxis } : null);
                  addToast(`독립 복제 ${arrayCount - 1}개 생성`, 'success');
                }}
                className="w-full py-1.5 rounded-xs bg-background border border-border text-muted hover:text-foreground hover:bg-surface text-[11px] font-medium transition-colors"
              >
<span className="inline-flex items-center gap-1.5">{arrayMode === 'radial' ? <CircleDot size={13} /> : <Grid2x2 size={13} />} 한 번 복제 ({arrayCount}개, 독립)</span>
              </button>
              {!obj.parentId && (
                <button
                  onClick={() => {
                    makeCloner({ mode: arrayMode, count: arrayCount, offset: arrayOffset, ...(arrayMode === 'radial' ? { radius: arrayRadius, axis: arrayAxis } : {}) });
                    addToast('라이브 클로너로 만들었어요', 'success');
                  }}
                  className="w-full py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
                >
<span className="inline-flex items-center gap-1.5"><Grid2x2 size={13} /> 라이브 클로너로 만들기 ({arrayCount}개)</span>
                </button>
              )}
              <p className="text-[10px] text-muted/50">
                <b>한 번 복제</b> = 독립 오브젝트를 지금 만듦(이후 개수 못 바꿈). <b>라이브 클로너</b> = 만든 뒤에도 개수·간격을 실시간으로 바꾸고, 소스를 편집하면 전부 반영돼요.
              </p>
            </div>
        </GroupBox>
        )}

        {/* Content (content 오브젝트만) */}
        {obj.content && <ContentSection obj={obj} open={isOpen('content')} onToggle={() => toggleSection('content')} />}

        {/* Material (프리미티브 + 텍스트 콘텐츠 오브젝트) — 그룹/GLB/파티클/이미지·영상 콘텐츠는 제외 */}
        {!obj.assetId && !obj.particle && (!obj.content || obj.content.type === 'text') && (
          <GroupBox>
            <SectionHeader title="Material" hint="색상·자체발광·거칠기·금속성. 프리미티브(박스/구체/원기둥 등)와 텍스트 콘텐츠에 적용돼요." isOpen={isOpen('material')} onToggle={() => toggleSection('material')} />
            {isOpen('material') && (() => {
              const matRef = obj.materialId ? (materialAssets.find((m) => m.id === obj.materialId) ?? null) : null;
              return (
              <div className="px-3 pb-4 space-y-2">
                {matRef && (
                  <div className="rounded-xs bg-primary/10 border border-primary/30 p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-primary"><Palette size={13} /> 재질 에셋 <b className="font-semibold">{matRef.name}</b></div>
                    <p className="text-[10px] text-muted/60 leading-snug">공유 재질이에요 — 편집은 Materials 탭에서 하면 이 재질을 쓰는 모든 오브젝트에 반영돼요. 이 오브젝트만 따로 바꾸려면 연결을 끊으세요.</p>
                    <button onClick={() => detachMaterial(obj.id)} className="w-full py-1 rounded-xs border border-border text-muted hover:text-foreground hover:border-primary/50 text-[10px] transition-all">연결 끊기 (독립 재질로)</button>
                  </div>
                )}
                {!matRef && (<>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Color</span>
                    <div className="px-2 flex items-center border border-border rounded-xs">
                      <input
                        type="color"
                        value={obj.material?.color ?? '#a78bfa'}
                        onChange={(e) => updateObject(obj.id, { material: { ...obj.material, color: e.target.value } })}
                        onBlur={pushHistory}
                        className="w-5 h-5 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={obj.material?.color ?? '#a78bfa'}
                        onChange={(e) => updateObject(obj.id, { material: { ...obj.material, color: e.target.value } })}
                        onBlur={pushHistory}
                      className="w-full px-2.5 py-1.5  text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className='flex-1'>
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Emissive</span>
                    <div className="px-2 flex items-center border border-border rounded-xs">
                      <input
                        type="color"
                        value={obj.material?.emissive ?? '#000000'}
                        onChange={(e) => updateObject(obj.id, { material: { ...obj.material, emissive: e.target.value } })}
                        onBlur={pushHistory}
                        className="w-5 h-5 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={obj.material?.emissive ?? '#000000'}
                        onChange={(e) => updateObject(obj.id, { material: { ...obj.material, emissive: e.target.value } })}
                        onBlur={pushHistory}
                      className="w-full px-2.5 py-1.5 text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className='flex gap-2'>
                  <div>
                    <LabeledNum
                      label="Roughness"
                      value={obj.material?.roughness ?? 0.5}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, roughness: v } })}
                      onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.005}
                    />
                  </div>
                  <div>
                    <LabeledNum
                      label="Metalness"
                      value={obj.material?.metalness ?? 0.1}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, metalness: v } })}
                      onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.005}
                    />
                  </div>
                </div>

                {/* 물리 재질(MeshPhysicalMaterial) — 클리어코트/시인/투과. 하나라도 올리면 physical 재질로 렌더(프리미티브만) */}
                {obj.primitiveShape && !obj.content && (
                  <div className="pt-2 border-t border-border/50 space-y-1.5">
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide block">물리 재질 (고급)</span>
                    <LabeledNum label="Clearcoat (코팅 광택)" value={obj.material?.clearcoat ?? 0}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, clearcoat: v } })} onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.02} />
                    <LabeledNum label="Sheen (천 광택)" value={obj.material?.sheen ?? 0}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, sheen: v } })} onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.02} />
                    <LabeledNum label="Transmission (투과/유리)" value={obj.material?.transmission ?? 0}
                      onChange={(v) => updateObject(obj.id, { material: { ...obj.material, transmission: v } })} onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.02} />
                    {(obj.material?.transmission ?? 0) > 0 && (
                      <LabeledNum label="IOR (굴절률)" value={obj.material?.ior ?? 1.5}
                        onChange={(v) => updateObject(obj.id, { material: { ...obj.material, ior: v } })} onCommit={pushHistory}
                        min={1} max={2.4} precision={2} dragStep={0.02} />
                    )}
                    <p className="text-[10px] text-muted/50">투과(Transmission)를 올리면 유리처럼 투명해져요. 셋 다 0이면 기본(standard) 재질입니다.</p>
                  </div>
                )}

                {/* Texture — 표면에 이미지 매핑(포스터/사진/로고). 프리미티브만(텍스트 콘텐츠 제외) */}
                {obj.primitiveShape && !obj.content && (() => {
                  const texActive = texPanelOpen || !!obj.material?.textureUrl;
                  return (
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Texture (이미지)</span>
                      <Toggle value={texActive} onChange={(on) => {
                        setTexPanelOpen(on);
                        if (!on) { updateObject(obj.id, { material: { ...obj.material, textureUrl: undefined, textureRepeat: undefined } }); pushHistory(); }
                      }} />
                    </div>
                    <input ref={objTexInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleObjectTexUpload(obj.id, e)} />

                    {texActive && (
                      <>
                        {/* 썸네일 그리드 드롭다운 픽커(맨 아래 업로드 포함) */}
                        <TexturePicker
                          value={obj.material?.textureUrl ?? ''}
                          textures={assets.filter((a) => a.type === 'texture').map((a) => ({ id: a.id, name: a.name, url: a.dracoUrl }))}
                          onChange={(url) => { updateObject(obj.id, { material: { ...obj.material, textureUrl: url || undefined, textureRepeat: url ? obj.material?.textureRepeat : undefined } }); pushHistory(); }}
                          onUpload={() => objTexInputRef.current?.click()}
                          uploading={objTexUploading}
                        />

                        {/* 적용된 텍스처 미리보기 + 타일 반복 */}
                        {obj.material?.textureUrl && (
                          <>
                            <img src={obj.material.textureUrl} alt="texture" className="w-full h-16 object-cover rounded-xs border border-border" />
                            <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
                              <input type="checkbox" checked={!!obj.material?.textureRepeat}
                                onChange={(e) => { updateObject(obj.id, { material: { ...obj.material, textureRepeat: e.target.checked ? { x: 2, y: 2 } : undefined } }); pushHistory(); }} />
                              타일 반복 (패턴)
                            </label>
                            {obj.material?.textureRepeat && (
                              <div className="flex gap-2">
                                <LabeledNum label="가로 반복" value={obj.material.textureRepeat.x}
                                  onChange={(v) => updateObject(obj.id, { material: { ...obj.material, textureRepeat: { x: Math.max(1, v), y: obj.material?.textureRepeat?.y ?? 1 } } })}
                                  onCommit={pushHistory} min={1} max={20} precision={0} dragStep={1} />
                                <LabeledNum label="세로 반복" value={obj.material.textureRepeat.y}
                                  onChange={(v) => updateObject(obj.id, { material: { ...obj.material, textureRepeat: { x: obj.material?.textureRepeat?.x ?? 1, y: Math.max(1, v) } } })}
                                  onCommit={pushHistory} min={1} max={20} precision={0} dragStep={1} />
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                  );
                })()}
                </>)}
                {!matRef && (
                  <button
                    onClick={() => { const id = addMaterialAsset(obj.name || '재질', obj.material ?? {}); useSceneStore.getState().assignMaterialAsset([obj.id], id); }}
                    className="w-full py-1.5 rounded-xs border border-border text-muted hover:text-primary hover:border-primary/50 text-[11px] transition-all"
                  >
                    이 재질을 에셋으로 저장 (공유)
                  </button>
                )}
              </div>
              );
            })()}
          </GroupBox>
        )}

        {/* Particle (파티클 이미터만) */}
        {obj.particle && <ParticleSection obj={obj} open={isOpen('particle')} onToggle={() => toggleSection('particle')} />}

        {/* Visibility */}
        <VisibilitySection obj={obj} open={isOpen('visibility')} onToggle={() => toggleSection('visibility')} />

        {/* Light */}
        {obj.light && <LightSection obj={obj} open={isOpen('light')} onToggle={() => toggleSection('light')} />}

        {/* Physics — 그룹·라이트 제외 */}
        {!obj.light && !obj.isGroup && <PhysicsSection obj={obj} open={isOpen('physics')} onToggle={() => toggleSection('physics')} />}

        {/* Motion — 앰비언트 애니메이션 (라이트 제외) */}
        {!obj.light && <MotionSection obj={obj} />}

        {/* Animation — GLB 내장 클립을 트리거 없이 자동 재생(idle/앰비언트). GLB 오브젝트 전용 */}
        {!obj.isGroup && obj.assetId && (() => {
          const glbUrl = assets.find((a) => a.id === obj.assetId)?.dracoUrl;
          if (!glbUrl) return null;
          return (
            <GroupBox>
              <SectionHeader title="Animation" hint="GLB에 내장된 애니메이션 클립 중 하나를 트리거 없이 씬 로드 시 자동 루프 재생해요(돌아가는 선풍기·펄럭이는 깃발·idle 캐릭터 등). 클릭/호버/영역 이벤트 애니메이션이 실행되면 그쪽으로 덮입니다(뷰어 전용)." isOpen={isOpen('animation')} onToggle={() => toggleSection('animation')} />
              {isOpen('animation') && (
                <div className="px-3 pb-4 space-y-1.5">
                  <span className="text-[10px] text-muted/50 block font-semibold tracking-wide">기본 클립</span>
                  <GlbClipPicker
                    url={glbUrl}
                    value={obj.defaultClip ?? ''}
                    onChange={(c) => { updateObject(obj.id, { defaultClip: c || undefined }); pushHistory(); }}
                  />
                  {obj.defaultClip && (
                    <button
                      onClick={() => { updateObject(obj.id, { defaultClip: undefined }); pushHistory(); }}
                      className="text-[10px] text-muted/60 hover:text-danger transition-colors"
                    >
                      기본 애니메이션 해제
                    </button>
                  )}
                  <p className="text-[10px] text-muted/50">
                    에디터엔 정적, 실제 재생은 뷰어에서 확인. 한 번 재생 후 idle 복귀는 없어요.
                  </p>
                </div>
              )}
            </GroupBox>
          );
        })()}

        {/* Events — 그룹 제외(그룹 자체는 클릭/트리거 타깃이 아님. 이벤트는 개별 오브젝트에) */}
        {!obj.isGroup && (
        <GroupBox>
        <SectionHeader title="Events" hint="트리거(클릭·호버·근접 E·영역 진입)에 따라 동작(팝업·URL·씬 이동·애니메이션·이동·사운드 등)을 실행해요. 다가가면 뜨는 '대화 말풍선'도 여기서 설정합니다." isOpen={isOpen('events')} onToggle={() => toggleSection('events')} />
        {isOpen('events') && (
          <div className="px-3 pb-4 space-y-2">
            {/* 상호작용 근접 범위 오버라이드 — 비우면 씬 기본값 사용 (interact(E)/approach·E 프롬프트·하이라이트) */}
            <div className="space-y-1">
              <span className="text-[10px] text-muted/50 block font-semibold tracking-wide">상호작용 범위 (m)</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={0.5} max={20} step={0.5}
                  value={obj.interactRange ?? ''}
                  placeholder={`씬 기본 (${environment.interactRange ?? 3})`}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updateObject(obj.id, { interactRange: v === '' ? undefined : Math.max(0.5, parseFloat(v)) });
                  }}
                  onBlur={pushHistory}
                  className="flex-1 bg-surface border border-border rounded-xs px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted/40 focus:border-primary/50 outline-none"
                />
                {obj.interactRange != null && (
                  <button
                    onClick={() => { updateObject(obj.id, { interactRange: undefined }); pushHistory(); }}
                    className="text-[10px] text-muted/60 hover:text-danger transition-colors px-1.5 py-1 shrink-0"
                  >
                    기본값
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted/50">이 오브젝트의 E/approach 발동 거리. 비우면 씬 기본값을 씁니다.</p>
            </div>

            {/* 대화(말풍선) — 플레이 모드에서 오브젝트 위에 뜨는 순차 문장 */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted/50 block font-semibold tracking-wide">대화 말풍선</span>
              <textarea
                value={dlg.lines.join('\n')}
                onChange={(e) => setDlg({ lines: e.target.value.split('\n') })}
                onBlur={pushHistory}
                rows={3}
                placeholder={'한 줄에 문장 하나 (순서대로 표시)\n예: 안녕하세요!\n무엇을 도와드릴까요?'}
                className="w-full bg-surface border border-border rounded-xs px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted/40 focus:border-primary/50 outline-none resize-y leading-relaxed"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">표시 시점</span>
                  <SelectBox
                    value={dlg.show}
                    onChange={(v) => { setDlg({ show: v as DialogueConfig['show'] }); pushHistory(); }}
                    options={[
                      { value: 'always', label: '항상' },
                      { value: 'approach', label: '다가가면' },
                      { value: 'interact', label: 'E키로 열기' },
                    ]}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">넘기기</span>
                  <SelectBox
                    value={dlg.advance}
                    onChange={(v) => { setDlg({ advance: v as DialogueConfig['advance'] }); pushHistory(); }}
                    options={[
                      { value: 'auto', label: '자동(타이머)' },
                      { value: 'manual', label: 'E키로 넘김' },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {dlg.advance === 'auto' && (
                  <label className="flex items-center gap-1.5 text-[10px] text-muted/70">
                    <span className="shrink-0">간격(초)</span>
                    <input
                      type="number" min={0.5} step={0.5}
                      value={dlg.autoSec ?? 2.5}
                      onChange={(e) => setDlg({ autoSec: parseFloat(e.target.value) || 2.5 })}
                      onBlur={pushHistory}
                      className="w-full bg-surface border border-border rounded-xs px-1.5 py-1 text-[11px] text-foreground outline-none focus:border-primary/50"
                    />
                  </label>
                )}
                <label className="flex items-center gap-1.5 text-[10px] text-muted/70">
                  <span className="shrink-0">화자</span>
                  <input
                    value={dlg.speaker ?? ''}
                    onChange={(e) => setDlg({ speaker: e.target.value })}
                    onBlur={pushHistory}
                    placeholder="이름(선택)"
                    className="w-full bg-surface border border-border rounded-xs px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted/40 outline-none focus:border-primary/50"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-[10px] text-muted/70 pt-0.5">
                <Toggle value={dlg.typing !== false} onChange={(v) => { setDlg({ typing: v }); pushHistory(); }} />
                <span>타이핑 효과</span>
              </label>
              <label className="flex items-center gap-2 text-[10px] text-muted/70">
                <Toggle value={dlg.once === true} onChange={(v) => { setDlg({ once: v }); pushHistory(); }} />
                <span>1회성 (한 번 다 보면 이 세션 동안 다시 안 뜸)</span>
              </label>
              {obj.events.some((e) => e.trigger === 'dialogue_end') && (
                <label className="flex items-center gap-1.5 text-[10px] text-muted/70">
                  <span className="shrink-0">종료 버튼</span>
                  <input
                    value={dlg.endButtonLabel ?? ''}
                    onChange={(e) => setDlg({ endButtonLabel: e.target.value })}
                    onBlur={pushHistory}
                    placeholder="확인 (기본)"
                    className="w-full bg-surface border border-border rounded-xs px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted/40 outline-none focus:border-primary/50"
                  />
                </label>
              )}
              <p className="text-muted/50 text-[10px]">
                플레이 모드 전용 · 오브젝트 바로 위 표시. 비워두면 안 뜸. 여러 문장이면 순서대로.
              </p>
            </div>

            <div className="h-px bg-border/60 my-1" />

            {obj.events.length === 0 && !showAddEvent && (
              <p className="text-muted/60  text-[11px] py-1">이벤트 없음</p>
            )}

            {obj.events.map((ev) => (
              editingId === ev.id ? (
              /* 수정 중 — 이 항목 자리에 폼을 인라인으로 표시 */
              <div key={ev.id}>{renderEventForm()}</div>
              ) : (
              <div key={ev.id} className="bg-surface border border-border/80 rounded-xs p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded-xs text-[10px] font-medium shrink-0">
                      {TRIGGER_LABELS[ev.trigger]}
                    </span>
                    <span className="text-muted/60 text-[10px]">›</span>
                    <span className="text-foreground text-[10px] truncate font-medium">{ACTION_LABELS[ev.action] ?? ev.action}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        if (ev.action === 'open_url' && ev.value) window.open(ev.value, '_blank');
                        else if (ev.action === 'show_popup') setPreviewPopup({ content: ev.value || '(내용 없음)', config: ev.popup });
                        else if (ev.action === 'emit_event') addToast(`이벤트 발송 테스트: "${ev.value}"`, 'success');
                        else if (ev.action === 'play_animation') addToast(`애니메이션 클립: "${ev.value}"`, 'info');
                        else if (ev.action === 'go_to_scene') addToast(`씬 이동: "${sceneName(ev.value)}" (플레이/뷰어에서 동작)`, 'info');
                        else if (OBJECT_TARGET_ACTIONS.has(ev.action)) addToast(`${ACTION_LABELS[ev.action]}: "${objectName(ev.value)}" (뷰어에서 동작)`, 'info');
                        else if (ev.action === 'reset_camera') addToast('카메라 초기화 (탐색 모드 뷰어에서 동작)', 'info');
                        else if (ev.action === 'animate_object') { const [tid, clip] = ev.value.split('|'); addToast(`애니메이션: "${objectName(tid)}" → "${clip ?? ''}" (뷰어에서 동작)`, 'info'); }
                        else if (ev.action === 'move_object') { const [tid, off, dur] = ev.value.split('|'); addToast(`이동: "${objectName(tid)}" Δ(${off || '0,0,0'}) ${dur || '1'}초 (뷰어에서 동작)`, 'info'); }
                        else if (ev.action === 'play_sound' && ev.value) { new Audio(ev.value).play().catch(() => addToast('오디오 재생 실패 — URL을 확인하세요', 'error')); }
                      }}
                      title="미리보기"
                      className="text-muted/50 hover:text-primary w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                    >
                      <Play size={12} />
                    </button>
                    <button
                      onClick={() => startEdit(ev)}
                      title="수정"
                      className="text-muted/50 hover:text-primary w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => removeEvent(ev.id)}
                      className="text-muted/40 hover:text-danger w-4 h-4 flex items-center justify-center rounded hover:bg-danger/10 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                {ev.value && (
                  <p className="text-muted/60 text-[10px] mt-1.5 truncate  bg-background/50 rounded px-1.5 py-0.5">
                    {ev.action === 'go_to_scene' ? `→ ${sceneName(ev.value)}`
                      : ev.action === 'animate_object' ? `→ ${objectName(ev.value.split('|')[0])} : ${ev.value.split('|')[1] ?? ''}`
                      : ev.action === 'move_object' ? `→ ${objectName(ev.value.split('|')[0])} Δ(${ev.value.split('|')[1] ?? '0,0,0'}) ${ev.value.split('|')[2] ?? '1'}초`
                      : OBJECT_TARGET_ACTIONS.has(ev.action) ? `→ ${objectName(ev.value)}`
                      : ev.value}
                  </p>
                )}
              </div>
              )
            ))}

            {/* 수정 중이면 해당 항목 자리에 폼이 인라인으로 뜨므로 하단엔 아무것도 안 띄운다.
                신규 추가(showAddEvent)면 하단에 폼, 아니면 '이벤트 추가' 버튼. */}
            {editingId ? null : showAddEvent ? renderEventForm() : (
              <button
                onClick={() => { setEditingId(null); setNewValue(''); setShowAddEvent(true); }}
                className="w-full py-1.5 rounded-xs border border-dashed border-border text-muted hover:border-primary/60 hover:text-primary hover:bg-primary/5  text-[11px] transition-all cursor-pointer"
              >
                이벤트 추가
              </button>
            )}
          </div>
        )}
        </GroupBox>
        )}

        {/* 그룹 해제 안내 */}
        {obj.isGroup && (
          <div className="px-3 py-3">
            <p className="text-[11px] text-muted leading-relaxed">
              그룹 해제: <kbd className="bg-background border border-border rounded px-1 text-[10px]">Ctrl+Shift+G</kbd>
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
