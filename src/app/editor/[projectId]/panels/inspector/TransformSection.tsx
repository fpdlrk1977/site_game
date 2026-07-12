'use client';

// Transform 섹션 — 위치/회전/크기(라이브) + 실측 크기(m) + '바닥에 놓기'. 모든 오브젝트.
// setPos/setRot/setScl·바닥스냅 헬퍼를 컴포넌트 안에서 store+lib로 재구성(동작 무변경).
import * as THREE from 'three';
import { ArrowDownToLine } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { worldBBox, localBBox } from '@/lib/objectBBox';
import { glbLocalBboxCache } from '@/lib/glbBboxCache';
import { SectionHeader, GroupBox, XYZRow, LiveTransformRows } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function TransformSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { objects, assets, updateObject, pushHistory } = useSceneStore();
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
  return (
        <GroupBox>
          <SectionHeader title="Transform" hint="위치·회전·크기. 기즈모 회전 중 Shift를 누르면 15°씩 스냅돼요. GLB는 추가 시 밑면이 바닥에 자동 정렬되고, '바닥에 놓기'로 다시 맞출 수 있어요." isOpen={open} onToggle={onToggle} />
          {open && (
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
  );
}
