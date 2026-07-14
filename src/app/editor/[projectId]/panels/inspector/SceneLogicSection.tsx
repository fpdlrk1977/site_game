'use client';

// 게임 컨트롤러(씬 전역 로직) — 오브젝트에 매달리지 않은 규칙. GAME_LOGIC.md '게임 컨트롤러' Phase 1.
// 트리거: scene_start / on_timer / variable_changed. 액션: set_variable·승패·팝업·오브젝트 표시/통과(핵심 subset).
// 폼 완전 일반화(EventsSection 재사용)는 Phase 2. 여기선 씬 컨트롤러에 필요한 만큼만 자체 완결로.

import { useState } from 'react';
import { MathUtils } from 'three';
import { Cpu, Plus, Trash2, Pencil, X } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox } from './ui';
import type { EventSchema, EventCondition, GameVariable } from '@/types/scene';

type Trig = EventSchema['trigger'];
type Act = EventSchema['action'];

const TRIG_OPTIONS: { value: Trig; label: string }[] = [
  { value: 'scene_start', label: '시작하면 (scene start)' },
  { value: 'variable_changed', label: '변수 바뀌면 (variable changed)' },
  { value: 'on_timer', label: 'N초마다 (timer)' },
];
const TRIG_LABEL: Record<string, string> = { scene_start: '시작하면', variable_changed: '변수 바뀌면', on_timer: '주기적으로' };

// 씬 컨트롤러에서 쓸 수 있는 액션 subset (대상 명시/전역인 것만)
const ACT_OPTIONS: { value: Act; label: string }[] = [
  { value: 'set_variable', label: '변수 변경 (점수·상태 등)' },
  { value: 'game_win', label: '게임 승리' },
  { value: 'game_lose', label: '게임 패배' },
  { value: 'show_popup', label: '팝업 표시' },
  { value: 'show_object', label: '오브젝트 표시' },
  { value: 'hide_object', label: '오브젝트 숨김' },
  { value: 'toggle_object', label: '오브젝트 토글' },
  { value: 'set_passable', label: '통과 가능' },
  { value: 'set_solid', label: '통과 불가' },
  { value: 'despawn_object', label: '오브젝트 제거' },
  { value: 'swap_model', label: '모델 교체' },
  { value: 'play_sound', label: '사운드 재생' },
];
const ACT_LABEL: Record<string, string> = Object.fromEntries(ACT_OPTIONS.map((a) => [a.value, a.label.split(' (')[0]]));
const OBJECT_TARGET = new Set<Act>(['show_object', 'hide_object', 'toggle_object', 'set_passable', 'set_solid', 'despawn_object']);
const VAR_TYPE_LABEL: Record<string, string> = { number: '숫자', boolean: '참/거짓', string: '텍스트', enum: '선택', color: '색', asset: '모델', timer: '타이머' };

const inputCls = 'w-full bg-surface border border-border rounded-xs px-2.5 py-1.5 text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary';

function defaultCondition(v?: GameVariable): EventCondition {
  const t = v?.type;
  const isNum = t === 'number' || t === 'timer';
  return {
    variable: v?.name ?? '',
    op: isNum ? '>=' : '==',
    value: t === 'boolean' ? true : isNum ? 0 : t === 'enum' ? (v?.options?.[0] ?? '') : t === 'color' ? '#ffffff' : '',
  };
}

export function SceneLogicSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { sceneEvents, variables, objects, assets, addSceneEvent, updateSceneEvent, removeSceneEvent } = useSceneStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [trig, setTrig] = useState<Trig>('variable_changed');
  const [act, setAct] = useState<Act>('set_variable');
  const [value, setValue] = useState('');
  const [conds, setConds] = useState<EventCondition[]>([]);
  const [logic, setLogic] = useState<'and' | 'or'>('and');
  const [everySec, setEverySec] = useState(3);
  const [once, setOnce] = useState(false);

  const resetForm = () => { setShowForm(false); setEditingId(null); setTrig('variable_changed'); setAct('set_variable'); setValue(''); setConds([]); setLogic('and'); setEverySec(3); setOnce(false); };

  const openAdd = () => { resetForm(); setShowForm(true); };
  const openEdit = (ev: EventSchema) => {
    setEditingId(ev.id); setTrig(ev.trigger); setAct(ev.action); setValue(ev.value ?? '');
    setConds(ev.conditions && ev.conditions.length ? ev.conditions : (ev.condition ? [ev.condition] : []));
    setLogic(ev.conditionLogic ?? 'and');
    setEverySec(ev.timer?.everySec ?? 3); setOnce(ev.timer?.once ?? false);
    setShowForm(true);
  };

  const save = () => {
    const valueOptional = new Set<Act>(['game_win', 'game_lose', 'show_popup', 'despawn_object']);
    if (!value.trim() && !valueOptional.has(act)) return;
    const cs = conds.filter((c) => c.variable);
    const base: EventSchema = {
      id: editingId ?? MathUtils.generateUUID(),
      trigger: trig,
      action: act,
      value: value.trim(),
      ...(cs.length > 0 ? { conditions: cs } : {}),
      ...(cs.length > 1 ? { conditionLogic: logic } : {}),
      ...(trig === 'on_timer' ? { timer: { everySec: Math.max(0.1, everySec), ...(once ? { once: true } : {}) } } : {}),
    };
    if (editingId) updateSceneEvent(editingId, base);
    else addSceneEvent(base);
    resetForm();
  };

  // set_variable 값 인코딩 "name|op|amount"
  const [vn = '', op = 'add', amt = ''] = value.split('|');
  const setSV = (name: string, o: string, a: string) => setValue(`${name}|${o}|${a}`);
  const selVar = variables.find((v) => v.name === vn) ?? variables[0];
  const vtype = selVar?.type ?? 'number';

  const summarize = (ev: EventSchema) => {
    const cs = ev.conditions && ev.conditions.length ? ev.conditions : (ev.condition ? [ev.condition] : []);
    const condText = cs.map((c) => `${c.variable} ${c.op} ${c.value}`).join(ev.conditionLogic === 'or' ? ' 또는 ' : ' 그리고 ');
    let valSum = ev.value ?? '';
    if (ev.action === 'set_variable') { const [n, o, a] = (ev.value ?? '').split('|'); valSum = `${n} ${o} ${a}`; }
    else if (OBJECT_TARGET.has(ev.action)) valSum = objects.find((o) => o.id === ev.value)?.name ?? ev.value ?? '';
    return { condText, valSum };
  };

  return (
    <GroupBox>
      <div className="relative">
        <SectionHeader
          title="Game Logic"
          hint="오브젝트에 매달리지 않은 씬 전역 규칙. '점수 3이면 게이트 열림' 같은 공유 규칙을 한 곳에 모읍니다. 트리거: 시작하면 / N초마다 / 변수 바뀌면."
          isOpen={open}
          onToggle={onToggle}
        />
        <button
          onClick={(e) => { e.stopPropagation(); if (!open) onToggle(); openAdd(); }}
          title="규칙 추가"
          className="absolute top-2.5 right-3 p-1 rounded-xs text-muted/60 hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
      {open && (
        <div className="px-3 pb-4 space-y-2">
          {/* 규칙 목록 (문장 카드) */}
          {sceneEvents.length > 0 && sceneEvents.map((ev) => {
            const { condText, valSum } = summarize(ev);
            return (
              <div key={ev.id} className="bg-surface border border-border rounded-xs px-2 py-1.5 flex items-start gap-1.5">
                <Cpu size={12} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 text-[11px] leading-snug">
                  <span className="text-muted/70">{TRIG_LABEL[ev.trigger] ?? ev.trigger}</span>
                  {ev.trigger === 'on_timer' && ev.timer && <span className="text-muted/50"> ({ev.timer.everySec}s{ev.timer.once ? ', 1회' : ''})</span>}
                  <span className="text-muted/40"> → </span>
                  <span className="text-foreground font-medium">{ACT_LABEL[ev.action] ?? ev.action}</span>
                  {valSum && <span className="text-muted"> {valSum}</span>}
                  {condText && <div className="text-[10px] text-amber-500/80 mt-0.5">단, {condText} 일 때만</div>}
                </div>
                <button onClick={() => openEdit(ev)} title="수정" className="p-0.5 rounded text-muted/50 hover:text-foreground"><Pencil size={11} /></button>
                <button onClick={() => removeSceneEvent(ev.id)} title="삭제" className="p-0.5 rounded text-muted/50 hover:text-red-500"><Trash2 size={11} /></button>
              </div>
            );
          })}

          {sceneEvents.length === 0 && !showForm && (
            <p className="text-[10px] text-muted/50">아직 전역 규칙이 없어요. <b>+</b>로 추가하세요. (예: 시작하면 팝업, 점수 도달 시 승리)</p>
          )}

          {/* 추가/수정 폼 */}
          {showForm && (
            <div className="bg-surface border border-primary/30 rounded-xs p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-primary tracking-wide">{editingId ? '규칙 수정' : '새 규칙'}</span>
                <button onClick={resetForm} className="text-muted/60 hover:text-foreground"><X size={13} /></button>
              </div>

              {/* 트리거 */}
              <div>
                <span className="text-[10px] text-muted/50 block mb-0.5">언제 (트리거)</span>
                <SelectBox value={trig} onChange={(t) => setTrig(t as Trig)} options={TRIG_OPTIONS} />
              </div>
              {trig === 'on_timer' && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted/60">간격(초)</label>
                  <input type="number" value={everySec} min={0.1} step={0.5} onChange={(e) => setEverySec(Number(e.target.value))} className="w-16 bg-background border border-border rounded-xs px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  <label className="flex items-center gap-1 text-[10px] text-muted/60 cursor-pointer"><input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} /> 1회만</label>
                </div>
              )}

              {/* 조건 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted/50">조건{trig === 'variable_changed' ? ' (변수 바뀌면 필수)' : ' (선택)'}</span>
                  {conds.length > 1 && (
                    <SelectBox value={logic} onChange={(l) => setLogic(l as 'and' | 'or')} options={[{ value: 'and', label: '모두(AND)' }, { value: 'or', label: '하나라도(OR)' }]} fullWidth={false} />
                  )}
                </div>
                {variables.length === 0 ? (
                  <p className="text-[10px] text-amber-500/80">먼저 위 <b>게임 변수</b>에서 변수를 만드세요.</p>
                ) : (
                  <>
                    {conds.map((c, i) => {
                      const cv = variables.find((v) => v.name === c.variable) ?? variables[0];
                      const ct = cv?.type ?? 'number';
                      const upd = (patch: Partial<EventCondition>) => setConds((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                      return (
                        <div key={i} className="flex items-start gap-1">
                          <div className="flex-1 space-y-1">
                            <SelectBox
                              value={c.variable || variables[0].name}
                              onChange={(name) => { const nv = variables.find((v) => v.name === name); upd(defaultCondition(nv)); }}
                              options={variables.map((v) => ({ value: v.name, label: `${v.name} (${VAR_TYPE_LABEL[v.type] ?? v.type})` }))}
                            />
                            <div className="grid grid-cols-2 gap-1">
                              <SelectBox
                                value={c.op}
                                onChange={(o) => upd({ op: o as EventCondition['op'] })}
                                options={
                                  ct === 'boolean' ? [{ value: '==', label: '같음 ==' }, { value: '!=', label: '다름 !=' }]
                                  : ct === 'string' ? [{ value: '==', label: '같음 ==' }, { value: '!=', label: '다름 !=' }, { value: 'contains', label: '포함 ⊃' }]
                                  : (ct === 'enum' || ct === 'color') ? [{ value: '==', label: '같음 ==' }, { value: '!=', label: '다름 !=' }]
                                  : [{ value: '>=', label: '이상 ≥' }, { value: '>', label: '초과 >' }, { value: '==', label: '같음 ==' }, { value: '<=', label: '이하 ≤' }, { value: '<', label: '미만 <' }, { value: '!=', label: '다름 !=' }]
                                }
                              />
                              {ct === 'boolean' ? (
                                <SelectBox value={c.value === true ? 'true' : 'false'} onChange={(v) => upd({ value: v === 'true' })} options={[{ value: 'true', label: '참' }, { value: 'false', label: '거짓' }]} />
                              ) : ct === 'enum' ? (
                                <SelectBox value={typeof c.value === 'string' ? c.value : (cv?.options?.[0] ?? '')} onChange={(v) => upd({ value: v })} options={(cv?.options ?? []).map((o) => ({ value: o, label: o }))} />
                              ) : ct === 'color' ? (
                                <input type="color" value={typeof c.value === 'string' && /^#/.test(c.value) ? c.value : '#ffffff'} onChange={(e) => upd({ value: e.target.value })} className="w-full h-7 cursor-pointer bg-transparent" />
                              ) : ct === 'string' ? (
                                <input type="text" value={typeof c.value === 'string' ? c.value : ''} onChange={(e) => upd({ value: e.target.value })} className={inputCls} />
                              ) : (
                                <input type="number" value={typeof c.value === 'number' ? c.value : 0} onChange={(e) => upd({ value: Number(e.target.value) })} className={inputCls} />
                              )}
                            </div>
                          </div>
                          <button onClick={() => setConds((xs) => xs.filter((_, j) => j !== i))} className="p-1 mt-0.5 rounded text-muted/50 hover:text-red-500"><X size={12} /></button>
                        </div>
                      );
                    })}
                    <button onClick={() => setConds((xs) => [...xs, defaultCondition(variables[0])])} className="text-[10px] text-primary hover:underline">+ 조건 추가</button>
                  </>
                )}
              </div>

              {/* 액션 */}
              <div>
                <span className="text-[10px] text-muted/50 block mb-0.5">무엇을 (액션)</span>
                <SelectBox value={act} onChange={(a) => { setAct(a as Act); setValue(''); }} options={ACT_OPTIONS} />
              </div>

              {/* 액션 값 입력 */}
              {act === 'set_variable' ? (
                variables.length === 0 ? (
                  <p className="text-[10px] text-amber-500/80">먼저 위 <b>게임 변수</b>에서 변수를 만드세요.</p>
                ) : (
                  <div className="space-y-1.5">
                    <SelectBox value={vn || variables[0].name} onChange={(name) => { const nv = variables.find((v) => v.name === name); setSV(name, nv?.type === 'number' ? 'add' : 'set', ''); }} options={variables.map((v) => ({ value: v.name, label: `${v.name} (${VAR_TYPE_LABEL[v.type] ?? v.type})` }))} />
                    <div className="grid grid-cols-2 gap-1.5">
                      <SelectBox
                        value={op}
                        onChange={(o) => setSV(vn || variables[0].name, o, o === 'random' ? '1,6' : o === 'clamp' ? '0,100' : amt)}
                        options={
                          vtype === 'boolean' ? [{ value: 'set', label: '설정 =' }, { value: 'toggle', label: '토글' }]
                          : vtype === 'string' ? [{ value: 'set', label: '설정 =' }, { value: 'append', label: '이어붙이기 +' }]
                          : vtype === 'enum' ? [{ value: 'set', label: '설정 =' }, { value: 'next', label: '다음 상태 ▶' }]
                          : (vtype === 'color' || vtype === 'asset') ? [{ value: 'set', label: '설정 =' }]
                          : [{ value: 'add', label: '더하기 +' }, { value: 'sub', label: '빼기 −' }, { value: 'set', label: '설정 =' }, { value: 'mul', label: '곱하기 ×' }, { value: 'div', label: '나누기 ÷' }, { value: 'mod', label: '나머지 %' }, { value: 'random', label: '랜덤 🎲' }, { value: 'clamp', label: '범위제한' }]
                        }
                      />
                      {(op === 'toggle' || op === 'next') ? (
                        <div className="text-[10px] text-muted/60 flex items-center px-1">값 불필요</div>
                      ) : (op === 'random' || op === 'clamp') ? (
                        (() => { const [lo = op === 'clamp' ? '0' : '1', hi = op === 'clamp' ? '100' : '6'] = amt.split(','); return (
                          <div className="flex items-center gap-1">
                            <input type="number" value={lo} onChange={(e) => setSV(vn || variables[0].name, op, `${e.target.value},${hi}`)} className={inputCls} />
                            <span className="text-[10px] text-muted/60">~</span>
                            <input type="number" value={hi} onChange={(e) => setSV(vn || variables[0].name, op, `${lo},${e.target.value}`)} className={inputCls} />
                          </div>
                        ); })()
                      ) : vtype === 'boolean' ? (
                        <SelectBox value={amt === 'true' ? 'true' : 'false'} onChange={(a) => setSV(vn || variables[0].name, op, a)} options={[{ value: 'true', label: '참' }, { value: 'false', label: '거짓' }]} />
                      ) : vtype === 'enum' ? (
                        <SelectBox value={amt || selVar?.options?.[0] || ''} onChange={(a) => setSV(vn || variables[0].name, op, a)} options={(selVar?.options ?? []).map((o) => ({ value: o, label: o }))} />
                      ) : vtype === 'color' ? (
                        <input type="color" value={/^#/.test(amt) ? amt : '#ffffff'} onChange={(e) => setSV(vn || variables[0].name, op, e.target.value)} className="w-full h-7 cursor-pointer bg-transparent" />
                      ) : vtype === 'string' ? (
                        <input type="text" value={amt} onChange={(e) => setSV(vn || variables[0].name, op, e.target.value)} placeholder="텍스트" className={inputCls} />
                      ) : vtype === 'asset' ? (
                        <SelectBox value={amt} onChange={(a) => setSV(vn || variables[0].name, op, a)} options={assets.filter((a) => a.type === 'model' || a.type === 'character' || !a.type).map((a) => ({ value: a.id, label: a.name }))} placeholder="모델 선택..." />
                      ) : (
                        <input type="text" inputMode="numeric" value={amt} onChange={(e) => setSV(vn || variables[0].name, op, e.target.value)} placeholder="값 또는 변수명" className={inputCls} />
                      )}
                    </div>
                  </div>
                )
              ) : OBJECT_TARGET.has(act) ? (
                <SelectBox value={value} onChange={setValue} options={objects.map((o) => ({ value: o.id, label: o.name }))} placeholder="대상 오브젝트 선택..." />
              ) : (act === 'game_win' || act === 'game_lose') ? (
                <input type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder="메시지 (선택)" className={inputCls} />
              ) : act === 'show_popup' ? (
                <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="팝업에 표시할 내용/URL" rows={2} className={inputCls} />
              ) : act === 'play_sound' ? (
                <input type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder="오디오 URL" className={inputCls} />
              ) : act === 'swap_model' ? (
                (() => {
                  const [tid = '', source = ''] = value.split('|');
                  const setSM = (t: string, s: string) => setValue(`${t}|${s}`);
                  const assetVars = variables.filter((v) => v.type === 'asset');
                  const modelAssets = assets.filter((a) => a.type === 'model' || a.type === 'character' || !a.type);
                  return (
                    <div className="space-y-1.5">
                      <SelectBox value={tid} onChange={(t) => setSM(t, source)} options={objects.map((o) => ({ value: o.id, label: o.name }))} placeholder="대상 오브젝트..." />
                      <SelectBox value={source} onChange={(s) => setSM(tid, s)} options={[...assetVars.map((v) => ({ value: `@${v.name}`, label: `변수: ${v.name}` })), ...modelAssets.map((a) => ({ value: a.id, label: `모델: ${a.name}` }))]} placeholder="바꿀 모델 (변수/에셋)..." />
                    </div>
                  );
                })()
              ) : null}

              <div className="flex gap-1.5 pt-1">
                <button onClick={save} className="flex-1 py-1.5 rounded-xs bg-primary text-white text-[11px] font-medium hover:bg-primary/90 transition-colors">{editingId ? '수정' : '추가'}</button>
                <button onClick={resetForm} className="px-3 py-1.5 rounded-xs border border-border text-muted text-[11px] hover:text-foreground transition-colors">취소</button>
              </div>
            </div>
          )}
        </div>
      )}
    </GroupBox>
  );
}
