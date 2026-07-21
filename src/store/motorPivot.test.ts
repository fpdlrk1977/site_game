// 모터 경첩 이동(moveMotorPivot) 결정론 테스트 — `npx tsx src/store/motorPivot.test.ts`
//
// 불변식 하나만 검증한다: **경첩(모터 원점)만 움직이고, 연결된 부품의 월드 변환은 그대로**.
// 이게 깨지면 부품이 조용히 어긋나므로(에러 없이 위치만 틀어짐) 눈으로는 못 잡는다.
import { Vector3, Quaternion, Matrix4, Euler, MathUtils } from 'three';
import { useSceneStore } from './sceneStore';
import type { ObjectNodeSchema } from '@/types/scene';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
function near(a: number, b: number, eps = 1e-9) { return Math.abs(a - b) < eps; }

function obj(o: Partial<ObjectNodeSchema> & { id: string }): ObjectNodeSchema {
  return {
    name: o.id, assetId: null, parentId: null, layer: 'default',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
    visible: true, locked: false,
    physics: { enabled: false, mass: 0, isSensor: false, restitution: 0, friction: 0.5 } as ObjectNodeSchema['physics'],
    events: [],
    ...o,
  } as ObjectNodeSchema;
}

/** 부모 체인을 합성한 월드 행렬(스토어 내부 computeWorldMatrix와 동일 규칙). */
function worldMatrix(objects: ObjectNodeSchema[], id: string): Matrix4 {
  const o = objects.find((x) => x.id === id)!;
  const local = new Matrix4().compose(
    new Vector3(o.position.x, o.position.y, o.position.z),
    new Quaternion().setFromEuler(new Euler(
      o.rotation.x * MathUtils.DEG2RAD, o.rotation.y * MathUtils.DEG2RAD, o.rotation.z * MathUtils.DEG2RAD)),
    new Vector3(o.scale.x, o.scale.y, o.scale.z),
  );
  return o.parentId ? worldMatrix(objects, o.parentId).multiply(local) : local;
}
/** 월드 행렬 전체(16성분). decompose로 위치/회전/크기를 나눠 비교하면 **전단(shear)이 있는 경우**
 *  — 모터에 비균일 스케일 + 자식 회전 — 분해가 비단위 쿼터니언을 내놔 비교가 무의미해진다.
 *  행렬을 통째로 비교하면 위치·회전·크기·전단이 한 번에, 규약 의존 없이 검증된다. */
function worldElems(objects: ObjectNodeSchema[], id: string): number[] {
  return [...worldMatrix(objects, id).elements];
}
function maxDiff(a: number[], b: number[]) {
  return a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
}

/** 시나리오 실행: objects 세팅 → 경첩 이동 → (경첩 위치, 부품 월드 변환 보존) 검증. */
function scenario(name: string, objects: ObjectNodeSchema[], motorId: string, partIds: string[], target: Vector3) {
  console.log(`\n${name}`);
  useSceneStore.setState({ objects, _prevSnapshot: null });
  const before = partIds.map((id) => worldElems(objects, id));

  useSceneStore.getState().moveMotorPivot(motorId, { x: target.x, y: target.y, z: target.z });
  const after = useSceneStore.getState().objects;

  // ① 경첩(모터 원점)이 정확히 target 월드 좌표에 있다
  const mw = new Vector3().setFromMatrixPosition(worldMatrix(after, motorId));
  check('경첩이 목표 월드 좌표로 이동',
    near(mw.x, target.x, 1e-9) && near(mw.y, target.y, 1e-9) && near(mw.z, target.z, 1e-9),
    `got (${mw.x.toFixed(6)}, ${mw.y.toFixed(6)}, ${mw.z.toFixed(6)}) want (${target.x}, ${target.y}, ${target.z})`);

  // ② 부품의 월드 행렬이 통째로 그대로 (= 화면에서 전혀 안 움직임)
  partIds.forEach((id, i) => {
    const d = maxDiff(before[i], worldElems(after, id));
    check(`부품 '${id}' 월드 변환 완전 보존`, d < 1e-9, `최대 성분 오차 ${d.toExponential(2)}`);
  });
}

// ── 1. 기본: 원점 모터 + 부품 하나 ─────────────────────────────
// 새의 어깨로 경첩을 보내는 대표 케이스.
scenario('1. 기본 — 모터(원점) + 부품 1개, 경첩을 어깨로',
  [obj({ id: 'motor', isGroup: true, isActuator: true }),
   obj({ id: 'wing', parentId: 'motor', position: { x: 2, y: 0, z: 0 } })],
  'motor', ['wing'], new Vector3(1, 0.5, 0));

// ── 2. 회전·비균일 스케일이 걸린 모터 ───────────────────────────
// 역보정이 회전/스케일을 제대로 통과하는지(성분별 곱으로 대충 하면 여기서 깨진다).
scenario('2. 모터에 회전(Y40°,Z25°)+비균일 스케일',
  [obj({ id: 'motor', isGroup: true, isActuator: true,
        position: { x: -1, y: 2, z: 0.5 }, rotation: { x: 0, y: 40, z: 25 }, scale: { x: 2, y: 0.5, z: 1.5 } }),
   obj({ id: 'wing', parentId: 'motor', position: { x: 1.3, y: -0.7, z: 0.4 },
        rotation: { x: 10, y: 0, z: 0 }, scale: { x: 1, y: 2, z: 1 } })],
  'motor', ['wing'], new Vector3(3, -1, 2));

// ── 3. 부품 여러 개 (한 모터에 양 날개) ─────────────────────────
scenario('3. 부품 여러 개 — 한 모터에 두 날개',
  [obj({ id: 'motor', isGroup: true, isActuator: true, rotation: { x: 0, y: 90, z: 0 } }),
   obj({ id: 'wingL', parentId: 'motor', position: { x: 2, y: 0, z: 0 } }),
   obj({ id: 'wingR', parentId: 'motor', position: { x: -2, y: 0, z: 0 }, rotation: { x: 0, y: 180, z: 0 } })],
  'motor', ['wingL', 'wingR'], new Vector3(0, 1.5, 0));

// ── 4. 중첩 — 몸통 그룹 안의 모터 (실제 새 조립 구조) ───────────
// 모터가 root가 아니라 부모(몸통) 밑에 있을 때도 부모 공간 변환이 맞아야 한다.
scenario('4. 중첩 — 몸통 그룹 > 모터 > 날개',
  [obj({ id: 'body', isGroup: true, position: { x: 5, y: 1, z: -2 }, rotation: { x: 0, y: 30, z: 0 }, scale: { x: 1.5, y: 1.5, z: 1.5 } }),
   obj({ id: 'motor', parentId: 'body', isGroup: true, isActuator: true, position: { x: 0.5, y: 0.2, z: 0 } }),
   obj({ id: 'wing', parentId: 'motor', position: { x: 1, y: 0, z: 0.3 }, rotation: { x: 0, y: 0, z: 15 } })],
  'motor', ['wing'], new Vector3(6.2, 2.4, -1.1));

// ── 5. 빈 모터(부품 없음) — 그냥 이동만 되면 됨 ─────────────────
scenario('5. 빈 모터 — 부품 없이 경첩만 이동',
  [obj({ id: 'motor', isGroup: true, isActuator: true, position: { x: 1, y: 1, z: 1 } })],
  'motor', [], new Vector3(-2, 3, 0.5));

// ── 6. 가드: 모터가 아니면 no-op ────────────────────────────────
console.log('\n6. 가드 — 일반 그룹엔 적용 안 됨(모터 전용)');
{
  const objects = [obj({ id: 'g', isGroup: true }), obj({ id: 'c', parentId: 'g', position: { x: 1, y: 0, z: 0 } })];
  useSceneStore.setState({ objects, _prevSnapshot: null });
  useSceneStore.getState().moveMotorPivot('g', { x: 9, y: 9, z: 9 });
  const after = useSceneStore.getState().objects;
  const g = after.find((o) => o.id === 'g')!;
  check('일반 그룹은 무변경', g.position.x === 0 && g.position.y === 0 && g.position.z === 0,
    `got (${g.position.x}, ${g.position.y}, ${g.position.z})`);
}

// ── 7. undo 기준: 연속 드래그가 1회로 커밋되는지(_prevSnapshot 지연커밋) ──
console.log('\n7. undo — 연속 이동이 _prevSnapshot 하나로 묶임');
{
  const objects = [obj({ id: 'motor', isGroup: true, isActuator: true }),
                   obj({ id: 'wing', parentId: 'motor', position: { x: 2, y: 0, z: 0 } })];
  useSceneStore.setState({ objects, _prevSnapshot: null, past: [], future: [] });
  const st = useSceneStore.getState();
  st.moveMotorPivot('motor', { x: 0.5, y: 0, z: 0 });
  const snapAfterFirst = useSceneStore.getState()._prevSnapshot;
  st.moveMotorPivot('motor', { x: 1.0, y: 0, z: 0 });
  st.moveMotorPivot('motor', { x: 1.5, y: 0, z: 0 });
  const snapAfterThird = useSceneStore.getState()._prevSnapshot;
  check('첫 이동이 스냅샷 생성', snapAfterFirst !== null);
  check('이후 이동은 스냅샷 덮어쓰지 않음(드래그 전체가 undo 1회)', snapAfterFirst === snapAfterThird);
  const origin = snapAfterFirst!.objects.find((o) => o.id === 'motor')!;
  check('스냅샷은 드래그 시작 전 상태', origin.position.x === 0, `got ${origin.position.x}`);
}

// ── 8. 모터만 제거(B) — 부품이 살아남고 제자리 ────────────────
// 삭제(deleteSelected)는 자손까지 지우므로, 이 경로가 "되돌리려면 작업물을 날려야" 하는 상황을 막는다.
console.log('\n8. 모터만 제거 — 부품 유지 + 제자리(최상위 모터)');
{
  const objects = [
    obj({ id: 'motor', isGroup: true, isActuator: true,
          position: { x: 1, y: 2, z: -1 }, rotation: { x: 0, y: 35, z: 20 }, scale: { x: 1.5, y: 1.5, z: 1.5 } }),
    obj({ id: 'wing', parentId: 'motor', position: { x: 1.2, y: 0, z: 0.3 }, rotation: { x: 0, y: 0, z: 12 } }),
    obj({ id: 'other', position: { x: 9, y: 0, z: 9 } }),
  ];
  const before = worldElems(objects, 'wing');
  useSceneStore.setState({ objects, _prevSnapshot: null, past: [], future: [] });
  useSceneStore.getState().removeMotorKeepParts('motor');
  const after = useSceneStore.getState().objects;

  check('모터가 사라짐', !after.find((o) => o.id === 'motor'));
  check('부품이 살아남음', !!after.find((o) => o.id === 'wing'));
  check('무관한 오브젝트 보존', !!after.find((o) => o.id === 'other'));
  check('부품이 최상위로 승격', after.find((o) => o.id === 'wing')!.parentId === null);
  const d = maxDiff(before, worldElems(after, 'wing'));
  check('부품 월드 변환 완전 보존(제자리)', d < 1e-9, `최대 성분 오차 ${d.toExponential(2)}`);
  check('풀려난 부품이 선택됨', useSceneStore.getState().selectedIds.join(',') === 'wing');
  check('undo 스택에 1회 기록', useSceneStore.getState().past.length === 1);
}

// ── 9. 모터만 제거 — 중첩(몸통 안의 모터) ──────────────────────
// 부품은 최상위가 아니라 **모터의 부모(몸통)** 로 승격돼야 조립 구조가 유지된다.
console.log('\n9. 모터만 제거 — 중첩(몸통 > 모터 > 날개)');
{
  const objects = [
    obj({ id: 'body', isGroup: true, position: { x: 4, y: 1, z: 0 }, rotation: { x: 0, y: 50, z: 0 }, scale: { x: 2, y: 2, z: 2 } }),
    obj({ id: 'motor', parentId: 'body', isGroup: true, isActuator: true, position: { x: 0.4, y: 0.6, z: 0 }, rotation: { x: 15, y: 0, z: 0 } }),
    obj({ id: 'wing', parentId: 'motor', position: { x: 0.9, y: 0, z: 0.2 }, scale: { x: 1, y: 0.5, z: 1 } }),
  ];
  const before = worldElems(objects, 'wing');
  useSceneStore.setState({ objects, _prevSnapshot: null, past: [], future: [] });
  useSceneStore.getState().removeMotorKeepParts('motor');
  const after = useSceneStore.getState().objects;

  check('부품이 몸통(조부모)으로 승격', after.find((o) => o.id === 'wing')!.parentId === 'body');
  check('몸통 보존', !!after.find((o) => o.id === 'body'));
  const d = maxDiff(before, worldElems(after, 'wing'));
  check('부품 월드 변환 완전 보존(제자리)', d < 1e-9, `최대 성분 오차 ${d.toExponential(2)}`);
}

// ── 10. 가드 — 모터가 아니면 아무 것도 안 한다 ──────────────────
console.log('\n10. 가드 — 일반 그룹엔 적용 안 됨');
{
  const objects = [obj({ id: 'g', isGroup: true }), obj({ id: 'c', parentId: 'g' })];
  useSceneStore.setState({ objects, _prevSnapshot: null, past: [], future: [] });
  useSceneStore.getState().removeMotorKeepParts('g');
  check('일반 그룹은 무변경', useSceneStore.getState().objects.length === 2);
}

// ── 11. 모터 삽입(C) — 부품 자리를 모터가 승계, 부품은 제자리 ──────
// "새 몸통 > 날개"에서 날개에 관절을 달아도 **몸통과의 관계가 유지**돼야 한다(재부착 왕복 제거).
console.log('\n11. 모터 삽입 — 몸통 > [모터] > 날개, 날개는 제자리');
{
  const objects = [
    obj({ id: 'body', isGroup: true, position: { x: 3, y: 1, z: -2 }, rotation: { x: 0, y: 40, z: 0 }, scale: { x: 1.5, y: 1.5, z: 1.5 } }),
    obj({ id: 'wing', parentId: 'body', position: { x: 1, y: 0.2, z: 0 }, rotation: { x: 0, y: 0, z: 20 }, scale: { x: 2, y: 0.2, z: 1 } }),
    obj({ id: 'other', position: { x: 9, y: 0, z: 9 } }),
  ];
  const before = worldElems(objects, 'wing');
  useSceneStore.setState({ objects, assets: [], _prevSnapshot: null, past: [], future: [] });
  useSceneStore.getState().insertMotorForObject('wing');
  const after = useSceneStore.getState().objects;

  const motor = after.find((o) => o.isActuator);
  check('모터가 생성됨', !!motor);
  check('모터가 부품의 원래 부모 자리를 승계', motor?.parentId === 'body');
  check('부품이 모터의 자식이 됨', after.find((o) => o.id === 'wing')!.parentId === motor?.id);
  check('모터는 그룹', motor?.isGroup === true);
  check('관절 설정이 모터에 붙음', !!motor?.actuator);
  // ★ 핵심 — 날개가 화면에서 전혀 안 움직여야 한다
  const d = maxDiff(before, worldElems(after, 'wing'));
  check('부품 월드 변환 완전 보존(제자리)', d < 1e-9, `최대 성분 오차 ${d.toExponential(2)}`);
  check('무관한 오브젝트 보존', !!after.find((o) => o.id === 'other'));
  check('undo 1회', useSceneStore.getState().past.length === 1);
}

// ── 12. 승격 — 속성형 관절이 있던 부품 ─────────────────────────
// 설정(축·범위·구동)은 모터로 옮겨가고, hinge는 모터 원점이 대신하므로 빠진다. 이중 적용 방지.
console.log('\n12. 승격 — 속성형 설정이 모터로 이관되고 부품에선 제거');
{
  const objects = [
    obj({ id: 'wing', position: { x: 2, y: 1, z: 0 }, scale: { x: 2, y: 0.2, z: 1 },
          actuator: { kind: 'rotate', axis: 'z', hinge: { x: 0, y: 0.5, z: 0.5 }, min: -10, max: 70, drive: 'oscillate', speed: 3 } }),
  ];
  const beforeWing = worldElems(objects, 'wing');
  useSceneStore.setState({ objects, assets: [], _prevSnapshot: null, past: [], future: [] });
  useSceneStore.getState().insertMotorForObject('wing');
  const after = useSceneStore.getState().objects;
  const motor = after.find((o) => o.isActuator)!;
  const wing = after.find((o) => o.id === 'wing')!;

  check('부품에서 속성형 관절 제거(이중 적용 방지)', wing.actuator === undefined);
  check('축 이관', motor.actuator?.axis === 'z');
  check('범위 이관', motor.actuator?.min === -10 && motor.actuator?.max === 70);
  check('구동 이관', motor.actuator?.drive === 'oscillate' && motor.actuator?.speed === 3);
  check('hinge는 빠짐(모터 원점이 대신)', motor.actuator?.hinge === undefined);
  const d = maxDiff(beforeWing, worldElems(after, 'wing'));
  check('부품 월드 변환 완전 보존', d < 1e-9, `최대 성분 오차 ${d.toExponential(2)}`);
}

// ── 13. 삽입 → 제거 왕복이 원상복구인지 (C와 B의 정합) ──────────
console.log('\n13. 왕복 — 모터 삽입 후 "모터만 제거"하면 원래 구조·위치로');
{
  const objects = [
    obj({ id: 'body', isGroup: true, position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 25, z: 0 } }),
    obj({ id: 'wing', parentId: 'body', position: { x: 1.5, y: 0.3, z: 0 }, rotation: { x: 5, y: 0, z: 0 } }),
  ];
  const before = worldElems(objects, 'wing');
  useSceneStore.setState({ objects, assets: [], _prevSnapshot: null, past: [], future: [] });
  useSceneStore.getState().insertMotorForObject('wing');
  const motorId = useSceneStore.getState().objects.find((o) => o.isActuator)!.id;
  useSceneStore.getState().removeMotorKeepParts(motorId);
  const after = useSceneStore.getState().objects;

  check('모터가 사라짐', !after.find((o) => o.isActuator));
  check('부품이 원래 부모(몸통)로 복귀', after.find((o) => o.id === 'wing')!.parentId === 'body');
  const d = maxDiff(before, worldElems(after, 'wing'));
  check('부품 월드 변환 원상복구', d < 1e-9, `최대 성분 오차 ${d.toExponential(2)}`);
}

// ── 14. 가드 — 모터에 또 모터를 삽입하지 않는다 ─────────────────
console.log('\n14. 가드 — 이미 모터면 no-op');
{
  const objects = [obj({ id: 'm', isGroup: true, isActuator: true, actuator: { kind: 'rotate', axis: 'y', min: 0, max: 90, drive: 'manual' } })];
  useSceneStore.setState({ objects, assets: [], _prevSnapshot: null, past: [], future: [] });
  useSceneStore.getState().insertMotorForObject('m');
  check('무변경', useSceneStore.getState().objects.length === 1);
}

// ── 15. 프리셋 모터에도 A·B가 그대로 먹는지 (실제 프리셋 데이터로) ──
// 프리셋 모터는 isGroup+isActuator라 일반 모터와 같은 구조다 — 추론이 아니라 실제 스탬프로 확인.
console.log('\n15. 프리셋 모터 — 경첩 이동/모터만 제거가 동일하게 동작');
for (const presetId of ['hinged_door', 'gears', 'robot_arm']) {
  useSceneStore.setState({ objects: [], assets: [], _prevSnapshot: null, past: [], future: [] });
  useSceneStore.getState().addNodePreset(presetId);
  const stamped = useSceneStore.getState().objects;
  const motors = stamped.filter((o) => o.isActuator);
  check(`[${presetId}] 모터가 스탬프됨 (${motors.length}개)`, motors.length > 0);
  if (motors.length === 0) continue;

  // 부품이 달린 모터를 고른다(경첩 이동의 핵심 = 부품이 제자리인지)
  const motor = motors.find((m) => stamped.some((o) => o.parentId === m.id)) ?? motors[0];
  const parts = stamped.filter((o) => o.parentId === motor.id).map((o) => o.id);

  // (A) 경첩 이동 — 부품 제자리
  const beforeA = parts.map((id) => worldElems(stamped, id));
  useSceneStore.getState().moveMotorPivot(motor.id, { x: 4, y: 2.5, z: -1.5 });
  const afterA = useSceneStore.getState().objects;
  const mw = new Vector3().setFromMatrixPosition(worldMatrix(afterA, motor.id));
  check(`[${presetId}] A: 경첩이 목표로 이동`, near(mw.x, 4, 1e-9) && near(mw.y, 2.5, 1e-9) && near(mw.z, -1.5, 1e-9));
  const dA = Math.max(0, ...parts.map((id, i) => maxDiff(beforeA[i], worldElems(afterA, id))));
  check(`[${presetId}] A: 부품 ${parts.length}개 전부 제자리`, dA < 1e-9, `최대 오차 ${dA.toExponential(2)}`);

  // (B) 모터만 제거 — 부품 생존 + 제자리
  const beforeB = parts.map((id) => worldElems(afterA, id));
  useSceneStore.getState().removeMotorKeepParts(motor.id);
  const afterB = useSceneStore.getState().objects;
  check(`[${presetId}] B: 모터만 사라짐`, !afterB.find((o) => o.id === motor.id));
  check(`[${presetId}] B: 부품 전부 생존`, parts.every((id) => !!afterB.find((o) => o.id === id)));
  const dB = Math.max(0, ...parts.map((id, i) => maxDiff(beforeB[i], worldElems(afterB, id))));
  check(`[${presetId}] B: 부품 제자리`, dB < 1e-9, `최대 오차 ${dB.toExponential(2)}`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
