'use client';

import { useState, useRef, useLayoutEffect, type MutableRefObject } from 'react';
import { Download, X, CirclePile, Package } from 'lucide-react';
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



// ── 메인 ───────────────────────────────────────────────────────
// 외부: selectedId를 key로 넘겨 오브젝트 전환 시 내부 상태 완전 초기화.
//   단, 섹션 접힘 상태(collapsed)는 여기(remount 안 되는 부모)에 두어 오브젝트를 전환해도 유지한다
//   → 애니메이션 트랙에서 다른 오브젝트를 골라도 Animation 패널이 접히지 않는다(작업 연속성).
export function InspectorPanel() {
  const { selectedId } = useSceneStore();
  // 섹션 접기 상태 — 점진적 공개(STEP 3): 기본은 Transform·Material·Content·Geometry·Visibility만 펼치고
  // 고급 섹션(물리·모션·이벤트·파티클·서브디비전·애니메이션·배열)은 접어 둔다. 값이 있으면 헤더에 점(dot)으로 표시.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(['array', 'subdivision', 'particle', 'motion', 'events', 'animation', 'animclip']),
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
  const { objects, assets, selectedId, selectedIds, projectId, environment, prefabs, updateObject, pushHistory, instantiatePrefab, deletePrefab, requestExport, mergeIntoAsset } = useSceneStore();
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
              <SectionHeader title="Prefab Library" icon={<CirclePile size={12} />} hint="Master prefabs in this scene. 'Place' adds a new instance to the scene. Deleting removes only the definition; already-placed objects remain as independent objects." />
              <div className="px-3 pb-4 space-y-1.5">
                {prefabs.map((p) => {
                  const count = new Set(objects.filter((o) => o.prefabId === p.id).map((o) => o.prefabInstanceId)).size;
                  return (
                    <div key={p.id} className="flex items-center gap-1.5 bg-background border border-border rounded-xs px-2 py-1.5">
                      <span className="text-[11px] text-foreground font-medium flex-1 truncate flex items-center gap-1.5" title={p.name}><CirclePile size={12} className="shrink-0 text-muted" /> {p.name}</span>
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
        {/* 이름 + GLB 내보내기 */}
        <div className="px-3 py-2 flex items-center gap-1.5">
          <input
            value={obj.name}
            onChange={(e) => updateObject(obj.id, { name: e.target.value })}
            onBlur={pushHistory}
            className="flex-1 min-w-0 bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          />
          <button
            onClick={() => { requestExport(selectedIds.length > 0 ? selectedIds : [obj.id], obj.name || 'object'); addToast('Exporting GLB', 'success'); }}
            title="Export this object as a .glb file (download)"
            className="shrink-0 h-[30px] px-2 rounded-xs bg-surface border border-border text-foreground hover:text-muted hover:bg-background text-[11px] transition-all inline-flex items-center gap-1"
          >
            <Download size={12} /> GLB
          </button>
        </div>

        {/* 모델 에셋으로 저장 — 프리미티브(또는 프리미티브 그룹)를 GLB로 구워 Models 라이브러리에 등록.
            GLB/콘텐츠/라이트/파티클은 제외(이미 에셋이거나 프리미티브 아님). */}
        {!obj.assetId && !obj.content && !obj.light && !obj.particle && (
          <div className="px-3 pt-2 pb-1">
            <button
              onClick={() => saveAsModel(obj.id, obj.name || '모델')}
              disabled={savingModel}
              title="이 오브젝트를 GLB 모델 에셋으로 저장 (Assets › Models에서 재사용)"
              className="w-full py-1.5 rounded-xs bg-surface border border-border text-foreground hover:text-muted hover:bg-background text-[11px] transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Package size={13} /> {savingModel ? '모델로 굽는 중…' : '모델 에셋으로 저장'}
            </button>
          </div>
        )}

        {/* Prefab — 원본 정의화 / 인스턴스 동기화 (조건 불충족 시 자체 null) */}
        <PrefabSection obj={obj} open={isOpen('prefab')} onToggle={() => toggleSection('prefab')} />

        {/* Transform */}
        <TransformSection obj={obj} open={isOpen('transform')} onToggle={() => toggleSection('transform')} />

        {/* Subdivision — 표면 세분화. 모든 프리미티브 */}
        {obj.primitiveShape && !obj.content && !obj.assetId && !obj.light && !obj.particle && <SubdivisionSection obj={obj} />}

        {/* Geometry — 프리미티브 확장 파라미터(둥근 박스·각뿔대·로프트) */}
        {(obj.primitiveShape === 'box' || obj.primitiveShape === 'frustum' || obj.primitiveShape === 'loft') && <GeometrySection obj={obj} open={isOpen('geometry')} onToggle={() => toggleSection('geometry')} />}

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

        {/* Motion — 앰비언트 애니메이션 (라이트 제외) */}
        {!obj.light && <MotionSection obj={obj} open={isOpen('motion')} onToggle={() => toggleSection('motion')} />}

        {/* Animation — 사용자 저작 키프레임 클립 (라이트 제외, 그룹 포함). ANIMATION.md */}
        {!obj.light && <AnimationClipSection obj={obj} open={isOpen('animclip')} onToggle={() => toggleSection('animclip')} />}

        {/* Animation — GLB 내장 클립을 트리거 없이 자동 재생(idle/앰비언트). GLB 오브젝트 전용 */}
        {!obj.isGroup && obj.assetId && animGlbUrl && animClips && animClips.length > 0 && (() => {
          const glbUrl = animGlbUrl;
          return (
            <GroupBox>
              <SectionHeader title="Animation" hint="Auto-loops one of the GLB's built-in animation clips on scene load, with no trigger (spinning fan, waving flag, idle character…). If a click/hover/area event animation fires, it takes over (viewer only)." isOpen={isOpen('animation')} onToggle={() => toggleSection('animation')} dot={!!obj.defaultClip} />
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
