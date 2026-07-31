"use client";

// 에디터 뷰포트 — **브릭 전용.**
//
// 2026-07-31 전면 재작성: 1,277줄 → 이 크기. 구 오브젝트 시스템(2d)을 걷어내며
// 오브젝트 렌더·변환 기즈모·선택(클릭/마퀴/그룹 스코프)·배치 고스트·경계 벽·스폰 마커·
// 태양 기즈모·애니 피벗·후처리·GLB 내보내기를 **전부 삭제**했다.
//
// ★ 브릭은 "선택해서 기즈모로 옮기는" 모델이 아니다 — 격자에 놓고 지운다.
//   그래서 이 파일엔 선택 상태도, 드래그 사각형도, 변환 기즈모도 없다.
//   짓기·지우기·마커는 전부 `BrickScene`(→ `BrickBuilder`) 안에 있다.
//
// 남은 책임은 넷뿐이다: **카메라 · 룩 · 브릭 레이어 · 시점 요청 처리.**

import { useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useSceneStore } from "@/store/sceneStore";
import { SceneToneMapping } from "@/components/three/SceneToneMapping";
import { BrickScene } from "@/components/brick/BrickScene";
import { BrickEnvironment } from "@/components/brick/BrickEnvironment";
import { BrickOrbit } from "@/components/brick/BrickOrbit";

/** 시점 프리셋·전체 맞춤이 잡는 기본 반경(m). **브릭 월드는 무한**이라 씬 바운드로 계산할 수 없다. */
const VIEW_SPREAD = 16;
/** 원근 기본 화각 */
const FOV = 60;
/** near-ortho(준-직교) 화각 — 좁히고 멀리 두면 원근 왜곡이 거의 사라져 평행 도면처럼 보인다 */
const FLAT_FOV = 14;

// 씬을 새로 불러오면 카메라를 원점 근처 기본 시점으로 되돌린다.
//   ⚠️ `<Canvas camera>`의 초기값은 **마운트 때 한 번**만 쓰인다 — 씬을 갈아끼워도 카메라는 그대로다.
//   씬마다 브릭이 다른데 이전 씬을 보던 각도에 머물면 빈 하늘을 보고 있을 수 있다.
//   ★ orbitRef가 준비될 때까지 tick을 소비하지 않는다(준비 전에 소비하면 그 로드는 영영 못 맞춘다).
function InitialFit({ orbitRef }: { orbitRef: React.RefObject<OrbitControlsImpl | null> }) {
  const lastTick = useRef<number | null>(null);
  useFrame(() => {
    const { sceneLoadTick } = useSceneStore.getState();
    if (lastTick.current === sceneLoadTick) return;
    const orbit = orbitRef.current;
    if (!orbit) return;
    lastTick.current = sceneLoadTick;
    const cam = orbit.object as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera && cam.fov !== FOV) {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
    }
    orbit.target.set(0, 0, 0);
    cam.position.set(VIEW_SPREAD * 0.8, VIEW_SPREAD * 0.6, VIEW_SPREAD * 0.8);
    orbit.update();
  });
  return null;
}

export function EditorCanvas() {
  const orbitRef = useRef<OrbitControlsImpl>(null);
  /** 브릭이 붙을 씬 — 이 씬의 `brick_chunks`를 읽고 쓴다 */
  const brickSceneId = useSceneStore((s) => s.sceneId);
  const toneExposure = useSceneStore((s) => s.environment.toneMappingExposure);
  const focusAllRequest = useSceneStore((s) => s.focusAllRequest);
  const cameraViewRequest = useSceneStore((s) => s.cameraViewRequest);
  const startViewSaveRequest = useSceneStore((s) => s.startViewSaveRequest);
  const editorPlaying = useSceneStore((s) => s.editorPlaying);

  // 전체 맞춤(Shift+F) — 브릭 월드는 무한하므로 "전부 담기"가 성립하지 않는다.
  //   지금 보고 있는 지점(orbit target) 둘레를 기본 반경으로 잡고 **원근(3D)으로 복귀**한다.
  useEffect(() => {
    const orbit = orbitRef.current;
    if (!focusAllRequest || !orbit) return;
    const cam = orbit.object as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera && cam.fov !== FOV) {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
    }
    const t = orbit.target;
    cam.position.set(t.x + VIEW_SPREAD * 0.8, t.y + VIEW_SPREAD * 0.6, t.z + VIEW_SPREAD * 0.8);
    orbit.update();
  }, [focusAllRequest]);

  // 시점 프리셋 (Numpad7=Top · Numpad1=Front · Numpad3=Right)
  //   near-ortho로 전환해 칸이 또렷한 평행 뷰를 만든다 — 바닥 깔기·벽 쌓기에 쓴다. "3D"(Shift+F)로 복귀.
  useEffect(() => {
    const orbit = orbitRef.current;
    if (!cameraViewRequest || !orbit) return;
    const cam = orbit.object as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      cam.fov = FLAT_FOV;
      cam.updateProjectionMatrix();
    }
    const d = (VIEW_SPREAD * 0.7) / Math.tan((FLAT_FOV * Math.PI) / 360);
    const t = orbit.target;
    if (cameraViewRequest.view === "top") cam.position.set(t.x, t.y + d, t.z + 0.001);
    else if (cameraViewRequest.view === "front") cam.position.set(t.x, t.y, t.z + d);
    else cam.position.set(t.x + d, t.y, t.z);
    orbit.update();
  }, [cameraViewRequest]);

  // 게시 시작 뷰 저장 — 현재 카메라(위치·타겟·fov)를 environment.startView에.
  useEffect(() => {
    const orbit = orbitRef.current;
    if (!startViewSaveRequest || !orbit) return;
    const cam = orbit.object as THREE.PerspectiveCamera;
    const tgt = orbit.target;
    useSceneStore.getState().updateEnvironment({
      startView: {
        position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        target: { x: tgt.x, y: tgt.y, z: tgt.z },
        fov: cam.isPerspectiveCamera ? cam.fov : undefined,
      },
    });
    useSceneStore.getState().pushHistory();
  }, [startViewSaveRequest]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        id="editor-canvas"
        // 그림자 맵 없음 — 브릭 조명은 굽는다(BrickEnvironment). 실측에서 그림자 패스가 프레임의 절반이었다.
        camera={{ position: [VIEW_SPREAD * 0.8, VIEW_SPREAD * 0.6, VIEW_SPREAD * 0.8], fov: FOV }}
        // dpr 상한 — 기본값은 devicePixelRatio 무제한이라 배율 200%면 픽셀을 4배, 250%면 6배 넘게 그린다.
        dpr={[1, 2]}
        // ▶ 플레이 중엔 이 캔버스가 불투명 오버레이에 완전히 가려진다(카메라 보존 위해 언마운트는 안 함).
        //   그런데도 매 프레임 그리고 있었다 → 렌더 루프만 정지시킨다.
        frameloop={editorPlaying ? "never" : "always"}
        gl={{ preserveDrawingBuffer: true, toneMapping: THREE.LinearToneMapping }}
        style={{ width: "100%", height: "100%" }}
      >
        <InitialFit orbitRef={orbitRef} />

        {/* 톤매핑 Linear 고정 + 씬별 노출 — 저장 색을 그대로 렌더(뷰어와 동일) */}
        <SceneToneMapping exposure={toneExposure ?? 1} />

        {/* ★ 룩 — **뷰어와 같은 컴포넌트**. 배경·안개·환경광이 전부다. */}
        <BrickEnvironment />

        {/* ★ 브릭 — **뷰어와 같은 컴포넌트**를 쓴다(규칙이 갈라지지 않게). 여기선 짓기 가능.
            포인터는 이 컴포넌트가 캔버스 DOM에 직접 붙인다(capture 단계). */}
        <BrickScene sceneId={brickSceneId} />

        {/* 회색 격자 없음 — **지형 블록 자체가 격자**다. 놓을 자리는 `PlacementMarker`가 표면에 눕혀 보여준다. */}

        {/* 카메라 조작 — 프로토타입·뷰어와 **같은 컴포넌트**(설정이 갈라지지 않게) */}
        <BrickOrbit ref={orbitRef} />
      </Canvas>
    </div>
  );
}
