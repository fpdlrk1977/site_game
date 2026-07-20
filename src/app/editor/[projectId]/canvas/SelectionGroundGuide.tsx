'use client';

// 선택 오브젝트의 "바닥 위치" 가이드 — 3D에서 깊이/높이 파악을 쉽게.
//   ① 밑면 중앙에서 바닥(y=0)까지 수직 점선(떠 있을 때만) + ② 바닥에 발자국(footprint) 윤곽·반투명 채움
//   + ③ 높이 라벨(얼마나 떠 있는지). 라이트/파티클은 자체 표식이 있어 제외. 단일 선택만.
// 드래그 중에도 라이브 추종(SelectionOutline과 동일하게 매 프레임 월드 bbox 계산).
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import { CHARACTER_PREVIEW_ID } from './CharacterPreview';
import { localBBox } from '@/lib/objectBBox';

const COLOR = '#0D99FF';
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _min = new THREE.Vector3();
const _max = new THREE.Vector3();

export function SelectionGroundGuide() {
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const objects = useSceneStore((s) => s.objects);
  const assets = useSceneStore((s) => s.assets);
  const refsMap = useObjectRefs();

  const dropRef = useRef<THREE.LineSegments>(null);   // 수직 점선(밑면→바닥)
  const footRef = useRef<THREE.LineSegments>(null);   // 바닥 발자국 윤곽
  const fillRef = useRef<THREE.Mesh>(null);           // 발자국 반투명 채움
  const labelGroupRef = useRef<THREE.Group>(null);    // 높이 라벨 앵커
  const labelRef = useRef<HTMLDivElement>(null);

  const id = selectedIds.length === 1 ? selectedIds[0] : null;
  const obj = id && id !== CHARACTER_PREVIEW_ID ? objects.find((o) => o.id === id) : null;
  // 라이트/파티클은 자체 위치 표식이 있어 제외. 숨김/잠금 제외.
  const valid = !!obj && !obj.locked && obj.visible && !obj.light && !obj.particle;

  // 수직 점선 = 1 세그먼트(2정점)
  const dropGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    return g;
  }, []);
  // 발자국 윤곽 = 사각형 4변(8정점)
  const footGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    return g;
  }, []);
  useEffect(() => () => { dropGeo.dispose(); footGeo.dispose(); }, [dropGeo, footGeo]);

  useFrame(() => {
    const drop = dropRef.current, foot = footRef.current, fill = fillRef.current;
    if (!drop || !foot || !fill) return;
    const lg = labelGroupRef.current; // 라벨(Html)은 선택 시에만 마운트 → null 가능
    const hideAll = () => { drop.visible = false; foot.visible = false; fill.visible = false; };
    if (!valid || !id) { hideAll(); return; }
    const ref = refsMap.current.get(id);
    const lb = localBBox(objects, assets, id);
    if (!ref || !ref.parent || !lb || lb.isEmpty()) { hideAll(); return; }
    ref.updateWorldMatrix(true, false);
    // 월드 8코너 → 월드 AABB(min/max)
    for (let i = 0; i < 8; i++) {
      _corners[i].set(i & 1 ? lb.max.x : lb.min.x, i & 2 ? lb.max.y : lb.min.y, i & 4 ? lb.max.z : lb.min.z)
        .applyMatrix4(ref.matrixWorld);
    }
    _min.set(Infinity, Infinity, Infinity);
    _max.set(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) { _min.min(_corners[i]); _max.max(_corners[i]); }
    const cx = (_min.x + _max.x) / 2, cz = (_min.z + _max.z) / 2;
    const baseY = _min.y;               // 밑면 높이(바닥에서 얼마나 떠 있나)
    const floating = baseY > 0.02;      // 바닥에 거의 붙었으면 점선/라벨 숨김
    const gy = 0.02;                    // 발자국을 바닥 살짝 위에(z-fighting 방지)

    // ① 수직 점선 — 밑면 중앙 → 바닥
    const dp = dropGeo.attributes.position.array as Float32Array;
    dp[0] = cx; dp[1] = baseY; dp[2] = cz;
    dp[3] = cx; dp[4] = gy; dp[5] = cz;
    dropGeo.attributes.position.needsUpdate = true;
    drop.computeLineDistances();
    drop.visible = floating;

    // ② 발자국 윤곽(사각형 4변) + 채움 — 월드 XZ min/max
    const x0 = _min.x, x1 = _max.x, z0 = _min.z, z1 = _max.z;
    const fp = footGeo.attributes.position.array as Float32Array;
    const edges: [number, number, number, number][] = [
      [x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0],
    ];
    let k = 0;
    for (const [ax, az, bx, bz] of edges) {
      fp[k++] = ax; fp[k++] = gy; fp[k++] = az;
      fp[k++] = bx; fp[k++] = gy; fp[k++] = bz;
    }
    footGeo.attributes.position.needsUpdate = true;
    foot.computeLineDistances();
    foot.visible = true;
    // 채움 평면 — 중심·크기 맞춤(로컬 plane 1×1을 스케일)
    fill.position.set(cx, gy - 0.001, cz);
    fill.scale.set(Math.max(0.001, x1 - x0), Math.max(0.001, z1 - z0), 1);
    fill.visible = true;

    // ③ 높이 라벨 — 점선 중간, 떠 있을 때만(선택 시에만 마운트됨). Html은 display로 토글.
    if (lg && labelRef.current) {
      lg.position.set(cx, baseY / 2, cz);
      labelRef.current.style.display = floating ? 'block' : 'none';
      labelRef.current.textContent = `${baseY.toFixed(2)}m`;
    }
  });

  return (
    <>
      {/* 수직 점선(밑면→바닥) */}
      <lineSegments ref={dropRef} geometry={dropGeo} frustumCulled={false} visible={false} renderOrder={998}>
        <lineDashedMaterial color={COLOR} dashSize={0.12} gapSize={0.08} transparent opacity={0.8} depthTest={false} />
      </lineSegments>
      {/* 바닥 발자국 윤곽 */}
      <lineSegments ref={footRef} geometry={footGeo} frustumCulled={false} visible={false} renderOrder={998}>
        <lineDashedMaterial color={COLOR} dashSize={0.14} gapSize={0.09} transparent opacity={0.9} depthTest={false} />
      </lineSegments>
      {/* 발자국 반투명 채움 (바닥에 눕힘) */}
      <mesh ref={fillRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={997}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      {/* 높이 라벨 — 선택 시에만 마운트(drei Html은 .visible=false로 안 숨겨지는 함정 → 조건부 렌더로 해결) */}
      {valid && (
        <group ref={labelGroupRef}>
          <Html center zIndexRange={[60, 0]} style={{ pointerEvents: 'none', userSelect: 'none' }}>
            <div ref={labelRef} style={{ background: 'rgba(13,153,255,0.9)', color: '#fff', fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>0m</div>
          </Html>
        </group>
      )}
    </>
  );
}
