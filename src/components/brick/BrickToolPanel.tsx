'use client';

// 브릭 도구 패널 — **프로토타입과 에디터가 같이 쓰는 하나의 UI.**
//
// ★ 이 세션에 배치 규칙이 네 번 바뀌었다. UI도 두 곳에 흩어지면 같은 일이 난다.
//   여기 하나만 고치면 둘 다 바뀐다.
//
// 담는 것: 도구 · 파츠 · 방향 · 재질 · 색 · 돌기 모양.
// 안 담는 것: 통계·스트레스 테스트·전체 지우기 등 **프로토타입 전용 계측**(그건 그 페이지가 갖는다).

import { useEffect, useMemo, useState } from 'react';
import { STUD_STYLES } from '@/lib/brick/brickGeometry';
import { MAT_CLASSES, PART_KINDS, PARTS, partsOfKind } from '@/lib/brick/parts';
import { BRICK_COLORS, useBrickStore, type Tool } from '@/store/brickStore';
import { useEffectiveTool } from './BrickBuilder';
import { BrickColorPicker } from './BrickColorPicker';
import { Plus } from 'lucide-react';

const btn = 'px-2.5 py-1.5 rounded-xs text-[12px] border transition-colors cursor-pointer';
const on = 'bg-primary text-white border-primary';
const off = 'bg-surface text-foreground border-border hover:bg-foreground/[0.06]';
const label = 'text-[10px] uppercase text-muted mb-1';

/** 돌기 모양은 룩·IP 검토용이라 프로토타입에서만 노출한다(BRICK_SYSTEM.md §8.5) */
export function BrickToolPanel({ showStudStyle = false }: { showStudStyle?: boolean }) {
  const { part, rot, color, mat, studStyle, recentColors } = useBrickStore();
  const { setPart, rotate, setColor, setMat, setTool, setStudStyle, rememberColor } = useBrickStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const effTool = useEffectiveTool();

  /**
   * 최근 색은 **마운트 후에** 불러온다.
   *
   * ★ 스토어 초기값에서 `localStorage`를 읽었더니 **하이드레이션이 깨졌다** —
   *   서버에는 localStorage가 없어 빈 배열이고 클라이언트에는 저장된 색이 있어서,
   *   서버가 그린 HTML(최근 줄 없음)과 클라이언트 렌더(최근 줄 있음)가 어긋난다.
   *   브라우저에만 있는 값은 **렌더가 끝난 뒤** 채워 넣어야 한다.
   */
  const hydrateRecentColors = useBrickStore((s) => s.hydrateRecentColors);
  useEffect(() => { hydrateRecentColors(); }, [hydrateRecentColors]);

  /** 지금 보고 있는 갈래(브릭/플레이트)의 파츠 — 목록과 숫자키가 같은 순서를 쓴다 */
  const kindParts = useMemo(() => partsOfKind(PARTS[part].kind), [part]);

  // 단축키 — 1~9 파츠(**지금 보고 있는 갈래 안에서**) · R 회전
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력창에서는 가로채지 않는다(이름 편집 등)
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key >= '1' && e.key <= '9') {
        const p = kindParts[Number(e.key) - 1];
        if (p) setPart(p.id);
      } else if (e.key === 'r' || e.key === 'R') rotate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kindParts, setPart, rotate]);

  return (
    <>
      {/* ★ 도구 — **액션은 왼쪽 클릭 하나뿐**이다. 버튼 하나에 두 뜻을 담으면
          카메라 조작과 충돌한다(예전 우클릭 = 회전 + 삭제). 우클릭은 모바일에도 없다. */}
      <div className={label}>도구 <span className="opacity-60">Ctrl=일시 반전</span></div>
      <div className="flex gap-1 mb-2">
        {(['place', 'erase'] as Tool[]).map((t) => (
          <button key={t} onClick={() => setTool(t)} className={`${btn} flex-1 ${effTool === t ? on : off}`}>
            {t === 'place' ? '＋ 놓기' : '－ 지우기'}
          </button>
        ))}
      </div>

      {/* 파츠가 16종이라 가로 나열이 안 맞는다 — 갈래 탭 + 격자 */}
      <div className={label}>파츠 <span className="opacity-60">1~9 = 아래 목록 순서</span></div>
      <div className="flex gap-1 mb-1">
        {PART_KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setPart(partsOfKind(k.id)[0].id)}
            title={k.note}
            className={`${btn} flex-1 ${PARTS[part].kind === k.id ? on : off}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1 mb-1">
        {kindParts.map((p) => (
          <button key={p.id} onClick={() => setPart(p.id)} className={`${btn} px-0 ${part === p.id ? on : off}`}>{p.label}</button>
        ))}
      </div>
      <div className="mb-3 text-[10px] text-muted">{PART_KINDS.find((k) => k.id === PARTS[part].kind)?.note}</div>

      <div className={label}>방향 <span className="opacity-60">R</span></div>
      <button onClick={rotate} className={`${btn} w-full mb-3 ${off}`}>회전 {rot * 90}°</button>

      <div className={label}>재질</div>
      <div className="flex gap-1 mb-3">
        {MAT_CLASSES.map((m) => (
          <button key={m.id} onClick={() => setMat(m.id)} className={`${btn} flex-1 ${mat === m.id ? on : off}`}>{m.label}</button>
        ))}
      </div>

      <div className={label}>색</div>
      <div className="grid grid-cols-5 gap-1 mb-3">
        {BRICK_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => { setColor(c); setPickerOpen(false); }}
            className={`h-6 rounded-xs border-2 cursor-pointer ${color === c ? 'border-primary' : 'border-border'}`}
            style={{ background: c }}
          />
        ))}
        {/* 임의 색 — 팔레트 밖의 색을 직접 만든다 */}
        <button
          onClick={() => setPickerOpen((o) => !o)}
          title="색 직접 고르기"
          className={`h-6 rounded-xs border-2 cursor-pointer flex items-center justify-center text-foreground ${pickerOpen ? 'border-primary' : 'border-border'}`}
          style={{ background: 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
        >
          <Plus size={12} className="text-white drop-shadow" />
        </button>
      </div>

      {pickerOpen && <BrickColorPicker value={color} onChange={setColor} onCommit={rememberColor} />}

      {/* 최근에 쓴 임의 색 — 기기에 남는다(씬을 옮겨도 유지) */}
      {recentColors.length > 0 && (
        <>
          <div className={label}>최근</div>
          <div className="grid grid-cols-5 gap-1 mb-3">
            {recentColors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                className={`h-5 rounded-xs border-2 cursor-pointer ${color === c ? 'border-primary' : 'border-border'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </>
      )}

      {showStudStyle && (
        <>
          <div className={label}>돌기 모양</div>
          <div className="flex gap-1 mb-1">
            {STUD_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStudStyle(s.id)}
                className={`${btn} flex-1 ${studStyle === s.id ? on : off}`}
                title={s.note}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="mb-3 text-[10px] text-muted leading-relaxed">
            {STUD_STYLES.find((s) => s.id === studStyle)?.note}
          </div>
        </>
      )}
    </>
  );
}
