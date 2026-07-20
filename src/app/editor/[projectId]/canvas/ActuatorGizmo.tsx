'use client';

// 관절(액추에이터) 저작 가이드 — 선택 오브젝트의 경첩(주황 점)과 회전/이동 축(주황 선)을 에디터에 표시.
//   rotate 관절은 min→max 회전 범위를 부채꼴(호)로 미리 보여주고, 양 끝의 핸들을 드래그해 각도를 직접 조절.
//   경첩/축/부채꼴은 읽기 전용, min/max 핸들만 상호작용. 실제 움직임은 ▶ 플레이. doc/PIVOT_MANIPULATION.md §6.
import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import { CHARACTER_PREVIEW_ID } from './CharacterPreview';
import { localBBox } from '@/lib/objectBBox';
import { anchorLocalPoint } from '@/lib/pivotMath';

const ORANGE = '#ff7a0d';
const MIN_COL = '#ff7a0d'; // 닫힘(min)
const MAX_COL = '#ffd24d'; // 열림(max)
// 회전 커서 — 부채꼴 핸들 위/드래그 시. 원형 화살표(주황) SVG, 핫스팟 중앙, 폴백 grab.
const ROTATE_CUR = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='%23ff7a0d' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12a9 9 0 1 1-2.64-6.36'/><path d='M21 3v6h-6'/></svg>\") 14 14, grab";
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const FAN_SEG = 48; // 부채꼴 세그먼트 수
const _h = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const _wp = new THREE.Vector3();
const _ws = new THREE.Vector3();
const _p = new THREE.Vector3();
const _wbox = new THREE.Box3();
const _ref = new THREE.Vector3(); // 부채꼴 기준 반경 벡터(월드)
const _rim = new THREE.Vector3(); // 부채꼴 테두리 점
const _q = new THREE.Quaternion();
const _size = new THREE.Vector3();
// 드래그(핸들→각도) 계산용 임시
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _dv = new THREE.Vector3();
const _cross = new THREE.Vector3();

export function ActuatorGizmo({ orbitRef }: { orbitRef?: React.RefObject<OrbitControlsImpl | null> }) {
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const objects = useSceneStore((s) => s.objects);
  const assets = useSceneStore((s) => s.assets);
  const refsMap = useObjectRefs();
  const { camera, gl, size } = useThree();

  const id = selectedIds.length === 1 ? selectedIds[0] : null;
  const obj = id && id !== CHARACTER_PREVIEW_ID ? objects.find((o) => o.id === id) : null;
  const act = obj?.actuator;
  const showHandles = !!act && act.kind === 'rotate';

  const sphereRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const fanRef = useRef<THREE.Mesh>(null);
  const minRef = useRef<THREE.Mesh>(null);
  const maxRef = useRef<THREE.Mesh>(null);
  // 드래그 상태 + 최신 월드 프레임(핸들 pointermove가 참조)
  const dragRef = useRef<'min' | 'max' | null>(null);
  const hingeW = useRef(new THREE.Vector3());
  const axisW = useRef(new THREE.Vector3());
  const refW = useRef(new THREE.Vector3());
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(), []);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  // 부채꼴 채움: 중심(0) + 테두리 FAN_SEG+1 점, 삼각형 팬 인덱스는 1회 세팅.
  const fanGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((FAN_SEG + 2) * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < FAN_SEG; i++) idx.push(0, i + 1, i + 2);
    g.setIndex(idx);
    return g;
  }, []);
  // 부채꼴 테두리 라인(선 스트립): 중심→테두리 전체→중심 = 두 반경변 + 호.
  const edgeGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((FAN_SEG + 3) * 3), 3));
    return g;
  }, []);
  // 부채꼴 테두리 라인 오브젝트(THREE.Line) — r3f `<line>` 태그 모호성 회피 위해 명령형 생성.
  const edgeLine = useMemo(() => {
    const l = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color: ORANGE, depthTest: false, transparent: true, opacity: 0.55 }));
    l.renderOrder = 1001;
    l.frustumCulled = false;
    l.visible = false;
    return l;
  }, [edgeGeo]);
  useEffect(() => () => {
    geo.dispose(); fanGeo.dispose(); edgeGeo.dispose();
    (edgeLine.material as THREE.Material).dispose();
  }, [geo, fanGeo, edgeGeo, edgeLine]);

  // 핸들 드래그 시작 — 포인터를 회전 평면에 투영해 각도(°)를 계산, min/max에 실시간 반영.
  //   atan2는 ±180°만 나오므로 프레임 간 델타를 unwrap해 누적 → 180°를 넘겨도 부채꼴이 뒤집히지 않고
  //   연속으로 돈다. **반대 핸들 기준 상대 클램프**로 스윕(max−min)이 0~360°를 벗어나지 않게 한다
  //   (절대 [-360,360]만 막으면 min 음수 + max 양수로 스윕이 360°를 넘어버림).
  const startDrag = (which: 'min' | 'max') => (e: { stopPropagation: () => void }) => {
    if (!id) return;
    e.stopPropagation();
    dragRef.current = which;
    if (orbitRef?.current) orbitRef.current.enabled = false;
    gl.domElement.style.cursor = ROTATE_CUR;
    // 시작 각도(저장값)에서 누적. prevRaw는 첫 move에서 기준만 잡고 값 갱신은 건너뜀(잡는 순간 점프 방지).
    const o0 = useSceneStore.getState().objects.find((x) => x.id === id);
    let accum = (o0?.actuator?.[which] as number) ?? 0;
    let prevRaw: number | null = null;
    const move = (ev: PointerEvent) => {
      if (dragRef.current !== which || !id) return;
      const rect = gl.domElement.getBoundingClientRect();
      _ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(_ndc, camera);
      plane.setFromNormalAndCoplanarPoint(axisW.current, hingeW.current);
      if (!ray.ray.intersectPlane(plane, _hit)) return;
      _dv.subVectors(_hit, hingeW.current);
      // 기준(refW)으로부터 축(axisW) 둘레 부호 있는 각도(±180°).
      const raw = Math.atan2(_cross.crossVectors(refW.current, _dv).dot(axisW.current), refW.current.dot(_dv)) * RAD2DEG;
      if (prevRaw === null) { prevRaw = raw; return; } // 첫 프레임: 기준만 잡음
      let d = raw - prevRaw; // 프레임 간 델타 unwrap → 경계(±180°) 넘어도 연속
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      prevRaw = raw;
      const st = useSceneStore.getState();
      const o = st.objects.find((x) => x.id === id);
      if (!o?.actuator) return;
      // 반대 핸들 기준 클램프: min ≤ max ≤ min+360 (스윕 0~360° 보장, 360° 초과·역전 방지).
      const other = (which === 'max' ? o.actuator.min : o.actuator.max) ?? 0;
      accum += d;
      accum = which === 'max'
        ? Math.max(other, Math.min(other + 360, accum))
        : Math.max(other - 360, Math.min(other, accum));
      st.updateObject(id, { actuator: { ...o.actuator, [which]: Math.round(accum) } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dragRef.current = null;
      gl.domElement.style.cursor = '';
      if (orbitRef?.current) orbitRef.current.enabled = true;
      useSceneStore.getState().pushHistory();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useFrame(() => {
    const sp = sphereRef.current, ln = lineRef.current, fan = fanRef.current, edge = edgeLine;
    const minH = minRef.current, maxH = maxRef.current;
    if (!sp || !ln || !fan || !edge || !minH || !maxH) return;
    const hideAll = () => { sp.visible = false; ln.visible = false; fan.visible = false; edge.visible = false; minH.visible = false; maxH.visible = false; };
    if (!act || !id) { hideAll(); return; }
    const ref = refsMap.current.get(id);
    const lb = localBBox(objects, assets, id);
    const haveBox = !!lb && !lb.isEmpty();
    const isMotor = !!obj?.isActuator;
    // 모터형은 bbox 없이도(빈 모터) 가이드 표시. 속성형은 bbox 필요.
    if (!ref || !ref.parent || (!isMotor && !haveBox)) { hideAll(); return; }
    ref.updateWorldMatrix(true, false);
    ref.matrixWorld.decompose(_wp, _wq, _ws);
    // 경첩 월드 위치 — 모터형=자기 원점, 속성형=bbox 앵커
    if (isMotor) _h.copy(_wp);
    else _h.copy(anchorLocalPoint(lb!, act.hinge ?? { x: 0.5, y: 0.5, z: 0.5 })).applyMatrix4(ref.matrixWorld);
    sp.position.copy(_h);
    // 축/부채꼴 반경(len) = 월드 bbox 최대 변의 60%(+여유). 빈 모터는 기본 반경. (핸들 크기 상한에도 씀)
    let len: number;
    if (haveBox) { _wbox.copy(lb!).applyMatrix4(ref.matrixWorld); _wbox.getSize(_p); len = Math.max(_p.x, _p.y, _p.z) * 0.6 + 0.2; }
    else len = 1.2;
    // 화면상 일정 크기(거리+뷰포트 보정) — 단, 줌아웃 시 오브젝트/부채꼴을 가리지 않도록 len의 일정 비율로 상한(cap).
    const hScale = Math.min(
      Math.max(0.02, camera.position.distanceTo(_h) * 0.02 * (800 / Math.max(1, size.height))),
      len * 0.16,
    );
    sp.scale.setScalar(hScale);
    // 축 방향(월드) — 오브젝트 회전 반영
    _axis.set(act.axis === 'x' ? 1 : 0, act.axis === 'y' ? 1 : 0, act.axis === 'z' ? 1 : 0).applyQuaternion(_wq).normalize();
    const arr = geo.attributes.position.array as Float32Array;
    _p.copy(_h).addScaledVector(_axis, -len);
    arr[0] = _p.x; arr[1] = _p.y; arr[2] = _p.z;
    _p.copy(_h).addScaledVector(_axis, len);
    arr[3] = _p.x; arr[4] = _p.y; arr[5] = _p.z;
    geo.attributes.position.needsUpdate = true;
    sp.visible = true; ln.visible = true;

    // slide는 부채꼴/핸들 없음(축 선만)
    if (act.kind !== 'rotate') { fan.visible = false; edge.visible = false; minH.visible = false; maxH.visible = false; return; }

    // 기준 반경 벡터 = 회전축에 수직인 로컬 축(bbox 긴 쪽) → 월드 → 반경 len.
    if (haveBox) lb!.getSize(_size); else _size.set(1, 1, 1);
    let refLocalX = 0, refLocalY = 0, refLocalZ = 0;
    if (act.axis === 'y') { if (_size.z > _size.x) refLocalZ = 1; else refLocalX = 1; }
    else if (act.axis === 'x') { if (_size.z > _size.y) refLocalZ = 1; else refLocalY = 1; }
    else { if (_size.y > _size.x) refLocalY = 1; else refLocalX = 1; }
    _ref.set(refLocalX, refLocalY, refLocalZ).applyQuaternion(_wq).normalize().multiplyScalar(len);
    // 드래그 핸들러가 참조할 최신 월드 프레임 저장
    hingeW.current.copy(_h);
    axisW.current.copy(_axis);
    refW.current.copy(_ref);

    // min/max 핸들 위치 = _ref를 각도만큼 회전 + 경첩
    _q.setFromAxisAngle(_axis, act.min * DEG2RAD);
    minH.position.copy(_rim.copy(_ref).applyQuaternion(_q).add(_h));
    minH.scale.setScalar(hScale * 1.1);
    _q.setFromAxisAngle(_axis, act.max * DEG2RAD);
    maxH.position.copy(_rim.copy(_ref).applyQuaternion(_q).add(_h));
    maxH.scale.setScalar(hScale * 1.1);
    minH.visible = true; maxH.visible = true;

    // 스윕 부채꼴 — 범위가 있을 때만.
    if (Math.abs(act.max - act.min) < 0.01) { fan.visible = false; edge.visible = false; return; }
    const minRad = act.min * DEG2RAD, maxRad = act.max * DEG2RAD;
    const fanArr = fanGeo.attributes.position.array as Float32Array;
    const edgeArr = edgeGeo.attributes.position.array as Float32Array;
    fanArr[0] = _h.x; fanArr[1] = _h.y; fanArr[2] = _h.z;
    edgeArr[0] = _h.x; edgeArr[1] = _h.y; edgeArr[2] = _h.z;
    for (let i = 0; i <= FAN_SEG; i++) {
      const ang = minRad + (maxRad - minRad) * (i / FAN_SEG);
      _q.setFromAxisAngle(_axis, ang);
      _rim.copy(_ref).applyQuaternion(_q).add(_h);
      const o = (i + 1) * 3;
      fanArr[o] = _rim.x; fanArr[o + 1] = _rim.y; fanArr[o + 2] = _rim.z;
      edgeArr[o] = _rim.x; edgeArr[o + 1] = _rim.y; edgeArr[o + 2] = _rim.z;
    }
    const last = (FAN_SEG + 2) * 3;
    edgeArr[last] = _h.x; edgeArr[last + 1] = _h.y; edgeArr[last + 2] = _h.z;
    fanGeo.attributes.position.needsUpdate = true;
    edgeGeo.attributes.position.needsUpdate = true;
    fanGeo.computeVertexNormals();
    fan.visible = true; edge.visible = true;
  });

  return (
    <>
      {/* 스윕 부채꼴(채움) — 회전 범위 시각화. 호 라인 아래(renderOrder 1000). */}
      <mesh ref={fanRef} geometry={fanGeo} renderOrder={1000} visible={false} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial color={ORANGE} depthTest={false} transparent opacity={0.16} side={THREE.DoubleSide} />
      </mesh>
      <primitive object={edgeLine} />
      <mesh ref={sphereRef} renderOrder={1002} visible={false} raycast={() => null}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={ORANGE} depthTest={false} transparent opacity={0.95} />
      </mesh>
      <lineSegments ref={lineRef} geometry={geo} renderOrder={1002} visible={false} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial color={ORANGE} depthTest={false} transparent opacity={0.9} />
      </lineSegments>
      {/* min/max 드래그 핸들 — 끌어서 각도 직접 조절(회전 커서). rotate 전용. */}
      <mesh
        ref={minRef} renderOrder={1003} visible={false}
        onPointerDown={showHandles ? startDrag('min') : undefined}
        onPointerOver={showHandles ? (e) => { e.stopPropagation(); if (!dragRef.current) gl.domElement.style.cursor = ROTATE_CUR; } : undefined}
        onPointerOut={showHandles ? () => { if (!dragRef.current) gl.domElement.style.cursor = ''; } : undefined}
      >
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial color={MIN_COL} depthTest={false} transparent opacity={0.98} />
      </mesh>
      <mesh
        ref={maxRef} renderOrder={1003} visible={false}
        onPointerDown={showHandles ? startDrag('max') : undefined}
        onPointerOver={showHandles ? (e) => { e.stopPropagation(); if (!dragRef.current) gl.domElement.style.cursor = ROTATE_CUR; } : undefined}
        onPointerOut={showHandles ? () => { if (!dragRef.current) gl.domElement.style.cursor = ''; } : undefined}
      >
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial color={MAX_COL} depthTest={false} transparent opacity={0.98} />
      </mesh>
    </>
  );
}
