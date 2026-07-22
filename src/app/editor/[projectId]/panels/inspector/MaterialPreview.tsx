"use client";

// 재질 미리보기 — 씬 조명과 무관하게 고정 스튜디오 조명 아래 회전하는 구에 현재 재질을 입혀 보여준다.
// 실제 렌더의 PrimitiveMaterial을 그대로 사용 → Toon/Matcap/유리/Fresnel/맵/그라데이션까지 정확히 일치.
// 씬과 완전히 분리된 별도 Canvas라 회귀 위험이 없다(조명은 여기 내부 고정).
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Outlines, Edges } from "@react-three/drei";
import * as THREE from "three";
import { PrimitiveMaterial } from "@/components/three/PrimitiveMaterial";
import { DefaultEnvironment } from "@/components/three/DefaultEnvironment";
import type { MaterialOverride } from "@/types/scene";

// 구 로컬 bbox(반경 1) — 그라데이션/triplanar 투영 좌표용
const WRAP_MIN: [number, number, number] = [-1, -1, -1];
const WRAP_SIZE: [number, number, number] = [2, 2, 2];

function PreviewSphere({ mat }: { mat?: MaterialOverride }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.5;
  });
  const emissive = mat?.emissive ?? "#000000";
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1, 64, 64]} />
      <PrimitiveMaterial
        color={mat?.color ?? "#ffffff"}
        roughness={mat?.roughness ?? 0.5}
        metalness={mat?.metalness ?? 0.1}
        emissive={emissive}
        emissiveIntensity={mat?.emissiveIntensity ?? (emissive !== "#000000" ? 1 : 0)}
        opacity={mat?.opacity}
        envMapIntensity={mat?.envMapIntensity}
        clearcoat={mat?.clearcoat}
        clearcoatRoughness={mat?.clearcoatRoughness}
        sheen={mat?.sheen}
        sheenColor={mat?.sheenColor}
        sheenRoughness={mat?.sheenRoughness}
        iridescence={mat?.iridescence}
        iridescenceIOR={mat?.iridescenceIOR}
        anisotropy={mat?.anisotropy}
        transmission={mat?.transmission}
        ior={mat?.ior}
        thickness={mat?.thickness}
        attenuationColor={mat?.attenuationColor}
        attenuationDistance={mat?.attenuationDistance}
        fresnelColor={mat?.fresnelColor}
        fresnelIntensity={mat?.fresnelIntensity}
        fresnelPower={mat?.fresnelPower}
        shading={mat?.shading}
        toonSteps={mat?.toonSteps}
        matcapPreset={mat?.matcapPreset}
        matcapUrl={mat?.matcapUrl}
        textureUrl={mat?.textureUrl}
        repeat={mat?.textureRepeat}
        textureMapping={mat?.textureMapping}
        triplanarScale={mat?.triplanarScale}
        normalUrl={mat?.normalUrl}
        normalScale={mat?.normalScale}
        roughnessUrl={mat?.roughnessUrl}
        metalnessUrl={mat?.metalnessUrl}
        aoUrl={mat?.aoUrl}
        aoIntensity={mat?.aoIntensity}
        displacementUrl={mat?.displacementUrl}
        displacementScale={mat?.displacementScale}
        gradient={mat?.gradient ?? null}
        wrapMin={WRAP_MIN}
        wrapSize={WRAP_SIZE}
      />
      {mat?.outline && <Outlines thickness={mat.outlineWidth ?? 4} color={mat.outlineColor ?? '#000000'} />}
      {mat?.edges && <Edges threshold={1} color={mat.edgesColor ?? '#000000'} lineWidth={mat.edgesWidth ?? 1.5} />}
    </mesh>
  );
}

export function MaterialPreview({ mat }: { mat?: MaterialOverride }) {
  return (
    <div className="w-full h-28 rounded-xs overflow-hidden border border-border/60">
      <Canvas
        camera={{ position: [0, 0, 3.1], fov: 32 }}
        dpr={[1, 2]}
        gl={{ toneMapping: THREE.LinearToneMapping, toneMappingExposure: 1 }}
      >
        {/* 재질을 잘 보이게 하는 중립 스튜디오 조명 — 씬과 독립 */}
        <color attach="background" args={["#26262e"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 4, 5]} intensity={2.6} />
        <directionalLight position={[-4, 1, -2]} intensity={0.7} color="#bcd0ff" />
        {/* 금속/유리 반사용 IBL(절차적·네트워크 없음). 미리보기는 반사가 잘 보이게 강하게. */}
        <DefaultEnvironment intensity={1} />
        <PreviewSphere mat={mat} />
      </Canvas>
    </div>
  );
}
