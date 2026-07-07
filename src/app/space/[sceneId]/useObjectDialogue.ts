import { useEffect, useRef, useState } from 'react';
import type { DialogueConfig, ObjectNodeSchema } from '@/types/scene';

export interface DialogueView {
  visible: boolean;
  speaker?: string;
  text: string;       // 타이핑 진행분(부분 문자열)
  hasMore: boolean;   // 다음 문장이 남았는지 (manual일 때 ▶ 힌트용)
  manual: boolean;    // E키로 넘기는 모드인지
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
 * @param dlg      효과 대화 설정(effectiveDialogue 결과) 또는 null
 * @param playMode 플레이 모드 여부
 * @param nearby   이 오브젝트가 현재 근접(최근접) 대상인지 (InteractHighlightContext === id)
 * @param nonce    E키 nonce (DialogueAdvanceContext) — nearby일 때만 반응
 */
export function useObjectDialogue(
  dlg: DialogueConfig | null,
  playMode: boolean,
  nearby: boolean,
  nonce: number,
): DialogueView {
  const lines = dlg?.lines?.filter((l) => l.trim().length > 0) ?? [];
  const show = dlg?.show ?? 'approach';
  const advance = dlg?.advance ?? 'auto';
  const autoSec = dlg?.autoSec ?? 2.5;
  const typing = dlg?.typing ?? true;
  const manual = advance === 'manual';

  const [idx, setIdx] = useState(0);
  const [opened, setOpened] = useState(false); // show='interact' 전용
  const [typed, setTyped] = useState('');
  const prevNonce = useRef(nonce);

  // 표시 여부(active)
  const active =
    playMode && lines.length > 0
      ? show === 'always'
        ? true
        : show === 'approach'
          ? nearby
          : opened
      : false;

  // 근접이 풀리면 interact 대화는 닫고, approach/interact는 처음 문장으로 리셋
  useEffect(() => {
    if (!nearby && show !== 'always') {
      if (opened) setOpened(false);
      if (idx !== 0) setIdx(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearby, show]);

  // E(nonce) 처리 — 근접 대상일 때만: interact 열기 / manual 다음 문장
  useEffect(() => {
    if (prevNonce.current === nonce) return;
    prevNonce.current = nonce;
    if (!nearby || lines.length === 0) return;

    if (show === 'interact' && !opened) {
      setOpened(true);
      setIdx(0);
      return;
    }
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

  // auto 넘김 — active이고 문장이 2개 이상일 때 타이머로 순환
  useEffect(() => {
    if (!active || advance !== 'auto') return;
    if (lines.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => {
        const next = i + 1;
        if (next >= lines.length) {
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
  const full = active ? (lines[Math.min(idx, lines.length - 1)] ?? '') : '';
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
  };
}
