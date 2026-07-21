'use client';

// Actuator(관절) 섹션 — 경첩 기준 축 회전/직선 이동. motion과 배타. doc/PIVOT_MANIPULATION.md §6.
//   5a: manual·oscillate 구동 + 시각(▶ 플레이/게시). variable·event 구동은 5b.
import { Cog } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema, ActuatorConfig } from '@/types/scene';

const STEPS = [0, 0.5, 1] as const;
// 회전축에 수직인 평면의 두 축(경첩 3×3 그리드용). col=첫번째 · row=두번째.
const PLANE: Record<'x' | 'y' | 'z', { col: 'x' | 'y' | 'z'; row: 'x' | 'y' | 'z'; colLbl: [string, string, string]; rowLbl: [string, string, string] }> = {
  y: { col: 'x', row: 'z', colLbl: ['좌', '중', '우'], rowLbl: ['앞', '중', '뒤'] },
  x: { col: 'z', row: 'y', colLbl: ['앞', '중', '뒤'], rowLbl: ['하', '중', '상'] },
  z: { col: 'x', row: 'y', colLbl: ['좌', '중', '우'], rowLbl: ['하', '중', '상'] },
};

export function ActuatorSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  const variables = useSceneStore((s) => s.variables);
  const insertMotorForObject = useSceneStore((s) => s.insertMotorForObject);
  const act = obj.actuator;
  const motor = !!obj.isActuator; // 모터형: 항상 켜짐·경첩=원점(피커 없음)
  const setA = (patch: Partial<ActuatorConfig>) =>
    updateObject(obj.id, { actuator: { ...(obj.actuator ?? { kind: 'rotate', axis: 'y', min: 0, max: 90, drive: 'manual' }), ...patch } });

  const enable = (on: boolean) => {
    if (on) updateObject(obj.id, { actuator: { kind: 'rotate', axis: 'y', hinge: { x: 0, y: 0.5, z: 0.5 }, min: 0, max: 90, drive: 'manual', value: 0 }, motion: undefined });
    else updateObject(obj.id, { actuator: undefined });
    pushHistory();
  };

  const hinge = act?.hinge ?? { x: 0.5, y: 0.5, z: 0.5 };
  const plane = act ? PLANE[act.axis] : PLANE.y;
  const setHingeCell = (colV: number, rowV: number) => {
    const next: { x: number; y: number; z: number } = { x: hinge.x, y: hinge.y, z: hinge.z };
    next[plane.col] = colV;
    next[plane.row] = rowV;
    setA({ hinge: next });
    pushHistory();
  };
  const stepIdx = (v: number) => (v <= 0.25 ? 0 : v >= 0.75 ? 2 : 1);

  return (
    <GroupBox>
      <div className={motor ? undefined : 'relative'}>
      <SectionHeader
        title={motor ? '모터 (Motor)' : 'Actuator (joint)'}
        hint={motor
          ? '이 오브젝트는 모터(부품)입니다. 트리에서 다른 오브젝트를 이 모터 아래로 끌어 연결하면, 연결된 것이 모터의 원점(=경첩)·축을 중심으로 돕니다. 축·범위·구동을 아래에서 설정하고 ▶ 플레이로 확인하세요.'
          : 'Turn an object into a mechanical joint: rotate around a hinge (door/arm) or slide along an axis (piston), within a min~max range. Reacts to game state (variable/event), holds its position, can carry a real collider. Exclusive with Motion; preview in ▶ Play. ↔ For a free-form scripted sequence (curved path, several channels at once) use Animation; for always-on decorative movement use Motion.'}
        isOpen={motor ? open : undefined}
        onToggle={motor ? onToggle : undefined}
        dot={motor ? !!act : false}
      />
      {/* 속성형 — Subdivision 패턴: 헤더 스위치로 '관절 사용' 켜고/끄기(화살표 없음). 모터는 항상 활성이라 스위치 없음. */}
      {!motor && (
        <label className="flex items-center cursor-pointer absolute top-4.5 right-4">
          <Toggle value={!!act} onChange={enable} />
        </label>
      )}
      {/* 꺼짐 상태 안내 — 관절을 다는 두 갈래를 여기서 보여준다(예전엔 스위치만 있어 모터형만 눈에 띄었다). */}
      {!motor && !act && (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-[10px] text-muted/60">
            스위치를 켜면 <b>이 부품 자체가</b> 경첩을 중심으로 움직입니다(문·서랍·날개). 경첩은 <b>모서리로 골라</b> 지정하므로 계층이 바뀌지 않습니다.
          </p>
          <button
            onClick={() => insertMotorForObject(obj.id)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xs border border-border/70 text-[10px] text-muted hover:text-foreground hover:border-primary transition-colors"
          >
            <Cog size={12} /> 모터로 달기 (여러 부품 묶기)
          </button>
          <p className="text-[9px] text-muted/50">
            여러 부품을 <b>한 축으로 함께</b> 돌리거나(회전문·기어), 경첩이 이 부품 <b>바깥</b>에 있어야 할 때 씁니다.
          </p>
        </div>
      )}
      {(motor ? open : !!act) && (
        <div className="px-3 pb-4 space-y-2">
          {motor && (
            <p className="text-[10px] text-muted/60">
              경첩 = <b>모터 위치</b>(dot). 모터를 경첩 자리로 옮기고 회전시켜 축 방향을 맞추세요. 트리에서 오브젝트를 이 모터로 <b>드래그하면 연결</b>됩니다.
            </p>
          )}

          {act && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Kind</span>
                  <SelectBox
                    value={act.kind}
                    onChange={(v) => { setA({ kind: v as ActuatorConfig['kind'] }); pushHistory(); }}
                    options={[{ value: 'rotate', label: '회전 (경첩)' }, { value: 'slide', label: '직선 (피스톤)' }]}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Axis</span>
                  <SelectBox
                    value={act.axis}
                    onChange={(v) => { setA({ axis: v as 'x' | 'y' | 'z' }); pushHistory(); }}
                    options={[{ value: 'y', label: 'Y (수직)' }, { value: 'x', label: 'X (좌우)' }, { value: 'z', label: 'Z (앞뒤)' }]}
                  />
                </div>
              </div>

              {/* 경첩 3×3 — 회전축에 수직인 평면. rotate 전용. 모터형은 원점=경첩이라 숨김. */}
              {act.kind === 'rotate' && !motor && (
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">경첩 (Hinge) · {act.axis.toUpperCase()}축 수직면</span>
                  <div className="flex gap-2 items-start">
                    <div className="inline-grid grid-cols-3 gap-0.5">
                      {[0, 1, 2].map((r) => STEPS.map((_, c) => {
                        const colV = STEPS[c], rowV = STEPS[r];
                        const sel = stepIdx(hinge[plane.col]) === c && stepIdx(hinge[plane.row]) === r;
                        return (
                          <button
                            key={`${r}-${c}`}
                            onClick={() => setHingeCell(colV, rowV)}
                            title={`${plane.colLbl[c]} · ${plane.rowLbl[r]}`}
                            className={`w-5 h-5 rounded-xs border text-[8px] transition-colors ${sel ? 'bg-primary border-primary text-white' : 'bg-background border-border/70 text-muted/50 hover:border-primary'}`}
                          >
                            {sel ? '●' : ''}
                          </button>
                        );
                      }))}
                    </div>
                    <p className="text-[9px] text-muted/50 flex-1">가로 {plane.colLbl.join('/')} · 세로 {plane.rowLbl.join('/')}. 예: 문 = Y축 + 좌측.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <LabeledNum label={act.kind === 'rotate' ? 'Min (°)' : 'Min (m)'} value={act.min} onChange={(v) => setA({ min: v })} onCommit={pushHistory} precision={act.kind === 'rotate' ? 0 : 2} dragStep={act.kind === 'rotate' ? 5 : 0.1} />
                <LabeledNum label={act.kind === 'rotate' ? 'Max (°)' : 'Max (m)'} value={act.max} onChange={(v) => setA({ max: v })} onCommit={pushHistory} precision={act.kind === 'rotate' ? 0 : 2} dragStep={act.kind === 'rotate' ? 5 : 0.1} />
              </div>

              <div>
                <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Drive</span>
                <SelectBox
                  value={act.drive}
                  onChange={(v) => { setA({ drive: v as ActuatorConfig['drive'] }); pushHistory(); }}
                  options={[
                    { value: 'manual', label: '수동 (값 고정)' },
                    { value: 'oscillate', label: '자동 왕복 (oscillate)' },
                    { value: 'variable', label: '변수 (값 0~1로 따라감)' },
                    { value: 'event', label: '이벤트 (set_actuator로 여닫기)' },
                  ]}
                />
              </div>

              {act.drive === 'variable' && (
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">바인딩 변수 (0~1로 해석)</span>
                  {variables.length === 0 ? (
                    <p className="text-[10px] text-amber-500/80">게임 변수가 없습니다. Logic 탭에서 변수를 먼저 만드세요(예: 0~1 숫자).</p>
                  ) : (
                    <SelectBox
                      value={act.variable ?? ''}
                      onChange={(v) => { setA({ variable: v }); pushHistory(); }}
                      options={[{ value: '', label: '(선택)' }, ...variables.map((v) => ({ value: v.name, label: v.name }))]}
                    />
                  )}
                  {/* 범위 매핑 — 변수값 [varMin, varMax]을 구동 0~1로. 기본 0~1. */}
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <LabeledNum label="Var → 0 (varMin)" value={act.varMin ?? 0} onChange={(v) => setA({ varMin: v })} onCommit={pushHistory} precision={2} dragStep={0.5} />
                    <LabeledNum label="Var → 1 (varMax)" value={act.varMax ?? 1} onChange={(v) => setA({ varMax: v })} onCommit={pushHistory} precision={2} dragStep={0.5} />
                  </div>
                  <p className="text-[9px] text-muted/50 mt-0.5">변수값이 varMin일 때 닫힘(0)·varMax일 때 열림(1). 예: 체력 0~100 → 0/100. 역방향(varMin&gt;varMax)도 됩니다.</p>
                </div>
              )}
              {act.drive === 'event' && (
                <p className="text-[10px] text-muted/60">
                  이벤트 액션 <b>set_actuator</b>로 이 오브젝트를 열고 닫습니다 (open / close / toggle / 0~1). 예: 버튼 클릭·E키(interact)·근접(approach)에 걸어 <b>다가가서 문 열기</b>.
                </p>
              )}

              {(act.drive === 'variable' || act.drive === 'event') && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Ease</span>
                    <SelectBox
                      value={act.ease ?? 'smooth'}
                      onChange={(v) => { setA({ ease: v as ActuatorConfig['ease'] }); pushHistory(); }}
                      options={[
                        { value: 'smooth', label: '부드럽게 (감쇠)' },
                        { value: 'inout', label: '가감속 (ease-in-out)' },
                        { value: 'linear', label: '등속 (linear)' },
                      ]}
                    />
                  </div>
                  <LabeledNum label="Ease speed" value={act.speed ?? 1} onChange={(v) => setA({ speed: v })} onCommit={pushHistory} min={0.1} max={10} precision={2} dragStep={0.1} />
                </div>
              )}

              {act.drive === 'manual' && (
                <LabeledNum label="Value (0~1 · 미리보기)" value={act.value ?? 0} onChange={(v) => setA({ value: v })} onCommit={pushHistory} min={0} max={1} precision={2} dragStep={0.05} />
              )}
              {act.drive === 'oscillate' && (
                <div className="grid grid-cols-2 gap-2">
                  <LabeledNum label="Speed" value={act.speed ?? 1} onChange={(v) => setA({ speed: v })} onCommit={pushHistory} min={0.1} max={10} precision={2} dragStep={0.1} />
                  <div>
                    <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Loop</span>
                    <SelectBox
                      value={act.loop ?? 'pingpong'}
                      onChange={(v) => { setA({ loop: v as 'pingpong' | 'forward' }); pushHistory(); }}
                      options={[{ value: 'pingpong', label: '왕복 (ping-pong)' }, { value: 'forward', label: '한 방향 반복' }]}
                    />
                  </div>
                </div>
              )}

              {/* 콜라이더 동반 — 속성형·모터형 공통. 모터형은 연결된 부품 서브트리가 부딪히는 장애물이 됨. */}
              <label className="flex items-center gap-2 text-[10px] text-muted/70 pt-0.5">
                <Toggle value={act.collider === true} onChange={(v) => { setA({ collider: v }); pushHistory(); }} />
                <span>{motor ? '콜라이더 동반 (연결된 부품이 진짜 부딪히는 장애물)' : '콜라이더 동반 (플레이 모드에서 진짜 부딪히는 문/장애물)'}</span>
              </label>

              <p className="text-[10px] text-muted/50">
                에디터는 정적입니다. <b>▶ 플레이</b>로 실제 움직임을 확인하세요.{motor ? ' 연결(자식)된 오브젝트가 함께 돕니다.' : ' Motion과 함께 못 씁니다(관절 우선). '}<b>콜라이더 OFF</b>=통과(장식), <b>ON</b>=부딪히는 관절(hull/trimesh 근사·캐릭터 라이딩 미지원).
              </p>

              {/* 승격 — 속성형은 자기 하나만·경첩이 자기 bbox 안에 갇힌다. 부품을 더 묶거나 경첩을
                  바깥에 둬야 하면 모터로 올린다. 부품 자리를 모터가 승계하므로 위치·계층은 그대로. */}
              {!motor && (
                <div className="pt-1 border-t border-border/50">
                  <button
                    onClick={() => insertMotorForObject(obj.id)}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xs border border-border/70 text-[10px] text-muted hover:text-foreground hover:border-primary transition-colors"
                  >
                    <Cog size={12} /> 모터로 바꾸기 (여러 부품 묶기)
                  </button>
                  <p className="text-[9px] text-muted/50 pt-1">
                    지금 설정을 그대로 가진 모터가 <b>이 부품의 부모로</b> 삽입됩니다(위치·계층 유지). 부품을 더 연결하거나 경첩을 부품 <b>바깥</b>에 둘 수 있게 됩니다. 되돌리려면 모터에서 <b>모터만 제거</b>.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
      </div>
    </GroupBox>
  );
}
