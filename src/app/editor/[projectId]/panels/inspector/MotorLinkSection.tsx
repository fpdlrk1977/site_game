'use client';

// 모터 연결/해제 — 모터형 액추에이터에 오브젝트를 붙이거나 떼는 UX(트리 드래그 대안).
//   모터 선택 시: 연결된 부품 목록 + 해제. 일반 오브젝트 선택 시: 모터에 연결 / 해제.
//   내부적으로 reparentObject(월드 변환 보존 재부모화)만 호출. doc/PIVOT_MANIPULATION.md §6.
import { Link2, Unlink, MousePointerClick, Crosshair, CircleMinus } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { GroupBox } from './ui';
import type { ObjectNodeSchema } from '@/types/scene';

export function MotorLinkSection({ obj }: { obj: ObjectNodeSchema }) {
  const objects = useSceneStore((s) => s.objects);
  const reparentObject = useSceneStore((s) => s.reparentObject);
  const selectObject = useSceneStore((s) => s.selectObject);
  const connectMotorId = useSceneStore((s) => s.connectMotorId);
  const beginConnect = useSceneStore((s) => s.beginConnect);
  const cancelConnect = useSceneStore((s) => s.cancelConnect);
  const pivotMotorId = useSceneStore((s) => s.pivotMotorId);
  const beginPivotMove = useSceneStore((s) => s.beginPivotMove);
  const cancelPivotMove = useSceneStore((s) => s.cancelPivotMove);
  const removeMotorKeepParts = useSceneStore((s) => s.removeMotorKeepParts);
  const motors = objects.filter((o) => o.isActuator && o.id !== obj.id);

  // ── 모터 쪽: 연결된 부품 목록 + 해제 ─────────────────────────────
  if (obj.isActuator) {
    const parts = objects.filter((o) => o.parentId === obj.id);
    const connecting = connectMotorId === obj.id;
    const pivoting = pivotMotorId === obj.id;
    return (
      <GroupBox>
        <div className="px-3 py-3 space-y-2">
          <div className="text-[11px] font-semibold text-muted flex items-center gap-1.5">
            <Link2 size={13} /> 연결된 부품 ({parts.length})
          </div>
          {/* 3D 연결 모드 — 뷰포트에서 오브젝트를 클릭해 이 모터에 연결(트리 드래그 대안). 연속 연결 가능. */}
          <button
            onClick={() => (connecting ? cancelConnect() : beginConnect(obj.id))}
            className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xs border text-[10px] transition-colors ${
              connecting
                ? 'bg-[#ff7a0d] border-[#ff7a0d] text-white'
                : 'border-border/70 text-muted hover:text-foreground hover:border-primary'
            }`}
          >
            <MousePointerClick size={12} />
            {connecting ? '연결 중… 오브젝트 클릭 (빈 곳/ESC 종료)' : '3D로 부품 연결 (클릭해서 붙이기)'}
          </button>
          {/* 경첩 이동 모드 — 경첩(주황 점)만 옮기고 연결된 부품은 제자리. 관절 자리를 맞출 때 부품을
              대신 옮겨 위치 관계가 깨지던 왕복을 없앤다. 모드 중엔 이동 기즈모가 숨는다(드래그 충돌 방지). */}
          <button
            onClick={() => (pivoting ? cancelPivotMove() : beginPivotMove(obj.id))}
            className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xs border text-[10px] transition-colors ${
              pivoting
                ? 'bg-[#ff7a0d] border-[#ff7a0d] text-white'
                : 'border-border/70 text-muted hover:text-foreground hover:border-primary'
            }`}
          >
            <Crosshair size={12} />
            {pivoting ? '경첩 드래그 중… (ESC 종료)' : '경첩 위치 옮기기 (부품은 제자리)'}
          </button>
          {parts.length === 0 ? (
            <p className="text-[10px] text-muted/50">
              아직 없음 — 트리에서 오브젝트를 이 모터로 <b>드래그</b>하거나, 그 오브젝트를 선택해 <b>모터에 연결</b>을 쓰세요.
            </p>
          ) : (
            <ul className="space-y-1">
              {parts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <button className="truncate text-left text-[10px] text-foreground hover:text-primary transition-colors" onClick={() => selectObject(p.id)}>
                    {p.name}
                  </button>
                  <button
                    onClick={() => reparentObject(p.id, null)}
                    title="연결 해제 (최상위로)"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs border border-border/70 text-[10px] text-muted hover:text-red-500 hover:border-red-500/50 transition-colors shrink-0"
                  >
                    <Unlink size={11} /> 해제
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* 비파괴 제거 — 삭제(Del)는 연결된 부품까지 지운다. 이 버튼은 모터만 없애고 부품은 제자리에 남긴다. */}
          <button
            onClick={() => removeMotorKeepParts(obj.id)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xs border border-border/70 text-[10px] text-muted hover:text-red-500 hover:border-red-500/50 transition-colors"
          >
            <CircleMinus size={12} />
            모터만 제거 (부품 {parts.length}개 유지)
          </button>
          <p className="text-[9px] text-muted/50">
            삭제(Del)는 연결된 부품까지 함께 지웁니다. 관절만 없애려면 위 버튼을 쓰세요.
          </p>
        </div>
      </GroupBox>
    );
  }

  // ── 일반 오브젝트 쪽: 모터에 연결 / 해제 (씬에 모터가 있을 때만) ──
  if (motors.length === 0) return null;
  const parentMotor = obj.parentId ? motors.find((m) => m.id === obj.parentId) : null;
  return (
    <GroupBox>
      <div className="px-3 py-3 space-y-2">
        <div className="text-[11px] font-semibold text-muted flex items-center gap-1.5">
          <Link2 size={13} /> 모터 연결
        </div>
        {parentMotor ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-foreground truncate">연결됨: <b>{parentMotor.name}</b></span>
            <button
              onClick={() => reparentObject(obj.id, null)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs border border-border/70 text-[10px] text-muted hover:text-red-500 hover:border-red-500/50 transition-colors shrink-0"
            >
              <Unlink size={11} /> 해제
            </button>
          </div>
        ) : (
          <SelectBox
            value=""
            onChange={(v) => { if (v) reparentObject(obj.id, v); }}
            options={[{ value: '', label: '모터 선택…' }, ...motors.map((m) => ({ value: m.id, label: m.name }))]}
          />
        )}
        <p className="text-[9px] text-muted/50">연결하면 이 오브젝트가 모터의 원점·축 기준으로 움직입니다. (트리 드래그로도 연결 가능)</p>
      </div>
    </GroupBox>
  );
}
