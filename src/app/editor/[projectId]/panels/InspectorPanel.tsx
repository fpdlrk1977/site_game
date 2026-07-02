'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { MathUtils } from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import { SelectBox } from '@/components/ui/SelectBox';
import type { ObjectNodeSchema, ColliderType, EventSchema, ContentConfig, ParticlePreset, PostProcessPreset, HdrPreset, GroundPreset } from '@/types/scene';

function evalMath(expr: string): number | null {
  const s = expr.replace(/[^0-9+\-*/.()\s]/g, '').trim();
  if (!s) return null;
  try {
    const result = Function(`'use strict'; return (${s})`)() as unknown;
    if (typeof result === 'number' && isFinite(result)) return result;
  } catch { /* ignore */ }
  return null;
}

// 지정한 소수 자릿수까지만 표시, 정수면 소수점 생략
const fmt = (v: number, precision = 1) => {
  const s = v.toFixed(precision);
  return Number(s) === Math.trunc(Number(s)) ? String(Math.trunc(Number(s))) : s;
};

// ── 드래그 스크럽 숫자 입력 ─────────────────────────────────────
function NumInput({
  value,
  onChange,
  onCommit,
  dragStep = 0.1,
  precision = 1,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  dragStep?: number;
  precision?: number;
  min?: number;
  max?: number;
}) {
  const [local, setLocal] = useState(fmt(value, precision));
  const isFocused = useRef(false);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ x: 0, val: 0 });
  // RAF ref: throttles Zustand store updates to once-per-frame to avoid
  // "Maximum update depth exceeded" when pointermove fires faster than React
  // can process SyncLane renders (especially with DevTools open).
  const rafRef = useRef<{ id: number; val: number } | null>(null);

  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  const round = (n: number) => {
    const mult = 10 ** precision;
    return Math.round(n * mult) / mult;
  };

  useEffect(() => {
    if (!isFocused.current) setLocal(fmt(value, precision));
  }, [value, precision]);

  const onDragDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    dragOrigin.current = { x: e.clientX, val: value };
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  };

  const onDragMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragOrigin.current.x;
    const newVal = clamp(round(dragOrigin.current.val + dx * dragStep));
    setLocal(fmt(newVal, precision));
    if (rafRef.current) cancelAnimationFrame(rafRef.current.id);
    rafRef.current = {
      val: newVal,
      id: requestAnimationFrame(() => { onChange(newVal); rafRef.current = null; }),
    };
  };

  const onDragUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = '';
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current.id);
      onChange(rafRef.current.val);
      rafRef.current = null;
    }
    onCommit();
  };

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={local}
        onFocus={() => { isFocused.current = true; }}
        onChange={(e) => {
          setLocal(e.target.value);
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        onBlur={() => {
          isFocused.current = false;
          let n = parseFloat(local);
          if (isNaN(n)) n = evalMath(local) ?? NaN;
          if (!isNaN(n)) { const c = clamp(round(n)); onChange(c); setLocal(fmt(c, precision)); }
          else setLocal(fmt(value, precision));
          onCommit();
        }}
        className="w-full bg-surface border border-border rounded-xs pl-6 pr-5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
      />
      <span
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground cursor-ew-resize select-none transition-colors"
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <ArrowLeftRight size={10} />
      </span>
    </div>
  );
}

// ── 라벨 + 드래그 스크럽 숫자 입력 (단일 값, range 슬라이더 대체) ──
function LabeledNum({
  label,
  value,
  onChange,
  onCommit,
  min,
  max,
  precision = 1,
  dragStep = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  min?: number;
  max?: number;
  precision?: number;
  dragStep?: number;
}) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">{label}</span>
      <NumInput value={value} onChange={onChange} onCommit={onCommit} min={min} max={max} precision={precision} dragStep={dragStep} />
    </div>
  );
}

// ── XYZ 행 ─────────────────────────────────────────────────────
function XYZRow({
  label,
  x, y, z,
  onChangeX, onChangeY, onChangeZ,
  onCommit,
  dragStep = 0.1,
}: {
  label: string;
  x: number; y: number; z: number;
  onChangeX: (v: number) => void;
  onChangeY: (v: number) => void;
  onChangeZ: (v: number) => void;
  onCommit: () => void;
  dragStep?: number;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-semibold text-muted/50 tracking-wide">{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {[
          { axis: 'X', val: x, change: onChangeX },
          { axis: 'Y', val: y, change: onChangeY },
          { axis: 'Z', val: z, change: onChangeZ },
        ].map(({ axis, val, change }) => (
          <div key={axis} className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted/70 pointer-events-none z-10">
              {axis}
            </span>
            <NumInput value={val} onChange={change} onCommit={onCommit} dragStep={dragStep} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 섹션 헤더 (접기/펼치기 지원) ──────────────────────────────
function SectionHeader({
  title,
  icon,
  isOpen,
  onToggle,
}: {
  title: string;
  icon?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const collapsible = onToggle !== undefined;
  return (
    <div
      // onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-3 text-[12px] font-semibold text-muted tracking-wide bg-surface/40 select-none ${
        collapsible ? 'hover:text-foreground hover:bg-surface/70 transition-colors' : ''
      }`}
    >
      {icon && <span className="text-[12px] opacity-60 font-normal not-italic">{icon}</span>}
      <span className="flex-1 text-foreground">{title}</span>
      {/* {collapsible && (
        <span className="text-muted/40 text-[10px]">{isOpen ? '▾' : '▸'}</span>
      )} */}
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`relative w-7.5 h-4 rounded-full transition-colors cursor-pointer flex-shrink-0 ${value ? 'bg-primary' : 'bg-border'}`}
    >
      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${value ? 'left-4' : 'left-0.5'}`} />
    </div>
  );
}

function GroupBox({ children, className}: { children: React.ReactNode, className?:string }) {
  return <div className={`border-t border-border`}>
      {children}
    </div>
}

// ── 트리거/액션 라벨 ───────────────────────────────────────────
const TRIGGER_LABELS: Record<EventSchema['trigger'], string> = {
  click: 'Click',
  hover_enter: 'Hover',
  area_enter: 'Area Enter',
};
const ACTION_LABELS: Record<string, string> = {
  open_url: 'URL 열기',
  show_popup: '팝업',
  emit_event: '이벤트 발송',
};

// ── Environment 패널 (오브젝트 미선택 시) ──────────────────────
function EnvironmentPanel() {
  const { environment, updateEnvironment, pushHistory, assets, projectId } = useSceneStore();
  const { addToast } = useToast();
  const [notesOpen, setNotesOpen] = useState(true);
  const [groundTexUploading, setGroundTexUploading] = useState(false);
  const groundTexInputRef = useRef<HTMLInputElement>(null);
  const env = environment;

  const handleGroundTexUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !projectId) return;
    if (file.size > 8 * 1024 * 1024) {
      addToast('이미지가 너무 큽니다. 최대 8MB까지 지원합니다.', 'error');
      return;
    }
    setGroundTexUploading(true);
    try {
      const supabase = createBrowserSupabase();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `ground/${projectId}/tex_${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from('assets')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (storageErr) throw storageErr;
      const { data } = await supabase.storage.from('assets').createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!data?.signedUrl) throw new Error('URL 생성 실패');
      updateEnvironment({ ground: { ...env.ground!, textureUrl: data.signedUrl } });
      pushHistory();
    } catch (err) {
      addToast('텍스처 업로드 실패', 'error');
      console.error(err);
    } finally {
      setGroundTexUploading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
        {/* Sky */}
      <GroupBox>
        <SectionHeader title="Sky" />
        <div className="px-3 pb-3 space-y-2">
          {/* 모드 탭 */}
          {(() => {
            const useHdr = (env.hdrPreset ?? 'none') !== 'none';
            const mode = useHdr ? 'hdr' : env.sky.type === 'sky' ? 'sky' : 'color';
            const HDR_PRESETS: { id: HdrPreset; label: string }[] = [
              { id: 'sunset',    label: 'Sunset'   },
              { id: 'dawn',      label: 'Dawn'     },
              { id: 'night',     label: 'Night'    },
              { id: 'forest',    label: 'Forest'   },
              { id: 'park',      label: 'Park'     },
              { id: 'city',      label: 'City'     },
              { id: 'warehouse', label: 'Factory'  },
              { id: 'apartment', label: 'Indoor'   },
              { id: 'lobby',     label: 'Lobby'    },
              { id: 'studio',    label: 'Studio'   },
            ];
            return (
              <>
                <div className="flex gap-1">
                  {([['color', '단색'], ['sky', '하늘'], ['hdr', 'HDR']] as const).map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => {
                        if (t === 'hdr') {
                          updateEnvironment({ hdrPreset: env.hdrPreset && env.hdrPreset !== 'none' ? env.hdrPreset : 'sunset' });
                        } else {
                          updateEnvironment({ sky: { ...env.sky, type: t }, hdrPreset: 'none' });
                        }
                        pushHistory();
                      }}
                      className={`flex-1 py-1 rounded-xs text-[10px] font-medium transition-all border ${
                        mode === t
                          ? 'bg-primary border-primary text-white'
                          : 'bg-background border-border text-muted hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {mode === 'color' && (
                  <div className="px-2 flex items-center border border-border rounded-xs">
                    <input type="color" value={env.sky.value}
                      onChange={(e) => updateEnvironment({ sky: { ...env.sky, value: e.target.value } })}
                      onBlur={pushHistory} className="w-5 h-5 cursor-pointer" />
                    <input type="text" value={env.sky.value}
                      onChange={(e) => updateEnvironment({ sky: { ...env.sky, value: e.target.value } })}
                      onBlur={pushHistory}
                      className="flex-1 px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                )}

                {mode === 'hdr' && (
                  <div className="grid grid-cols-2 gap-1">
                    {HDR_PRESETS.map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => { updateEnvironment({ hdrPreset: id }); pushHistory(); }}
                        className={`py-1 rounded-xs text-[10px] font-medium transition-all border ${
                          env.hdrPreset === id
                            ? 'bg-primary border-primary text-white'
                            : 'bg-background border-border text-muted hover:text-foreground'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </GroupBox>

      {/* Ground */}
      <GroupBox>
        <div className="relative">
          <SectionHeader title="Ground" />
          <label className="flex items-center justify-between cursor-pointer absolute top-3 right-4">
            <Toggle
              value={env.ground?.enabled ?? false}
              onChange={(v) => { updateEnvironment({ ground: { color: env.ground?.color ?? '#4a7c59', enabled: v } }); pushHistory(); }}
            />
          </label>
        </div>
        {env.ground?.enabled && (
          <div className="px-3 pb-3 space-y-2">
            {/* 프리셋 */}
            {(() => {
              const GROUND_PRESETS: { id: GroundPreset; label: string; color: string }[] = [
                { id: 'grass',  label: '🌿 잔디', color: '#5a8a3c' },
                { id: 'dirt',   label: '🟤 흙',   color: '#8b5a2b' },
                { id: 'sand',   label: '🏖 모래', color: '#d4b483' },
                { id: 'stone',  label: '🪨 돌',   color: '#777777' },
                { id: 'water',  label: '💧 물',   color: '#1a6b9a' },
                { id: 'custom', label: '🎨 직접', color: env.ground!.color },
              ];
              const current = env.ground!.preset ?? 'custom';
              return (
                <div className="grid grid-cols-3 gap-1">
                  {GROUND_PRESETS.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => { updateEnvironment({ ground: { ...env.ground!, preset: id } }); pushHistory(); }}
                      className={`py-1 rounded-xs text-[9px] font-medium transition-all border ${
                        current === id
                          ? 'bg-primary border-primary text-white'
                          : 'bg-background border-border text-muted hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              );
            })()}
            {/* 직접 설정 시 텍스처 업로드 + 컬러 피커 */}
            {(env.ground.preset ?? 'custom') === 'custom' && (
              <div className="space-y-2">
                {/* 텍스처 미리보기 or 업로드 버튼 */}
                {env.ground.textureUrl ? (
                  <div className="relative rounded-xs overflow-hidden border border-border group">
                    <img src={env.ground.textureUrl} alt="ground texture" className="w-full h-16 object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => groundTexInputRef.current?.click()}
                        className="bg-black/70 text-white rounded px-2 py-1 text-[10px] hover:bg-primary/80 transition-colors"
                      >
                        교체
                      </button>
                      <button
                        onClick={() => {
                          const { textureUrl: _removed, ...rest } = env.ground!;
                          updateEnvironment({ ground: rest });
                          pushHistory();
                        }}
                        className="bg-black/70 text-white rounded px-2 py-1 text-[10px] hover:bg-danger/80 transition-colors"
                      >
                        제거
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => groundTexInputRef.current?.click()}
                    disabled={groundTexUploading}
                    className="w-full py-2.5 rounded-xs border border-dashed border-border text-muted hover:border-primary/60 hover:text-primary hover:bg-primary/5 text-[10px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {groundTexUploading ? '업로드 중...' : '텍스처 이미지 업로드\nJPG · PNG · WEBP'}
                  </button>
                )}
                <input
                  ref={groundTexInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleGroundTexUpload}
                />
                {/* 텍스처 없을 때 단색 폴백 컬러 */}
                {!env.ground.textureUrl && (
                  <div className="px-2 flex items-center border border-border rounded-xs">
                    <input type="color" value={env.ground.color}
                      onChange={(e) => updateEnvironment({ ground: { ...env.ground!, color: e.target.value } })}
                      onBlur={pushHistory} className="w-5 h-5 cursor-pointer" />
                    <input type="text" value={env.ground.color}
                      onChange={(e) => updateEnvironment({ ground: { ...env.ground!, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="flex-1 px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </GroupBox>
      


      <GroupBox>
        {/* Fog */}
        <div className='relative'>
        <SectionHeader title="Fog" />
        <label className="flex items-center justify-between cursor-pointer absolute top-3 right-4">
            {/* <span className="text-xs text-muted">Enable Fog</span> */}
            <Toggle
              value={env.fog.enabled}
              onChange={(v) => { updateEnvironment({ fog: { ...env.fog, enabled: v } }); pushHistory(); }}
            />
          </label>
        </div>
        {env.fog.enabled && <div className="px-3 pb-3">
          
              <div className="">
                <span className="text-[10px] text-muted/50 w-12 font-semibold">Color</span>

                <div className="px-2 flex items-center border border-border rounded-xs">
                  <input
                    type="color"
                    value={env.fog.color}
                    onChange={(e) => updateEnvironment({ fog: { ...env.fog, color: e.target.value } })}
                    onBlur={pushHistory}
                    className="w-5 h-5 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={env.fog.color}
                    onChange={(e) => updateEnvironment({ fog: { ...env.fog, color: e.target.value } })}
                    onBlur={pushHistory}
                    className="flex-1 px-2.5 py-1.5 text-xs text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className='mt-2'>
                <LabeledNum
                  label="Near"
                  value={env.fog.near}
                  onChange={(v) => updateEnvironment({ fog: { ...env.fog, near: v } })}
                  onCommit={pushHistory}
                  min={1} max={200} precision={0} dragStep={1}
                />
              </div>
              <div className='mt-2'>
                <LabeledNum
                  label="Far"
                  value={env.fog.far}
                  onChange={(v) => updateEnvironment({ fog: { ...env.fog, far: v } })}
                  onCommit={pushHistory}
                  min={10} max={500} precision={0} dragStep={2}
                />
              </div>
 
        </div>}
      </GroupBox>
      

      {/* Lights */}
      <GroupBox>
        <SectionHeader title="Lights" />
        <div className="px-3 space-y-1 pb-4">
          <div>
            <LabeledNum
              label="Ambient"
              value={env.lights.ambientIntensity}
              onChange={(v) => updateEnvironment({ lights: { ...env.lights, ambientIntensity: v } })}
              onCommit={pushHistory}
              min={0} max={3} precision={2} dragStep={0.02}
            />
          </div>
          <div>
            <LabeledNum
              label="Directional"
              value={env.lights.directionalIntensity}
              onChange={(v) => updateEnvironment({ lights: { ...env.lights, directionalIntensity: v } })}
              onCommit={pushHistory}
              min={0} max={5} precision={1} dragStep={0.05}
            />
          </div>
          <XYZRow
            label="Sun Position"
            x={env.lights.directionalPosition.x}
            y={env.lights.directionalPosition.y}
            z={env.lights.directionalPosition.z}
            onChangeX={(v) => updateEnvironment({ lights: { ...env.lights, directionalPosition: { ...env.lights.directionalPosition, x: v } } })}
            onChangeY={(v) => updateEnvironment({ lights: { ...env.lights, directionalPosition: { ...env.lights.directionalPosition, y: v } } })}
            onChangeZ={(v) => updateEnvironment({ lights: { ...env.lights, directionalPosition: { ...env.lights.directionalPosition, z: v } } })}
            onCommit={pushHistory} dragStep={0.5}
          />
        </div>
      </GroupBox>

      {/* Player */}
      <GroupBox>
        <SectionHeader title="Player" />
        <div className="px-3 pb-4 space-y-1">
          {(() => {
            const characterAssets = assets.filter((a) => a.type === 'character');
            return (
              <>
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1.5 font-semibold tracking-wide">캐릭터</span>
                  <SelectBox
                    value={env.playerCharacterId ?? ''}
                    onChange={(v) => { updateEnvironment({ playerCharacterId: v || undefined }); pushHistory(); }}
                    options={[
                      { value: '', label: '기본 캡슐' },
                      ...characterAssets.map((a) => ({ value: a.id, label: a.name })),
                    ]}
                  />
                  {characterAssets.length === 0 && (
                    <p className="text-[10px] text-muted/60 mt-1.5">
                      Asset Browser → Character 탭에서 GLB를 업로드하세요
                    </p>
                  )}
                </div>
                {env.playerCharacterId && (
                  <div>
                    <LabeledNum
                      label="Scale"
                      value={env.playerCharacterScale ?? 1}
                      onChange={(v) => updateEnvironment({ playerCharacterScale: v })}
                      onCommit={pushHistory}
                      min={0.1} max={3} precision={2} dragStep={0.02}
                    />
                  </div>
                )}
                <div>
                  <LabeledNum
                    label="이동 속도"
                    value={env.playerSpeed ?? 5}
                    onChange={(v) => updateEnvironment({ playerSpeed: v })}
                    onCommit={pushHistory}
                    min={1} max={20} precision={1} dragStep={0.1}
                  />
                </div>
                <div>
                  <LabeledNum
                    label="점프력"
                    value={env.playerJumpForce ?? 12}
                    onChange={(v) => updateEnvironment({ playerJumpForce: v })}
                    onCommit={pushHistory}
                    min={2} max={30} precision={0} dragStep={0.5}
                  />
                </div>
              </>
            );
          })()}
        </div>
      </GroupBox>

      {/* 스폰 포인트 */}
      <GroupBox>
        <SectionHeader title="Spawn Point" />
        <div className="px-3 pb-4 space-y-1">
          <XYZRow
            label="시작 위치"
            x={env.playerStartPosition?.x ?? 0}
            y={env.playerStartPosition?.y ?? 0}
            z={env.playerStartPosition?.z ?? 0}
            onChangeX={(v) => updateEnvironment({ playerStartPosition: { ...env.playerStartPosition ?? { x: 0, y: 0, z: 0 }, x: v } })}
            onChangeY={(v) => updateEnvironment({ playerStartPosition: { ...env.playerStartPosition ?? { x: 0, y: 0, z: 0 }, y: v } })}
            onChangeZ={(v) => updateEnvironment({ playerStartPosition: { ...env.playerStartPosition ?? { x: 0, y: 0, z: 0 }, z: v } })}
            onCommit={pushHistory} dragStep={0.5}
          />
          {env.playerStartPosition && (
            <button
              onClick={() => { updateEnvironment({ playerStartPosition: undefined }); pushHistory(); }}
              className="w-full py-1 rounded-xs border border-dashed text-[10px] text-danger border-danger/50 hover:bg-danger/2 transition-colors cursor-pointer"
            >
              스폰 포인트 초기화
            </button>
          )}
          {/* {!env.playerStartPosition && (
            <p className="mt-1 text-[10px] text-muted/60">기본값: X=0, Y=4, Z=0</p>
          )} */}
        </div>
      </GroupBox>

      {/* Boundary */}
      <GroupBox>
        <SectionHeader title="Boundary" />
        <div className="px-3 pb-4">
          <LabeledNum
            label="크기"
            value={env.boundary ?? 0}
            onChange={(v) => updateEnvironment({ boundary: v === 0 ? undefined : v })}
            onCommit={pushHistory}
            min={0} max={200} precision={0} dragStep={1}
          />
          <p className="text-[10px] text-muted/60 mt-0.5">0 = 경계 없음</p>
        </div>
      </GroupBox>

      {/* Post Processing */}
      <GroupBox>
        <SectionHeader title="Post Processing" />
        <div className="px-3 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted/60 tracking-wide">Preset</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['none', 'cinematic', 'dreamy', 'vintage', 'sharp'] as PostProcessPreset[]).map((preset) => {
              const current = env.postProcessing?.preset ?? 'none';
              const LABELS: Record<PostProcessPreset, string> = {
                none: 'None', cinematic: 'Cinematic', dreamy: 'Dreamy', vintage: 'Vintage', sharp: 'Sharp',
              };
              return (
                <button
                  key={preset}
                  onClick={() => { updateEnvironment({ postProcessing: { preset } }); pushHistory(); }}
                  className={`px-2 py-1.5 rounded-xs text-[10px] font-medium transition-all ${
                    current === preset
                      ? 'bg-primary text-white'
                      : 'bg-background border border-border text-muted hover:text-foreground hover:border-border/60'
                  }`}
                >
                  {LABELS[preset]}
                </button>
              );
            })}
          </div>
        </div>
      </GroupBox>

      {/* 씬 메모 */}
      <GroupBox>
        <SectionHeader title="씬 메모" isOpen={notesOpen} onToggle={() => setNotesOpen((v) => !v)} />
        {notesOpen && (
          <div className="px-3 pb-4">
            <textarea
              value={env.notes ?? ''}
              onChange={(e) => updateEnvironment({ notes: e.target.value })}
              onBlur={pushHistory}
              placeholder="씬에 대한 메모를 입력하세요..."
              rows={4}
              className="w-full bg-background border border-border rounded-xs px-2.5 py-1.5 text-xs text-foreground placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        )}
      </GroupBox>
    </div>
  );
}

// ── 메인 ───────────────────────────────────────────────────────
export function InspectorPanel() {
  const { objects, selectedId, selectedIds, updateObject, pushHistory, alignSelected, batchUpdateObjects } = useSceneStore();
  const { addToast } = useToast();
  const obj = objects.find((o) => o.id === selectedId) as ObjectNodeSchema | undefined;
  const isMultiSelect = selectedIds.length > 1;

  // 섹션 접기 상태
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const isOpen = (key: string) => !collapsed.has(key);

  // Events 추가 폼 상태
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newTrigger, setNewTrigger] = useState<EventSchema['trigger']>('click');
  const [newAction, setNewAction] = useState<EventSchema['action']>('show_popup');
  const [newValue, setNewValue] = useState('');

  // 이벤트 프리뷰 팝업
  const [previewPopup, setPreviewPopup] = useState<string | null>(null);

  if (isMultiSelect) {
    // 2개 선택 시 거리 계산
    let distance: number | null = null;
    if (selectedIds.length === 2) {
      const [a, b] = selectedIds.map((id) => objects.find((o) => o.id === id));
      if (a && b) {
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const dz = a.position.z - b.position.z;
        distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }

    const allHaveMaterial = selectedIds.every((id) => {
      const o = objects.find((x) => x.id === id);
      return o && !o.assetId && !o.particle;
    });
    const firstColor = (() => {
      const o = objects.find((x) => x.id === selectedIds[0]);
      return o?.material?.color ?? '#a78bfa';
    })();
    const allVisible = selectedIds.every((id) => objects.find((x) => x.id === id)?.visible !== false);

    return (
      <aside className="flex flex-col bg-sidebar border-l border-border overflow-hidden h-full">
        <div className="px-3 py-2 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-muted tracking-wide">{selectedIds.length}개 선택됨</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-3 space-y-3">
            <p className="text-[10px] text-muted">Shift+클릭으로 오브젝트를 추가 선택하세요.</p>

            {/* 2개 선택 시 거리 표시 */}
            {distance !== null && (
              <div className="bg-background border border-border rounded-xs px-3 py-2">
                <p className="text-[10px] text-muted mb-0.5">선택 오브젝트 간 거리</p>
                <p className="text-base font-bold text-foreground tabular-nums">{distance.toFixed(2)} m</p>
              </div>
            )}
          </div>

          {/* 일괄 편집 */}
          <SectionHeader title="일괄 편집" icon="◈" />
          <div className="px-3 py-3 space-y-3">
            {allHaveMaterial && (
              <div>
                <span className="text-[10px] font-semibold text-muted tracking-wide block mb-1">Color (전체 적용)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    defaultValue={firstColor}
                    onChange={(e) => batchUpdateObjects(selectedIds, (o) => ({ material: { ...o.material, color: e.target.value } }))}
                    onBlur={pushHistory}
                    className="w-8 h-8 rounded-xs border border-border bg-background cursor-pointer p-0.5"
                  />
                  <span className="text-[10px] text-muted">선택된 모든 오브젝트에 적용</span>
                </div>
              </div>
            )}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-muted">Visible (전체)</span>
              <Toggle
                value={allVisible}
                onChange={(v) => { batchUpdateObjects(selectedIds, () => ({ visible: v })); pushHistory(); }}
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-muted">Physics Enabled (전체)</span>
              <Toggle
                value={selectedIds.every((id) => objects.find((x) => x.id === id)?.physics.enabled === true)}
                onChange={(v) => { batchUpdateObjects(selectedIds, (o) => ({ physics: { ...o.physics, enabled: v } })); pushHistory(); }}
              />
            </label>
          </div>

          {/* 정렬 */}
          <SectionHeader title="정렬" icon="⊞" />
          <div className="px-3 py-3 space-y-3">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <div key={axis}>
                <p className="text-[10px] font-semibold text-muted tracking-wide mb-1.5">{axis.toUpperCase()}축 정렬</p>
                <div className="grid grid-cols-3 gap-1">
                  {(['min', 'center', 'max'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => alignSelected(axis, mode)}
                      className="py-1 rounded-xs text-[10px] bg-background text-muted hover:bg-surface hover:text-foreground transition-colors"
                    >
                      {mode === 'min' ? '최소' : mode === 'center' ? '중앙' : '최대'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  if (!obj) {
    return (
      <aside className="flex flex-col bg-surface border-l border-border overflow-hidden h-full">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-foreground tracking-wide flex-1">Environment</span>
        </div>
        <EnvironmentPanel />
      </aside>
    );
  }

  const setPos = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { position: { ...obj.position, [axis]: axis === 'y' ? Math.max(0, v) : v } });
  const setRot = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { rotation: { ...obj.rotation, [axis]: v } });
  const setScl = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { scale: { ...obj.scale, [axis]: v } });

  const addEvent = () => {
    if (!newValue.trim() && newAction !== 'show_popup') return;
    const ev: EventSchema = {
      id: MathUtils.generateUUID(),
      trigger: newTrigger,
      action: newAction,
      value: newValue.trim(),
    };
    updateObject(obj.id, { events: [...obj.events, ev] });
    pushHistory();
    setNewValue('');
    setShowAddEvent(false);
  };

  const removeEvent = (id: string) => {
    updateObject(obj.id, { events: obj.events.filter((e) => e.id !== id) });
    pushHistory();
  };

  const areaEnterNeedsPhysics = newTrigger === 'area_enter' && (!obj.physics.enabled || !obj.physics.isSensor);

  // 그룹 오브젝트 전용 인스펙터
  if (obj.isGroup) {
    return (
      <aside className="flex flex-col bg-sidebar border-l border-border overflow-hidden h-full">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-muted tracking-wide flex-1">Inspector — 그룹</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 border-b border-border">
            <input value={obj.name} onChange={(e) => updateObject(obj.id, { name: e.target.value })} onBlur={pushHistory}
              className="w-full bg-background border border-border rounded-xs px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            />
          </div>
          <SectionHeader title="Transform" />
          <div className="px-3 py-3 space-y-3">
            <XYZRow label="Position" x={obj.position.x} y={obj.position.y} z={obj.position.z}
              onChangeX={(v) => updateObject(obj.id, { position: { ...obj.position, x: v } })}
              onChangeY={(v) => updateObject(obj.id, { position: { ...obj.position, y: Math.max(0, v) } })}
              onChangeZ={(v) => updateObject(obj.id, { position: { ...obj.position, z: v } })}
              onCommit={pushHistory} dragStep={0.1}
            />
            <XYZRow label="Rotation °" x={obj.rotation.x} y={obj.rotation.y} z={obj.rotation.z}
              onChangeX={(v) => updateObject(obj.id, { rotation: { ...obj.rotation, x: v } })}
              onChangeY={(v) => updateObject(obj.id, { rotation: { ...obj.rotation, y: v } })}
              onChangeZ={(v) => updateObject(obj.id, { rotation: { ...obj.rotation, z: v } })}
              onCommit={pushHistory} dragStep={1}
            />
            <XYZRow label="Scale" x={obj.scale.x} y={obj.scale.y} z={obj.scale.z}
              onChangeX={(v) => updateObject(obj.id, { scale: { ...obj.scale, x: v } })}
              onChangeY={(v) => updateObject(obj.id, { scale: { ...obj.scale, y: v } })}
              onChangeZ={(v) => updateObject(obj.id, { scale: { ...obj.scale, z: v } })}
              onCommit={pushHistory} dragStep={0.05}
            />
          </div>
          <SectionHeader title="Visibility" />
          <div className="px-3 py-3 space-y-2">
            {(['visible', 'locked'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-muted capitalize">{key === 'visible' ? 'Visible' : 'Locked'}</span>
                <Toggle value={obj[key]} onChange={() => { updateObject(obj.id, { [key]: !obj[key] }); pushHistory(); }} />
              </label>
            ))}
          </div>
          <div className="px-3 py-3">
            <p className="text-[11px] text-muted leading-relaxed">
              그룹 해제: <kbd className="bg-background border border-border rounded px-1 text-[10px]">Ctrl+Shift+G</kbd>
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col bg-surface border-l border-border overflow-hidden relative h-full">
      {/* 이벤트 프리뷰 팝업 오버레이 */}
      {previewPopup !== null && (
        <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreviewPopup(null)}>
          <div className="bg-sidebar border border-border rounded-2xl p-5 w-full max-w-xs shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] text-muted/60 mb-2 font-semibold tracking-wide">팝업 미리보기</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{previewPopup}</p>
            <button
              onClick={() => setPreviewPopup(null)}
              className="mt-4 w-full py-1.5 rounded-xs bg-primary text-white text-xs font-semibold hover:bg-primary/80 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold text-foreground tracking-wide flex-1">Inspector</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 이름 */}
        <div className="px-3 py-2">
          <input
            value={obj.name}
            onChange={(e) => updateObject(obj.id, { name: e.target.value })}
            onBlur={pushHistory}
            className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          />
        </div>

        {/* Transform */}
        <GroupBox>
          <SectionHeader title="Transform" isOpen={isOpen('transform')} onToggle={() => toggleSection('transform')} />
          {isOpen('transform') && (
            <div className="px-3 pb-4 space-y-1">
              <XYZRow
                label="Position"
                x={obj.position.x} y={obj.position.y} z={obj.position.z}
                onChangeX={(v) => setPos('x', v)}
                onChangeY={(v) => setPos('y', v)}
                onChangeZ={(v) => setPos('z', v)}
                onCommit={pushHistory} dragStep={0.1}
              />
              <XYZRow
                label="Rotation °"
                x={obj.rotation.x} y={obj.rotation.y} z={obj.rotation.z}
                onChangeX={(v) => setRot('x', v)}
                onChangeY={(v) => setRot('y', v)}
                onChangeZ={(v) => setRot('z', v)}
                onCommit={pushHistory} dragStep={1}
              />
              <XYZRow
                label="Scale"
                x={obj.scale.x} y={obj.scale.y} z={obj.scale.z}
                onChangeX={(v) => setScl('x', v)}
                onChangeY={(v) => setScl('y', v)}
                onChangeZ={(v) => setScl('z', v)}
                onCommit={pushHistory} dragStep={0.05}
              />
            </div>
          )}
        </GroupBox>

        {/* Content (content 오브젝트만) */}
        {obj.content && (
          <GroupBox>
            <SectionHeader title="Content" isOpen={isOpen('content')} onToggle={() => toggleSection('content')} />
            {isOpen('content') && <div className="px-3 pb-4 space-y-1">
              {obj.content.type === 'text' && (
                <>
                  <div>
                    <span className="text-[10px] font-semibold text-muted tracking-wide block mb-1">텍스트</span>
                    <textarea
                      value={obj.content.text ?? ''}
                      onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, text: e.target.value } })}
                      onBlur={pushHistory}
                      rows={3}
                      className="w-full bg-background border border-border rounded-xs px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>
                  <div>
                    <LabeledNum
                      label="글자 크기"
                      value={obj.content.fontSize ?? 0.5}
                      onChange={(v) => updateObject(obj.id, { content: { ...obj.content!, fontSize: v } })}
                      onCommit={pushHistory}
                      min={0.1} max={3} precision={1} dragStep={0.05}
                    />
                  </div>
                  <div className='mt-2'>
                    <LabeledNum
                      label="두께"
                      value={obj.content.depth ?? 0.1}
                      onChange={(v) => updateObject(obj.id, { content: { ...obj.content!, depth: v } })}
                      onCommit={pushHistory}
                      min={0} max={1} precision={2} dragStep={0.01}
                    />
                  </div>
                </>
              )}
              {(obj.content.type === 'image' || obj.content.type === 'video') && (
                <div>
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">
                    {obj.content.type === 'image' ? '이미지 URL' : '동영상 URL'}
                  </span>
                  <input
                    type="text"
                    value={obj.content.url ?? ''}
                    onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, url: e.target.value } })}
                    onBlur={pushHistory}
                    placeholder={obj.content.type === 'image' ? 'https://example.com/img.jpg' : 'https://www.youtube.com/...'}
                    className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5 text-xs text-white placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>}
          </GroupBox>
        )}

        {/* Particle (파티클 이미터만) */}
        {obj.particle && (
          <GroupBox>
            <SectionHeader title="Particle" isOpen={isOpen('particle')} onToggle={() => toggleSection('particle')} />
            {isOpen('particle') && <div className="px-3 pb-4 space-y-2">
              <div>
                <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Preset</span>
                <SelectBox
                  value={obj.particle.preset}
                  onChange={(v) => { updateObject(obj.id, { particle: { ...obj.particle!, preset: v as ParticlePreset } }); pushHistory(); }}
                  options={[
                    { value: 'fire', label: '불꽃 (Fire)', icon: '🔥' },
                    { value: 'dust', label: '먼지 (Dust)', icon: '💨' },
                    { value: 'light', label: '빛 파티클 (Light)', icon: '✨' },
                    { value: 'snow', label: '눈 (Snow)', icon: '❄️' },
                  ]}
                />
              </div>
              <div>
                <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">색상 오버라이드</span>
                <div className="px-2 flex items-center border border-border rounded-xs">
                  <input type="color"
                    value={obj.particle.color ?? '#ffffff'}
                    onChange={(e) => updateObject(obj.id, { particle: { ...obj.particle!, color: e.target.value } })}
                    onBlur={pushHistory}
                    className="w-5 h-5 cursor-pointer"
                  />
                  <input type="text"
                    value={obj.particle.color ?? '#ffffff'}
                    onChange={(e) => updateObject(obj.id, { particle: { ...obj.particle!, color: e.target.value } })}
                    onBlur={pushHistory}
                    placeholder="프리셋 기본값"
                    className="flex-1 px-2.5 py-1.5 text-xs text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              {([
                { key: 'count', label: '파티클 수', min: 10, max: 500, precision: 0, dragStep: 2, fallback: 80 },
                { key: 'speed', label: '속도',       min: 0.1, max: 5,   precision: 1, dragStep: 0.05, fallback: 0.8 },
                { key: 'spread', label: '확산 범위', min: 0.1, max: 5,   precision: 1, dragStep: 0.05, fallback: 1 },
                { key: 'size',  label: '크기',       min: 0.01, max: 0.5, precision: 2, dragStep: 0.005, fallback: 0.08 },
              ] as const).map(({ key, label, min, max, precision, dragStep, fallback }) => (
                <LabeledNum key={key}
                  label={label}
                  value={(obj.particle![key] as number | undefined) ?? fallback}
                  onChange={(v) => updateObject(obj.id, { particle: { ...obj.particle!, [key]: v } })}
                  onCommit={pushHistory}
                  min={min} max={max} precision={precision} dragStep={dragStep}
                />
              ))}
            </div>}
          </GroupBox>
        )}

        {/* Material (primitive + text content 오브젝트) */}
        {!obj.assetId && !obj.particle && (!obj.content || obj.content.type === 'text') && (
          <GroupBox>
            <SectionHeader title="Material" isOpen={isOpen('material')} onToggle={() => toggleSection('material')} />
            {isOpen('material') && (
              <div className="px-3 pb-4 space-y-2">
                <div>
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Color</span>
                  <div className="px-2 flex items-center border border-border rounded-xs">
                    <input
                      type="color"
                      value={obj.material?.color ?? '#a78bfa'}
                      onChange={(e) => updateObject(obj.id, { material: { ...obj.material, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="w-5 h-5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={obj.material?.color ?? '#a78bfa'}
                      onChange={(e) => updateObject(obj.id, { material: { ...obj.material, color: e.target.value } })}
                      onBlur={pushHistory}
                    className="flex-1 px-2.5 py-1.5 text-xs text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <LabeledNum
                    label="Roughness"
                    value={obj.material?.roughness ?? 0.5}
                    onChange={(v) => updateObject(obj.id, { material: { ...obj.material, roughness: v } })}
                    onCommit={pushHistory}
                    min={0} max={1} precision={2} dragStep={0.005}
                  />
                </div>
                <div>
                  <LabeledNum
                    label="Metalness"
                    value={obj.material?.metalness ?? 0.1}
                    onChange={(v) => updateObject(obj.id, { material: { ...obj.material, metalness: v } })}
                    onCommit={pushHistory}
                    min={0} max={1} precision={2} dragStep={0.005}
                  />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Emissive</span>
                  <div className="px-2 flex items-center border border-border rounded-xs">
                    <input
                      type="color"
                      value={obj.material?.emissive ?? '#000000'}
                      onChange={(e) => updateObject(obj.id, { material: { ...obj.material, emissive: e.target.value } })}
                      onBlur={pushHistory}
                      className="w-5 h-5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={obj.material?.emissive ?? '#000000'}
                      onChange={(e) => updateObject(obj.id, { material: { ...obj.material, emissive: e.target.value } })}
                      onBlur={pushHistory}
                    className="flex-1 px-2.5 py-1.5 text-xs text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}
          </GroupBox>
        )}

        {/* Visibility */}
        <GroupBox>
        <SectionHeader title="Visibility" isOpen={isOpen('visibility')} onToggle={() => toggleSection('visibility')} />
        {isOpen('visibility') && (
          <div className="px-3 pb-4 space-y-2">
            {(['visible', 'locked'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-[10px] font-semibold text-muted/50 capitalize">{key === 'visible' ? 'Visible' : 'Locked'}</span>
                <Toggle
                  value={obj[key]}
                  onChange={() => { updateObject(obj.id, { [key]: !obj[key] }); pushHistory(); }}
                />
              </label>
            ))}
          </div>
        )}

        </GroupBox>

        {/* Light */}
        {obj.light && (
          <GroupBox>
            <SectionHeader title="Light" isOpen={isOpen('light')} onToggle={() => toggleSection('light')} />
            {isOpen('light') && (
              <div className="px-3 pb-4 space-y-2">
                {/* Type */}
                <div>
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Type</span>
                  <SelectBox
                    value={obj.light.type}
                    onChange={(v) => { updateObject(obj.id, { light: { ...obj.light!, type: v as 'point' | 'spot' | 'directional' } }); pushHistory(); }}
                    options={[
                      { value: 'point', label: 'Point Light', icon: '💡' },
                      { value: 'spot', label: 'Spot Light', icon: '🔦' },
                      { value: 'directional', label: 'Directional Light', icon: '☀️' },
                    ]}
                  />
                </div>
                {/* Color */}
                <div className="">
                  <span className="text-[10px] font-semibold text-muted/50">Color</span>
                  {/* <div className="flex items-center gap-2">
                    <input type="color" value={obj.light.color}
                      onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
                    <span className="text-[10px]  text-muted">{obj.light.color}</span>
                  </div> */}

                  <div className="px-2 flex items-center border border-border rounded-xs">
                    <input
                      type="color"
                      value={obj.light.color}
                    onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="w-5 h-5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={obj.light.color}
                      onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="flex-1 px-2.5 py-1.5 text-xs text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                </div>
                {/* Intensity */}
                <div>
                  <LabeledNum
                    label="Intensity"
                    value={obj.light.intensity}
                    onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, intensity: v } })}
                    onCommit={pushHistory}
                    min={0} max={10} precision={1} dragStep={0.05}
                  />
                </div>
                {/* Distance (point, spot) */}
                {obj.light.type !== 'directional' && (
                  <div>
                    <LabeledNum
                      label="Distance"
                      value={obj.light.distance ?? 20}
                      onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, distance: v } })}
                      onCommit={pushHistory}
                      min={1} max={100} precision={0} dragStep={1}
                    />
                  </div>
                )}
                {/* Decay (point, spot) */}
                {obj.light.type !== 'directional' && (
                  <div>
                    <LabeledNum
                      label="Decay"
                      value={obj.light.decay ?? 2}
                      onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, decay: v } })}
                      onCommit={pushHistory}
                      min={0} max={3} precision={1} dragStep={0.02}
                    />
                  </div>
                )}
                {/* Angle + Penumbra (spot only) */}
                {obj.light.type === 'spot' && (
                  <>
                    <div>
                      <LabeledNum
                        label="Angle (°)"
                        value={Math.round((obj.light.angle ?? Math.PI / 6) * 180 / Math.PI)}
                        onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, angle: v * Math.PI / 180 } })}
                        onCommit={pushHistory}
                        min={5} max={89} precision={0} dragStep={1}
                      />
                    </div>
                    <div>
                      <LabeledNum
                        label="Penumbra"
                        value={obj.light.penumbra ?? 0.1}
                        onChange={(v) => updateObject(obj.id, { light: { ...obj.light!, penumbra: v } })}
                        onCommit={pushHistory}
                        min={0} max={1} precision={2} dragStep={0.005}
                      />
                    </div>
                  </>
                )}
                {/* Cast Shadow */}
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[10px] font-semibold text-muted/50">Cast Shadow</span>
                  <Toggle
                    value={obj.light.castShadow ?? false}
                    onChange={(v) => { updateObject(obj.id, { light: { ...obj.light!, castShadow: v } }); pushHistory(); }}
                  />
                </label>
              </div>
            )}
          </GroupBox>
        )}

        {/* Physics */}
        {!obj.light && (
        <GroupBox><SectionHeader title="Physics" isOpen={isOpen('physics')} onToggle={() => toggleSection('physics')} />
        {isOpen('physics') && <div className="px-3 pb-4 space-y-2">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[10px] font-semibold text-muted/50">Enable Physics</span>
            <Toggle
              value={obj.physics.enabled}
              onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, enabled: v } }); pushHistory(); }}
            />
          </label>
          {obj.physics.enabled && (
            <>
              <div>
                <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">Collider Type</span>
                <SelectBox
                  value={obj.physics.colliderType}
                  onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, colliderType: v as ColliderType } }); pushHistory(); }}
                  options={[
                    { value: 'box', label: 'Box (Cuboid)' },
                    { value: 'sphere', label: 'Sphere (Ball)' },
                    { value: 'capsule', label: 'Capsule' },
                    { value: 'hull', label: 'Convex Hull' },
                    { value: 'trimesh', label: 'Trimesh (정확/느림)' },
                  ]}
                />
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-[10px] font-semibold text-muted/50">Is Sensor  <span className="text-[10px] font-normal text-muted/60 mt-0.5">(Area 진입 시 이벤트 발생)</span></p>
                  
                </div>
                <Toggle
                  value={obj.physics.isSensor}
                  onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, isSensor: v } }); pushHistory(); }}
                />
              </label>
              <div>
                <LabeledNum
                  label="Friction"
                  value={obj.physics.friction}
                  onChange={(v) => updateObject(obj.id, { physics: { ...obj.physics, friction: v } })}
                  onCommit={pushHistory}
                  min={0} max={1} precision={2} dragStep={0.005}
                />
              </div>
              <div>
                <LabeledNum
                  label="Restitution"
                  value={obj.physics.restitution}
                  onChange={(v) => updateObject(obj.id, { physics: { ...obj.physics, restitution: v } })}
                  onCommit={pushHistory}
                  min={0} max={1} precision={2} dragStep={0.005}
                />
              </div>
            </>
          )}
        </div>}</GroupBox>)}

        {/* Events */}
        <GroupBox>
        <SectionHeader title="Events" isOpen={isOpen('events')} onToggle={() => toggleSection('events')} />
        {isOpen('events') && (
          <div className="px-3 pb-4 space-y-2">
            {obj.events.length === 0 && !showAddEvent && (
              <p className="text-muted/60 text-xs py-1">이벤트 없음</p>
            )}

            {obj.events.map((ev) => (
              <div key={ev.id} className="bg-surface border border-border/80 rounded-xs p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded-xs text-[10px] font-medium shrink-0">
                      {TRIGGER_LABELS[ev.trigger]}
                    </span>
                    <span className="text-muted/60 text-[10px]">›</span>
                    <span className="text-foreground text-[10px] truncate font-medium">{ACTION_LABELS[ev.action] ?? ev.action}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        if (ev.action === 'open_url' && ev.value) window.open(ev.value, '_blank');
                        else if (ev.action === 'show_popup') setPreviewPopup(ev.value || '(내용 없음)');
                        else if (ev.action === 'emit_event') addToast(`이벤트 발송 테스트: "${ev.value}"`, 'success');
                      }}
                      title="미리보기"
                      className="text-muted/50 hover:text-primary text-[10px] w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                    >
                      ▶
                    </button>
                    <button
                      onClick={() => removeEvent(ev.id)}
                      className="text-muted/40 hover:text-danger text-[11px] w-4 h-4 flex items-center justify-center rounded hover:bg-danger/10 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {ev.value && (
                  <p className="text-muted/60 text-[10px] mt-1.5 truncate  bg-background/50 rounded px-1.5 py-0.5">{ev.value}</p>
                )}
              </div>
            ))}

            {showAddEvent ? (
              <div className="bg-surface border border-border/60 rounded-xs p-2.5 space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Trigger</span>
                    <SelectBox
                      value={newTrigger}
                      onChange={(v) => setNewTrigger(v as EventSchema['trigger'])}
                      options={[
                        { value: 'click', label: 'Click' },
                        { value: 'hover_enter', label: 'Hover' },
                        { value: 'area_enter', label: 'Area Enter' },
                      ]}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Action</span>
                    <SelectBox
                      value={newAction}
                      onChange={(v) => setNewAction(v as EventSchema['action'])}
                      options={[
                        { value: 'show_popup', label: '팝업' },
                        { value: 'open_url', label: 'URL 열기' },
                        { value: 'emit_event', label: '이벤트 발송' },
                      ]}
                    />
                  </div>
                </div>

                {areaEnterNeedsPhysics && (
                  <p className="text-danger text-[10px] bg-danger/2 border border-amber-500/20 rounded-xs px-2 py-1.5">
                    ⚠ Area Enter는 Physics 활성화 + Is Sensor 필요
                  </p>
                )}

                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">
                    {newAction === 'open_url' ? 'URL' : newAction === 'emit_event' ? '이벤트 이름' : '팝업 내용'}
                  </span>
                  <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={newAction === 'open_url' ? 'https://...' : newAction === 'emit_event' ? 'my_event_name' : '표시할 텍스트'}
                    className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5 text-xs text-white placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={(e) => e.key === 'Enter' && addEvent()}
                  />
                </div>

                <div className="flex gap-1.5">
                  <button
                    onClick={addEvent}
                    className="flex-1 py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-xs font-semibold transition-colors"
                  >
                    추가
                  </button>
                  <button
                    onClick={() => { setShowAddEvent(false); setNewValue(''); }}
                    className="flex-1 py-1.5 rounded-xs bg-background hover:bg-surface text-foreground text-xs transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddEvent(true)}
                className="w-full py-1.5 rounded-xs border border-dashed border-border text-muted hover:border-primary/60 hover:text-primary hover:bg-primary/5 text-xs transition-all cursor-pointer"
              >
                이벤트 추가
              </button>
            )}
          </div>
        )}
        </GroupBox>
      </div>
    </aside>
  );
}
