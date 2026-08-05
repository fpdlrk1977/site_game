'use client';

// 브릭 도구 패널 — **프로토타입과 에디터가 같이 쓰는 하나의 UI.**
//
// ★ 이 세션에 배치 규칙이 네 번 바뀌었다. UI도 두 곳에 흩어지면 같은 일이 난다.
//   여기 하나만 고치면 둘 다 바뀐다.
//
// 담는 것: 도구 · 파츠 · 방향 · 재질 · 색 · 돌기 모양 · 전체 지우기.
// 안 담는 것: 통계·스트레스 테스트 등 **프로토타입 전용 계측**(그건 그 페이지가 갖는다).

import { useEffect, useMemo, useState } from 'react';
import { STUD_STYLES } from '@/lib/brick/brickGeometry';
import { MAT_CLASSES, PART_KINDS, PARTS, partsOfKind } from '@/lib/brick/parts';
import { PROP_LIST } from '@/lib/brick/props';
import { spinOf, tipOf, TIP_LABELS } from '@/lib/brick/rotation';
import { BRICK_TEXTURES } from '@/lib/brick/textures';
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
  const { part, prop, rot, color, mat, tex, studStyle, recentColors, walking } = useBrickStore();
  const { setPart, setProp, rotate, tipOver, setColor, setMat, setTex, setTool, setStudStyle, rememberColor, setWalking } = useBrickStore();
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

  // 단축키 — 1~9 파츠(**지금 보고 있는 갈래 안에서**) · R 회전 · Shift+R 눕히기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력창에서는 가로채지 않는다(이름 편집 등)
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // ★ Ctrl/Cmd 조합은 건드리지 않는다 — Ctrl+R(새로고침)이 브릭을 돌리고 있었고,
      //   Ctrl+1~9는 브라우저 탭 전환이다. Ctrl은 도구 일시 반전에도 쓰인다.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= '1' && e.key <= '9') {
        // 소품 탭에 있으면 숫자키도 **소품 목록**을 고른다 — 보고 있는 목록과 같아야 헷갈리지 않는다
        const i = Number(e.key) - 1;
        if (prop) { const p = PROP_LIST[i]; if (p) setProp(p.id); }
        else { const p = kindParts[i]; if (p) setPart(p.id); }
      } else if (e.key === 'r' || e.key === 'R') {
        // Shift+R = 눕히기. 한 글쇠에 두 축을 담되 수식키로 갈라 둔다
        if (e.shiftKey) tipOver(); else rotate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kindParts, prop, setPart, setProp, rotate, tipOver]);

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

      {/* ★ 걷기 — **지은 것 안에 들어가 본다.** 짓기와 나란히 두는 이유:
          "만들다가 바로 걸어본다"가 이 제품의 핵심 동작이라 깊은 메뉴에 숨기면 안 쓰게 된다. */}
      <button
        onClick={() => setWalking(!walking)}
        title="지은 공간 안에 들어가 걸어 다닌다 · WASD 이동 · 드래그로 둘러보기 · Shift 빠르게"
        className={`${btn} w-full mb-1 ${walking ? on : off}`}
      >
        {walking ? '▣ 걷기 끝내기' : '▶ 걸어보기'}
      </button>
      {walking && (
        <div className="mb-2 text-[10px] text-muted">
          WASD 이동 · 드래그로 둘러보기 · Shift 빠르게 · 턱은 자동으로 오른다
        </div>
      )}

      {/* 파츠가 여럿이라 가로 나열이 안 맞는다 — 갈래 탭 + 격자.
          **소품**은 파츠가 아니라 브릭 묶음이라 마지막 탭으로 따로 둔다(§22). */}
      <div className={label}>파츠 <span className="opacity-60">1~9 = 아래 목록 순서</span></div>
      <div className="flex gap-1 mb-1">
        {PART_KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setPart(partsOfKind(k.id)[0].id)}
            title={k.note}
            className={`${btn} flex-1 ${!prop && PARTS[part].kind === k.id ? on : off}`}
          >
            {k.label}
          </button>
        ))}
        <button
          onClick={() => setProp(PROP_LIST[0].id)}
          title="미리 만들어 둔 브릭 묶음 — 클릭 한 번에 통째로 놓인다"
          className={`${btn} flex-1 ${prop ? on : off}`}
        >
          소품
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1 mb-1">
        {prop
          ? PROP_LIST.map((p) => (
            <button key={p.id} onClick={() => setProp(p.id)} className={`${btn} px-0 ${prop === p.id ? on : off}`}>{p.label}</button>
          ))
          : kindParts.map((p) => (
            <button key={p.id} onClick={() => setPart(p.id)} className={`${btn} px-0 ${part === p.id ? on : off}`}>{p.label}</button>
          ))}
      </div>
      <div className="mb-3 text-[10px] text-muted">
        {prop
          ? '미리 만든 묶음을 통째로 놓는다 · 자기 색을 갖고 있어 팔레트 색을 안 쓴다 · R로 네 방향'
          : PART_KINDS.find((k) => k.id === PARTS[part].kind)?.note}
      </div>

      {/* 방향은 축이 둘이다 — **어느 면이 위인가**와 그 상태에서의 **제자리 회전**.
          하나로 합치면 원하는 방향까지 여러 번 눌러야 한다.
          ⚠️ 옆으로 눕히기는 아직 없다 — 칸이 정육면체가 아니라 격자에 안 맞는다(rotation.ts `isGridExact`). */}
      <div className={label}>방향 <span className="opacity-60">R 회전 · Shift+R 뒤집기</span></div>
      <div className="flex gap-1 mb-1">
        <button onClick={rotate} className={`${btn} flex-1 ${off}`}>회전 {spinOf(rot) * 90}°</button>
        <button
          onClick={tipOver}
          title="위아래를 뒤집는다 — 돌기가 아래를 보게 된다(천장 마감·처마)"
          className={`${btn} flex-1 ${tipOf(rot) === 0 ? off : on}`}
        >
          {tipOf(rot) === 0 ? '뒤집기' : '뒤집힘'}
        </button>
      </div>
      <div className="mb-3 text-[10px] text-muted">
        {tipOf(rot) === 0 ? '똑바로 놓인 상태' : `${TIP_LABELS[tipOf(rot)]} — 돌기가 아래를 본다`}
      </div>

      <div className={label}>재질</div>
      <div className="flex gap-1 mb-3">
        {MAT_CLASSES.map((m) => (
          <button key={m.id} onClick={() => setMat(m.id)} className={`${btn} flex-1 ${mat === m.id ? on : off}`}>{m.label}</button>
        ))}
      </div>

      {/* 재료(무늬) — 색과는 **별개 축**이다. 무늬는 흑백이라 색이 그대로 곱해진다
          (잔디 무늬 + 파란색 = 파란 잔디). 고르면 기본색도 함께 잡아 준다. */}
      <div className={label}>재료</div>
      <div className="grid grid-cols-4 gap-1 mb-3">
        {BRICK_TEXTURES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTex(t.id)}
            className={`${btn} px-0 ${tex === t.id ? on : off}`}
            title={t.id === 0 ? '무늬 없이 색만' : `${t.label} 무늬 — 색은 따로 고를 수 있다`}
          >
            {t.label}
          </button>
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

      <ClearAllButton />
    </>
  );
}

/**
 * 전체 지우기 — **되돌릴 수 없다.** 월드뿐 아니라 **저장소까지** 비운다.
 *
 * ★ 그래서 한 번 더 묻는다. `window.confirm`을 안 쓰는 이유는 브라우저 기본 대화상자가
 *   캔버스 포인터 상태를 흐트러뜨리고(놓친 pointerup으로 드래그가 붙는다) 스타일도 못 맞추기 때문.
 *   버튼 자리에서 두 단계로 처리하면 그 문제가 없다.
 */
function ClearAllButton() {
  const clear = useBrickStore((s) => s.clear);
  const [asking, setAsking] = useState(false);

  // 물어보는 상태로 두고 딴짓하다 잊는 걸 막는다 — 4초 뒤 저절로 닫힌다
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 4000);
    return () => clearTimeout(t);
  }, [asking]);

  if (!asking) {
    return (
      <>
        <div className={label}>초기화</div>
        <button
          onClick={() => setAsking(true)}
          className={`${btn} w-full ${off} text-danger`}
          title="지은 것을 전부 지우고 처음 지형으로 되돌린다 (되돌리기 불가)"
        >
          전체 지우기
        </button>
      </>
    );
  }
  return (
    <>
      <div className={label}>정말 지울까요? <span className="opacity-60">되돌릴 수 없음</span></div>
      <div className="flex gap-1">
        <button
          onClick={() => { setAsking(false); void clear(); }}
          className={`${btn} flex-1 bg-danger text-white border-danger`}
        >
          지우기
        </button>
        <button onClick={() => setAsking(false)} className={`${btn} flex-1 ${off}`}>취소</button>
      </div>
    </>
  );
}
