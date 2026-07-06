'use client';

/**
 * 바닥 스냅 시각 검증 페이지.
 * 원점이 밑면이 아닌(기하가 원점보다 아래로 내려간) '모델'을 바닥 평면 위에 놓고,
 * 인스펙터 snapToGround와 동일한 공식으로 밑면을 바닥(y=0)에 맞춘다.
 *
 * 좌: 스냅 전(원점 y=0에 배치 → 바닥에 파묻힘). 우: 스냅 후(밑면이 바닥에 앉음).
 * 두 모델 모두 동일하게 회전(roll 25°)·비균일 스케일을 줘 회전/스케일 케이스도 확인한다.
 */

import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

const ROT: [number, number, number] = [0, 0, 25]; // degrees
const SCALE: [number, number, number] = [1, 1.4, 1];

// 원점보다 아래로 내려간 기하: 박스 중심을 로컬 y=-0.6에 두어 min.y가 음수가 되게 한다
function makeGeom() {
  const g = new THREE.BoxGeometry(1.2, 1.6, 1.2);
  g.translate(0, -0.6, 0); // 원점이 박스 상단쪽 → 밑면은 y=-1.4
  g.computeBoundingBox();
  return g;
}

const D2R = Math.PI / 180;

function computeSnapY(geom: THREE.BufferGeometry): number {
  const local = geom.boundingBox!.clone();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(ROT[0] * D2R, ROT[1] * D2R, ROT[2] * D2R)),
    new THREE.Vector3(...SCALE),
  );
  return -local.clone().applyMatrix4(m).min.y;
}

function Model({ x, snapped, geom }: { x: number; snapped: boolean; geom: THREE.BufferGeometry }) {
  const y = snapped ? computeSnapY(geom) : 0;
  const rot: [number, number, number] = [ROT[0] * D2R, ROT[1] * D2R, ROT[2] * D2R];
  return (
    <mesh geometry={geom} position={[x, y, 0]} rotation={rot} scale={SCALE} castShadow>
      <meshStandardMaterial color={snapped ? '#22c55e' : '#ef4444'} roughness={0.6} />
    </mesh>
  );
}

export default function SnapTestPage() {
  const geom = makeGeom();
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0b1020' }}>
      <Canvas shadows camera={{ position: [4, 3, 7], fov: 50 }} gl={{ toneMapping: THREE.LinearToneMapping }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1.4} castShadow />
        {/* 바닥 평면 y=0 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <Grid position={[0, 0.002, 0]} args={[40, 40]} cellSize={1} sectionSize={5} infiniteGrid fadeDistance={40} cellColor="#334155" sectionColor="#64748b" />
        <Model x={-2} snapped={false} geom={geom} />
        <Model x={2} snapped geom={geom} />
        <OrbitControls />
      </Canvas>
    </div>
  );
}
