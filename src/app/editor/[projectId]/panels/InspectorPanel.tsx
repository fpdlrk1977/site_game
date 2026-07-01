'use client';

import { useState, useEffect } from 'react';
import { MathUtils } from 'three';
import { useSceneStore } from '@/store/sceneStore';
import type { ObjectNodeSchema, ColliderType, EventSchema, ContentConfig, ParticlePreset } from '@/types/scene';

// ── 단일 숫자 입력 ─────────────────────────────────────────────
function NumInput({
  value,
  onChange,
  onCommit,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  const [local, setLocal] = useState(value.toFixed(3));

  useEffect(() => {
    setLocal(value.toFixed(3));
  }, [value]);

  return (
    <input
      type="number"
      step="0.01"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        const n = parseFloat(e.target.value);
        if (!isNaN(n)) onChange(n);
      }}
      onBlur={() => {
        const n = parseFloat(local);
        if (!isNaN(n)) onChange(n);
        onCommit();
      }}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-transparent transition-all tabular-nums"
    />
  );
}

// ── XYZ 행 ─────────────────────────────────────────────────────
function XYZRow({
  label,
  x, y, z,
  onChangeX, onChangeY, onChangeZ,
  onCommit,
}: {
  label: string;
  x: number; y: number; z: number;
  onChangeX: (v: number) => void;
  onChangeY: (v: number) => void;
  onChangeZ: (v: number) => void;
  onCommit: () => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {[
          { axis: 'X', val: x, change: onChangeX },
          { axis: 'Y', val: y, change: onChangeY },
          { axis: 'Z', val: z, change: onChangeZ },
        ].map(({ axis, val, change }) => (
          <div key={axis} className="relative">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-500 pointer-events-none">
              {axis}
            </span>
            <NumInput
              value={val}
              onChange={change}
              onCommit={onCommit}
            />
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
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 bg-zinc-900/40 select-none ${
        collapsible ? 'cursor-pointer hover:text-zinc-400 hover:bg-zinc-900/70 transition-colors' : ''
      }`}
    >
      {icon && <span className="text-[12px] opacity-60 font-normal not-italic">{icon}</span>}
      <span className="flex-1">{title}</span>
      {collapsible && (
        <span className="text-zinc-700 text-[10px]">{isOpen ? '▾' : '▸'}</span>
      )}
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${value ? 'bg-violet-600' : 'bg-zinc-700'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? 'left-4' : 'left-0.5'}`} />
    </div>
  );
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
  const { environment, updateEnvironment, pushHistory } = useSceneStore();
  const env = environment;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Sky */}
      <SectionHeader title="Sky" />
      <div className="px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={env.sky.value}
            onChange={(e) => updateEnvironment({ sky: { ...env.sky, value: e.target.value } })}
            onBlur={pushHistory}
            className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer p-0.5"
          />
          <input
            type="text"
            value={env.sky.value}
            onChange={(e) => updateEnvironment({ sky: { ...env.sky, value: e.target.value } })}
            onBlur={pushHistory}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Fog */}
      <SectionHeader title="Fog" />
      <div className="px-3 py-3 space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs text-zinc-400">Enable Fog</span>
          <Toggle
            value={env.fog.enabled}
            onChange={(v) => { updateEnvironment({ fog: { ...env.fog, enabled: v } }); pushHistory(); }}
          />
        </label>
        {env.fog.enabled && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 w-12">Color</span>
              <input
                type="color"
                value={env.fog.color}
                onChange={(e) => updateEnvironment({ fog: { ...env.fog, color: e.target.value } })}
                onBlur={pushHistory}
                className="w-8 h-7 rounded border border-zinc-700 bg-zinc-800 cursor-pointer p-0.5"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Near</span>
                <span className="text-[10px] text-zinc-500 tabular-nums">{env.fog.near}</span>
              </div>
              <input type="range" min="1" max="200" step="1" value={env.fog.near}
                onChange={(e) => updateEnvironment({ fog: { ...env.fog, near: parseFloat(e.target.value) } })}
                onMouseUp={pushHistory}
                className="w-full accent-violet-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Far</span>
                <span className="text-[10px] text-zinc-500 tabular-nums">{env.fog.far}</span>
              </div>
              <input type="range" min="10" max="500" step="5" value={env.fog.far}
                onChange={(e) => updateEnvironment({ fog: { ...env.fog, far: parseFloat(e.target.value) } })}
                onMouseUp={pushHistory}
                className="w-full accent-violet-500"
              />
            </div>
          </>
        )}
      </div>

      {/* Lights */}
      <SectionHeader title="Lights" />
      <div className="px-3 py-3 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Ambient</span>
            <span className="text-[10px] text-zinc-500 tabular-nums">{env.lights.ambientIntensity.toFixed(2)}</span>
          </div>
          <input type="range" min="0" max="3" step="0.05" value={env.lights.ambientIntensity}
            onChange={(e) => updateEnvironment({ lights: { ...env.lights, ambientIntensity: parseFloat(e.target.value) } })}
            onMouseUp={pushHistory}
            className="w-full accent-violet-500"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Directional</span>
            <span className="text-[10px] text-zinc-500 tabular-nums">{env.lights.directionalIntensity.toFixed(2)}</span>
          </div>
          <input type="range" min="0" max="5" step="0.1" value={env.lights.directionalIntensity}
            onChange={(e) => updateEnvironment({ lights: { ...env.lights, directionalIntensity: parseFloat(e.target.value) } })}
            onMouseUp={pushHistory}
            className="w-full accent-violet-500"
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
          onCommit={pushHistory}
        />
      </div>
    </div>
  );
}

// ── 메인 ───────────────────────────────────────────────────────
export function InspectorPanel() {
  const { objects, selectedId, selectedIds, updateObject, pushHistory, alignSelected } = useSceneStore();
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

  if (isMultiSelect) {
    return (
      <aside className="flex flex-col bg-zinc-950 border-l border-zinc-800 overflow-hidden">
        <div className="px-3 py-2 border-b border-zinc-800">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{selectedIds.length}개 선택됨</span>
        </div>
        <div className="px-3 py-4 space-y-3">
          <p className="text-[10px] text-zinc-500">Shift+클릭으로 오브젝트를 추가 선택하세요.</p>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis}>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{axis.toUpperCase()}축 정렬</p>
              <div className="grid grid-cols-3 gap-1">
                {(['min', 'center', 'max'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => alignSelected(axis, mode)}
                    className="py-1 rounded-lg text-[10px] bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                  >
                    {mode === 'min' ? '최소' : mode === 'center' ? '중앙' : '최대'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  if (!obj) {
    return (
      <aside className="flex flex-col bg-zinc-950 border-l border-zinc-800 overflow-hidden">
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">Environment</span>
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
      <aside className="flex flex-col bg-zinc-950 border-l border-zinc-800 overflow-hidden">
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">Inspector — 그룹</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 border-b border-zinc-800">
            <input value={obj.name} onChange={(e) => updateObject(obj.id, { name: e.target.value })} onBlur={pushHistory}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium"
            />
          </div>
          <SectionHeader title="Transform" />
          <div className="px-3 py-3 space-y-3">
            <XYZRow label="Position" x={obj.position.x} y={obj.position.y} z={obj.position.z}
              onChangeX={(v) => updateObject(obj.id, { position: { ...obj.position, x: v } })}
              onChangeY={(v) => updateObject(obj.id, { position: { ...obj.position, y: Math.max(0, v) } })}
              onChangeZ={(v) => updateObject(obj.id, { position: { ...obj.position, z: v } })}
              onCommit={pushHistory}
            />
            <XYZRow label="Rotation °" x={obj.rotation.x} y={obj.rotation.y} z={obj.rotation.z}
              onChangeX={(v) => updateObject(obj.id, { rotation: { ...obj.rotation, x: v } })}
              onChangeY={(v) => updateObject(obj.id, { rotation: { ...obj.rotation, y: v } })}
              onChangeZ={(v) => updateObject(obj.id, { rotation: { ...obj.rotation, z: v } })}
              onCommit={pushHistory}
            />
            <XYZRow label="Scale" x={obj.scale.x} y={obj.scale.y} z={obj.scale.z}
              onChangeX={(v) => updateObject(obj.id, { scale: { ...obj.scale, x: v } })}
              onChangeY={(v) => updateObject(obj.id, { scale: { ...obj.scale, y: v } })}
              onChangeZ={(v) => updateObject(obj.id, { scale: { ...obj.scale, z: v } })}
              onCommit={pushHistory}
            />
          </div>
          <SectionHeader title="Visibility" />
          <div className="px-3 py-3 space-y-2">
            {(['visible', 'locked'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-400 capitalize">{key === 'visible' ? 'Visible' : 'Locked'}</span>
                <Toggle value={obj[key]} onChange={() => { updateObject(obj.id, { [key]: !obj[key] }); pushHistory(); }} />
              </label>
            ))}
          </div>
          <div className="px-3 py-3">
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              그룹 해제: <kbd className="bg-zinc-800 border border-zinc-700 rounded px-1 text-[10px]">Ctrl+Shift+G</kbd>
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col bg-zinc-950 border-l border-zinc-800 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">Inspector</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 이름 */}
        <div className="px-3 py-2 border-b border-zinc-800">
          <input
            value={obj.name}
            onChange={(e) => updateObject(obj.id, { name: e.target.value })}
            onBlur={pushHistory}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium"
          />
        </div>

        {/* Transform */}
        <SectionHeader title="Transform" icon="⊹" isOpen={isOpen('transform')} onToggle={() => toggleSection('transform')} />
        {isOpen('transform') && (
          <div className="px-3 py-3 space-y-3">
            <XYZRow
              label="Position"
              x={obj.position.x} y={obj.position.y} z={obj.position.z}
              onChangeX={(v) => setPos('x', v)}
              onChangeY={(v) => setPos('y', v)}
              onChangeZ={(v) => setPos('z', v)}
              onCommit={pushHistory}
            />
            <XYZRow
              label="Rotation °"
              x={obj.rotation.x} y={obj.rotation.y} z={obj.rotation.z}
              onChangeX={(v) => setRot('x', v)}
              onChangeY={(v) => setRot('y', v)}
              onChangeZ={(v) => setRot('z', v)}
              onCommit={pushHistory}
            />
            <XYZRow
              label="Scale"
              x={obj.scale.x} y={obj.scale.y} z={obj.scale.z}
              onChangeX={(v) => setScl('x', v)}
              onChangeY={(v) => setScl('y', v)}
              onChangeZ={(v) => setScl('z', v)}
              onCommit={pushHistory}
            />
          </div>
        )}

        {/* Content (content 오브젝트만) */}
        {obj.content && (
          <>
            <SectionHeader title="Content" icon="🖼" isOpen={isOpen('content')} onToggle={() => toggleSection('content')} />
            {isOpen('content') && <div className="px-3 py-3 space-y-2.5">
              {obj.content.type === 'text' && (
                <>
                  <div>
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">텍스트</span>
                    <textarea
                      value={obj.content.text ?? ''}
                      onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, text: e.target.value } })}
                      onBlur={pushHistory}
                      rows={3}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">글자 크기</span>
                      <span className="text-[10px] text-zinc-500">{(obj.content.fontSize ?? 0.5).toFixed(1)}</span>
                    </div>
                    <input type="range" min="0.1" max="3" step="0.1"
                      value={obj.content.fontSize ?? 0.5}
                      onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, fontSize: parseFloat(e.target.value) } })}
                      onMouseUp={pushHistory}
                      className="w-full accent-violet-500"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">두께</span>
                      <span className="text-[10px] text-zinc-500">{(obj.content.depth ?? 0.1).toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01"
                      value={obj.content.depth ?? 0.1}
                      onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, depth: parseFloat(e.target.value) } })}
                      onMouseUp={pushHistory}
                      className="w-full accent-violet-500"
                    />
                  </div>
                </>
              )}
              {(obj.content.type === 'image' || obj.content.type === 'video') && (
                <div>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                    {obj.content.type === 'image' ? '이미지 URL' : '동영상 URL'}
                  </span>
                  <input
                    type="text"
                    value={obj.content.url ?? ''}
                    onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, url: e.target.value } })}
                    onBlur={pushHistory}
                    placeholder={obj.content.type === 'image' ? 'https://example.com/img.jpg' : 'https://www.youtube.com/...'}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              )}
            </div>}
          </>
        )}

        {/* Particle (파티클 이미터만) */}
        {obj.particle && (
          <>
            <SectionHeader title="Particle" icon="✨" isOpen={isOpen('particle')} onToggle={() => toggleSection('particle')} />
            {isOpen('particle') && <div className="px-3 py-3 space-y-2.5">
              <div>
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Preset</span>
                <select
                  value={obj.particle.preset}
                  onChange={(e) => { updateObject(obj.id, { particle: { ...obj.particle!, preset: e.target.value as ParticlePreset } }); pushHistory(); }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="fire">🔥 불꽃 (Fire)</option>
                  <option value="dust">💨 먼지 (Dust)</option>
                  <option value="light">✨ 빛 파티클 (Light)</option>
                  <option value="snow">❄️ 눈 (Snow)</option>
                </select>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">색상 오버라이드</span>
                <div className="flex items-center gap-2">
                  <input type="color"
                    value={obj.particle.color ?? '#ffffff'}
                    onChange={(e) => updateObject(obj.id, { particle: { ...obj.particle!, color: e.target.value } })}
                    onBlur={pushHistory}
                    className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer p-0.5"
                  />
                  <input type="text"
                    value={obj.particle.color ?? ''}
                    onChange={(e) => updateObject(obj.id, { particle: { ...obj.particle!, color: e.target.value } })}
                    onBlur={pushHistory}
                    placeholder="프리셋 기본값"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-zinc-600"
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
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</span>
                    <span className="text-[10px] text-zinc-500 tabular-nums">{(obj.particle![key] ?? '기본').toString()}</span>
                  </div>
                  <input type="range" min={min} max={max} step={step}
                    value={obj.particle![key] as number | undefined ?? (key === 'count' ? 80 : key === 'speed' ? 0.8 : key === 'spread' ? 1 : 0.08)}
                    onChange={(e) => updateObject(obj.id, { particle: { ...obj.particle!, [key]: parseFloat(e.target.value) } })}
                    onMouseUp={pushHistory}
                    className="w-full accent-violet-500"
                  />
                </div>
              ))}
            </div>}
          </>
        )}

        {/* Material (primitive + text content 오브젝트) */}
        {!obj.assetId && !obj.particle && (!obj.content || obj.content.type === 'text') && (
          <>
            <SectionHeader title="Material" icon="◉" isOpen={isOpen('material')} onToggle={() => toggleSection('material')} />
            {isOpen('material') && (
              <div className="px-3 py-3 space-y-2.5">
                <div>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={obj.material?.color ?? '#a78bfa'}
                      onChange={(e) => updateObject(obj.id, { material: { ...obj.material, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={obj.material?.color ?? '#a78bfa'}
                      onChange={(e) => updateObject(obj.id, { material: { ...obj.material, color: e.target.value } })}
                      onBlur={pushHistory}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Roughness</span>
                    <span className="text-[10px] text-zinc-500 tabular-nums">{(obj.material?.roughness ?? 0.5).toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01"
                    value={obj.material?.roughness ?? 0.5}
                    onChange={(e) => updateObject(obj.id, { material: { ...obj.material, roughness: parseFloat(e.target.value) } })}
                    onMouseUp={pushHistory}
                    className="w-full accent-violet-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Metalness</span>
                    <span className="text-[10px] text-zinc-500 tabular-nums">{(obj.material?.metalness ?? 0.1).toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01"
                    value={obj.material?.metalness ?? 0.1}
                    onChange={(e) => updateObject(obj.id, { material: { ...obj.material, metalness: parseFloat(e.target.value) } })}
                    onMouseUp={pushHistory}
                    className="w-full accent-violet-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Emissive</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={obj.material?.emissive ?? '#000000'}
                      onChange={(e) => updateObject(obj.id, { material: { ...obj.material, emissive: e.target.value } })}
                      onBlur={pushHistory}
                      className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={obj.material?.emissive ?? '#000000'}
                      onChange={(e) => updateObject(obj.id, { material: { ...obj.material, emissive: e.target.value } })}
                      onBlur={pushHistory}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Visibility */}
        <SectionHeader title="Visibility" icon="👁" isOpen={isOpen('visibility')} onToggle={() => toggleSection('visibility')} />
        {isOpen('visibility') && (
          <div className="px-3 py-3 space-y-2">
            {(['visible', 'locked'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-400 capitalize">{key === 'visible' ? 'Visible' : 'Locked'}</span>
                <Toggle
                  value={obj[key]}
                  onChange={() => { updateObject(obj.id, { [key]: !obj[key] }); pushHistory(); }}
                />
              </label>
            ))}
          </div>
        )}

        {/* Physics */}
        <SectionHeader title="Physics" icon="⬡" isOpen={isOpen('physics')} onToggle={() => toggleSection('physics')} />
        {isOpen('physics') && <div className="px-3 py-3 space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs text-zinc-400">Enable Physics</span>
            <Toggle
              value={obj.physics.enabled}
              onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, enabled: v } }); pushHistory(); }}
            />
          </label>
          {obj.physics.enabled && (
            <>
              <div>
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Collider Type</span>
                <select
                  value={obj.physics.colliderType}
                  onChange={(e) => { updateObject(obj.id, { physics: { ...obj.physics, colliderType: e.target.value as ColliderType } }); pushHistory(); }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
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
                  <span className="text-xs text-zinc-400">Is Sensor (Area)</span>
                  <p className="text-[10px] text-zinc-600 mt-0.5">진입 시 이벤트 발생</p>
                </div>
                <Toggle
                  value={obj.physics.isSensor}
                  onChange={(v) => { updateObject(obj.id, { physics: { ...obj.physics, isSensor: v } }); pushHistory(); }}
                />
              </label>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Friction</span>
                  <span className="text-[10px] text-zinc-500 tabular-nums">{obj.physics.friction.toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={obj.physics.friction}
                  onChange={(e) => updateObject(obj.id, { physics: { ...obj.physics, friction: parseFloat(e.target.value) } })}
                  onMouseUp={pushHistory}
                  className="w-full accent-violet-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Restitution</span>
                  <span className="text-[10px] text-zinc-500 tabular-nums">{obj.physics.restitution.toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={obj.physics.restitution}
                  onChange={(e) => updateObject(obj.id, { physics: { ...obj.physics, restitution: parseFloat(e.target.value) } })}
                  onMouseUp={pushHistory}
                  className="w-full accent-violet-500"
                />
              </div>
            </>
          )}
        </div>}

        {/* Events */}
        <SectionHeader title="Events" icon="⚡" isOpen={isOpen('events')} onToggle={() => toggleSection('events')} />
        {isOpen('events') && (
          <div className="px-3 py-3 space-y-2">
            {obj.events.length === 0 && !showAddEvent && (
              <p className="text-zinc-600 text-xs py-1">이벤트 없음</p>
            )}

            {obj.events.map((ev) => (
              <div key={ev.id} className="bg-zinc-900 border border-zinc-800/80 rounded-xl p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="bg-violet-600/20 text-violet-300 border border-violet-600/30 px-1.5 py-0.5 rounded-md text-[10px] font-medium shrink-0">
                      {TRIGGER_LABELS[ev.trigger]}
                    </span>
                    <span className="text-zinc-600 text-[10px]">›</span>
                    <span className="text-zinc-300 text-[10px] truncate font-medium">{ACTION_LABELS[ev.action] ?? ev.action}</span>
                  </div>
                  <button
                    onClick={() => removeEvent(ev.id)}
                    className="text-zinc-700 hover:text-red-400 text-[11px] shrink-0 transition-colors w-4 h-4 flex items-center justify-center rounded hover:bg-red-400/10"
                  >
                    ✕
                  </button>
                </div>
                {ev.value && (
                  <p className="text-zinc-600 text-[10px] mt-1.5 truncate font-mono bg-zinc-950/50 rounded px-1.5 py-0.5">{ev.value}</p>
                )}
              </div>
            ))}

            {showAddEvent ? (
              <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl p-2.5 space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <span className="text-[10px] text-zinc-500 block mb-1 font-semibold uppercase tracking-wider">Trigger</span>
                    <select
                      value={newTrigger}
                      onChange={(e) => setNewTrigger(e.target.value as EventSchema['trigger'])}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-1.5 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                    >
                      <option value="click">Click</option>
                      <option value="hover_enter">Hover</option>
                      <option value="area_enter">Area Enter</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block mb-1 font-semibold uppercase tracking-wider">Action</span>
                    <select
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value as EventSchema['action'])}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-1.5 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                    >
                      <option value="show_popup">팝업</option>
                      <option value="open_url">URL 열기</option>
                      <option value="emit_event">이벤트 발송</option>
                    </select>
                  </div>
                </div>

                {areaEnterNeedsPhysics && (
                  <p className="text-amber-400/80 text-[10px] bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5">
                    ⚠ Area Enter는 Physics 활성화 + Is Sensor 필요
                  </p>
                )}

                <div>
                  <span className="text-[10px] text-zinc-500 block mb-1 font-semibold uppercase tracking-wider">
                    {newAction === 'open_url' ? 'URL' : newAction === 'emit_event' ? '이벤트 이름' : '팝업 내용'}
                  </span>
                  <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={newAction === 'open_url' ? 'https://...' : newAction === 'emit_event' ? 'my_event_name' : '표시할 텍스트'}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    onKeyDown={(e) => e.key === 'Enter' && addEvent()}
                  />
                </div>

                <div className="flex gap-1.5">
                  <button
                    onClick={addEvent}
                    className="flex-1 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
                  >
                    추가
                  </button>
                  <button
                    onClick={() => { setShowAddEvent(false); setNewValue(''); }}
                    className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddEvent(true)}
                className="w-full py-1.5 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-violet-600/60 hover:text-violet-400 hover:bg-violet-600/5 text-xs transition-all"
              >
                + 이벤트 추가
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
