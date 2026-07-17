'use client';

// Transform 섹션 — 위치/회전/크기(라이브) + 실측 크기(m) + '바닥에 놓기'. 모든 오브젝트.
// setPos/setRot/setScl·바닥스냅 헬퍼를 컴포넌트 안에서 store+lib로 재구성(동작 무변경).
import * as THREE from 'three';
import { ArrowDownToLine } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { useEditorPrefsStore, SIZE_UNIT_FACTOR, SIZE_UNITS } from '@/store/editorPrefsStore';
import { worldBBox, localBBox } from '@/lib/objectBBox';
import { anchorLocalPoint, scaleAnchorDelta, isCenterAnchor } from '@/lib/pivotMath';
import { glbLocalBboxCache } from '@/lib/glbBboxCache';
import { SectionHeader, GroupBox, XYZRow, LiveTransformRows } from './ui';
import { PivotPicker } from './PivotPicker';
import type { ObjectNodeSchema, Vector3 } from '@/types/scene';

export function TransformSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { objects, assets, updateObject, pushHistory } = useSceneStore();
  const sizeUnit = useEditorPrefsStore((s) => s.sizeUnit);
  const setSizeUnit = useEditorPrefsStore((s) => s.setSizeUnit);
  const uf = SIZE_UNIT_FACTOR[sizeUnit]; // m→표시단위 배율 (m=1, cm=100, mm=1000)
  const sizeDp = sizeUnit === 'm' ? 3 : sizeUnit === 'cm' ? 1 : 0; // 표시 소수 자리
  // 그룹 자식의 position은 부모 기준 로컬 좌표라 음수 y가 정상 — 최상위 오브젝트만 바닥(y=0) 클램프
  // (GizmoController의 skipYClamp와 동일한 규칙)
  const setPos = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { position: { ...obj.position, [axis]: axis === 'y' && !obj.parentId ? Math.max(0, v) : v } });
  const setRot = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { rotation: { ...obj.rotation, [axis]: v } });
  // 스케일 — 앵커(pivot) 설정 시 그 점이 고정되도록 position 동반 보정(하단 앵커=바닥 고정 성장). 미설정=중심(현재 동작).
  const setScl = (axis: 'x' | 'y' | 'z', v: number) => {
    const newScale = { ...obj.scale, [axis]: v };
    if (!isCenterAnchor(obj.pivot)) {
      const lb = localBBox(objects, assets, obj.id);
      if (lb && !lb.isEmpty()) {
        const A = anchorLocalPoint(lb, obj.pivot!);
        const d = scaleAnchorDelta(A, obj.rotation, obj.scale, newScale);
        updateObject(obj.id, {
          scale: newScale,
          position: { x: obj.position.x + d.x, y: obj.position.y + d.y, z: obj.position.z + d.z },
        });
        return;
      }
    }
    updateObject(obj.id, { scale: newScale });
  };
  const setPivot = (p?: Vector3) => { updateObject(obj.id, { pivot: p }); pushHistory(); };

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
  return (
        <GroupBox>
          <SectionHeader title="Transform" hint="Position, rotation and scale. Hold Shift while rotating with the gizmo to snap every 15°. GLB models auto-align to the floor when added; use 'Drop to floor' to re-align." isOpen={open} onToggle={onToggle} />
          {open && (
            <div className="px-3 pb-4 space-y-1">
              {/* 기즈모 드래그 중 라이브 채널로 실시간 갱신(캔버스 리렌더 없이 이 서브트리만) */}
              <LiveTransformRows obj={obj} setPos={setPos} setRot={setRot} setScl={setScl} onCommit={pushHistory} />
              {/* 실측 크기 — 지오메트리 로컬 bbox × 스케일(미터). mm/cm/m 단위 토글로 표시/입력 환산.
                  모든 프리미티브에 표시(박스·구체·원기둥 포함) — 물리적 크기를 직관적으로 맞추기 위함.
                  입력값은 현재 단위 → 미터로 되돌린 뒤 스케일로 역산(저장 데이터는 항상 미터/스케일). */}
              {obj.primitiveShape && !obj.content && !obj.assetId && (() => {
                const lb = localBBox(objects, assets, obj.id);
                const ls = lb && !lb.isEmpty() ? lb.getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1);
                // 입력값 v(현재 단위) → 미터(v/uf) → 스케일 역산
                const setSize = (axis: 'x' | 'y' | 'z', v: number) => setScl(axis, Math.max(0.001, v / uf) / (ls[axis] || 1));
                const disp = (axis: 'x' | 'y' | 'z') => +(ls[axis] * obj.scale[axis] * uf).toFixed(sizeDp);
                return (
                  <XYZRow
                    label={`Size (${sizeUnit})`}
                    labelExtra={
                      <div className="flex items-center gap-0.5 rounded-xs bg-background/60 p-0.5">
                        {SIZE_UNITS.map((u) => (
                          <button
                            key={u}
                            onClick={() => setSizeUnit(u)}
                            title={`Show size in ${u}`}
                            className={`px-1.5 py-0.5 rounded-[4px] text-[9px] font-semibold leading-none transition-colors cursor-pointer ${
                              u === sizeUnit ? 'bg-primary text-white' : 'text-muted/70 hover:text-foreground'
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    }
                    x={disp('x')}
                    y={disp('y')}
                    z={disp('z')}
                    onChangeX={(v) => setSize('x', v)}
                    onChangeY={(v) => setSize('y', v)}
                    onChangeZ={(v) => setSize('z', v)}
                    onCommit={pushHistory}
                    dragStep={0.1 * uf}
                    min={0.001 * uf}
                  />
                );
              })()}
              {/* 변형 기준점(앵커) — 스케일이 이 점 기준으로. 하단=바닥 고정 성장. 라이트 제외. */}
              {!obj.light && (
                <div className="pt-1">
                  <PivotPicker value={obj.pivot} onChange={setPivot} />
                </div>
              )}
              {/* 밑면을 바닥에 정렬 — 원점이 발밑이 아니어서 바닥에 파묻히는 경우 교정(모든 루트 타입) */}
              {!obj.parentId && (
                <button
                  onClick={snapToGround}
                  disabled={!canSnapToGround}
                  title={canSnapToGround ? "Align the object's bottom to the floor (y=0)" : (glbUnloaded ? 'Available after the model loads' : "Can't drop to floor")}
                  className="w-full mt-1 py-1.5 rounded-xs bg-surface border border-border text-foreground hover:text-muted hover:bg-background text-[11px] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-foreground disabled:hover:bg-surface inline-flex items-center justify-center gap-1.5"
                >
                  <ArrowDownToLine size={13} /> Drop to floor
                </button>
              )}
            </div>
          )}
        </GroupBox>
  );
}
