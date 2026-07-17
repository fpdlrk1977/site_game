'use client';

// Actuator(관절) 섹션 — 경첩 기준 축 회전/직선 이동. motion과 배타. doc/PIVOT_MANIPULATION.md §6.
//   5a: manual·oscillate 구동 + 시각(▶ 플레이/게시). variable·event 구동은 5b.
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
  const act = obj.actuator;
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
      <SectionHeader
        title="Actuator (joint)"
        hint="Turn an object into a joint: rotate around a hinge (door/arm) or slide along an axis (piston), within a min~max range. Exclusive with Motion. Preview the movement in ▶ Play."
        isOpen={open}
        onToggle={onToggle}
        dot={!!act}
      />
      {open && (
        <div className="px-3 pb-4 space-y-2">
          <label className="flex items-center gap-2 text-[10px] text-muted/70">
            <Toggle value={!!act} onChange={enable} />
            <span>관절 사용 (motion과 배타)</span>
          </label>

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

              {/* 경첩 3×3 — 회전축에 수직인 평면. rotate 전용. */}
              {act.kind === 'rotate' && (
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
                </div>
              )}
              {act.drive === 'event' && (
                <p className="text-[10px] text-muted/60">
                  이벤트 액션 <b>set_actuator</b>로 이 오브젝트를 열고 닫습니다 (open / close / toggle / 0~1). 예: 버튼 클릭·E키(interact)·근접(approach)에 걸어 <b>다가가서 문 열기</b>.
                </p>
              )}

              {(act.drive === 'variable' || act.drive === 'event') && (
                <LabeledNum label="Ease speed" value={act.speed ?? 1} onChange={(v) => setA({ speed: v })} onCommit={pushHistory} min={0.1} max={10} precision={2} dragStep={0.1} />
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

              <p className="text-[10px] text-muted/50">
                에디터는 정적입니다. <b>▶ 플레이</b>로 실제 움직임을 확인하세요. Motion과 함께 못 씁니다(관절 우선). 변수·이벤트 구동과 콜라이더는 다음 단계(5b·5c).
              </p>
            </>
          )}
        </div>
      )}
    </GroupBox>
  );
}
