'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { MathUtils } from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
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

// 소수점 1자리까지만 표시, 정수면 소수점 생략
const fmt = (v: number) => {
  const s = v.toFixed(1);
  return s.endsWith('.0') ? String(Math.round(v)) : s;
};

// ── 드래그 스크럽 숫자 입력 ─────────────────────────────────────
function NumInput({
  value,
  onChange,
  onCommit,
  dragStep = 0.1,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  dragStep?: number;
}) {
  const [local, setLocal] = useState(fmt(value));
  const isFocused = useRef(false);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ x: 0, val: 0 });
  // RAF ref: throttles Zustand store updates to once-per-frame to avoid
  // "Maximum update depth exceeded" when pointermove fires faster than React
  // can process SyncLane renders (especially with DevTools open).
  const rafRef = useRef<{ id: number; val: number } | null>(null);

  useEffect(() => {
    if (!isFocused.current) setLocal(fmt(value));
  }, [value]);

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
    const newVal = Math.round((dragOrigin.current.val + dx * dragStep) * 10) / 10;
    setLocal(fmt(newVal));
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
          if (!isNaN(n)) { onChange(Math.round(n * 10) / 10); setLocal(fmt(Math.round(n * 10) / 10)); }
          else setLocal(fmt(value));
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
                <div className="flex items-center -mb-1.5">
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Near : </span>
                  <span className="text-[10px] text-foreground font-semibold tabular-nums">{env.fog.near}</span>
                </div>
                <input type="range" min="1" max="200" step="1" value={env.fog.near}
                  onChange={(e) => updateEnvironment({ fog: { ...env.fog, near: parseFloat(e.target.value) } })}
                  onMouseUp={pushHistory}
                  className="w-full text-primary"
                />
              </div>
              <div className='mt-2'>
                <div className="flex items-center -mb-1.5">
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Far : </span>
                  <span className="text-[10px] text-foreground font-semibold tabular-nums">{env.fog.far}</span>
                </div>
                <input type="range" min="10" max="500" step="5" value={env.fog.far}
                  onChange={(e) => updateEnvironment({ fog: { ...env.fog, far: parseFloat(e.target.value) } })}
                  onMouseUp={pushHistory}
                  className="w-full accent-primary"
                />
              </div>
 
        </div>}
      </GroupBox>
      

      {/* Lights */}
      <GroupBox>
        <SectionHeader title="Lights" />
        <div className="px-3 space-y-1 pb-4">
          <div>
            <div className="-mb-1.5">
              <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Ambient : </span>
              <span className="text-[10px] text-foreground font-semibold tabular-nums">{env.lights.ambientIntensity.toFixed(2)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.05" value={env.lights.ambientIntensity}
              onChange={(e) => updateEnvironment({ lights: { ...env.lights, ambientIntensity: parseFloat(e.target.value) } })}
              onMouseUp={pushHistory}
              className="w-full accent-primary"
            />
          </div>
          <div>
            <div className="-mb-1.5">
              <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Directional : </span>
              <span className="text-[10px] text-foreground font-semibold tabular-nums">{env.lights.directionalIntensity.toFixed(2)}</span>
            </div>
            <input type="range" min="0" max="5" step="0.1" value={env.lights.directionalIntensity}
              onChange={(e) => updateEnvironment({ lights: { ...env.lights, directionalIntensity: parseFloat(e.target.value) } })}
              onMouseUp={pushHistory}
              className="w-full accent-primary"
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
                  <select
                    value={env.playerCharacterId ?? ''}
                    onChange={(e) => { updateEnvironment({ playerCharacterId: e.target.value || undefined }); pushHistory(); }}
                    className="w-full bg-surface border border-border rounded-xs px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">기본 캡슐</option>
                    {characterAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {characterAssets.length === 0 && (
                    <p className="text-[10px] text-muted/60 mt-1.5">
                      Asset Browser → Character 탭에서 GLB를 업로드하세요
                    </p>
                  )}
                </div>
                {env.playerCharacterId && (
                  <div>
                    <div className="-mb-1.5">
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Scale : </span>
                      <span className="text-[10px] text-foreground font-semibold tabular-nums">{(env.playerCharacterScale ?? 1).toFixed(2)}</span>
                    </div>
                    <input
                      type="range" min="0.1" max="3" step="0.05"
                      value={env.playerCharacterScale ?? 1}
                      onChange={(e) => updateEnvironment({ playerCharacterScale: parseFloat(e.target.value) })}
                      onMouseUp={pushHistory}
                      className="w-full accent-primary"
                    />
                  </div>
                )}
                <div>
                  <div className="-mb-1.5">
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide">이동 속도 : </span>
                    <span className="text-[10px] text-foreground font-semibold tabular-nums">{(env.playerSpeed ?? 5).toFixed(1)}</span>
                  </div>
                  <input type="range" min="1" max="20" step="0.5"
                    value={env.playerSpeed ?? 5}
                    onChange={(e) => updateEnvironment({ playerSpeed: parseFloat(e.target.value) })}
                    onMouseUp={pushHistory}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <div className="-mb-1.5">
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide">점프력 : </span>
                    <span className="text-[10px] text-foreground font-semibold tabular-nums">{(env.playerJumpForce ?? 12).toFixed(1)}</span>
                  </div>
                  <input type="range" min="2" max="30" step="1"
                    value={env.playerJumpForce ?? 12}
                    onChange={(e) => updateEnvironment({ playerJumpForce: parseFloat(e.target.value) })}
                    onMouseUp={pushHistory}
                    className="w-full accent-primary"
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
          <div className="-mb-1.5">
            <span className="text-[10px] font-semibold text-muted/50 tracking-wide">크기 : </span>
            <span className="text-[10px] text-foreground font-semibold tabular-nums">
              {(env.boundary ?? 0) === 0 ? '무한' : `±${env.boundary}m`}
            </span>
          </div>
          <input
            type="range" min="0" max="200" step="5"
            value={env.boundary ?? 0}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              updateEnvironment({ boundary: v === 0 ? undefined : v });
            }}
            onMouseUp={pushHistory}
            className="w-full accent-primary"
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
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
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
              <div className="bg-background border border-border rounded-lg px-3 py-2">
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
                    className="w-8 h-8 rounded-lg border border-border bg-background cursor-pointer p-0.5"
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
                      className="py-1 rounded-lg text-[10px] bg-background text-muted hover:bg-surface hover:text-foreground transition-colors"
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
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
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
              className="mt-4 w-full py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/80 transition-colors"
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
                    <div className="flex items-center justify-between -mb-1.5">
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide">글자 크기 : </span>
                      <span className="text-[10px] text-foreground font-semibold">{(obj.content.fontSize ?? 0.5).toFixed(1)}</span>
                    </div>
                    <input type="range" min="0.1" max="3" step="0.1"
                      value={obj.content.fontSize ?? 0.5}
                      onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, fontSize: parseFloat(e.target.value) } })}
                      onMouseUp={pushHistory}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div className='mt-2'>
                    <div className="flex items-center justify-between -mb-1.5">
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide">두께 : </span>
                      <span className="text-[10px] text-foreground font-semibold">{(obj.content.depth ?? 0.1).toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01"
                      value={obj.content.depth ?? 0.1}
                      onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, depth: parseFloat(e.target.value) } })}
                      onMouseUp={pushHistory}
                      className="w-full accent-primary"
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
                <select
                  value={obj.particle.preset}
                  onChange={(e) => { updateObject(obj.id, { particle: { ...obj.particle!, preset: e.target.value as ParticlePreset } }); pushHistory(); }}
                  className="w-full bg-surface border border-border rounded-xs px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="fire">🔥 불꽃 (Fire)</option>
                  <option value="dust">💨 먼지 (Dust)</option>
                  <option value="light">✨ 빛 파티클 (Light)</option>
                  <option value="snow">❄️ 눈 (Snow)</option>
                </select>
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
                { key: 'count', label: '파티클 수', min: 10, max: 500, step: 10 },
                { key: 'speed', label: '속도',       min: 0.1, max: 5,   step: 0.1 },
                { key: 'spread', label: '확산 범위', min: 0.1, max: 5,   step: 0.1 },
                { key: 'size',  label: '크기',       min: 0.01, max: 0.5, step: 0.01 },
              ] as const).map(({ key, label, min, max, step }) => (
                <div key={key}>
                  <div className="flex items-center justify-between -mb-1.5">
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide">{label}</span>
                    <span className="text-[10px] text-foreground font-semibold tabular-nums">{(obj.particle![key] ?? '기본').toString()}</span>
                  </div>
                  <input type="range" min={min} max={max} step={step}
                    value={obj.particle![key] as number | undefined ?? (key === 'count' ? 80 : key === 'speed' ? 0.8 : key === 'spread' ? 1 : 0.08)}
                    onChange={(e) => updateObject(obj.id, { particle: { ...obj.particle!, [key]: parseFloat(e.target.value) } })}
                    onMouseUp={pushHistory}
                    className="w-full accent-primary"
                  />
                </div>
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
                  <div className="flex items-center justify-between -mb-1.5">
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Roughness</span>
                    <span className="text-[10px] text-foreground font-semibold tabular-nums">{(obj.material?.roughness ?? 0.5).toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01"
                    value={obj.material?.roughness ?? 0.5}
                    onChange={(e) => updateObject(obj.id, { material: { ...obj.material, roughness: parseFloat(e.target.value) } })}
                    onMouseUp={pushHistory}
                    className="w-full accent-primary"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between -mb-1.5">
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Metalness</span>
                    <span className="text-[10px] text-foreground font-semibold tabular-nums">{(obj.material?.metalness ?? 0.1).toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01"
                    value={obj.material?.metalness ?? 0.1}
                    onChange={(e) => updateObject(obj.id, { material: { ...obj.material, metalness: parseFloat(e.target.value) } })}
                    onMouseUp={pushHistory}
                    className="w-full accent-primary"
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
                  <select
                    value={obj.light.type}
                    onChange={(e) => { updateObject(obj.id, { light: { ...obj.light!, type: e.target.value as 'point' | 'spot' | 'directional' } }); pushHistory(); }}
                    className="w-full bg-surface border border-border rounded-xs px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="point">Point Light</option>
                    <option value="spot">Spot Light</option>
                    <option value="directional">Directional Light</option>
                  </select>
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
                  <div className="flex items-center justify-between -mb-1.5">
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Intensity</span>
                    <span className="text-[10px] text-foreground font-semibold tabular-nums">{obj.light.intensity.toFixed(1)}</span>
                  </div>
                  <input type="range" min="0" max="10" step="0.1" value={obj.light.intensity}
                    onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, intensity: parseFloat(e.target.value) } })}
                    onMouseUp={pushHistory}
                    className="w-full accent-primary" />
                </div>
                {/* Distance (point, spot) */}
                {obj.light.type !== 'directional' && (
                  <div>
                    <div className="flex items-center justify-between -mb-1.5">
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Distance</span>
                      <span className="text-[10px] text-foreground font-semibold tabular-nums">{(obj.light.distance ?? 20).toFixed(0)}</span>
                    </div>
                    <input type="range" min="1" max="100" step="1" value={obj.light.distance ?? 20}
                      onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, distance: parseFloat(e.target.value) } })}
                      onMouseUp={pushHistory}
                      className="w-full accent-primary" />
                  </div>
                )}
                {/* Decay (point, spot) */}
                {obj.light.type !== 'directional' && (
                  <div>
                    <div className="flex items-center justify-between -mb-1.5">
                      <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Decay</span>
                      <span className="text-[10px] text-foreground font-semibold tabular-nums">{(obj.light.decay ?? 2).toFixed(1)}</span>
                    </div>
                    <input type="range" min="0" max="3" step="0.1" value={obj.light.decay ?? 2}
                      onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, decay: parseFloat(e.target.value) } })}
                      onMouseUp={pushHistory}
                      className="w-full accent-primary" />
                  </div>
                )}
                {/* Angle + Penumbra (spot only) */}
                {obj.light.type === 'spot' && (
                  <>
                    <div>
                      <div className="flex items-center justify-between -mb-1.5">
                        <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Angle (°)</span>
                        <span className="text-[10px] text-foreground font-semibold tabular-nums">
                          {((obj.light.angle ?? Math.PI / 6) * 180 / Math.PI).toFixed(0)}°
                        </span>
                      </div>
                      <input type="range" min="5" max="89" step="1"
                        value={Math.round((obj.light.angle ?? Math.PI / 6) * 180 / Math.PI)}
                        onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, angle: parseFloat(e.target.value) * Math.PI / 180 } })}
                        onMouseUp={pushHistory}
                        className="w-full accent-primary" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between -mb-1.5">
                        <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Penumbra</span>
                        <span className="text-[10px] text-foreground font-semibold tabular-nums">{(obj.light.penumbra ?? 0.1).toFixed(2)}</span>
                      </div>
                      <input type="range" min="0" max="1" step="0.01" value={obj.light.penumbra ?? 0.1}
                        onChange={(e) => updateObject(obj.id, { light: { ...obj.light!, penumbra: parseFloat(e.target.value) } })}
                        onMouseUp={pushHistory}
                        className="w-full accent-primary" />
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
                <select
                  value={obj.physics.colliderType}
                  onChange={(e) => { updateObject(obj.id, { physics: { ...obj.physics, colliderType: e.target.value as ColliderType } }); pushHistory(); }}
                  className="w-full bg-surface border border-border rounded-xs px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="box">Box (Cuboid)</option>
                  <option value="sphere">Sphere (Ball)</option>
                  <option value="capsule">Capsule</option>
                  <option value="hull">Convex Hull</option>
                  <option value="trimesh">Trimesh (정확/느림)</option>
                </select>
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
                <div className="flex items-center justify-between -mb-1.5">
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Friction</span>
                  <span className="text-[10px] text-foreground font-semibold tabular-nums">{obj.physics.friction.toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={obj.physics.friction}
                  onChange={(e) => updateObject(obj.id, { physics: { ...obj.physics, friction: parseFloat(e.target.value) } })}
                  onMouseUp={pushHistory}
                  className="w-full accent-primary"
                />
              </div>
              <div>
                <div className="flex items-center justify-between -mb-1.5">
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide">Restitution</span>
                  <span className="text-[10px] text-foreground font-semibold tabular-nums">{obj.physics.restitution.toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={obj.physics.restitution}
                  onChange={(e) => updateObject(obj.id, { physics: { ...obj.physics, restitution: parseFloat(e.target.value) } })}
                  onMouseUp={pushHistory}
                  className="w-full accent-primary"
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
                    <span className="bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded-md text-[10px] font-medium shrink-0">
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
                    <select
                      value={newTrigger}
                      onChange={(e) => setNewTrigger(e.target.value as EventSchema['trigger'])}
                      className="w-full bg-surface border border-border rounded-xs px-1.5 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="click">Click</option>
                      <option value="hover_enter">Hover</option>
                      <option value="area_enter">Area Enter</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Action</span>
                    <select
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value as EventSchema['action'])}
                      className="w-full bg-surface border border-border rounded-xs px-1.5 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="show_popup">팝업</option>
                      <option value="open_url">URL 열기</option>
                      <option value="emit_event">이벤트 발송</option>
                    </select>
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
