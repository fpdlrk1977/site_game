import { useEffect, useRef, useState } from 'react';
import type { DialogueConfig, ObjectNodeSchema } from '@/types/scene';

export interface DialogueView {
  visible: boolean;
  speaker?: string;
  text: string;             // 타이핑 진행분(부분 문자열)
  hasMore: boolean;         // 다음 문장이 남았는지 (manual일 때 ▶ 힌트용)
  manual: boolean;          // E키로 넘기는 모드인지
  endButton: string | null; // 마지막 문장에 표시할 종료 액션 버튼 라벨(없으면 null)
  confirm: () => void;      // 종료 버튼 클릭 핸들러 (dialogue_end 발동 + 닫기)
}

// interactLabel(레거시)을 dialogue로 변환한 효과값을 만든다.
export function effectiveDialogue(object: ObjectNodeSchema): DialogueConfig | null {
  if (object.dialogue && object.dialogue.lines?.some((l) => l.trim().length > 0)) {
    return object.dialogue;
  }
  const legacy = object.interactLabel?.trim();
  if (legacy) return { lines: [legacy], show: 'approach', advance: 'auto' };
  return null;
}

const TYPE_MS_PER_CHAR = 28; // 타이핑 속도

/**
 * 오브젝트별 대화 상태 머신.
 * @param dlg          효과 대화 설정(effectiveDialogue 결과) 또는 null
 * @param playMode     플레이 모드 여부
 * @param nearby       이 오브젝트가 현재 근접(최근접) 대상인지 (InteractHighlightContext === id)
 * @param nonce        E키 nonce (DialogueAdvanceContext) — nearby일 때만 반응
 * @param hasEndAction 이 오브젝트에 dialogue_end 이벤트가 있는지 (있으면 마지막 문장에 액션 버튼 표시)
 * @param onEnd        종료 버튼 확정 시 호출 (dialogue_end 이벤트 디스패치)
 */
export function useObjectDialogue(
  dlg: DialogueConfig | null,
  playMode: boolean,
  nearby: boolean,
  nonce: number,
  hasEndAction: boolean = false,
  onEnd?: () => void,
): DialogueView {
  const lines = dlg?.lines?.filter((l) => l.trim().length > 0) ?? [];
  const show = dlg?.show ?? 'approach';
  const advance = dlg?.advance ?? 'auto';
  const autoSec = dlg?.autoSec ?? 2.5;
  const typing = dlg?.typing ?? true;
  const manual = advance === 'manual';
  const once = dlg?.once === true;
  const endLabel = dlg?.endButtonLabel?.trim() || '확인';

  const [idx, setIdx] = useState(0);
  const [opened, setOpened] = useState(false);   // show='interact' 전용
  const [typed, setTyped] = useState('');
  const [seen, setSeen] = useState(false);       // once: 이 세션에서 끝까지 봤는지
  const [dismissed, setDismissed] = useState(false); // 종료 버튼을 눌러 이번 세션 대화를 닫았는지

  const prevNonce = useRef(nonce);
  const reachedEndRef = useRef(false);           // 이번 세션에서 마지막 문장까지 도달했는지
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const hasEndActionRef = useRef(hasEndAction); hasEndActionRef.current = hasEndAction;
  const openedRef = useRef(opened); openedRef.current = opened;
  const confirmRef = useRef<() => void>(() => {});

  // 표시 여부(active) — once로 이미 본 대화·이번 세션에서 닫은 대화는 뜨지 않음
  const wantActive =
    playMode && lines.length > 0
      ? show === 'always'
        ? true
        : show === 'approach'
          ? nearby
          : opened
      : false;
  const active = wantActive && !dismissed && !(once && seen);

  const full = active ? (lines[Math.min(idx, lines.length - 1)] ?? '') : '';
  const atEnd = active && idx >= lines.length - 1 && full.length > 0 && typed.length >= full.length;
  const showEndButton = atEnd && hasEndAction;

  // 종료 버튼 확정 — dialogue_end 발동 + 닫기(+once면 seen)
  const confirm = () => {
    onEndRef.current?.();
    if (once) setSeen(true);
    setDismissed(true);
  };
  confirmRef.current = confirm;

  // 근접이 풀리면 interact 대화는 닫고, approach/interact는 처음 문장으로 리셋. dismissed/도달 상태도 정리.
  useEffect(() => {
    if (!nearby && show !== 'always') {
      if (opened) setOpened(false);
      if (idx !== 0) setIdx(0);
      if (dismissed) setDismissed(false);
      // 버튼 없는 대화 + once: 끝까지 보고 떠났으면 seen(다시 안 뜸)
      if (once && !hasEndActionRef.current && reachedEndRef.current) setSeen(true);
      reachedEndRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearby, show]);

  // 마지막 문장 도달 기록(버튼 없는 once 처리용 · E=확정 판정용)
  useEffect(() => {
    if (atEnd) reachedEndRef.current = true;
  }, [atEnd]);

  // E(nonce) 처리 — 근접 대상일 때만: interact 열기 / (끝+버튼)이면 확정 / manual 다음 문장
  useEffect(() => {
    if (prevNonce.current === nonce) return;
    prevNonce.current = nonce;
    if (!nearby || lines.length === 0) return;

    if (show === 'interact' && !openedRef.current) { setOpened(true); setIdx(0); return; }
    if (reachedEndRef.current && hasEndActionRef.current) { confirmRef.current(); return; }
    if (manual) {
      setIdx((i) => {
        const next = i + 1;
        if (next >= lines.length) {
          if (show === 'interact') { setOpened(false); return 0; } // 마지막에서 닫기
          return 0; // approach/always는 처음으로 순환
        }
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  // auto 넘김 — active이고 문장이 2개 이상일 때 타이머로 순환.
  //   단, 종료 액션 버튼이 있으면 마지막 문장에서 멈춰 버튼을 유지한다(순환 안 함).
  useEffect(() => {
    if (!active || advance !== 'auto') return;
    if (lines.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => {
        const next = i + 1;
        if (next >= lines.length) {
          if (hasEndActionRef.current) return i;                     // 끝에서 정지(버튼 유지)
          if (show === 'interact') { setOpened(false); return 0; }
          return 0;
        }
        return next;
      });
    }, Math.max(0.5, autoSec) * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, advance, autoSec, lines.length, show]);

  // 타이핑 효과 — 현재 문장(idx)/active 변화 시 처음부터 타이핑
  useEffect(() => {
    if (!active) { setTyped(''); return; }
    if (!typing) { setTyped(full); return; }
    setTyped('');
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      setTyped(full.slice(0, n));
      if (n >= full.length) clearInterval(t);
    }, TYPE_MS_PER_CHAR);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, active, typing]);

  return {
    visible: active,
    speaker: dlg?.speaker?.trim() || undefined,
    text: typed,
    hasMore: idx < lines.length - 1,
    manual,
    endButton: showEndButton ? endLabel : null,
    confirm,
  };
}
