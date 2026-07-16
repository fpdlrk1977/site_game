'use client';

// 공통 컬러픽커 — 브라우저 기본 input[type=color]을 대체하는 자체 픽커(피그마식).
// 트리거(스와치 버튼) + 팝오버(HSV 사각형 + Hue 슬라이더 + hex/RGB 입력 + 저장 팔레트 + 스포이드).
// 위치/바깥클릭/Esc 닫기는 공통 useDropdown 재사용. 저장 팔레트는 sceneStore.colorAssets 연동.
//
// 드롭인 사용:
//   <ColorPicker value={hex} onChange={(hex) => update(hex)} onCommit={pushHistory} />
// onChange = 드래그 중 실시간, onCommit = 한 조작 끝(마우스업/입력확정/스와치클릭) → pushHistory 1회.
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Pipette, Plus } from 'lucide-react';
import { useDropdown } from '@/hooks/useDropdown';
import { useSceneStore } from '@/store/sceneStore';
import { normalizeHex, hexToHsv, hsvToHex, hexToRgb, rgbToHex, type HSV } from '@/lib/color';

interface Props {
  value: string;
  onChange: (hex: string) => void;
  /** 한 조작(드래그/입력/스와치)이 끝날 때 1회 — 보통 pushHistory 연결 */
  onCommit?: () => void;
  className?: string;   // 트리거 스와치 버튼 크기/스타일 override (기본 w-8 h-8)
  disabled?: boolean;
  title?: string;
  /** 트리거에 hex 텍스트도 함께 표시 */
  showHex?: boolean;
  /** 저장 팔레트(colorAssets) 표시 (기본 true) */
  palette?: boolean;
}

// EyeDropper API (크로미엄) 타입
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function ColorPicker({ value, onChange, onCommit, className, disabled, title, showHex, palette = true }: Props) {
  const { open, toggle, close, triggerRef, panelRef, panelStyle } = useDropdown<HTMLButtonElement>();
  const colorAssets = useSceneStore((s) => s.colorAssets);
  const addColorAsset = useSceneStore((s) => s.addColorAsset);
  const removeColorAsset = useSceneStore((s) => s.removeColorAsset);

  const norm = normalizeHex(value) ?? '#000000';
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(norm) ?? { h: 0, s: 0, v: 0 });
  const [hexText, setHexText] = useState(norm);
  const draggingRef = useRef(false);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // 외부 value 변경 → 내부 HSV 동기화(드래그 중 아닐 때, 실제 색이 다를 때만 — 그레이스케일에서 hue 보존)
  useEffect(() => {
    if (draggingRef.current) return;
    const n = normalizeHex(value);
    if (!n) return;
    setHexText(n);
    if (hsvToHex(hsv.h, hsv.s, hsv.v) !== n) {
      const h = hexToHsv(n);
      if (h) setHsv(h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = useCallback((next: HSV) => {
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    setHexText(hex);
    onChange(hex);
  }, [onChange]);

  const commit = useCallback(() => { onCommit?.(); }, [onCommit]);

  // SV 사각형 포인터 → 채도(x)/명도(y)
  const applySV = useCallback((clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    emit({ h: hsv.h, s, v });
  }, [emit, hsv.h]);

  // Hue 슬라이더 포인터 → 색상(x)
  const applyHue = useCallback((clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 360;
    emit({ h, s: hsv.s, v: hsv.v });
  }, [emit, hsv.s, hsv.v]);

  // 드래그 공통 — pointerdown 시 window 리스너로 커서가 영역을 벗어나도 추적, up에서 commit
  const startDrag = (apply: (x: number, y: number) => void, e: React.PointerEvent) => {
    draggingRef.current = true;
    apply(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => apply(ev.clientX, ev.clientY);
    const up = () => {
      draggingRef.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      commit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const commitHexText = () => {
    const n = normalizeHex(hexText);
    if (n) {
      const h = hexToHsv(n);
      if (h) { setHsv(h); onChange(n); commit(); setHexText(n); return; }
    }
    setHexText(hsvToHex(hsv.h, hsv.s, hsv.v)); // 잘못된 입력 → 현재 색으로 되돌림
  };

  const applyRgb = (part: 'r' | 'g' | 'b', raw: string) => {
    const rgb = hexToRgb(hsvToHex(hsv.h, hsv.s, hsv.v));
    if (!rgb) return;
    const val = Math.max(0, Math.min(255, Math.round(Number(raw) || 0)));
    const next = { ...rgb, [part]: val };
    const hex = rgbToHex(next.r, next.g, next.b);
    const h = hexToHsv(hex);
    if (h) { setHsv(h); setHexText(hex); onChange(hex); }
  };

  const pickSwatch = (hex: string) => {
    const n = normalizeHex(hex);
    if (!n) return;
    const h = hexToHsv(n);
    if (h) { setHsv(h); setHexText(n); onChange(n); commit(); }
  };

  const eyedropper = async () => {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!Ctor) return;
    try {
      const res = await new Ctor().open();
      pickSwatch(res.sRGBHex);
    } catch { /* 사용자 취소 */ }
  };

  const curHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const rgb = hexToRgb(curHex) ?? { r: 0, g: 0, b: 0 };
  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) toggle(); }}
        title={title}
        className={`inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${className ?? 'w-8 h-8'} rounded-xs border border-border overflow-hidden shrink-0`}
        style={{ backgroundColor: norm }}
      >
        {showHex && <span className="text-[10px] font-mono text-white mix-blend-difference px-1">{norm}</span>}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="w-56 bg-surface border border-border rounded-sm shadow-dropdown p-2.5 select-none"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* SV 사각형 */}
          <div
            ref={svRef}
            onPointerDown={(e) => startDrag(applySV, e)}
            className="relative w-full h-32 rounded-xs cursor-crosshair"
            style={{
              backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
              backgroundImage:
                'linear-gradient(to right, #fff, rgba(255,255,255,0)), linear-gradient(to top, #000, rgba(0,0,0,0))',
            }}
          >
            <span
              className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: curHex }}
            />
          </div>

          {/* Hue 슬라이더 */}
          <div
            ref={hueRef}
            onPointerDown={(e) => startDrag((x) => applyHue(x), e)}
            className="relative w-full h-3 rounded-full mt-2.5 cursor-pointer"
            style={{ backgroundImage: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
          >
            <span
              className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
              style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
            />
          </div>

          {/* hex + RGB + 스포이드 */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <input
              value={hexText}
              onChange={(e) => setHexText(e.target.value)}
              onBlur={commitHexText}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitHexText(); } }}
              spellCheck={false}
              className="w-[74px] bg-background border border-border rounded-xs px-1.5 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {(['r', 'g', 'b'] as const).map((p) => (
              <input
                key={p}
                type="number"
                min={0}
                max={255}
                value={rgb[p]}
                onChange={(e) => applyRgb(p, e.target.value)}
                onBlur={commit}
                className="w-9 bg-background border border-border rounded-xs px-1 py-1 text-[11px] text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            ))}
            {hasEyeDropper && (
              <button
                type="button"
                onClick={eyedropper}
                title="Pick a color from the screen"
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-xs bg-background border border-border text-muted hover:text-foreground transition-colors"
              >
                <Pipette size={13} />
              </button>
            )}
          </div>

          {/* 저장 팔레트 */}
          {palette && (
            <div className="mt-2.5 pt-2.5 border-t border-border">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-muted tracking-wide">Saved</span>
                <button
                  type="button"
                  onClick={() => addColorAsset('', curHex)}
                  title="Save the current color to the palette"
                  className="inline-flex items-center gap-0.5 text-[10px] text-muted hover:text-foreground transition-colors"
                >
                  <Plus size={11} /> Save
                </button>
              </div>
              {colorAssets.length > 0 ? (
                <div className="grid grid-cols-8 gap-1">
                  {colorAssets.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickSwatch(c.color)}
                      onContextMenu={(e) => { e.preventDefault(); removeColorAsset(c.id); }}
                      title={`${c.name || c.color} — right-click to remove`}
                      className="aspect-square rounded-xs border border-border hover:ring-1 hover:ring-primary transition-all"
                      style={{ backgroundColor: c.color }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted/50">No saved colors yet. Click Save to add one.</p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={close}
            className="w-full mt-2.5 py-1 rounded-xs bg-background text-muted hover:text-foreground text-[10px] transition-colors"
          >
            Done
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
