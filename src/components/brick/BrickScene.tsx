'use client';

// 씬에 붙은 브릭 — **에디터·뷰어가 같이 쓰는 단 하나의 레이어.** `<Canvas>` 안에 넣는다.
//
//   에디터: <BrickScene sceneId={sceneId} />            → 짓기 가능
//   뷰어  : <BrickScene sceneId={scene.sceneId} readOnly /> → 보기만
//
// ★ 왜 하나로 두는가: 이 세션에 배치 규칙이 네 번 바뀌었다. 에디터와 뷰어가 각자 배선하면
//   **반드시 갈라지고**, 게시된 화면만 조용히 틀려진다(가장 늦게 발견되는 종류).
//
// 하는 일: ①씬의 `brick_chunks`에 연결 ②렌더(+짓기) ③카메라 주변 스트리밍 ④자동 저장(에디터만)

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { attachBrickStorage, useBrickStore } from '@/store/brickStore';
import { BrickBuilder } from './BrickBuilder';
import { BrickInstances } from './BrickInstances';

interface Props {
  sceneId: string | null;
  /** 뷰어 — 보기만 한다(짓기·저장 없음) */
  readOnly?: boolean;
  onStats?: (s: { groups: number; instances: number; tris: number }) => void;
}

/** 스트리밍 발동 간격(m) — 이보다 덜 움직이면 무시 */
const STREAM_STEP = 6;

/**
 * 카메라 주변 청크를 올리고 먼 것은 내린다.
 *
 * ★ 카메라 **위치**가 아니라 **보는 지점(`controls.target`)** 기준이다.
 *   OrbitControls는 회전할 때 눈 위치가 궤도를 따라 크게 움직여서, 위치 기준이면
 *   가만히 둘러보기만 해도 스트리밍이 계속 발동한다(그때마다 전체 재계산 → 버벅임).
 *   걷기 모드처럼 controls가 없으면 카메라 위치로 떨어진다.
 */
function BrickStreamer() {
  const stream = useBrickStore((s) => s.streamAround);
  const last = useRef({ x: Infinity, z: Infinity });
  useFrame(({ camera, controls }) => {
    const t = (controls as { target?: THREE.Vector3 } | null)?.target;
    const x = t ? t.x : camera.position.x;
    const z = t ? t.z : camera.position.z;
    if (Math.abs(x - last.current.x) < STREAM_STEP && Math.abs(z - last.current.z) < STREAM_STEP) return;
    last.current = { x, z };
    void stream(x, z);
  });
  return null;
}

export function BrickScene({ sceneId, readOnly = false, onStats }: Props) {
  const world = useBrickStore((s) => s.world);
  const version = useBrickStore((s) => s.version);
  const studStyle = useBrickStore((s) => s.studStyle);
  const saveState = useBrickStore((s) => s.saveState);
  const loadWorld = useBrickStore((s) => s.loadWorld);
  const flush = useBrickStore((s) => s.flush);

  // 씬에 연결 — 같은 씬이면 `attachBrickStorage`가 아무것도 안 한다(월드 보존)
  useEffect(() => {
    if (!sceneId) return;
    attachBrickStorage(sceneId);
    void loadWorld();
  }, [sceneId, loadWorld]);

  // 자동 저장 — 변경이 멎고 600ms 뒤 **바뀐 청크만**. 뷰어는 쓰지 않는다.
  useEffect(() => {
    if (readOnly || saveState !== 'pending') return;
    const t = setTimeout(() => { void flush(); }, 600);
    return () => clearTimeout(t);
  }, [readOnly, saveState, version, flush]);

  // 저장 전에 창이 닫히는 경우 대비
  useEffect(() => {
    if (readOnly) return;
    const onHide = () => { void flush(); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [readOnly, flush]);

  if (!sceneId) return null;
  return (
    <>
      {readOnly
        ? <BrickInstances world={world} version={version} studStyle={studStyle} onStats={onStats} />
        : <BrickBuilder onStats={onStats} />}
      <BrickStreamer />
    </>
  );
}
