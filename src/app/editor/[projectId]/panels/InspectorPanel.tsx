'use client';

import { useState, useEffect } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import type { ObjectNodeSchema } from '@/types/scene';

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

// ── 섹션 헤더 ──────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 bg-zinc-900/50">
      {title}
    </div>
  );
}

// ── 메인 ───────────────────────────────────────────────────────
export function InspectorPanel() {
  const { objects, selectedId, updateObject, pushHistory } = useSceneStore();
  const obj = objects.find((o) => o.id === selectedId) as ObjectNodeSchema | undefined;

  if (!obj) {
    return (
      <aside className="flex flex-col bg-zinc-950 border-l border-zinc-800">
        <div className="px-3 py-2 border-b border-zinc-800">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Inspector</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-zinc-600 text-xs text-center leading-relaxed">
            오브젝트를 선택하면<br />속성을 편집할 수 있습니다
          </p>
        </div>
      </aside>
    );
  }

  const setPos = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { position: { ...obj.position, [axis]: v } });
  const setRot = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { rotation: { ...obj.rotation, [axis]: v } });
  const setScl = (axis: 'x' | 'y' | 'z', v: number) =>
    updateObject(obj.id, { scale: { ...obj.scale, [axis]: v } });

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
        <SectionHeader title="Transform" />
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

        {/* Material */}
        <SectionHeader title="Material" />
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
            <input
              type="range" min="0" max="1" step="0.01"
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
            <input
              type="range" min="0" max="1" step="0.01"
              value={obj.material?.metalness ?? 0.1}
              onChange={(e) => updateObject(obj.id, { material: { ...obj.material, metalness: parseFloat(e.target.value) } })}
              onMouseUp={pushHistory}
              className="w-full accent-violet-500"
            />
          </div>
        </div>

        {/* Visibility */}
        <SectionHeader title="Visibility" />
        <div className="px-3 py-3 space-y-2">
          {(
            [
              { key: 'visible', label: 'Visible' },
              { key: 'locked', label: 'Locked' },
            ] as const
          ).map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-zinc-400">{label}</span>
              <div
                onClick={() => { updateObject(obj.id, { [key]: !obj[key] }); pushHistory(); }}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  obj[key] ? 'bg-violet-600' : 'bg-zinc-700'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                  obj[key] ? 'left-4' : 'left-0.5'
                }`} />
              </div>
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
}
