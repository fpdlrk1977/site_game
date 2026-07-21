// 플레이 모드 렌더 라우팅 — "각 오브젝트를 어떤 방식으로 그릴 것인가"를 결정하는 **순수 함수**.
//
// 왜 분리했나: 이 판정이 PlayCanvas 안에 **흩어진 filter 체인**으로 있던 동안 같은 종류의 버그가 반복해서 났다.
//   ①유령 콜라이더(시각은 움직이는데 벽은 원래 자리) ②이중 렌더(두 버킷에 동시에 들어감)
//   ③중첩 모터가 콜라이더를 못 받음(루트 전용 필터) ④평범한 그룹의 관절이 얼어붙음(`!isGroup` 조건)
// 전부 "조건 하나를 빠뜨려도 에러 없이 조용히 틀리는" 형태였다. 순수 함수로 빼면
// **상호배타(한 오브젝트는 정확히 한 버킷) + 전수커버(빠지는 오브젝트 없음)** 를 테스트로 고정할 수 있다.
//
// 기준 문서: doc/PIVOT_MANIPULATION.md §6, doc/PROGRESS.md 라우팅 갭 1·2차.
import type { ObjectNodeSchema } from '@/types/scene';

/** 렌더 방식. PlayCanvas의 각 렌더 블록과 1:1 대응한다. */
export type PlayBucket =
  | 'hidden'                 // 숨김(자신 또는 조상) — 아무것도 안 그림(콜라이더도 없음)
  | 'light'                  // 라이트(루트)
  | 'group-static'           // 정적 그룹 → GroupWithCollision(자식별 콜라이더)
  | 'group-moving-collider'  // 모션+콜라이더 그룹 → 하나의 kinematic 강체로 이동
  | 'group-moved'            // move_object로 옮겨지는 그룹 → kinematic 강체
  | 'group-visual'           // 시각 전용 그룹(장식·통과) → ViewerObject, 콜라이더 없음
  | 'moving-collider'        // 모션+콜라이더 오브젝트 → 월드 kinematic (루트·중첩 공통)
  | 'visual-motion'          // 모션(콜라이더 미동반) → 시각만, 통과
  | 'actuator-visual'        // 관절(콜라이더 미동반) → 시각만, 통과
  | 'actuator-collider'      // 관절(콜라이더 동반) → 월드 kinematic (루트·중첩 공통)
  | 'passable-visual'        // 런타임 통과 처리(set_passable) → 시각만
  | 'auto'                   // 일반 정적 오브젝트 → fixed 콜라이더
  | 'physics'                // physics 켠 오브젝트 → PhysicsObject
  | 'child';                 // 조상 그룹이 그려줌(별도 최상위 렌더 없음)

// ── 오브젝트별 거동 판정 (루트/자식 어디서든 동일) ─────────────────────────
/** 위치가 움직이는 모션 + 콜라이더 동반 → kinematic 이동 장애물. pulse는 제자리라 제외. */
export const isMovingColliderObj = (o: ObjectNodeSchema) =>
  o.motion?.collider === true && o.motion.type !== 'pulse' && !o.isGroup && !o.light;
/** 위치가 움직이는 모션인데 콜라이더 미동반 → 시각 전용(통과). 정적 콜라이더를 붙이면 유령 콜라이더가 된다. */
export const isVisualOnlyMotionObj = (o: ObjectNodeSchema) =>
  !!o.motion && o.motion.type !== 'pulse' && o.motion.collider !== true &&
  !o.isGroup && !o.light && !o.physics.enabled;
/** 관절(액추에이터) 보유. **그룹 여부를 따지지 않는다** — 모터도, 평범한 그룹도, 일반 오브젝트도 동일 규칙. */
export const hasActuator = (o: ObjectNodeSchema) => !!o.actuator && !o.light;
export const isActuatorVisualObj = (o: ObjectNodeSchema) => hasActuator(o) && o.actuator!.collider !== true;
export const isActuatorColliderObj = (o: ObjectNodeSchema) => hasActuator(o) && o.actuator!.collider === true;
/** 모션+콜라이더 그룹 → 서브트리를 하나의 강체로 묶어 이동. */
export const isGroupMovingCollider = (o: ObjectNodeSchema) =>
  !!o.motion && o.motion.collider === true && o.motion.type !== 'pulse';

export interface RoutingOpts {
  /** 런타임 통과 처리(set_passable/toggle_collision) 대상 id */
  passableIds?: Set<string>;
  /** move_object로 런타임 이동 중인 id */
  movedIds?: Set<string>;
}

/** 조상 체인 — 숨은 조상 아래인지, 움직이는 그룹(하나의 강체) 아래인지. */
function ancestorInfo(objects: ObjectNodeSchema[], o: ObjectNodeSchema) {
  let pid = o.parentId;
  let visible = true;
  let underMovingGroup = false;
  while (pid) {
    const p = objects.find((x) => x.id === pid);
    if (!p) break;
    if (!p.visible) visible = false;
    if (p.isGroup && p.motion) underMovingGroup = true;
    pid = p.parentId;
  }
  return { visible, underMovingGroup };
}

/**
 * 모든 오브젝트를 렌더 버킷으로 분류한다. **한 오브젝트는 정확히 하나의 버킷**을 갖는다.
 * (PlayCanvas는 이 결과로 각 렌더 목록을 만든다 — 필터 체인을 직접 쓰지 않는다.)
 */
export function classifyPlayObjects(
  objects: ObjectNodeSchema[],
  opts: RoutingOpts = {},
): Map<string, PlayBucket> {
  const isPassable = (o: ObjectNodeSchema) => !!opts.passableIds?.has(o.id);
  const isMoved = (o: ObjectNodeSchema) => !!opts.movedIds?.has(o.id);
  const out = new Map<string, PlayBucket>();

  for (const o of objects) {
    const anc = ancestorInfo(objects, o);
    // ① 숨김 — 자신 또는 조상이 안 보이면 콜라이더도 붙이지 않는다("보이지 않는 벽" 방지).
    if (!o.visible || !anc.visible) { out.set(o.id, 'hidden'); continue; }

    const isRoot = !o.parentId;

    // ② 상위로 끌어올려 그리는(hoist) 것들 — 루트·중첩 공통. 월드 기준 kinematic이라 깊이와 무관.
    //    움직이는 그룹 아래라면 그 그룹 강체에 실려 이동하므로 개별 콜라이더를 주지 않는다.
    if (!anc.underMovingGroup && !isPassable(o)) {
      if (isMovingColliderObj(o)) { out.set(o.id, 'moving-collider'); continue; }
      if (isActuatorColliderObj(o)) { out.set(o.id, 'actuator-collider'); continue; }
    }

    // ③ 중첩 오브젝트는 조상 그룹이 그려준다(GroupWithCollision / ViewerObject 재귀).
    if (!isRoot) { out.set(o.id, 'child'); continue; }

    // ④ 루트 — 라이트
    if (o.light) { out.set(o.id, 'light'); continue; }

    // ⑤ 루트 — 그룹
    if (o.isGroup) {
      if (isGroupMovingCollider(o) && !isPassable(o)) { out.set(o.id, 'group-moving-collider'); continue; }
      if (isMoved(o) && !o.motion && !isPassable(o)) { out.set(o.id, 'group-moved'); continue; }
      // 관절이 걸린 그룹(모터 포함)은 정적으로 두면 관절이 굳는다 → 관절 버킷이 구동.
      //   (콜라이더 동반이면 위 ②에서 이미 actuator-collider로 빠졌다.)
      if (isActuatorVisualObj(o) && !isPassable(o)) { out.set(o.id, 'actuator-visual'); continue; }
      if (!o.motion && !isPassable(o) && !isMoved(o) && !o.isActuator && !o.actuator) {
        out.set(o.id, 'group-static'); continue;
      }
      out.set(o.id, 'group-visual'); continue; // 나머지(모션 콜라이더 미동반·통과 등)
    }

    // ⑥ 루트 — 일반 오브젝트
    if (isPassable(o)) { out.set(o.id, 'passable-visual'); continue; }
    if (isVisualOnlyMotionObj(o)) { out.set(o.id, 'visual-motion'); continue; }
    if (isActuatorVisualObj(o)) { out.set(o.id, 'actuator-visual'); continue; }
    if (o.physics.enabled) { out.set(o.id, 'physics'); continue; }
    out.set(o.id, 'auto');
  }
  return out;
}

/** 버킷별 id 목록으로 뒤집기 — 렌더 시 `objects.filter(o => ids.has(o.id))` 대신 쓰기 편하게. */
export function bucketOf(map: Map<string, PlayBucket>, bucket: PlayBucket): Set<string> {
  const s = new Set<string>();
  for (const [id, b] of map) if (b === bucket) s.add(id);
  return s;
}
