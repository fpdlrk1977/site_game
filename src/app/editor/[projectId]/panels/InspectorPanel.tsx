'use client';

import { useState, useRef, useLayoutEffect, type MutableRefObject } from 'react';
import { Download, X, CirclePile, Package, Clapperboard, Eye, EyeOff, Lock, Unlock, MoreHorizontal } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { Tooltip } from '@/components/ui/Tooltip';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { RichContent } from '@/components/ui/RichContent';
import { PopupFrame } from '@/components/ui/PopupFrame';
import { buildMergedGlb } from '@/lib/mergeObjects';
import { uploadGlbBlob } from '@/lib/uploadAsset';
import { persistCurrentScene } from '@/lib/saveScene';
import { SectionHeader, GroupBox } from './inspector/ui';
import { EnvironmentPanel } from './inspector/EnvironmentPanel';
import { GlbClipPicker, useGlbClipNames } from './inspector/GlbClipPicker';
import { MotionSection } from './inspector/MotionSection';
import { ActuatorSection } from './inspector/ActuatorSection';
import { MotorLinkSection } from './inspector/MotorLinkSection';
import { AnimationClipSection } from './inspector/AnimationClipSection';
import { PhysicsSection } from './inspector/PhysicsSection';
import { LightSection } from './inspector/LightSection';
import { ContentSection } from './inspector/ContentSection';
import { ParticleSection } from './inspector/ParticleSection';
import { VisibilitySection } from './inspector/VisibilitySection';
import { SubdivisionSection } from './inspector/SubdivisionSection';
import { GeometrySection } from './inspector/GeometrySection';
import { ClonerSection } from './inspector/ClonerSection';
import { ArraySection } from './inspector/ArraySection';
import { PrefabSection } from './inspector/PrefabSection';
import { TransformSection } from './inspector/TransformSection';
import { MaterialSection } from './inspector/MaterialSection';
import { MultiSelectPanel } from './inspector/MultiSelectPanel';
import { EventsSection } from './inspector/EventsSection';
import type { ObjectNodeSchema, PopupConfig } from '@/types/scene';

import { CHARACTER_PREVIEW_ID } from '@/app/editor/[projectId]/canvas/CharacterPreview';



// 인스펙터 헤더의 타입 라벨 — "이게 무슨 오브젝트인지"를 이름 아래 한 줄로.
//   판정 순서 = 좁은 것부터(모터는 그룹이기도 하고, 클로너·프리팹도 그룹이므로 isGroup보다 먼저 봐야 한다).
const SHAPE_LABEL: Record<string, string> = {
  box: 'Box', sphere: 'Sphere', cylinder: 'Cylinder', plane: 'Plane', frustum: 'Frustum',
  loft: 'Loft', extrude: 'Extrude', lathe: 'Lathe', voxel: 'Voxel', torus: 'Torus',
};
function objectTypeLabel(o: ObjectNodeSchema): string {
  if (o.light) return { point: 'Point Light', spot: 'Spot Light', directional: 'Directional Light' }[o.light.type] ?? 'Light';
  if (o.particle) return 'Particle';
  if (o.isActuator) return 'Motor';
  if (o.clonerConfig) return 'Cloner';
  if (o.prefabId) return o.isGroup ? 'Prefab' : 'Prefab part';
  if (o.content) return { text: 'Text', image: 'Image', video: 'Video' }[o.content.type] ?? 'Content';
  if (o.assetId) return 'Model (GLB)';
  if (o.isGroup) return 'Group';
  if (o.primitiveShape) return SHAPE_LABEL[o.primitiveShape] ?? 'Primitive';
  return 'Object';
}
// 뱃지 호버 설명 — "이게 뭔지"를 한 문장으로. 판정 순서는 objectTypeLabel과 동일해야 라벨과 설명이 어긋나지 않는다.
function objectTypeHint(o: ObjectNodeSchema): string {
  if (o.light) return '씬을 비추는 조명입니다. 색·강도·거리를 조절할 수 있고, spot/directional은 뷰포트에서 방향을 끌어 맞춥니다.';
  if (o.particle) return '눈·불꽃 같은 분위기용 파티클입니다. 충돌하지 않는 장식 요소입니다.';
  if (o.isActuator) return '모터(관절 부품)입니다. 연결된 자식이 이 모터의 원점(경첩)·축을 기준으로 움직입니다. ▶ 플레이에서 동작합니다.';
  if (o.clonerConfig) return '클로너 그룹입니다. 소스 하나를 개수·간격 설정대로 실시간 복제하며, 소스를 고치면 복제본이 모두 따라갑니다.';
  if (o.prefabId) return o.isGroup
    ? '프리팹 인스턴스입니다. 원본을 고치면 모든 사본에 반영되고, 사본에서 바꾼 값만 원본을 벗어납니다(override).'
    : '프리팹 인스턴스 안의 부품입니다. 원본의 같은 노드와 동기화됩니다.';
  if (o.content) return '텍스트·이미지·영상 콘텐츠입니다. URL을 넣으면 이미지·YouTube 같은 리치 콘텐츠로 표시됩니다.';
  if (o.assetId) return '가져온 3D 모델(GLB)입니다. 내장 애니메이션 클립이 있으면 Animation 섹션에서 고를 수 있습니다.';
  if (o.isGroup) return '여러 오브젝트를 묶은 그룹입니다. 함께 이동·회전하고, 자식은 그룹 기준 좌표를 씁니다.';
  if (o.primitiveShape) return '에디터에서 만든 기본 도형입니다. 크기·재질·물리를 직접 설정할 수 있습니다.';
  return '씬에 배치된 오브젝트입니다.';
}

// ── 메인 ───────────────────────────────────────────────────────
// 외부: selectedId를 key로 넘겨 오브젝트 전환 시 내부 상태 완전 초기화.
//   단, 섹션 접힘 상태(collapsed)는 여기(remount 안 되는 부모)에 두어 오브젝트를 전환해도 유지한다
//   → 애니메이션 트랙에서 다른 오브젝트를 골라도 Animation 패널이 접히지 않는다(작업 연속성).
export function InspectorPanel() {
  const { selectedId } = useSceneStore();
  // 섹션 접기 상태 — 점진적 공개(STEP 3): 기본은 Transform·Material·Content·Geometry·Visibility만 펼치고
  // 고급 섹션(물리·모션·이벤트·파티클·서브디비전·애니메이션·배열)은 접어 둔다. 값이 있으면 헤더에 점(dot)으로 표시.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(['array', 'subdivision', 'particle', 'motion', 'actuator', 'events', 'animation', 'animclip']),
  );
  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const isOpen = (key: string) => !collapsed.has(key);
  // 스크롤 위치도 부모에 보관 → 오브젝트 전환(InspectorInner remount)에도 스크롤 유지(트랙 전환 시 위로 안 튐).
  const scrollTopRef = useRef(0);
  return <InspectorInner key={selectedId ?? '__none__'} isOpen={isOpen} toggleSection={toggleSection} scrollTopRef={scrollTopRef} />;
}

function InspectorInner({ isOpen, toggleSection, scrollTopRef }: { isOpen: (key: string) => boolean; toggleSection: (key: string) => void; scrollTopRef: MutableRefObject<number> }) {
  // remount(오브젝트 전환) 시 1회 저장된 스크롤 위치 복원(페인트 전). 섹션 토글 등 리렌더엔 안 건드림.
  const scrollElRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (scrollElRef.current) scrollElRef.current.scrollTop = scrollTopRef.current; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => { scrollTopRef.current = e.currentTarget.scrollTop; };
  const { objects, assets, selectedId, selectedIds, projectId, environment, prefabs, updateObject, setObjectLocked, pushHistory, instantiatePrefab, deletePrefab, requestExport, mergeIntoAsset } = useSceneStore();
  const { addToast } = useToast();
  // 단일 오브젝트를 GLB로 구워 Models(에셋)에 등록 — Merge와 동일 파이프라인(단일 rootId).
  const [savingModel, setSavingModel] = useState(false);
  const saveAsModel = async (targetId: string, name: string) => {
    if (!projectId || savingModel) return;
    setSavingModel(true);
    try {
      const result = await buildMergedGlb(useSceneStore.getState().objects, [targetId]);
      if (!result) { addToast('구울 프리미티브가 없어요 (GLB·콘텐츠·라이트 제외).', 'error'); return; }
      const asset = await uploadGlbBlob(result.blob, name, projectId, 'model');
      mergeIntoAsset([targetId], asset, result.center, name);
      const save = await persistCurrentScene();
      if (save.status === 'conflict') addToast('저장했지만 다른 탭·기기에서 씬이 먼저 저장돼 반영하지 못했어요. 새로고침 후 다시 시도해 주세요.', 'error');
      else addToast('모델 에셋으로 저장했어요 — Assets › Models에서 재사용할 수 있어요.', 'success');
    } catch (err) {
      addToast(`모델 저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, 'error');
    } finally {
      setSavingModel(false);
    }
  };
  const obj = objects.find((o) => o.id === selectedId) as ObjectNodeSchema | undefined;
  const isMultiSelect = selectedIds.length > 1;



  // 이벤트 프리뷰 팝업
  const [previewPopup, setPreviewPopup] = useState<{ content: string; config?: PopupConfig } | null>(null);

  // Animation 섹션은 '클립 있는 GLB'에만 노출 — 선택 GLB의 클립을 미리 조회.
  // (훅은 조건부 반환 전에 항상 호출해야 하므로 여기서 실행)
  const animGlbUrl = obj && !obj.isGroup && obj.assetId ? (assets.find((a) => a.id === obj.assetId)?.dracoUrl ?? null) : null;
  const animClips = useGlbClipNames(animGlbUrl);

  if (isMultiSelect) return <MultiSelectPanel />;

  if (!obj) {
    const isCharSelected = selectedId === CHARACTER_PREVIEW_ID;
    return (
      <aside className="flex flex-col overflow-hidden h-full">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
          <span className=" text-[11px] font-semibold text-foreground tracking-wide flex-1">
            {isCharSelected ? 'Player Character' : 'Environment'}
          </span>
        </div>
        {isCharSelected && (
          <div className="px-3 py-2 bg-primary/5 border-b border-border shrink-0">
            <p className="text-[10px] text-primary">Drag in the viewport to reposition · scale &amp; properties in the Player section</p>
          </div>
        )}
        <div ref={scrollElRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
          {!isCharSelected && (
            <div className="px-3 pt-3">
              <button
                onClick={() => { requestExport([], 'scene'); addToast('Exporting whole scene as GLB', 'success'); }}
                title="Export all scene objects into one .glb file"
                className="w-full py-1.5 rounded-xs bg-surface border border-border text-foreground hover:text-muted hover:bg-background text-[11px] transition-all inline-flex items-center justify-center gap-1.5"
              >
                <Download size={13} /> Export whole scene as GLB
              </button>
            </div>
          )}
          {!isCharSelected && prefabs.length > 0 && (
            <GroupBox>
              <SectionHeader title="Prefab Library" icon={<CirclePile size={14} />} hint="Master prefabs in this scene. 'Place' adds a new instance to the scene. Deleting removes only the definition; already-placed objects remain as independent objects." />
              <div className="px-3 pb-4 space-y-1.5">
                {prefabs.map((p) => {
                  const count = new Set(objects.filter((o) => o.prefabId === p.id).map((o) => o.prefabInstanceId)).size;
                  return (
                    <div key={p.id} className="flex items-center gap-1.5 bg-background border border-border rounded-xs px-2 py-1.5">
                      <span className="text-[11px] text-foreground font-medium flex-1 truncate flex items-center gap-1.5" title={p.name}><CirclePile size={12} className="shrink-0 text-foreground" /> {p.name}</span>
                      <span className="text-[10px] text-muted shrink-0">{count}</span>
                      <button
                        onClick={() => { instantiatePrefab(p.id); addToast(`'${p.name}' placed`, 'success'); }}
                        className="px-2 py-0.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[10px] font-semibold transition-colors shrink-0"
                      >
                        Place
                      </button>
                      <button
                        onClick={() => { if (confirm(`Delete the prefab definition '${p.name}'?\nThe ${count} placed instances remain as independent objects.`)) { deletePrefab(p.id); addToast('Prefab definition deleted', 'success'); } }}
                        title="Delete prefab definition (instances kept)"
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




  return (
    <aside className="flex flex-col overflow-hidden relative h-full">
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
          ? ` · shown ${({ bottom: 'bottom', left: 'left', right: 'right' } as Record<string, string>)[c.position]} in the viewer`
          : '';
        const cardStyle = isFrame
          ? { width: width || 'min(80vw, 720px)', height: height || 'min(70vh, 520px)', background: bg }
          : { width: width || undefined, background: bg };
        return (
          <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreviewPopup(null)}>
            <div
              className={`bg-white border border-border rounded-sm shadow-2xl ${isFrame ? 'flex flex-col p-4 max-w-[92vw] max-h-[88vh]' : 'p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto'}`}
              style={cardStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] text-muted/60 mb-2 font-semibold tracking-wide shrink-0">Popup preview{posNote}</p>
              {isFrame ? (
                <div className="flex-1 min-h-0"><PopupFrame value={previewPopup.content} config={c} /></div>
              ) : (
                <RichContent value={previewPopup.content} onLight />
              )}
              <button
                onClick={() => setPreviewPopup(null)}
                className="mt-3 shrink-0 w-full py-1.5 rounded-xs bg-primary text-white  text-[11px] font-semibold hover:bg-primary/80 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
        <span className=" text-[11px] font-semibold text-foreground tracking-wide flex-1">{obj.isGroup ? 'Inspector — Group' : 'Inspector'}</span>
      </div>

      <div ref={scrollElRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {/* 헤더 — 이름(읽기 전용)+타입 라벨 · 우측에 표시/잠금/더보기 아이콘 버튼.
            이름 수정은 계층 트리(더블클릭·우클릭)에서 한다. 내보내기·모델 저장은 더보기 팝오버로 접었다. */}
        <div className="px-3 py-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-foreground truncate" title={obj.name}>{obj.name}</div>
            {/* 타입 뱃지 — 이 오브젝트가 무엇인지(Box·Model·Motor…). 호버 시 한 문장 설명.
                Tooltip이 트리거를 div로 감싸므로 inline-flex + w-fit으로 배경이 텍스트 폭에만 깔리게 한다. */}
            <Tooltip content={objectTypeHint(obj)} wide className="mt-1 w-fit">
              <span className="inline-flex px-1.5 py-0.5 rounded-xs bg-foreground/[0.04] text-[10px] text-muted/70 cursor-default">
                {objectTypeLabel(obj)}
              </span>
            </Tooltip>
          </div>
          <div className="flex items-center gap-0 shrink-0">
            <button
              onClick={() => { updateObject(obj.id, { visible: !obj.visible }); pushHistory(); }}
              title={obj.visible ? '숨기기' : '표시'}
              className="w-6 h-6 rounded-xs flex items-center justify-center text-foreground hover:bg-background transition-colors"
            >
              {obj.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button
              onClick={() => { setObjectLocked(obj.id, !obj.locked); pushHistory(); }}
              title={obj.locked ? '잠금 해제' : '잠금'}
              className="w-6 h-6 rounded-xs flex items-center justify-center text-foreground hover:bg-background transition-colors"
            >
              {obj.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <DropdownMenu
              placement="bottom-end"
              panelClassName="w-max py-1"
              trigger={({ toggle, ref }) => (
                <button
                  ref={ref}
                  onClick={toggle}
                  title="더보기"
                  className="w-6 h-6 rounded-xs flex items-center justify-center text-foreground hover:bg-background transition-colors"
                >
                  <MoreHorizontal size={14} />
                </button>
              )}
            >
              {({ close }) => (
                <>
                  <button
                    onClick={() => {
                      requestExport(selectedIds.length > 0 ? selectedIds : [obj.id], obj.name || 'object');
                      addToast('Exporting GLB', 'success');
                      close();
                    }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-background transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    <Download size={13} className="text-foreground" /> GLB로 내보내기
                  </button>
                  {/* 모델 에셋으로 저장 — 프리미티브(또는 프리미티브 그룹)만. GLB/콘텐츠/라이트/파티클은 제외
                      (이미 에셋이거나 프리미티브가 아님). */}
                  {!obj.assetId && !obj.content && !obj.light && !obj.particle && (
                    <button
                      onClick={() => { saveAsModel(obj.id, obj.name || '모델'); close(); }}
                      disabled={savingModel}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-background transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Package size={13} className="text-foreground" /> {savingModel ? '모델로 굽는 중…' : '모델 에셋으로 저장'}
                    </button>
                  )}
                </>
              )}
            </DropdownMenu>
          </div>
        </div>

        {/* Prefab — 원본 정의화 / 인스턴스 동기화 (조건 불충족 시 자체 null) */}
        <PrefabSection obj={obj} open={isOpen('prefab')} onToggle={() => toggleSection('prefab')} />

        {/* Transform */}
        <TransformSection obj={obj} open={isOpen('transform')} onToggle={() => toggleSection('transform')} />

        {/* Subdivision — 표면 세분화. 모든 프리미티브 */}
        {obj.primitiveShape && !obj.content && !obj.assetId && !obj.light && !obj.particle && <SubdivisionSection obj={obj} />}

        {/* Geometry — 프리미티브 확장 파라미터(둥근 박스·각뿔대·로프트) */}
        {(obj.primitiveShape === 'box' || obj.primitiveShape === 'frustum' || obj.primitiveShape === 'loft' || obj.primitiveShape === 'torus') && <GeometrySection obj={obj} open={isOpen('geometry')} onToggle={() => toggleSection('geometry')} />}

        {/* Cloner (라이브 비파괴 배열) */}
        {obj.clonerConfig && <ClonerSection obj={obj} open={isOpen('cloner')} onToggle={() => toggleSection('cloner')} />}

        {/* Array — 반복 복제 (클로너 그룹엔 위 Cloner를 씀) */}
        {!obj.clonerConfig && !obj.clonerClone && <ArraySection obj={obj} open={isOpen('array')} onToggle={() => toggleSection('array')} />}

        {/* Content (content 오브젝트만) */}
        {obj.content && <ContentSection obj={obj} open={isOpen('content')} onToggle={() => toggleSection('content')} />}

        {/* Material — 프리미티브 + 텍스트 콘텐츠. 클로너 그룹은 내부 소스를 편집(→ 복제본 전파). 일반 그룹은 메쉬가 없어 미표시. */}
        {(() => {
          const mt = obj.clonerConfig ? objects.find((o) => o.parentId === obj.id && !o.clonerClone) : obj;
          if (!mt || mt.isGroup || mt.assetId || mt.particle || (mt.content && mt.content.type !== 'text')) return null;
          return <MaterialSection obj={mt} open={isOpen('material')} onToggle={() => toggleSection('material')} />;
        })()}

        {/* Particle (파티클 이미터만) */}
        {obj.particle && <ParticleSection obj={obj} open={isOpen('particle')} onToggle={() => toggleSection('particle')} />}

        {/* Visibility */}
        <VisibilitySection obj={obj} open={isOpen('visibility')} onToggle={() => toggleSection('visibility')} />

        {/* Light */}
        {obj.light && <LightSection obj={obj} open={isOpen('light')} onToggle={() => toggleSection('light')} />}

        {/* Physics — 그룹·라이트 제외. enable 스위치만(화살표 없음) */}
        {!obj.light && !obj.isGroup && <PhysicsSection obj={obj} />}

        {/* Motion — 앰비언트 애니메이션 (라이트·모터 제외) */}
        {!obj.light && !obj.isActuator && <MotionSection obj={obj} open={isOpen('motion')} onToggle={() => toggleSection('motion')} />}

        {/* Actuator — 관절(경첩 회전/직선 이동, 라이트 제외). 모터형은 별도 키('motor')로 기본 펼침 + 접기 토글 동작. doc/PIVOT_MANIPULATION.md §6 */}
        {!obj.light && <ActuatorSection obj={obj} open={isOpen(obj.isActuator ? 'motor' : 'actuator')} onToggle={() => toggleSection(obj.isActuator ? 'motor' : 'actuator')} />}

        {/* 모터 연결/해제 — 모터엔 연결된 부품 목록, 일반 오브젝트엔 모터에 연결(라이트 제외) */}
        {!obj.light && <MotorLinkSection obj={obj} />}

        {/* Animation — 사용자 저작 키프레임 클립 (라이트·모터 제외, 그룹 포함). ANIMATION.md */}
        {!obj.light && !obj.isActuator && <AnimationClipSection obj={obj} open={isOpen('animclip')} onToggle={() => toggleSection('animclip')} />}

        {/* Animation — GLB 내장 클립을 트리거 없이 자동 재생(idle/앰비언트). GLB 오브젝트 전용 */}
        {!obj.isGroup && obj.assetId && animGlbUrl && animClips && animClips.length > 0 && (() => {
          const glbUrl = animGlbUrl;
          return (
            <GroupBox>
              <SectionHeader title="Animation" icon={<Clapperboard size={14} />} hint="Auto-loops one of the GLB's built-in animation clips on scene load, with no trigger (spinning fan, waving flag, idle character…). If a click/hover/area event animation fires, it takes over (viewer only)." isOpen={isOpen('animation')} onToggle={() => toggleSection('animation')} dot={!!obj.defaultClip} />
              {isOpen('animation') && (
                <div className="px-3 pb-4 space-y-1.5">
                  <span className="text-[10px] text-muted/50 block font-semibold tracking-wide">Default clip</span>
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
                      Clear default animation
                    </button>
                  )}
                  <p className="text-[10px] text-muted/50">
                    Static in the editor; see playback in the viewer. It doesn&apos;t return to idle after a one-shot.
                  </p>
                </div>
              )}
            </GroupBox>
          );
        })()}

        {/* Events — 그룹 제외(그룹 자체는 클릭/트리거 타깃이 아님) */}
        {!obj.isGroup && <EventsSection obj={obj} open={isOpen('events')} onToggle={() => toggleSection('events')} onPreview={setPreviewPopup} />}

        {/* 그룹 해제 안내 */}
        {obj.isGroup && (
          <div className="px-3 py-3">
            <p className="text-[11px] text-muted leading-relaxed">
              Ungroup: <kbd className="bg-background border border-border rounded px-1 text-[10px]">Ctrl+Shift+G</kbd>
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
