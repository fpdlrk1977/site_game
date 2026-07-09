'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeftRight, User } from 'lucide-react';
import { MathUtils } from 'three';
import * as THREE from 'three';
import { glbLocalBboxCache } from '@/lib/glbBboxCache';
import { useSceneStore } from '@/store/sceneStore';
import { useToast } from '@/hooks/useToast';
import { createBrowserSupabase } from '@/lib/supabase';
import { SelectBox } from '@/components/ui/SelectBox';
import { RichContent } from '@/components/ui/RichContent';
import { PopupFrame } from '@/components/ui/PopupFrame';
import { InfoHint } from '@/components/ui/InfoHint';
import type { ObjectNodeSchema, ColliderType, EventSchema, ParticlePreset, PostProcessPreset, HdrPreset, GroundPreset, EnvSchema, DialogueConfig, PopupConfig, PrefabOverrideGroup } from '@/types/scene';

// 프리팹 override 그룹 → 한글 라벨
const OVERRIDE_LABELS: Record<PrefabOverrideGroup, string> = {
  transform: '위치/회전/크기',
  material: '재질',
  events: '이벤트',
  motion: '모션',
  physics: '물리',
  content: '콘텐츠',
  light: '조명',
  particle: '파티클',
  name: '이름',
  visibility: '표시',
  dialogue: '대화',
};
import { CHARACTER_PREVIEW_ID } from '@/app/editor/[projectId]/canvas/CharacterPreview';

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
  prefix
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  dragStep?: number;
  precision?: number;
  min?: number;
  max?: number;
  prefix?:boolean
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
          // 타이핑 중에도 min/max를 넘는 값이 스토어로 흘러가지 않도록 클램프
          // (표시값은 그대로 두고 blur 시점에 정리)
          if (!isNaN(n)) onChange(clamp(n));
        }}
        onBlur={() => {
          isFocused.current = false;
          let n = parseFloat(local);
          if (isNaN(n)) n = evalMath(local) ?? NaN;
          if (!isNaN(n)) { const c = clamp(round(n)); onChange(c); setLocal(fmt(c, precision)); }
          else setLocal(fmt(value, precision));
          onCommit();
        }}
        className={`w-full bg-surface border border-border rounded-xs pr-5 py-1  text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary tabular-nums ${prefix ? 'pl-6' : 'pl-2'}`}
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
      <NumInput value={value} onChange={onChange} onCommit={onCommit} min={min} max={max} precision={precision} dragStep={dragStep} prefix={false} />
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
            <NumInput value={val} onChange={change} onCommit={onCommit} dragStep={dragStep} prefix={true} />
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
  hint,
  isOpen,
  onToggle,
}: {
  title: string;
  icon?: string;
  hint?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const collapsible = onToggle !== undefined;
  return (
    <div
      // onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-3 text-[11px] font-semibold text-muted tracking-wide bg-surface/40 select-none`}
    >

      {/* <div
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-3 text-[11px] font-semibold text-muted tracking-wide bg-surface/40 select-none ${
        collapsible ? 'cursor-pointer hover:text-foreground hover:bg-surface/70 transition-colors' : ''
      }`}
    > */}
      {icon && <span className="text-[12px] opacity-60 font-normal not-italic">{icon}</span>}
      <span className="flex-1 text-foreground flex items-center gap-1.5">
        {title}
        {hint && <InfoHint text={hint} />}
      </span>
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
      className={`relative w-7.5 h-4 rounded-full transition-colors cursor-pointer shrink-0 ${value ? 'bg-primary' : 'bg-border'}`}
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
  hover_enter: 'Hover In',
  hover_exit: 'Hover Out',
  area_enter: 'Area Enter',
  area_exit: 'Area Exit',
  interact: 'Interact (E)',
  approach_enter: 'Approach In (근접)',
  approach_exit: 'Approach Out',
  dialogue_end: '대사 종료 시',
};
const ACTION_LABELS: Record<string, string> = {
  open_url: 'URL 열기',
  show_popup: '팝업',
  emit_event: '이벤트 발송',
  play_animation: '애니메이션 재생',
  go_to_scene: '씬 이동',
  show_object: '오브젝트 표시',
  hide_object: '오브젝트 숨김',
  toggle_object: '오브젝트 토글',
  focus_object: '카메라 포커스',
  reset_camera: '카메라 초기화',
  animate_object: '오브젝트 애니메이션',
  move_object: '오브젝트 이동',
  set_passable: '통과 가능(문 열기)',
  set_solid: '통과 불가(문 닫기)',
  toggle_collision: '통과 토글',
  play_sound: '사운드 재생',
};

// value가 대상 objectId인 액션들 (에디터에서 오브젝트 선택 드롭다운 표시)
const OBJECT_TARGET_ACTIONS = new Set(['show_object', 'hide_object', 'toggle_object', 'focus_object', 'set_passable', 'set_solid', 'toggle_collision']);

// ── GLB 애니메이션 클립 선택기 ─────────────────────────────────
// three-stdlib GLTFLoader가 이 GLB의 animations를 파싱 못하는 문제 우회:
// GLB 바이너리의 JSON 청크를 직접 읽어 animation 이름만 추출
async function parseGlbAnimationNames(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB');
  const jsonChunkLen = view.getUint32(12, true);
  const jsonStr = new TextDecoder().decode(new Uint8Array(buffer, 20, jsonChunkLen));
  const gltf = JSON.parse(jsonStr) as { animations?: { name: string }[] };
  return (gltf.animations ?? []).map((a) => a.name);
}

// URL별 클립 목록 캐시 — 같은 GLB(수십 MB)를 피커 열 때마다 다시 받지 않는다.
// 실패한 Promise는 캐시에서 제거해 재시도 가능하게 유지.
const clipNamesCache = new Map<string, Promise<string[]>>();
function getGlbAnimationNames(url: string): Promise<string[]> {
  let p = clipNamesCache.get(url);
  if (!p) {
    p = parseGlbAnimationNames(url);
    p.catch(() => clipNamesCache.delete(url));
    clipNamesCache.set(url, p);
  }
  return p;
}

function GlbClipPicker({ url, value, onChange }: { url: string; value: string; onChange: (v: string) => void }) {
  const [clips, setClips] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setClips(null);
    setLoadError(null);
    getGlbAnimationNames(url)
      .then((names) => { if (!cancelled) setClips(names); })
      .catch((err) => { if (!cancelled) { setLoadError(String(err)); setClips([]); } });
    return () => { cancelled = true; };
  }, [url]);

  if (clips === null) {
    return (
      <div className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-muted/50">
        클립 목록 로딩 중…
      </div>
    );
  }
  if (loadError || clips.length === 0) {
    return (
      <>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="clip name"
          className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-white placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary" />
        {loadError
          ? <p className="text-danger text-[10px] mt-1">로드 실패: {loadError.slice(0, 80)}</p>
          : <p className="text-muted/50 text-[10px] mt-1">이 GLB에 애니메이션 클립이 없습니다.</p>}
      </>
    );
  }
  return (
    <SelectBox
      value={value}
      options={clips.map((n) => ({ value: n, label: n }))}
      onChange={onChange}
      placeholder="클립 선택"
    />
  );
}

// ── 분위기(Mood) 프리셋 ────────────────────────────────────────
// 기존 씬 설정(HDR 프리셋 + 라이트 강도/태양 위치 + 노출)을 한 번에 세팅.
// 클릭 시 updateEnvironment로 묶음 적용 — 개별 값은 이후 각 컨트롤에서 미세조정 가능.
const MOOD_PRESETS: { id: string; label: string; emoji: string; env: Partial<EnvSchema> }[] = [
  // 기본값 복귀 — HDR/라이트/노출을 DEFAULT_ENVIRONMENT 상태로 되돌린다(무드 해제).
  { id: 'default', label: '기본', emoji: '↺', env: { hdrPreset: 'none', toneMappingExposure: 1,
    lights: { ambientIntensity: 0.6, directionalIntensity: 1.2, directionalPosition: { x: 5, y: 10, z: 5 } } } },
  { id: 'morning', label: '아침', emoji: '🌅', env: { hdrPreset: 'dawn', toneMappingExposure: 1.05,
    lights: { ambientIntensity: 0.55, directionalIntensity: 1.0, directionalPosition: { x: 8, y: 5, z: 6 } } } },
  { id: 'noon', label: '한낮', emoji: '☀️', env: { hdrPreset: 'park', toneMappingExposure: 1.0,
    lights: { ambientIntensity: 0.6, directionalIntensity: 1.5, directionalPosition: { x: 4, y: 12, z: 4 } } } },
  { id: 'sunset', label: '노을', emoji: '🌇', env: { hdrPreset: 'sunset', toneMappingExposure: 0.95,
    lights: { ambientIntensity: 0.5, directionalIntensity: 1.0, directionalPosition: { x: 10, y: 3, z: 2 } } } },
  { id: 'night', label: '밤', emoji: '🌙', env: { hdrPreset: 'night', toneMappingExposure: 0.85,
    lights: { ambientIntensity: 0.3, directionalIntensity: 0.4, directionalPosition: { x: 3, y: 8, z: 5 } } } },
  { id: 'studio', label: '스튜디오', emoji: '💡', env: { hdrPreset: 'studio', toneMappingExposure: 1.0,
    lights: { ambientIntensity: 0.7, directionalIntensity: 1.2, directionalPosition: { x: 5, y: 10, z: 5 } } } },
];

// ── Environment 패널 (오브젝트 미선택 시) ──────────────────────
function EnvironmentPanel() {
  const { environment, updateEnvironment, pushHistory, assets, projectId } = useSceneStore();
  const { addToast } = useToast();
  const [notesOpen, setNotesOpen] = useState(true);
  const [moodSel, setMoodSel] = useState(''); // 마지막으로 적용한 Mood(표시용) — env에 저장되진 않음
  const [groundTexUploading, setGroundTexUploading] = useState(false);
  const groundTexInputRef = useRef<HTMLInputElement>(null);
  const [boundaryTexUploading, setBoundaryTexUploading] = useState(false);
  const boundaryTexInputRef = useRef<HTMLInputElement>(null);
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
      // 공개 버킷의 만료 없는 public URL 사용 (0006 마이그레이션에서 버킷 공개 전환)
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
      updateEnvironment({ ground: { ...env.ground!, textureUrl: publicUrl } });
      pushHistory();
    } catch (err) {
      addToast('텍스처 업로드 실패', 'error');
      console.error(err);
    } finally {
      setGroundTexUploading(false);
    }
  };

  const handleBoundaryTexUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !projectId) return;
    if (file.size > 8 * 1024 * 1024) {
      addToast('이미지가 너무 큽니다. 최대 8MB까지 지원합니다.', 'error');
      return;
    }
    setBoundaryTexUploading(true);
    try {
      const supabase = createBrowserSupabase();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `boundary/${projectId}/tex_${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from('assets')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (storageErr) throw storageErr;
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
      updateEnvironment({ boundaryWall: { ...(env.boundaryWall ?? {}), style: 'texture', textureUrl: publicUrl } });
      pushHistory();
    } catch (err) {
      addToast('텍스처 업로드 실패', 'error');
      console.error(err);
    } finally {
      setBoundaryTexUploading(false);
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
              <div className='flex gap-2'>
                <SelectBox
                  value={mode}
                  onChange={(v) => {
                    const t = v as 'color' | 'sky' | 'hdr';
                    if (t === 'hdr') {
                      updateEnvironment({ hdrPreset: env.hdrPreset && env.hdrPreset !== 'none' ? env.hdrPreset : 'sunset' });
                    } else {
                      updateEnvironment({ sky: { ...env.sky, type: t }, hdrPreset: 'none' });
                    }
                    pushHistory();
                  }}
                  options={[
                    { value: 'color', label: '단색' },
                    { value: 'sky', label: '하늘' },
                    { value: 'hdr', label: 'HDR' },
                  ]}
                />

                {mode === 'color' && (
                  <div className="px-2 flex  items-center border border-border rounded-xs">
                    <input type="color" value={env.sky.value}
                      onChange={(e) => updateEnvironment({ sky: { ...env.sky, value: e.target.value } })}
                      onBlur={pushHistory} className="w-5 h-5 cursor-pointer" />
                    <input type="text" value={env.sky.value}
                      onChange={(e) => updateEnvironment({ sky: { ...env.sky, value: e.target.value } })}
                      onBlur={pushHistory}
                      className="flex-1 px-2.5 py-1.5  text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                )}

                {mode === 'hdr' && (
                  <SelectBox
                    value={env.hdrPreset ?? 'sunset'}
                    onChange={(v) => { updateEnvironment({ hdrPreset: v as HdrPreset }); pushHistory(); }}
                    options={HDR_PRESETS.map(({ id, label }) => ({ value: id, label }))}
                  />
                )}
                </div>
              </>
              
            );
          })()}
        </div>
      </GroupBox>

      {/* Ground */}
      <GroupBox>
        <div className="relative">
          <SectionHeader title="Ground" hint="바닥 평면. 프리셋 또는 단색/이미지 텍스처. 바닥은 불투명이라, 오브젝트 밑면이 바닥 아래로 내려가면 가려져 잘려 보여요(자동 바닥 스냅으로 방지)." />
          <label className="flex items-center justify-between cursor-pointer absolute top-3 right-4">
            <Toggle
              value={env.ground?.enabled ?? false}
              onChange={(v) => { updateEnvironment({ ground: { ...env.ground, color: env.ground?.color ?? '#4a7c59', enabled: v } }); pushHistory(); }}
            />
          </label>
        </div>
        {env.ground?.enabled && (
          <div className="px-3 pb-3 space-y-2">
            {/* 프리셋 */}
            {(() => {
              const GROUND_PRESETS: { id: GroundPreset; label: string; emoji: string }[] = [
                { id: 'grass',  label: '잔디', emoji: '🌿' },
                { id: 'dirt',   label: '흙',   emoji: '🟤' },
                { id: 'sand',   label: '모래', emoji: '🏖' },
                { id: 'stone',  label: '돌',   emoji: '🪨' },
                { id: 'water',  label: '물',   emoji: '💧' },
                { id: 'custom', label: '직접', emoji: '🎨' },
              ];
              const current = env.ground!.preset ?? 'custom';
              return (
                <SelectBox
                  value={current}
                  onChange={(v) => { updateEnvironment({ ground: { ...env.ground!, preset: v as GroundPreset } }); pushHistory(); }}
                  options={GROUND_PRESETS.map(({ id, label, emoji }) => ({ value: id, label, icon: emoji }))}
                />
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
                      className="flex-1 px-2.5 py-1.5  text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
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
            {/* <span className=" text-[11px] text-muted">Enable Fog</span> */}
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
                    className="flex-1 px-2.5 py-1.5  text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className='flex gap-2'>
                <div className='mt-2'>
                  <LabeledNum
                    label="Near"
                    value={env.fog.near}
                    onChange={(v) => updateEnvironment({ fog: { ...env.fog, near: Math.min(v, env.fog.far) } })}
                    onCommit={pushHistory}
                    min={1} max={200} precision={0} dragStep={1}
                  />
                </div>
                <div className='mt-2'>
                  <LabeledNum
                    label="Far"
                    value={env.fog.far}
                    onChange={(v) => updateEnvironment({ fog: { ...env.fog, far: Math.max(v, env.fog.near) } })}
                    onCommit={pushHistory}
                    min={10} max={500} precision={0} dragStep={2}
                  />
                </div>
              </div>
        </div>}
      </GroupBox>
      

      {/* Mood — 분위기 프리셋 (HDR+라이트+노출 한 번에) */}
      <GroupBox>
        <SectionHeader title="Mood" />
        <div className="px-3 pb-3">
          <p className="text-[10px] text-muted/60 mb-2">한 번에 조명·배경·노출을 세팅합니다. 이후 아래에서 미세조정하세요.</p>
          <SelectBox
            value={moodSel}
            onChange={(id) => {
              const m = MOOD_PRESETS.find((p) => p.id === id);
              if (m) { updateEnvironment(m.env); pushHistory(); setMoodSel(id); }
            }}
            options={MOOD_PRESETS.map((m) => ({ value: m.id, label: `${m.emoji} ${m.label}` }))}
            placeholder="무드 선택..."
          />
        </div>
      </GroupBox>

      {/* Lights */}
      <GroupBox>
        <SectionHeader title="Lights" hint="씬 전역 조명 — 환경광(ambient)·방향광(태양)의 강도·방향. 그림자 진하기에 영향을 줘요." />
        <div className="px-3 space-y-1 pb-4">
          <div className='flex gap-2'>
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
          {/* 노출(Exposure) — NeutralToneMapping의 밝기. 1=기본. 씬 전체 톤 조절 */}
          <div className="pt-1">
            <LabeledNum
              label="Exposure (노출)"
              value={env.toneMappingExposure ?? 1}
              onChange={(v) => updateEnvironment({ toneMappingExposure: v })}
              onCommit={pushHistory}
              min={0.3} max={2} precision={2} dragStep={0.02}
            />
            <p className="text-[10px] text-muted/60 mt-1">
              씬 전체 밝기. 색은 지정값 그대로 나오도록 Linear 톤매핑을 씁니다. 너무 밝아
              하얗게 뜨는 부분이 있으면 노출을 낮추세요.
            </p>
          </div>
          {/* 접지 그림자 — 오브젝트가 바닥에 붙은 느낌. 기본 꺼짐, 켜서 확인 */}
          <label className="flex items-center justify-between cursor-pointer pt-2">
            <span className="text-[10px] font-semibold text-muted/70">접지 그림자 (Contact Shadows)</span>
            <Toggle
              value={env.contactShadows === true}
              onChange={(v) => { updateEnvironment({ contactShadows: v }); pushHistory(); }}
            />
          </label>
        </div>
      </GroupBox>

      {/* Interaction — 뷰어 상호작용 어포던스 */}
      <GroupBox>
        <SectionHeader title="Interaction" hint="클릭/호버 이벤트가 있는 오브젝트 위에 떠다니는 힌트 링을 띄워 '상호작용 가능'을 알려줘요. 탐색 모드 전용, 깔끔한 씬은 끌 수 있습니다." />
        <div className="px-3 pb-4 space-y-1">
          {/* 클릭/호버 이벤트가 있는 오브젝트 위에 힌트 링 표시 (탐색 모드 뷰어/임베드에서만) */}
          <label className="flex items-center justify-between cursor-pointer pb-1">
            <span className="text-[10px] font-semibold text-muted/70">상호작용 힌트 표시</span>
            <Toggle
              value={env.showInteractionHints !== false}
              onChange={(v) => { updateEnvironment({ showInteractionHints: v }); pushHistory(); }}
            />
          </label>
          <p className="text-[10px] text-muted/60 leading-relaxed">
            클릭·호버 이벤트가 있는 오브젝트 위에 떠다니는 링을 띄워 방문자에게 상호작용
            가능함을 알립니다. 뷰어의 탐색 모드에서만 보이며, 에디터엔 표시되지 않습니다.
          </p>
          {/* 상호작용 근접 범위 기본값 — interact(E)/approach·E 프롬프트·하이라이트 공유 */}
          <div className="pt-2">
            <LabeledNum label="상호작용 범위 기본값(m)" value={env.interactRange ?? 3}
              onChange={(v) => updateEnvironment({ interactRange: Math.max(0.5, v) })}
              onCommit={pushHistory} min={0.5} max={10} precision={1} dragStep={0.1} />
            <p className="text-[10px] text-muted/60 leading-relaxed mt-1">
              플레이 모드에서 캐릭터가 이만큼 가까이 가면 E 프롬프트·하이라이트·approach가 발동해요.
              오브젝트에 개별 범위를 지정하면 그 값이 우선합니다.
            </p>
          </div>
        </div>
      </GroupBox>

      {/* 팝업 기본값 — 씬 전역 show_popup 스타일 (개별 이벤트가 우선) */}
      <GroupBox>
        <SectionHeader title="팝업 기본값" hint="show_popup 팝업의 씬 전역 기본 위치·크기·배경색. 개별 이벤트에서 지정한 값이 이 기본값보다 우선합니다." />
        <div className="px-3 pb-4 space-y-1.5">
          {(() => {
            const dp = env.defaultPopup ?? {};
            const setDP = (patch: Partial<typeof dp>) => updateEnvironment({ defaultPopup: { ...dp, ...patch } });
            const inputCls = 'w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary';
            return (
              <>
                <label className="block">
                  <span className="text-[10px] text-muted/50 block mb-1">위치</span>
                  <SelectBox
                    value={dp.position ?? 'center'}
                    onChange={(v) => { setDP({ position: v as PopupConfig['position'] }); pushHistory(); }}
                    options={[
                      { value: 'center', label: '중앙 모달 (기본)' },
                      { value: 'bottom', label: '하단 시트' },
                      { value: 'left', label: '왼쪽 패널' },
                      { value: 'right', label: '오른쪽 패널' },
                    ]}
                  />
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">기본 너비</span>
                    <input type="text" value={dp.width ?? ''} onChange={(e) => setDP({ width: e.target.value })} onBlur={pushHistory} placeholder="예: 800px" className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">기본 높이</span>
                    <input type="text" value={dp.height ?? ''} onChange={(e) => setDP({ height: e.target.value })} onBlur={pushHistory} placeholder="예: 600px" className={inputCls} />
                  </label>
                </div>
                <label className="block">
                  <span className="text-[10px] text-muted/50 block mb-1">기본 배경색</span>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={dp.bg || '#ffffff'} onChange={(e) => setDP({ bg: e.target.value })} onBlur={pushHistory} className="w-7 h-7 rounded-xs border border-border bg-surface shrink-0 cursor-pointer" />
                    <input type="text" value={dp.bg ?? ''} onChange={(e) => setDP({ bg: e.target.value })} onBlur={pushHistory} placeholder="#ffffff (기본 흰색)" className={inputCls} />
                  </div>
                </label>
                <p className="text-[10px] text-muted/60 leading-relaxed">
                  이 씬의 모든 팝업에 적용되는 기본값이에요. 개별 이벤트에서 위치·크기·배경색을 지정하면 그 값이 우선합니다.
                </p>
              </>
            );
          })()}
        </div>
      </GroupBox>

      {/* Player */}
      <GroupBox>
        <SectionHeader title="Player" hint="플레이(걷기) 모드의 캐릭터·속도·점프. 캐릭터 GLB를 지정하지 않으면 기본 캡슐로 걸어다녀요." />
        <div className="px-3 pb-4 space-y-1">
          {/* 걷기(플레이) 모드 사용 — 끄면 이 씬은 둘러보기 전용(캐릭터·플레이 없음) */}
          <label className="flex items-center justify-between cursor-pointer pb-1">
            <span className="text-[10px] font-semibold text-muted/70">걷기(플레이) 모드 사용</span>
            <Toggle
              value={!env.disableWalk}
              onChange={(v) => { updateEnvironment({ disableWalk: !v }); pushHistory(); }}
            />
          </label>
          {env.disableWalk ? (
            <p className="text-[10px] text-muted/60 leading-relaxed">
              둘러보기 전용 씬입니다. 뷰어에서 캐릭터·플레이 없이 orbit으로만 감상합니다.
            </p>
          ) : (
          <>
          {/* 뷰어 기본 진입 모드 — 접속 시 탐색/플레이 중 무엇으로 시작할지 */}
          <div className="pb-1">
            <span className="text-[10px] text-muted/50 block mb-1.5 font-semibold tracking-wide">기본 진입 모드</span>
            <SelectBox
              value={env.defaultMode ?? 'explore'}
              onChange={(v) => { updateEnvironment({ defaultMode: v as 'explore' | 'play' }); pushHistory(); }}
              options={[
                { value: 'explore', label: '탐색 (둘러보기)' },
                { value: 'play', label: '플레이 (걸어다니기)' },
              ]}
            />
            <p className="text-[10px] text-muted/60 mt-1.5">
              뷰어 접속·씬 이동 시 시작할 모드. 플레이면 바로 캐릭터로 시작합니다.
            </p>
          </div>
          {(() => {
            const characterAssets = assets.filter((a) => a.type === 'character');
            return (
              <>
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1.5 font-semibold tracking-wide">캐릭터</span>
                  <SelectBox
                    value={env.playerCharacterId ?? ''}
                    onChange={(v) => { updateEnvironment({ playerCharacterId: v || undefined }); pushHistory(); }}
                    iconSize={32}
                    options={[
                      { value: '', label: '기본 캡슐', icon: <User className="text-muted" /> },
                      ...characterAssets.map((a) => ({
                        value: a.id,
                        label: a.name,
                        icon: a.thumbnailUrl
                          ? <img src={a.thumbnailUrl} alt="" className="rounded-xs" />
                          : <User className="text-muted" />,
                      })),
                    ]}
                  />
                  {characterAssets.length === 0 && (
                    <p className="text-[10px] text-muted/60 mt-1.5">
                      Asset Browser → Character 탭에서 GLB를 업로드하세요
                    </p>
                  )}
                </div>
                <div className='flex gap-2 pt-1'>
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
                      label="Speed"
                      value={env.playerSpeed ?? 5}
                      onChange={(v) => updateEnvironment({ playerSpeed: v })}
                      onCommit={pushHistory}
                      min={1} max={20} precision={1} dragStep={0.1}
                    />
                  </div>
                  <div>
                    <LabeledNum
                      label="Jump"
                      value={env.playerJumpForce ?? 12}
                      onChange={(v) => updateEnvironment({ playerJumpForce: v })}
                      onCommit={pushHistory}
                      min={2} max={30} precision={0} dragStep={0.5}
                    />
                  </div>
                </div>
              </>
            );
          })()}
          </>
          )}
        </div>
      </GroupBox>

      {/* 스폰 포인트 — 걷기 모드일 때만 (둘러보기 전용 씬은 캐릭터·스폰 없음) */}
      {!env.disableWalk && (
      <GroupBox>
        <SectionHeader title="Spawn Point" />
        <div className="px-3 pb-4 space-y-1">
          <XYZRow
            label="Position"
            x={env.playerStartPosition?.x ?? 0}
            y={env.playerStartPosition?.y ?? 0}
            z={env.playerStartPosition?.z ?? 0}
            onChangeX={(v) => updateEnvironment({ playerStartPosition: { ...env.playerStartPosition ?? { x: 0, y: 0, z: 0 }, x: v } })}
            onChangeY={(v) => updateEnvironment({ playerStartPosition: { ...env.playerStartPosition ?? { x: 0, y: 0, z: 0 }, y: Math.max(0, v) } })}
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
      )}

      {/* Boundary */}
      <GroupBox>
        <SectionHeader title="Boundary" hint="플레이 이동 제한 영역. 가로(X)·세로(Z)=중심에서 벽까지 거리(반경). 벽 스타일(단색·텍스처)로 방/전시장처럼 감쌀 수 있어요." />
        <div className="px-3 pb-4">
          <div className="grid grid-cols-2 gap-2">
            <LabeledNum
              label="가로(X)"
              value={env.boundary ?? 0}
              onChange={(v) => updateEnvironment(v === 0 ? { boundary: undefined, boundaryZ: undefined } : { boundary: v })}
              onCommit={pushHistory}
              min={0} max={200} precision={0} dragStep={1}
            />
            <LabeledNum
              label="세로(Z)"
              value={env.boundaryZ ?? env.boundary ?? 0}
              onChange={(v) => updateEnvironment({ boundaryZ: v === 0 ? undefined : v })}
              onCommit={pushHistory}
              min={0} max={200} precision={0} dragStep={1}
            />
          </div>
          <p className="text-[10px] text-muted/60 mt-0.5">0 = 경계 없음 · 중심에서 벽까지 거리(반경). 세로=가로면 정사각.</p>

          {(env.boundary ?? 0) > 0 && (() => {
            const bw = env.boundaryWall ?? {};
            const style = bw.style ?? 'none';
            const setBw = (patch: Partial<NonNullable<EnvSchema['boundaryWall']>>) =>
              updateEnvironment({ boundaryWall: { ...bw, ...patch } });
            return (
              <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">벽 스타일</span>
                  <SelectBox
                    value={style}
                    onChange={(v) => { setBw({ style: v as 'none' | 'color' | 'texture' }); pushHistory(); }}
                    options={[
                      { value: 'none', label: '투명 (영역만)' },
                      { value: 'color', label: '단색 벽' },
                      { value: 'texture', label: '텍스처 벽' },
                    ]}
                  />
                </div>
                {style === 'color' && (
                  <label className="flex items-center gap-2 text-[10px] text-muted/70">
                    <span className="shrink-0">색</span>
                    <input type="color" value={bw.color ?? '#8899aa'}
                      onChange={(e) => setBw({ color: e.target.value })} onBlur={pushHistory}
                      className="w-8 h-6 rounded-xs bg-transparent border border-border cursor-pointer" />
                    <span className="text-muted/50 font-mono">{bw.color ?? '#8899aa'}</span>
                  </label>
                )}
                {style === 'texture' && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-muted/50 block font-semibold tracking-wide">텍스처</span>
                    {bw.textureUrl ? (
                      <div className="relative rounded-xs overflow-hidden border border-border group">
                        <img src={bw.textureUrl} alt="boundary texture" className="w-full h-16 object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => boundaryTexInputRef.current?.click()}
                            className="bg-black/70 text-white rounded px-2 py-1 text-[10px] hover:bg-primary/80 transition-colors"
                          >교체</button>
                          <button
                            onClick={() => { setBw({ textureUrl: undefined }); pushHistory(); }}
                            className="bg-black/70 text-white rounded px-2 py-1 text-[10px] hover:bg-danger/80 transition-colors"
                          >제거</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => boundaryTexInputRef.current?.click()}
                        disabled={boundaryTexUploading}
                        className="w-full py-2.5 rounded-xs border border-dashed border-border text-muted hover:border-primary/60 hover:text-primary hover:bg-primary/5 text-[10px] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-pre-line"
                      >
                        {boundaryTexUploading ? '업로드 중...' : '텍스처 이미지 업로드\nJPG · PNG · WEBP'}
                      </button>
                    )}
                    <input
                      ref={boundaryTexInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleBoundaryTexUpload}
                    />
                  </div>
                )}
                {style !== 'none' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <LabeledNum label="높이" value={bw.height ?? 8}
                        onChange={(v) => setBw({ height: v })} onCommit={pushHistory}
                        min={0.5} max={50} precision={1} dragStep={0.5} />
                      <LabeledNum label="불투명도" value={bw.opacity ?? 1}
                        onChange={(v) => setBw({ opacity: v })} onCommit={pushHistory}
                        min={0} max={1} precision={2} dragStep={0.05} />
                    </div>
                    <label className="flex items-center gap-2 text-[10px] text-muted/70 pt-0.5">
                      <Toggle value={bw.ceiling === true} onChange={(v) => { setBw({ ceiling: v }); pushHistory(); }} />
                      <span>천장 포함 (완전한 방)</span>
                    </label>
                    <p className="text-[10px] text-muted/50">에디터엔 반투명 미리보기 · 실제 룩은 뷰어에서 확인</p>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </GroupBox>

      {/* Post Processing */}
      <GroupBox>
        <SectionHeader title="Post Processing" />
        <div className="px-3 pb-4">
          <span className="text-[10px] font-semibold text-muted/60 tracking-wide block mb-1">Preset</span>
          <SelectBox
            value={env.postProcessing?.preset ?? 'none'}
            onChange={(v) => { updateEnvironment({ postProcessing: { preset: v as PostProcessPreset } }); pushHistory(); }}
            options={([
              ['none', 'None'], ['cinematic', 'Cinematic'], ['dreamy', 'Dreamy'], ['vintage', 'Vintage'], ['sharp', 'Sharp'],
            ] as [PostProcessPreset, string][]).map(([value, label]) => ({ value, label }))}
          />
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
              className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-foreground placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        )}
      </GroupBox>
    </div>
  );
}

// ── 메인 ───────────────────────────────────────────────────────
// 외부: selectedId를 key로 넘겨 오브젝트 전환 시 내부 상태 완전 초기화
export function InspectorPanel() {
  const { selectedId } = useSceneStore();
  return <InspectorInner key={selectedId ?? '__none__'} />;
}

function InspectorInner() {
  const { objects, assets, selectedId, selectedIds, projectId, sceneId, environment, prefabs, updateObject, pushHistory, alignSelected, batchUpdateObjects, arraySelected, createPrefab, instantiatePrefab, applyInstanceToPrefab, revertInstance, deletePrefab } = useSceneStore();
  const { addToast } = useToast();
  const obj = objects.find((o) => o.id === selectedId) as ObjectNodeSchema | undefined;
  const isMultiSelect = selectedIds.length > 1;

  // 섹션 접기 상태 — Array(반복 복제)는 가끔 쓰는 툴이라 기본 접힘
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['array']));
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
  // show_popup 팝업 설정(모드/크기/색). undefined=auto(기존 동작).
  const [newPopup, setNewPopup] = useState<PopupConfig | undefined>(undefined);
  // null이면 신규 추가, 값이 있으면 그 이벤트를 수정 중
  const [editingId, setEditingId] = useState<string | null>(null);

  // 이벤트 프리뷰 팝업
  const [previewPopup, setPreviewPopup] = useState<{ content: string; config?: PopupConfig } | null>(null);

  // 배열(Array) 복제 파라미터 — 개수(원본 포함)와 복제 간 간격
  const [arrayCount, setArrayCount] = useState(5);
  const [arrayOffset, setArrayOffset] = useState({ x: 2, y: 0, z: 0 });

  // go_to_scene 액션용 씬 목록 — 폼을 열거나 이미 씬 이동 이벤트가 있을 때만 로드
  const [sceneList, setSceneList] = useState<{ id: string; name: string }[]>([]);
  const needScenes = showAddEvent || (obj?.events?.some((e) => e.action === 'go_to_scene') ?? false);
  useEffect(() => {
    if (!needScenes || !projectId || sceneList.length > 0) return;
    createBrowserSupabase()
      .from('scenes')
      .select('id, name')
      .eq('project_id', projectId)
      .order('created_at')
      .then(({ data }) => setSceneList(data ?? []));
  }, [needScenes, projectId, sceneList.length]);
  const sceneName = (id: string) => sceneList.find((s) => s.id === id)?.name ?? id;
  const objectName = (id: string) => objects.find((o) => o.id === id)?.name ?? id;

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
          <span className=" text-[11px] font-semibold text-muted tracking-wide">{selectedIds.length}개 선택됨</span>
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
              <span className=" text-[11px] text-muted">Visible (전체)</span>
              <Toggle
                value={allVisible}
                onChange={(v) => { batchUpdateObjects(selectedIds, () => ({ visible: v })); pushHistory(); }}
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className=" text-[11px] text-muted">Physics Enabled (전체)</span>
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
    const isCharSelected = selectedId === CHARACTER_PREVIEW_ID;
    return (
      <aside className="flex flex-col bg-surface border-l border-border overflow-hidden h-full">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
          <span className=" text-[11px] font-semibold text-foreground tracking-wide flex-1">
            {isCharSelected ? 'Player Character' : 'Environment'}
          </span>
        </div>
        {isCharSelected && (
          <div className="px-3 py-2 bg-primary/5 border-b border-border shrink-0">
            <p className="text-[10px] text-primary">뷰포트에서 드래그해 위치 조정 · 스케일/속성은 Player 섹션에서</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {!isCharSelected && prefabs.length > 0 && (
            <GroupBox>
              <SectionHeader title="Prefab 라이브러리" icon="◇" hint="이 씬의 프리팹 원본 목록. '배치'를 누르면 새 인스턴스를 씬에 추가해요. 삭제하면 정의만 지워지고 이미 배치된 오브젝트는 독립 오브젝트로 남습니다." />
              <div className="px-3 pb-4 space-y-1.5">
                {prefabs.map((p) => {
                  const count = new Set(objects.filter((o) => o.prefabId === p.id).map((o) => o.prefabInstanceId)).size;
                  return (
                    <div key={p.id} className="flex items-center gap-1.5 bg-background border border-border rounded-xs px-2 py-1.5">
                      <span className="text-[11px] text-foreground font-medium flex-1 truncate" title={p.name}>◇ {p.name}</span>
                      <span className="text-[10px] text-muted shrink-0">{count}</span>
                      <button
                        onClick={() => { instantiatePrefab(p.id); addToast(`'${p.name}' 배치`, 'success'); }}
                        className="px-2 py-0.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[10px] font-semibold transition-colors shrink-0"
                      >
                        배치
                      </button>
                      <button
                        onClick={() => { if (confirm(`'${p.name}' 프리팹 정의를 삭제할까요?\n이미 배치된 ${count}개 인스턴스는 독립 오브젝트로 남습니다.`)) { deletePrefab(p.id); addToast('프리팹 정의 삭제됨', 'success'); } }}
                        title="프리팹 정의 삭제(인스턴스는 유지)"
                        className="px-1 py-0.5 rounded-xs text-muted hover:text-red-500 text-[11px] transition-colors shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </GroupBox>
          )}
          <EnvironmentPanel />
        </div>
      </aside>
    );
  }

  // 그룹 자식의 position은 부모 기준 로컬 좌표라 음수 y가 정상 — 최상위 오브젝트만 바닥(y=0) 클램프
  // (GizmoController의 skipYClamp와 동일한 규칙)
  const setPos = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { position: { ...obj.position, [axis]: axis === 'y' && !obj.parentId ? Math.max(0, v) : v } });
  const setRot = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { rotation: { ...obj.rotation, [axis]: v } });
  const setScl = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { scale: { ...obj.scale, [axis]: v } });

  // GLB 밑면을 바닥(y=0)에 정렬 — 모델 로컬 bbox에 현재 회전·스케일을 적용해
  // 실제 최하단(min.y)을 구하고, position.y를 그만큼 올려 바닥에 앉힌다.
  const glbUrlForSnap = obj?.assetId ? assets.find((a) => a.id === obj.assetId)?.dracoUrl : null;
  const canSnapToGround = !!glbUrlForSnap && !obj.parentId && glbLocalBboxCache.has(glbUrlForSnap);
  const snapToGround = () => {
    if (!glbUrlForSnap) return;
    const local = glbLocalBboxCache.get(glbUrlForSnap);
    if (!local) return;
    const DEG2RAD = Math.PI / 180;
    // translation 없이 회전(euler)+스케일만 적용한 행렬로 로컬 bbox를 변환 → 오브젝트 좌표계 min.y
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(obj.rotation.x * DEG2RAD, obj.rotation.y * DEG2RAD, obj.rotation.z * DEG2RAD)),
      new THREE.Vector3(obj.scale.x, obj.scale.y, obj.scale.z),
    );
    const minY = local.clone().applyMatrix4(m).min.y;
    // 밑면이 바닥(0)에 오도록: position.y + minY = 0  →  position.y = -minY
    updateObject(obj.id, { position: { ...obj.position, y: -minY } });
    pushHistory();
  };

  // 팝업 설정을 저장 형태로 정리 — auto(기본)이고 스타일도 없으면 undefined로 떨궈 스키마를 깨끗하게 유지.
  const cleanPopup = (p: PopupConfig | undefined): PopupConfig | undefined => {
    if (!p) return undefined;
    const mode = p.mode ?? 'auto';
    const hasPos = !!(p.position && p.position !== 'center');
    const hasAnim = !!(p.anim && p.anim !== 'auto');
    const hasChrome = p.chrome === false;
    const hasPad = !!(p.padding && p.padding.trim());
    const hasStyle = !!(p.width || p.height || p.bg || p.title?.trim() || hasPos || hasAnim || hasChrome || hasPad);
    if (mode === 'auto' && !hasStyle) return undefined;
    return {
      mode,
      ...(hasPos ? { position: p.position } : {}),
      ...(hasAnim ? { anim: p.anim } : {}),
      ...(hasChrome ? { chrome: false } : {}),
      ...(hasPad ? { padding: p.padding } : {}),
      ...(p.width ? { width: p.width } : {}),
      ...(p.height ? { height: p.height } : {}),
      ...(p.bg ? { bg: p.bg } : {}),
      ...(p.title?.trim() ? { title: p.title.trim() } : {}),
    };
  };

  const addEvent = () => {
    // show_popup(빈 내용 허용)·reset_camera(값 불필요)를 제외하면 값이 있어야 추가 가능
    if (!newValue.trim() && newAction !== 'show_popup' && newAction !== 'reset_camera') return;
    const popupToSave = newAction === 'show_popup' ? cleanPopup(newPopup) : undefined;
    if (editingId) {
      // 기존 이벤트 수정
      updateObject(obj.id, {
        events: obj.events.map((e) =>
          e.id === editingId ? { ...e, trigger: newTrigger, action: newAction, value: newValue.trim(), popup: popupToSave } : e,
        ),
      });
    } else {
      const ev: EventSchema = {
        id: MathUtils.generateUUID(),
        trigger: newTrigger,
        action: newAction,
        value: newValue.trim(),
        ...(popupToSave ? { popup: popupToSave } : {}),
      };
      updateObject(obj.id, { events: [...obj.events, ev] });
    }
    pushHistory();
    setNewValue('');
    setNewPopup(undefined);
    setEditingId(null);
    setShowAddEvent(false);
  };

  const startEdit = (ev: EventSchema) => {
    setEditingId(ev.id);
    setNewTrigger(ev.trigger);
    setNewAction(ev.action);
    setNewValue(ev.value);
    setNewPopup(ev.popup);
    setShowAddEvent(true);
  };

  const cancelEventForm = () => {
    setShowAddEvent(false);
    setNewValue('');
    setNewPopup(undefined);
    setEditingId(null);
  };

  const removeEvent = (id: string) => {
    updateObject(obj.id, { events: obj.events.filter((e) => e.id !== id) });
    pushHistory();
    if (editingId === id) cancelEventForm();
  };

  // area_enter는 physics/센서 설정 없이도 접촉 시 발동한다 (PlayCanvas가 자동 처리).
  // Is Sensor를 켜면 오브젝트가 통과 가능한 트리거 영역이 된다는 안내만 표시.
  const showAreaEnterHint = newTrigger === 'area_enter' || newTrigger === 'area_exit';
  const showInteractHint = newTrigger === 'interact';
  const showApproachHint = newTrigger === 'approach_enter' || newTrigger === 'approach_exit';

  // 대화(말풍선) — dialogue 또는 레거시 interactLabel에서 편집값을 구성
  const dlg: DialogueConfig = obj.dialogue ?? (obj.interactLabel?.trim()
    ? { lines: [obj.interactLabel.trim()], show: 'approach', advance: 'auto' }
    : { lines: [], show: 'approach', advance: 'auto' });
  const setDlg = (patch: Partial<DialogueConfig>) =>
    updateObject(obj.id, { dialogue: { ...dlg, ...patch }, interactLabel: undefined });

  // 이벤트 추가/수정 폼 — 신규는 목록 하단, 수정은 해당 항목 자리에 인라인으로 렌더한다
  const renderEventForm = () => (
    <div className="bg-surface border border-primary/40 rounded-xs p-2.5 space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">Trigger</span>
          <SelectBox
            value={newTrigger}
            onChange={(v) => setNewTrigger(v as EventSchema['trigger'])}
            options={[
              { value: 'click', label: 'Click' },
              { value: 'hover_enter', label: 'Hover In' },
              { value: 'hover_exit', label: 'Hover Out' },
              { value: 'area_enter', label: 'Area Enter' },
              { value: 'area_exit', label: 'Area Exit' },
              { value: 'interact', label: 'Interact (E)' },
              { value: 'approach_enter', label: 'Approach In (근접)' },
              { value: 'approach_exit', label: 'Approach Out' },
              { value: 'dialogue_end', label: '대사 종료 시' },
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
              { value: 'go_to_scene', label: '씬 이동' },
              { value: 'show_object', label: '오브젝트 표시' },
              { value: 'hide_object', label: '오브젝트 숨김' },
              { value: 'toggle_object', label: '오브젝트 토글' },
              { value: 'move_object', label: '오브젝트 이동' },
              { value: 'set_passable', label: '통과 가능(문 열기)' },
              { value: 'set_solid', label: '통과 불가(문 닫기)' },
              { value: 'toggle_collision', label: '통과 토글' },
              { value: 'focus_object', label: '카메라 포커스' },
              { value: 'reset_camera', label: '카메라 초기화' },
              { value: 'play_animation', label: '애니메이션 재생' },
              { value: 'animate_object', label: '오브젝트 애니메이션' },
              { value: 'play_sound', label: '사운드 재생' },
              { value: 'emit_event', label: '이벤트 발송' },
            ]}
          />
        </div>
      </div>

      {showAreaEnterHint && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          캐릭터가 오브젝트에 닿으면 발동합니다. 통과 가능한 투명 트리거 영역으로
          쓰려면 Physics → Is Sensor를 켜세요.
        </p>
      )}

      {showInteractHint && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          플레이 모드에서 캐릭터가 가까이(약 3m) 가면 화면에 <b>E</b> 프롬프트가 뜨고,
          E키(모바일=버튼)를 누르면 발동합니다. NPC 대화·간판·아이템 등에 쓰세요.
          탐색 모드에선 발동하지 않습니다(대신 Click 트리거 사용).
        </p>
      )}

      {showApproachHint && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          플레이 모드에서 캐릭터가 오브젝트에 근접(약 3m)하면 <b>키 없이 자동</b>으로 발동합니다
          (In=들어올 때, Out=벗어날 때). 다가가면 NPC가 손 흔들기·사운드 재생 같은 연출에 쓰세요.
          오브젝트를 <b>솔리드로 유지</b>한 채 쓸 수 있습니다(Area와 달리 센서 불필요).
          영역 반경 기반이라 임의 구역 트리거는 Area를 쓰세요.
        </p>
      )}

      {newTrigger === 'dialogue_end' && (
        <p className="text-muted text-[10px] bg-surface border border-border rounded-xs px-2 py-1.5">
          이 오브젝트의 <b>대화(말풍선) 마지막 문장에 액션 버튼</b>이 뜨고, 방문자가 <b>버튼을 누르면</b> 발동합니다
          (자동으로 넘어가지 않아요). &quot;대사 끝나면 팝업 열기·씬 이동·문 열기&quot; 같은 연결에 쓰세요.
          아래 <b>대화 말풍선</b>에 대사를 먼저 채우고, 버튼 이름은 대화 설정에서 정할 수 있어요. 플레이 모드 전용.
        </p>
      )}

      <div>
        <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">
          {newAction === 'open_url' ? 'URL'
            : newAction === 'emit_event' ? '이벤트 이름'
            : newAction === 'play_animation' ? '클립 이름'
            : newAction === 'go_to_scene' ? '이동할 씬'
            : newAction === 'reset_camera' ? '설정'
            : newAction === 'animate_object' ? '대상 오브젝트 + 클립'
            : newAction === 'move_object' ? '대상 오브젝트 + 이동량'
            : newAction === 'play_sound' ? '오디오 URL'
            : OBJECT_TARGET_ACTIONS.has(newAction) ? '대상 오브젝트'
            : '팝업 내용'}
        </span>
        {(() => {
          if (newAction === 'show_popup') {
            const p = newPopup ?? {};
            const mode = p.mode ?? 'auto';
            const setP = (patch: Partial<PopupConfig>) => setNewPopup({ ...p, ...patch });
            const inputCls = 'w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary';
            return (
              <div className="space-y-2">
                <SelectBox
                  value={mode}
                  onChange={(m) => setP({ mode: m as PopupConfig['mode'] })}
                  options={[
                    { value: 'auto', label: '자동 (텍스트·이미지·영상·YouTube)' },
                    { value: 'url', label: '웹사이트 URL (iframe 삽입)' },
                    { value: 'html', label: '커스텀 HTML (샌드박스)' },
                  ]}
                />
                {mode === 'html' ? (
                  <textarea
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={'<div style="padding:16px">안녕하세요</div>'}
                    rows={5}
                    className={`${inputCls} font-mono resize-y`}
                  />
                ) : (
                  <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={mode === 'url' ? 'https://example.com' : '텍스트 또는 이미지/영상/YouTube URL'}
                    className={inputCls}
                    onKeyDown={(e) => e.key === 'Enter' && addEvent()}
                  />
                )}
                <div className="space-y-1.5 border-t border-border/60 pt-2">
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">위치</span>
                    <SelectBox
                      value={p.position ?? 'center'}
                      onChange={(v) => setP({ position: v as PopupConfig['position'] })}
                      options={[
                        { value: 'center', label: '중앙 모달 (기본)' },
                        { value: 'bottom', label: '하단 시트' },
                        { value: 'left', label: '왼쪽 패널' },
                        { value: 'right', label: '오른쪽 패널' },
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">애니메이션</span>
                    <SelectBox
                      value={p.anim ?? 'auto'}
                      onChange={(v) => setP({ anim: v as PopupConfig['anim'] })}
                      options={[
                        { value: 'auto', label: '자동 (위치에 맞게)' },
                        { value: 'fade', label: '페이드' },
                        { value: 'scale', label: '스케일' },
                        { value: 'slide', label: '슬라이드' },
                        { value: 'none', label: '없음' },
                      ]}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block">
                      <span className="text-[10px] text-muted/50 block mb-1">너비 (선택)</span>
                      <input type="text" value={p.width ?? ''} onChange={(e) => setP({ width: e.target.value })} placeholder="예: 800px, 90vw" className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-muted/50 block mb-1">높이 (선택)</span>
                      <input type="text" value={p.height ?? ''} onChange={(e) => setP({ height: e.target.value })} placeholder="예: 600px, 80vh" className={inputCls} />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">제목 (선택)</span>
                    <input type="text" value={p.title ?? ''} onChange={(e) => setP({ title: e.target.value })} placeholder="오브젝트 이름" className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">배경색 (선택)</span>
                    <div className="flex items-center gap-1.5">
                      <input type="color" value={p.bg || '#ffffff'} onChange={(e) => setP({ bg: e.target.value })} className="w-7 h-7 rounded-xs border border-border bg-surface shrink-0 cursor-pointer" />
                      <input type="text" value={p.bg ?? ''} onChange={(e) => setP({ bg: e.target.value })} placeholder="#ffffff (기본 흰색)" className={inputCls} />
                    </div>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[10px] text-muted/50">제목·닫기 표시 (chrome)</span>
                    <Toggle value={p.chrome !== false} onChange={(v) => setP({ chrome: v })} />
                  </label>
                  {p.chrome === false && (
                    <p className="text-muted/40 text-[10px] leading-relaxed">
                      몰입형 — 제목바·하단 닫기 버튼을 숨기고 우상단 플로팅 ✕만 표시, 여백 0(iframe이 카드에 꽉 참).
                    </p>
                  )}
                  <label className="block">
                    <span className="text-[10px] text-muted/50 block mb-1">내부 여백 (선택)</span>
                    <input type="text" value={p.padding ?? ''} onChange={(e) => setP({ padding: e.target.value })} placeholder="예: 0, 24px" className={inputCls} />
                  </label>
                  {(mode === 'url' || mode === 'html') && (
                    <p className="text-muted/50 text-[10px] leading-relaxed">
                      {mode === 'url'
                        ? '일부 사이트는 보안설정(X-Frame-Options)으로 삽입이 차단될 수 있어요. 그 경우 팝업 안 ‘새 탭에서 열기’ 버튼으로 열립니다.'
                        : 'HTML은 샌드박스(iframe)로 격리 렌더돼 페이지 스타일/스크립트에 영향을 주지 않아요.'}
                    </p>
                  )}
                  <p className="text-muted/40 text-[10px] leading-relaxed">
                    비운 항목은 씬 기본 팝업 설정 → 하드 기본값 순으로 적용돼요. (Environment → 팝업 기본값)
                  </p>
                </div>
              </div>
            );
          }
          if (newAction === 'reset_camera') {
            return <p className="text-muted/60 text-[10px] py-1">값이 필요 없습니다 — 클릭 시 카메라가 초기 시점으로 복귀합니다.</p>;
          }
          if (newAction === 'animate_object') {
            // value = "대상objectId|클립이름" — 대상 오브젝트 + 그 GLB의 클립 2단 선택
            const sep = newValue.indexOf('|');
            const targetId = sep >= 0 ? newValue.slice(0, sep) : newValue;
            const clip = sep >= 0 ? newValue.slice(sep + 1) : '';
            const targetOpts = objects.filter((o) => o.id !== obj?.id).map((o) => ({ value: o.id, label: o.name }));
            const targetObj = objects.find((o) => o.id === targetId);
            const targetGlbUrl = targetObj?.assetId ? assets.find((a) => a.id === targetObj.assetId)?.dracoUrl : null;
            return (
              <div className="space-y-1.5">
                <SelectBox value={targetId} onChange={(id) => setNewValue(`${id}|${clip}`)} options={targetOpts} placeholder="대상 오브젝트 선택..." />
                {targetId && (targetGlbUrl
                  ? <GlbClipPicker url={targetGlbUrl} value={clip} onChange={(c) => setNewValue(`${targetId}|${c}`)} />
                  : <p className="text-muted/60 text-[10px] py-1">이 오브젝트엔 애니메이션(GLB)이 없습니다.</p>
                )}
              </div>
            );
          }
          if (newAction === 'move_object') {
            // value = "대상objectId|dx,dy,dz|초" — 원래 저장 위치 기준 오프셋 + 이동 시간
            const [tid = '', offsetStr = '', durStr = ''] = newValue.split('|');
            const nums = offsetStr.split(',').map((s) => parseFloat(s));
            const off = {
              x: Number.isFinite(nums[0]) ? nums[0] : 0,
              y: Number.isFinite(nums[1]) ? nums[1] : 0,
              z: Number.isFinite(nums[2]) ? nums[2] : 0,
            };
            const durParsed = parseFloat(durStr);
            const dur = Number.isFinite(durParsed) ? durParsed : 1;
            const compose = (id: string, o: { x: number; y: number; z: number }, d: number) =>
              `${id}|${o.x},${o.y},${o.z}|${d}`;
            // 자기 자신도 대상 가능 (클릭하면 스스로 움직이는 문/플랫폼 등)
            const targetOpts = objects.map((o) => ({ value: o.id, label: o.id === obj?.id ? `${o.name} (자신)` : o.name }));
            return (
              <div className="space-y-1.5">
                <SelectBox value={tid} onChange={(id) => setNewValue(compose(id, off, dur))} options={targetOpts} placeholder="대상 오브젝트 선택..." />
                {tid && (
                  <>
                    <XYZRow label="이동량" x={off.x} y={off.y} z={off.z}
                      onChangeX={(v) => setNewValue(compose(tid, { ...off, x: v }, dur))}
                      onChangeY={(v) => setNewValue(compose(tid, { ...off, y: v }, dur))}
                      onChangeZ={(v) => setNewValue(compose(tid, { ...off, z: v }, dur))}
                      onCommit={() => {}} dragStep={0.1}
                    />
                    <LabeledNum label="이동 시간(초)" value={dur}
                      onChange={(v) => setNewValue(compose(tid, off, Math.max(0, v)))}
                      onCommit={() => {}}
                      min={0} max={30} precision={1} dragStep={0.05}
                    />
                    <p className="text-muted/50 text-[10px]">
                      누적이 아니라 항상 원래 위치 기준으로 이동합니다. (0,0,0) 이벤트를 하나 더 만들면 제자리로 돌아옵니다.
                    </p>
                  </>
                )}
              </div>
            );
          }
          if (newAction === 'play_sound') {
            return (
              <>
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="https://... (mp3/wav/ogg)"
                  className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => e.key === 'Enter' && addEvent()}
                />
                <p className="text-muted/50 text-[10px] mt-1">트리거 발동 시 오디오를 재생합니다. ▶ 버튼으로 미리 들을 수 있습니다.</p>
              </>
            );
          }
          if (newAction === 'go_to_scene') {
            const opts = sceneList.filter((s) => s.id !== sceneId).map((s) => ({ value: s.id, label: s.name }));
            return opts.length > 0 ? (
              <SelectBox value={newValue} onChange={setNewValue} options={opts} placeholder="이동할 씬 선택..." />
            ) : (
              <p className="text-muted/60 text-[10px] py-1">이동할 다른 씬이 없습니다. 먼저 씬을 추가하세요.</p>
            );
          }
          if (OBJECT_TARGET_ACTIONS.has(newAction)) {
            // 씬의 모든 오브젝트를 대상으로 — 자기 자신 포함(클릭→자기 포커스/숨김 등이 흔한 케이스)
            const opts = objects.map((o) => ({
              value: o.id,
              label: o.id === obj?.id ? `${o.name} (이 오브젝트)` : o.name,
            }));
            const isDoorAction = newAction === 'set_passable' || newAction === 'set_solid' || newAction === 'toggle_collision';
            return opts.length > 0 ? (
              <div className="space-y-1.5">
                <SelectBox value={newValue} onChange={setNewValue} options={opts} placeholder="대상 오브젝트 선택..." />
                {isDoorAction && (
                  <p className="text-muted/50 text-[10px]">
                    대상의 <b>콜라이더만</b> 켜고/끕니다(모습은 그대로). 플레이 모드에서 통과 가능/불가가 바뀌어요 —
                    문·차단봉 등에 씁니다. 애니메이션(문 열림)은 별도 이벤트로 함께 거세요. 탐색 모드엔 영향 없음.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted/60 text-[10px] py-1">대상으로 지정할 오브젝트가 없습니다.</p>
            );
          }
          const glbUrl = newAction === 'play_animation' && obj?.assetId
            ? assets.find((a) => a.id === obj.assetId)?.dracoUrl
            : null;
          return glbUrl ? (
            <GlbClipPicker url={glbUrl} value={newValue} onChange={setNewValue} />
          ) : (
            <>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={newAction === 'open_url' ? 'https://...'
                  : newAction === 'emit_event' ? 'my_event_name'
                  : newAction === 'play_animation' ? 'Armature|Walk'
                  : '텍스트 또는 이미지/영상/YouTube URL'}
                className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === 'Enter' && addEvent()}
              />
              {newAction === 'play_animation' && (
                <p className="text-muted/50 text-[10px] mt-1">GLB 오브젝트를 선택하면 클립 목록이 자동으로 표시됩니다.</p>
              )}
            </>
          );
        })()}
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={addEvent}
          className="flex-1 py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white  text-[11px] font-semibold transition-colors"
        >
          {editingId ? '저장' : '추가'}
        </button>
        <button
          onClick={cancelEventForm}
          className="flex-1 py-1.5 rounded-xs bg-background hover:bg-surface text-foreground  text-[11px] transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );


  return (
    <aside className="flex flex-col bg-surface border-l border-border overflow-hidden relative h-full">
      {/* 이벤트 프리뷰 팝업 오버레이 */}
      {previewPopup !== null && (() => {
        // 뷰어와 동일 병합(이벤트 config > 씬 defaultPopup)으로 모드/크기/배경을 미리보기.
        // 위치 프리셋은 에디터에선 중앙 고정으로 보여주고(실제 위치는 뷰어), 모드(iframe/html)는 실제로 렌더한다.
        const c = previewPopup.config;
        const d = environment.defaultPopup;
        const mode = c?.mode ?? 'auto';
        const isFrame = mode === 'url' || mode === 'html';
        const width = c?.width ?? d?.width;
        const height = c?.height ?? d?.height;
        const bg = c?.bg ?? d?.bg;
        const posNote = c?.position && c.position !== 'center'
          ? ` · 뷰어에선 ${({ bottom: '하단', left: '왼쪽', right: '오른쪽' } as Record<string, string>)[c.position]} 배치`
          : '';
        const cardStyle = isFrame
          ? { width: width || 'min(80vw, 720px)', height: height || 'min(70vh, 520px)', background: bg }
          : { width: width || undefined, background: bg };
        return (
          <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreviewPopup(null)}>
            <div
              className={`bg-white border border-border rounded-2xl shadow-2xl ${isFrame ? 'flex flex-col p-4 max-w-[92vw] max-h-[88vh]' : 'p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto'}`}
              style={cardStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] text-muted/60 mb-2 font-semibold tracking-wide shrink-0">팝업 미리보기{posNote}</p>
              {isFrame ? (
                <div className="flex-1 min-h-0"><PopupFrame value={previewPopup.content} config={c} /></div>
              ) : (
                <RichContent value={previewPopup.content} onLight />
              )}
              <button
                onClick={() => setPreviewPopup(null)}
                className="mt-3 shrink-0 w-full py-1.5 rounded-xs bg-primary text-white  text-[11px] font-semibold hover:bg-primary/80 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        );
      })()}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
        <span className=" text-[11px] font-semibold text-foreground tracking-wide flex-1">{obj.isGroup ? 'Inspector — 그룹' : 'Inspector'}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 이름 */}
        <div className="px-3 py-2">
          <input
            value={obj.name}
            onChange={(e) => updateObject(obj.id, { name: e.target.value })}
            onBlur={pushHistory}
            className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          />
        </div>

        {/* Prefab — 원본 정의화 / 인스턴스 동기화 */}
        {(() => {
          const prefabDef = obj.prefabId ? prefabs.find((p) => p.id === obj.prefabId) : undefined;
          const isInstance = !!obj.prefabInstanceId && !!prefabDef;
          const canCreate = !isInstance && !obj.parentId; // 루트 오브젝트/그룹만 프리팹화
          if (!isInstance && !canCreate) return null;

          const instanceRoot = isInstance
            ? objects.find((o) => o.prefabInstanceId === obj.prefabInstanceId && o.prefabNodeKey === prefabDef!.rootKey)
            : undefined;
          const overrides = isInstance
            ? [...new Set(
                objects
                  .filter((o) => o.prefabInstanceId === obj.prefabInstanceId)
                  .flatMap((o) => o.prefabOverrides ?? []),
              )]
            : [];
          const instanceCount = prefabDef
            ? new Set(objects.filter((o) => o.prefabId === prefabDef.id).map((o) => o.prefabInstanceId)).size
            : 0;

          return (
            <GroupBox>
              <SectionHeader title="Prefab" icon="◇" hint="여러 오브젝트를 재사용 가능한 원본으로 묶어요. 원본을 고치면 모든 인스턴스가 함께 바뀌고(동기화), 인스턴스별로 값을 바꾸면 그 항목만 원본을 안 따릅니다(override)." />
              <div className="px-3 pb-4 space-y-2">
                {!isInstance && canCreate && (
                  <>
                    <button
                      onClick={() => { createPrefab(); addToast('프리팹으로 만들었어요', 'success'); }}
                      className="w-full py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
                    >
                      ◇ 프리팹으로 만들기
                    </button>
                    <p className="text-[10px] text-muted/50">이 오브젝트{obj.isGroup ? '(그룹)' : ''}를 원본으로 등록합니다. 이후 복제한 인스턴스는 원본 수정 시 함께 바뀌어요.</p>
                  </>
                )}
                {isInstance && instanceRoot && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-primary font-semibold flex-1 truncate">◇ {prefabDef!.name}</span>
                      <span className="text-[10px] text-muted shrink-0">인스턴스 {instanceCount}개</span>
                    </div>
                    {overrides.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-muted">이 인스턴스에서 원본과 다른 항목:</p>
                        <div className="flex flex-wrap gap-1">
                          {overrides.map((g) => (
                            <button
                              key={g}
                              onClick={() => { revertInstance(instanceRoot.id, g); addToast(`'${OVERRIDE_LABELS[g]}' 원본으로 되돌림`, 'success'); }}
                              title="클릭하면 이 항목만 원본으로 되돌립니다"
                              className="px-1.5 py-0.5 rounded-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] hover:bg-amber-500/25 transition-colors cursor-pointer"
                            >
                              {OVERRIDE_LABELS[g]} ✕
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted/50">원본과 동일한 인스턴스입니다.</p>
                    )}
                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                      <button
                        onClick={() => { applyInstanceToPrefab(instanceRoot.id); addToast('원본에 반영했어요 (다른 인스턴스도 갱신)', 'success'); }}
                        title="이 인스턴스의 현재 상태를 원본에 반영 → 다른 인스턴스도 갱신됩니다(각자 override는 유지)"
                        className="py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
                      >
                        원본에 반영
                      </button>
                      <button
                        onClick={() => { revertInstance(instanceRoot.id); addToast('원본으로 되돌렸어요', 'success'); }}
                        disabled={overrides.length === 0}
                        title="이 인스턴스의 모든 override를 버리고 원본 값으로 되돌립니다"
                        className="py-1.5 rounded-xs border border-border text-muted hover:border-primary/60 hover:text-primary text-[11px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        원본으로 되돌리기
                      </button>
                    </div>
                    <p className="text-[10px] text-muted/50">위치/회전/크기는 항상 인스턴스별로 유지돼요(동기화 대상 아님).</p>
                  </>
                )}
              </div>
            </GroupBox>
          );
        })()}

        {/* Transform */}
        <GroupBox>
          <SectionHeader title="Transform" hint="위치·회전·크기. 기즈모 회전 중 Shift를 누르면 15°씩 스냅돼요. GLB는 추가 시 밑면이 바닥에 자동 정렬되고, '바닥에 놓기'로 다시 맞출 수 있어요." isOpen={isOpen('transform')} onToggle={() => toggleSection('transform')} />
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
              {/* GLB 밑면을 바닥에 정렬 — 모델 원점이 발밑이 아니어서 바닥에 파묻히는 경우 교정 */}
              {glbUrlForSnap && !obj.parentId && (
                <button
                  onClick={snapToGround}
                  disabled={!canSnapToGround}
                  title={canSnapToGround ? '모델 밑면을 바닥(y=0)에 맞춤' : '모델 로딩 후 사용할 수 있습니다'}
                  className="w-full mt-1 py-1.5 rounded-xs border border-border text-muted hover:border-primary/60 hover:text-primary hover:bg-primary/5 text-[11px] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted disabled:hover:bg-transparent"
                >
                  ⤓ 바닥에 놓기
                </button>
              )}
            </div>
          )}
        </GroupBox>

        {/* Array — 일정 간격 반복 복제 (울타리·기둥·계단 등) */}
        <GroupBox>
          <SectionHeader title="Array" hint="선택한 오브젝트를 일정 간격으로 여러 개 복제해요. 울타리·기둥·계단처럼 반복 배치에 씁니다. 개수는 원본 포함, 간격은 복제 사이 거리(단위: m)." isOpen={isOpen('array')} onToggle={() => toggleSection('array')} />
            <div className="px-3 pb-4 space-y-2">
              <LabeledNum label="개수 (원본 포함)" value={arrayCount} onChange={(v) => setArrayCount(Math.max(2, Math.min(100, Math.round(v))))} onCommit={() => {}} min={2} max={100} precision={0} dragStep={1} />
              <XYZRow label="간격 (m)" x={arrayOffset.x} y={arrayOffset.y} z={arrayOffset.z}
                onChangeX={(v) => setArrayOffset((o) => ({ ...o, x: v }))}
                onChangeY={(v) => setArrayOffset((o) => ({ ...o, y: v }))}
                onChangeZ={(v) => setArrayOffset((o) => ({ ...o, z: v }))}
                onCommit={() => {}} dragStep={0.5}
              />
              <button
                onClick={() => {
                  arraySelected(arrayCount, arrayOffset);
                  addToast(`${arrayCount - 1}개 복제 생성`, 'success');
                }}
                className="w-full py-1.5 rounded-xs bg-primary hover:bg-primary/80 text-white text-[11px] font-semibold transition-colors"
              >
                ⊞ 배열 생성 ({arrayCount}개)
              </button>
              <p className="text-[10px] text-muted/50">현재 위치에서 간격만큼 떨어뜨려 {arrayCount - 1}개를 추가합니다. 되돌리기(Ctrl+Z) 가능.</p>
            </div>
        </GroupBox>

        {/* Content (content 오브젝트만) */}
        {obj.content && (
          <GroupBox>
            <SectionHeader title="Content" hint="텍스트·이미지·영상 콘텐츠. URL을 넣으면 이미지/유튜브 등 리치 콘텐츠로 표시돼요." isOpen={isOpen('content')} onToggle={() => toggleSection('content')} />
            {isOpen('content') && <div className="px-3 pb-4 space-y-1">
              {obj.content.type === 'text' && (
                <>
                  <div>
                    {/* <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">텍스트</span> */}
                    <textarea
                      value={obj.content.text ?? ''}
                      onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, text: e.target.value } })}
                      onBlur={pushHistory}
                      rows={2}
                      className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>
                  <div className='flex gap-2'>
                    <div>
                      <LabeledNum
                        label="Size"
                        value={obj.content.fontSize ?? 0.5}
                        onChange={(v) => updateObject(obj.id, { content: { ...obj.content!, fontSize: v } })}
                        onCommit={pushHistory}
                        min={0.1} max={3} precision={1} dragStep={0.05}
                      />
                    </div>
                    <div>
                      <LabeledNum
                        label="Thickness"
                        value={obj.content.depth ?? 0.1}
                        onChange={(v) => updateObject(obj.id, { content: { ...obj.content!, depth: v } })}
                        onCommit={pushHistory}
                        min={0} max={1} precision={2} dragStep={0.01}
                      />
                    </div>
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
                    className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-white placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>}
          </GroupBox>
        )}

        {/* Material (프리미티브 + 텍스트 콘텐츠 오브젝트) — 그룹/GLB/파티클/이미지·영상 콘텐츠는 제외 */}
        {!obj.assetId && !obj.particle && (!obj.content || obj.content.type === 'text') && (
          <GroupBox>
            <SectionHeader title="Material" hint="색상·자체발광·거칠기·금속성. 프리미티브(박스/구체/원기둥 등)와 텍스트 콘텐츠에 적용돼요." isOpen={isOpen('material')} onToggle={() => toggleSection('material')} />
            {isOpen('material') && (
              <div className="px-3 pb-4 space-y-2">
                <div className='flex gap-2'>
                  <div className='flex-1'>
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
                      className="w-full px-2.5 py-1.5  text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className='flex-1'>
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
                      className="w-full px-2.5 py-1.5 text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className='flex gap-2'>
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
                </div>
              </div>
            )}
          </GroupBox>
        )}

        {/* Particle (파티클 이미터만) */}
        {obj.particle && (
          <GroupBox>
            <SectionHeader title="Particle" hint="눈·불꽃 같은 파티클 프리셋. 분위기 연출용이에요." isOpen={isOpen('particle')} onToggle={() => toggleSection('particle')} />
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
                    className="flex-1 px-2.5 py-1.5  text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
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

        

        {/* Visibility */}
        <GroupBox>
        <SectionHeader title="Visibility" hint="표시/숨김·잠금. 숨김은 뷰어에도 반영되고, 잠금은 뷰포트에서 선택·이동을 막아요(계층 리스트에선 선택 가능)." isOpen={isOpen('visibility')} onToggle={() => toggleSection('visibility')} />
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
            <SectionHeader title="Light" hint="포인트/스팟/방향 광원. 색·강도·거리·감쇠 등을 조절해요." isOpen={isOpen('light')} onToggle={() => toggleSection('light')} />
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
                      className="flex-1 px-2.5 py-1.5  text-[11px] text-foreground  focus:outline-none focus:ring-1 focus:ring-primary"
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

        {/* Physics — 그룹 제외(그룹 자체 physics는 플레이에서 무시됨, 자식별로 처리) */}
        {!obj.light && !obj.isGroup && (
        <GroupBox>
          <div className="relative">
          <SectionHeader title="Physics" hint="플레이 모드 충돌. 켜면 캐릭터가 부딪혀요. Is Sensor를 켜면 통과 가능한 투명 트리거 영역이 되어 area 이벤트에 씁니다." isOpen={isOpen('physics')} onToggle={() => toggleSection('physics')} />
          {isOpen('physics') &&<label className="flex items-center justify-between cursor-pointer absolute top-3 right-4">
            {/* <span className="text-[10px] font-semibold text-muted/50">Enable Physics</span> */}
            <Toggle
              value={obj.physics.enabled}
              onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, enabled: v } }); pushHistory(); }}
            />
          </label>
          }
          {isOpen('physics') && obj.physics.enabled && (
            <div className='px-3 pb-3 space-y-1'>
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
              <div className='flex gap-2'>
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
              </div>
            </div>
          )}
        
        </div>

          </GroupBox>)}

        {/* Motion — 앰비언트 애니메이션 (라이트 제외: GLB·프리미티브·콘텐츠·그룹) */}
        {!obj.light && (
          <GroupBox>
          <SectionHeader title="Motion" hint="뷰어에서 항상 실행되는 앰비언트 애니메이션. 둥실/회전/펄스/궤도/유동(정해진 영역 안을 열기구처럼 자유 이동). 기본은 시각 전용이고, '콜라이더 동반'을 켜면 플레이 모드에서 실제 이동 장애물이 돼요." />
          <div className="px-3 pb-4 space-y-2">
            {(() => {
              const m = obj.motion;
              const type = m?.type ?? 'none';
              const setM = (patch: Partial<NonNullable<ObjectNodeSchema['motion']>>) =>
                updateObject(obj.id, { motion: { ...(obj.motion ?? { type: 'float' }), ...patch } });
              return (
                <>
                  <SelectBox
                    value={type}
                    onChange={(v) => {
                      if (v === 'none') updateObject(obj.id, { motion: undefined });
                      else setM({ type: v as NonNullable<ObjectNodeSchema['motion']>['type'] });
                      pushHistory();
                    }}
                    options={[
                      { value: 'none', label: '없음' },
                      { value: 'float', label: '둥실 (위아래)' },
                      { value: 'spin', label: '회전 (제자리)' },
                      { value: 'pulse', label: '펄스 (커졌다 작아짐)' },
                      { value: 'orbit', label: '궤도 (원)' },
                      { value: 'wander', label: '유동 (영역 내 자유·열기구)' },
                    ]}
                  />
                  {type !== 'none' && (
                    <div className="grid grid-cols-2 gap-2">
                      <LabeledNum label="속도" value={m?.speed ?? 1} onChange={(v) => setM({ speed: v })} onCommit={pushHistory} min={0.1} max={5} precision={2} dragStep={0.1} />
                      {(type === 'float' || type === 'pulse') && (
                        <LabeledNum label="진폭" value={m?.amplitude ?? (type === 'float' ? 0.5 : 0.2)} onChange={(v) => setM({ amplitude: v })} onCommit={pushHistory} min={0} max={5} precision={2} dragStep={0.05} />
                      )}
                      {(type === 'orbit' || type === 'wander') && (
                        <LabeledNum label="반경" value={m?.radius ?? (type === 'orbit' ? 2 : 3)} onChange={(v) => setM({ radius: v })} onCommit={pushHistory} min={0.5} max={50} precision={1} dragStep={0.5} />
                      )}
                      {type === 'spin' && (
                        <div>
                          <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">회전축</span>
                          <SelectBox
                            value={m?.axis ?? 'y'}
                            onChange={(v) => { setM({ axis: v as 'x' | 'y' | 'z' }); pushHistory(); }}
                            options={[{ value: 'y', label: 'Y (세로)' }, { value: 'x', label: 'X (앞뒤)' }, { value: 'z', label: 'Z (좌우)' }]}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {type !== 'none' && type !== 'pulse' && (
                    <label className="flex items-center gap-2 text-[10px] text-muted/70 pt-0.5">
                      <Toggle value={m?.collider === true} onChange={(v) => { setM({ collider: v }); pushHistory(); }} />
                      <span>{obj.isGroup ? '플레이 모드에서 그룹 전체가 이동 장애물' : '플레이 모드에서 콜라이더도 이동(진짜 장애물)'}</span>
                    </label>
                  )}
                  {type !== 'none' && (
                    <p className="text-[10px] text-muted/50">
                      에디터엔 정적, 실제 움직임은 뷰어에서 확인. <b>콜라이더 동반 OFF = 통과 가능한 장식</b>, ON = 플레이 중 부딪히는 이동 장애물(캐릭터가 올라타 실려가진 않음).
                    </p>
                  )}
                </>
              );
            })()}
          </div>
          </GroupBox>
        )}

        {/* Animation — GLB 내장 클립을 트리거 없이 자동 재생(idle/앰비언트). GLB 오브젝트 전용 */}
        {!obj.isGroup && obj.assetId && (() => {
          const glbUrl = assets.find((a) => a.id === obj.assetId)?.dracoUrl;
          if (!glbUrl) return null;
          return (
            <GroupBox>
              <SectionHeader title="Animation" hint="GLB에 내장된 애니메이션 클립 중 하나를 트리거 없이 씬 로드 시 자동 루프 재생해요(돌아가는 선풍기·펄럭이는 깃발·idle 캐릭터 등). 클릭/호버/영역 이벤트 애니메이션이 실행되면 그쪽으로 덮입니다(뷰어 전용)." isOpen={isOpen('animation')} onToggle={() => toggleSection('animation')} />
              {isOpen('animation') && (
                <div className="px-3 pb-4 space-y-1.5">
                  <span className="text-[10px] text-muted/50 block font-semibold tracking-wide">기본 클립</span>
                  <GlbClipPicker
                    url={glbUrl}
                    value={obj.defaultClip ?? ''}
                    onChange={(c) => { updateObject(obj.id, { defaultClip: c || undefined }); pushHistory(); }}
                  />
                  {obj.defaultClip && (
                    <button
                      onClick={() => { updateObject(obj.id, { defaultClip: undefined }); pushHistory(); }}
                      className="text-[10px] text-muted/60 hover:text-danger transition-colors"
                    >
                      기본 애니메이션 해제
                    </button>
                  )}
                  <p className="text-[10px] text-muted/50">
                    에디터엔 정적, 실제 재생은 뷰어에서 확인. 한 번 재생 후 idle 복귀는 없어요.
                  </p>
                </div>
              )}
            </GroupBox>
          );
        })()}

        {/* Events — 그룹 제외(그룹 자체는 클릭/트리거 타깃이 아님. 이벤트는 개별 오브젝트에) */}
        {!obj.isGroup && (
        <GroupBox>
        <SectionHeader title="Events" hint="트리거(클릭·호버·근접 E·영역 진입)에 따라 동작(팝업·URL·씬 이동·애니메이션·이동·사운드 등)을 실행해요. 다가가면 뜨는 '대화 말풍선'도 여기서 설정합니다." isOpen={isOpen('events')} onToggle={() => toggleSection('events')} />
        {isOpen('events') && (
          <div className="px-3 pb-4 space-y-2">
            {/* 상호작용 근접 범위 오버라이드 — 비우면 씬 기본값 사용 (interact(E)/approach·E 프롬프트·하이라이트) */}
            <div className="space-y-1">
              <span className="text-[10px] text-muted/50 block font-semibold tracking-wide">상호작용 범위 (m)</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={0.5} max={20} step={0.5}
                  value={obj.interactRange ?? ''}
                  placeholder={`씬 기본 (${environment.interactRange ?? 3})`}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updateObject(obj.id, { interactRange: v === '' ? undefined : Math.max(0.5, parseFloat(v)) });
                  }}
                  onBlur={pushHistory}
                  className="flex-1 bg-surface border border-border rounded-xs px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted/40 focus:border-primary/50 outline-none"
                />
                {obj.interactRange != null && (
                  <button
                    onClick={() => { updateObject(obj.id, { interactRange: undefined }); pushHistory(); }}
                    className="text-[10px] text-muted/60 hover:text-danger transition-colors px-1.5 py-1 shrink-0"
                  >
                    기본값
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted/50">이 오브젝트의 E/approach 발동 거리. 비우면 씬 기본값을 씁니다.</p>
            </div>

            {/* 대화(말풍선) — 플레이 모드에서 오브젝트 위에 뜨는 순차 문장 */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted/50 block font-semibold tracking-wide">대화 말풍선</span>
              <textarea
                value={dlg.lines.join('\n')}
                onChange={(e) => setDlg({ lines: e.target.value.split('\n') })}
                onBlur={pushHistory}
                rows={3}
                placeholder={'한 줄에 문장 하나 (순서대로 표시)\n예: 안녕하세요!\n무엇을 도와드릴까요?'}
                className="w-full bg-surface border border-border rounded-xs px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted/40 focus:border-primary/50 outline-none resize-y leading-relaxed"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">표시 시점</span>
                  <SelectBox
                    value={dlg.show}
                    onChange={(v) => { setDlg({ show: v as DialogueConfig['show'] }); pushHistory(); }}
                    options={[
                      { value: 'always', label: '항상' },
                      { value: 'approach', label: '다가가면' },
                      { value: 'interact', label: 'E키로 열기' },
                    ]}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted/50 block mb-1 font-semibold tracking-wide">넘기기</span>
                  <SelectBox
                    value={dlg.advance}
                    onChange={(v) => { setDlg({ advance: v as DialogueConfig['advance'] }); pushHistory(); }}
                    options={[
                      { value: 'auto', label: '자동(타이머)' },
                      { value: 'manual', label: 'E키로 넘김' },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {dlg.advance === 'auto' && (
                  <label className="flex items-center gap-1.5 text-[10px] text-muted/70">
                    <span className="shrink-0">간격(초)</span>
                    <input
                      type="number" min={0.5} step={0.5}
                      value={dlg.autoSec ?? 2.5}
                      onChange={(e) => setDlg({ autoSec: parseFloat(e.target.value) || 2.5 })}
                      onBlur={pushHistory}
                      className="w-full bg-surface border border-border rounded-xs px-1.5 py-1 text-[11px] text-foreground outline-none focus:border-primary/50"
                    />
                  </label>
                )}
                <label className="flex items-center gap-1.5 text-[10px] text-muted/70">
                  <span className="shrink-0">화자</span>
                  <input
                    value={dlg.speaker ?? ''}
                    onChange={(e) => setDlg({ speaker: e.target.value })}
                    onBlur={pushHistory}
                    placeholder="이름(선택)"
                    className="w-full bg-surface border border-border rounded-xs px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted/40 outline-none focus:border-primary/50"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-[10px] text-muted/70 pt-0.5">
                <Toggle value={dlg.typing !== false} onChange={(v) => { setDlg({ typing: v }); pushHistory(); }} />
                <span>타이핑 효과</span>
              </label>
              <label className="flex items-center gap-2 text-[10px] text-muted/70">
                <Toggle value={dlg.once === true} onChange={(v) => { setDlg({ once: v }); pushHistory(); }} />
                <span>1회성 (한 번 다 보면 이 세션 동안 다시 안 뜸)</span>
              </label>
              {obj.events.some((e) => e.trigger === 'dialogue_end') && (
                <label className="flex items-center gap-1.5 text-[10px] text-muted/70">
                  <span className="shrink-0">종료 버튼</span>
                  <input
                    value={dlg.endButtonLabel ?? ''}
                    onChange={(e) => setDlg({ endButtonLabel: e.target.value })}
                    onBlur={pushHistory}
                    placeholder="확인 (기본)"
                    className="w-full bg-surface border border-border rounded-xs px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted/40 outline-none focus:border-primary/50"
                  />
                </label>
              )}
              <p className="text-muted/50 text-[10px]">
                플레이 모드 전용 · 오브젝트 바로 위 표시. 비워두면 안 뜸. 여러 문장이면 순서대로.
              </p>
            </div>

            <div className="h-px bg-border/60 my-1" />

            {obj.events.length === 0 && !showAddEvent && (
              <p className="text-muted/60  text-[11px] py-1">이벤트 없음</p>
            )}

            {obj.events.map((ev) => (
              editingId === ev.id ? (
              /* 수정 중 — 이 항목 자리에 폼을 인라인으로 표시 */
              <div key={ev.id}>{renderEventForm()}</div>
              ) : (
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
                        else if (ev.action === 'show_popup') setPreviewPopup({ content: ev.value || '(내용 없음)', config: ev.popup });
                        else if (ev.action === 'emit_event') addToast(`이벤트 발송 테스트: "${ev.value}"`, 'success');
                        else if (ev.action === 'play_animation') addToast(`애니메이션 클립: "${ev.value}"`, 'info');
                        else if (ev.action === 'go_to_scene') addToast(`씬 이동: "${sceneName(ev.value)}" (플레이/뷰어에서 동작)`, 'info');
                        else if (OBJECT_TARGET_ACTIONS.has(ev.action)) addToast(`${ACTION_LABELS[ev.action]}: "${objectName(ev.value)}" (뷰어에서 동작)`, 'info');
                        else if (ev.action === 'reset_camera') addToast('카메라 초기화 (탐색 모드 뷰어에서 동작)', 'info');
                        else if (ev.action === 'animate_object') { const [tid, clip] = ev.value.split('|'); addToast(`애니메이션: "${objectName(tid)}" → "${clip ?? ''}" (뷰어에서 동작)`, 'info'); }
                        else if (ev.action === 'move_object') { const [tid, off, dur] = ev.value.split('|'); addToast(`이동: "${objectName(tid)}" Δ(${off || '0,0,0'}) ${dur || '1'}초 (뷰어에서 동작)`, 'info'); }
                        else if (ev.action === 'play_sound' && ev.value) { new Audio(ev.value).play().catch(() => addToast('오디오 재생 실패 — URL을 확인하세요', 'error')); }
                      }}
                      title="미리보기"
                      className="text-muted/50 hover:text-primary text-[10px] w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                    >
                      ▶
                    </button>
                    <button
                      onClick={() => startEdit(ev)}
                      title="수정"
                      className="text-muted/50 hover:text-primary text-[10px] w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                    >
                      ✎
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
                  <p className="text-muted/60 text-[10px] mt-1.5 truncate  bg-background/50 rounded px-1.5 py-0.5">
                    {ev.action === 'go_to_scene' ? `→ ${sceneName(ev.value)}`
                      : ev.action === 'animate_object' ? `→ ${objectName(ev.value.split('|')[0])} : ${ev.value.split('|')[1] ?? ''}`
                      : ev.action === 'move_object' ? `→ ${objectName(ev.value.split('|')[0])} Δ(${ev.value.split('|')[1] ?? '0,0,0'}) ${ev.value.split('|')[2] ?? '1'}초`
                      : OBJECT_TARGET_ACTIONS.has(ev.action) ? `→ ${objectName(ev.value)}`
                      : ev.value}
                  </p>
                )}
              </div>
              )
            ))}

            {/* 수정 중이면 해당 항목 자리에 폼이 인라인으로 뜨므로 하단엔 아무것도 안 띄운다.
                신규 추가(showAddEvent)면 하단에 폼, 아니면 '이벤트 추가' 버튼. */}
            {editingId ? null : showAddEvent ? renderEventForm() : (
              <button
                onClick={() => { setEditingId(null); setNewValue(''); setShowAddEvent(true); }}
                className="w-full py-1.5 rounded-xs border border-dashed border-border text-muted hover:border-primary/60 hover:text-primary hover:bg-primary/5  text-[11px] transition-all cursor-pointer"
              >
                이벤트 추가
              </button>
            )}
          </div>
        )}
        </GroupBox>
        )}

        {/* 그룹 해제 안내 */}
        {obj.isGroup && (
          <div className="px-3 py-3">
            <p className="text-[11px] text-muted leading-relaxed">
              그룹 해제: <kbd className="bg-background border border-border rounded px-1 text-[10px]">Ctrl+Shift+G</kbd>
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
