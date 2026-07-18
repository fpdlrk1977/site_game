'use client';

// 관절(액추에이터) 저작 가이드 — 선택 오브젝트의 경첩(주황 점)과 회전/이동 축(주황 선)을 에디터에 표시.
//   읽기 전용(정적 표식). 실제 움직임은 ▶ 플레이. doc/PIVOT_MANIPULATION.md §6.
import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import { CHARACTER_PREVIEW_ID } from './CharacterPreview';
import { localBBox } from '@/lib/objectBBox';
import { anchorLocalPoint } from '@/lib/pivotMath';

const ORANGE = '#ff7a0d';
const _h = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const _wp = new THREE.Vector3();
const _ws = new THREE.Vector3();
const _p = new THREE.Vector3();
const _wbox = new THREE.Box3();

export function ActuatorGizmo() {
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const objects = useSceneStore((s) => s.objects);
  const assets = useSceneStore((s) => s.assets);
  const refsMap = useObjectRefs();
  const { camera } = useThree();

  const id = selectedIds.length === 1 ? selectedIds[0] : null;
  const obj = id && id !== CHARACTER_PREVIEW_ID ? objects.find((o) => o.id === id) : null;
  const act = obj?.actuator;

  const sphereRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);

  useFrame(() => {
    const sp = sphereRef.current, ln = lineRef.current;
    if (!sp || !ln) return;
    if (!act || !id) { sp.visible = false; ln.visible = false; return; }
    const ref = refsMap.current.get(id);
    const lb = localBBox(objects, assets, id);
    if (!ref || !ref.parent || !lb || lb.isEmpty()) { sp.visible = false; ln.visible = false; return; }
    ref.updateWorldMatrix(true, false);
    // 경첩 월드 위치
    _h.copy(anchorLocalPoint(lb, act.hinge ?? { x: 0.5, y: 0.5, z: 0.5 })).applyMatrix4(ref.matrixWorld);
    sp.position.copy(_h);
    sp.scale.setScalar(Math.max(0.02, camera.position.distanceTo(_h) * 0.02)); // 화면상 일정 크기
    // 축 방향(월드) — 오브젝트 회전 반영
    ref.matrixWorld.decompose(_wp, _wq, _ws);
    _axis.set(act.axis === 'x' ? 1 : 0, act.axis === 'y' ? 1 : 0, act.axis === 'z' ? 1 : 0).applyQuaternion(_wq).normalize();
    // 선 길이 = 오브젝트 월드 bbox 최대 변의 60%(+여유)
    _wbox.copy(lb).applyMatrix4(ref.matrixWorld);
    _wbox.getSize(_p);
    const len = Math.max(_p.x, _p.y, _p.z) * 0.6 + 0.2;
    const arr = geo.attributes.position.array as Float32Array;
    _p.copy(_h).addScaledVector(_axis, -len);
    arr[0] = _p.x; arr[1] = _p.y; arr[2] = _p.z;
    _p.copy(_h).addScaledVector(_axis, len);
    arr[3] = _p.x; arr[4] = _p.y; arr[5] = _p.z;
    geo.attributes.position.needsUpdate = true;
    sp.visible = true; ln.visible = true;
  });

  return (
    <>
      <mesh ref={sphereRef} renderOrder={1002} visible={false} raycast={() => null}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={ORANGE} depthTest={false} transparent opacity={0.95} />
      </mesh>
      <lineSegments ref={lineRef} geometry={geo} renderOrder={1002} visible={false} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial color={ORANGE} depthTest={false} transparent opacity={0.9} />
      </lineSegments>
    </>
  );
}
