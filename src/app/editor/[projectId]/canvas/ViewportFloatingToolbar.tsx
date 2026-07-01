'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  Move, RotateCcw, Maximize2, Globe, Crosshair,
  Grid3x3, Box, Layers, Undo2, Redo2, AlignCenter,
} from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import type { PrimitiveShape } from '@/types/scene';

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-zinc-950 border border-zinc-800 text-[10px] font-medium text-zinc-200 rounded-lg whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity duration-100 pointer-events-none z-[200] shadow-xl shadow-black/60">
        {label}
      </div>
    </div>
  );
}

const SEP = <div className="w-px h-4 bg-zinc-700/60 shrink-0" />;

const SHAPES: { shape: PrimitiveShape; label: string; icon: string }[] = [
  { shape: 'box',      label: '박스',   icon: '⬛' },
  { shape: 'sphere',   label: '구체',   icon: '⬤' },
  { shape: 'cylinder', label: '원기둥', icon: '⬭' },
  { shape: 'plane',    label: '평면',   icon: '▬' },
];

const SNAP_STEPS = [0.25, 0.5, 1, 2];

export function ViewportFloatingToolbar() {
  const {
    transformMode, transformSpace, snapEnabled, snapTranslate, wireframeMode,
    selectedIds,
    setTransformMode, setTransformSpace, setSnap, toggleWireframe,
    addObject, undo, redo, alignSelected,
  } = useSceneStore();

  const [showAlign, setShowAlign] = useState(false);
  const alignRef = useRef<HTMLDivElement>(null);
  const canAlign = selectedIds.length >= 2;

  useEffect(() => {
    if (!showAlign) return;
    const handler = (e: MouseEvent) => {
      if (alignRef.current && !alignRef.current.contains(e.target as Node)) setShowAlign(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAlign]);

  const MODE_BTNS = [
    { mode: 'translate' as const, icon: <Move size={13} />,      title: '이동 (W)' },
    { mode: 'rotate'    as const, icon: <RotateCcw size={13} />, title: '회전 (E)' },
    { mode: 'scale'     as const, icon: <Maximize2 size={13} />, title: '스케일 (R)' },
  ];

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/80 rounded-xl shadow-2xl shadow-black/50 pointer-events-auto select-none">

        {/* Transform 모드 */}
        <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 gap-0.5">
          {MODE_BTNS.map(({ mode, icon, title }) => (
            <Tip key={mode} label={title}>
              <button
                onClick={() => setTransformMode(mode)}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                  transformMode === mode
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {icon}
              </button>
            </Tip>
          ))}
        </div>

        {/* 좌표계 */}
        <Tip label={transformSpace === 'world' ? '월드 → 로컬' : '로컬 → 월드'}>
          <button
            onClick={() => setTransformSpace(transformSpace === 'world' ? 'local' : 'world')}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
          >
            {transformSpace === 'world' ? <Globe size={13} /> : <Crosshair size={13} />}
          </button>
        </Tip>

        {SEP}

        {/* 스냅 */}
        <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 gap-0.5">
          <Tip label={snapEnabled ? '스냅 끄기' : '스냅 켜기'}>
            <button
              onClick={() => setSnap(!snapEnabled)}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                snapEnabled
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              <Grid3x3 size={12} />
            </button>
          </Tip>
          {SNAP_STEPS.map((step) => (
            <Tip key={step} label={`스냅 ${step}`}>
              <button
                onClick={() => setSnap(true, step)}
                className={`px-1.5 h-7 rounded-md text-[10px] font-mono transition-all ${
                  snapEnabled && snapTranslate === step
                    ? 'bg-zinc-600 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {step}
              </button>
            </Tip>
          ))}
        </div>

        {SEP}

        {/* 도형 추가 */}
        <div className="flex items-center gap-0">
          {SHAPES.map(({ shape, label, icon }) => (
            <Tip key={shape} label={`${label} 추가`}>
              <button
                onClick={() => addObject(shape)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-sm"
              >
                {icon}
              </button>
            </Tip>
          ))}
        </div>

        {SEP}

        {/* 와이어프레임 */}
        <Tip label={wireframeMode ? '솔리드 모드' : '와이어프레임'}>
          <button
            onClick={toggleWireframe}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
              wireframeMode
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            {wireframeMode ? <Layers size={13} /> : <Box size={13} />}
          </button>
        </Tip>

        {SEP}

        {/* Undo / Redo */}
        <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 gap-0.5">
          <Tip label="실행 취소 (Ctrl+Z)">
            <button
              onClick={undo}
              className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
            >
              <Undo2 size={13} />
            </button>
          </Tip>
          <Tip label="다시 실행 (Ctrl+Y)">
            <button
              onClick={redo}
              className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
            >
              <Redo2 size={13} />
            </button>
          </Tip>
        </div>

        {SEP}

        {/* 정렬 */}
        <div className="relative" ref={alignRef}>
          <Tip label={canAlign ? '정렬' : '2개 이상 선택'}>
            <button
              onClick={() => setShowAlign((v) => !v)}
              disabled={!canAlign}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                canAlign
                  ? showAlign
                    ? 'bg-violet-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  : 'text-zinc-700 cursor-not-allowed'
              }`}
            >
              <AlignCenter size={13} />
            </button>
          </Tip>
          {showAlign && canAlign && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 p-2 min-w-[160px]">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 mb-1.5">정렬</div>
              {([
                { axis: 'x' as const, label: 'X', min: '좌', ctr: '중', max: '우' },
                { axis: 'y' as const, label: 'Y', min: '하', ctr: '중', max: '상' },
                { axis: 'z' as const, label: 'Z', min: '전', ctr: '중', max: '후' },
              ]).map(({ axis, label, min, ctr, max }) => (
                <div key={axis} className="flex items-center gap-1.5 py-0.5">
                  <span className="text-[10px] font-mono text-zinc-500 w-4 shrink-0">{label}</span>
                  <div className="flex items-center bg-zinc-800 rounded-md p-0.5 gap-0.5 flex-1">
                    {([
                      { mode: 'min' as const, label: min },
                      { mode: 'center' as const, label: ctr },
                      { mode: 'max' as const, label: max },
                    ]).map(({ mode, label: ml }) => (
                      <button
                        key={mode}
                        onClick={() => { alignSelected(axis, mode); setShowAlign(false); }}
                        className="flex-1 h-6 rounded text-[10px] font-medium text-zinc-400 hover:bg-violet-600 hover:text-white transition-all"
                      >
                        {ml}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
