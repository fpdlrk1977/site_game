'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { createBrowserSupabase } from '@/lib/supabase';
import { MobileControls } from './MobileControls';
import { RichContent } from '@/components/ui/RichContent';
import { effectiveDialogue } from './useObjectDialogue';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema, Vector3 } from '@/types/scene';

// 이 액션들이 (플레이 모드에서) 발동되면 상호작용이 끝날 때까지(팝업 닫기/Esc) 캐릭터 이동을 잠근다.
// 새로 "발동 중엔 못 움직이게" 하고 싶은 액션이 생기면 여기에 추가만 하면 자동 적용된다.
const MOVEMENT_LOCKING_ACTIONS: ReadonlySet<EventSchema['action']> = new Set<EventSchema['action']>([
  'show_popup',
  'focus_object',
]);

const ViewerCanvas = dynamic(
  () => import('./ViewerCanvas').then((m) => m.ViewerCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-sidebar">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-2xl mx-auto mb-3 animate-pulse">
            ⬡
          </div>
          <p className="text-muted text-sm">3D 공간 로딩 중...</p>
        </div>
      </div>
    ),
  },
);

interface Props {
  scene: ProjectSceneSchema;
  projectName?: string;
  isOwner?: boolean;
  projectId?: string;
  hideBadge?: boolean;
  /** 'standalone' = 독립 URL(/space) 풀 UI, 'embed' = 최소 UI + 부모 브릿지 */
  variant?: 'standalone' | 'embed';
  /** 임베드 브릿지 — show_popup/emit_event를 부모 페이지로 postMessage할 때 사용 */
  onBridge?: (msg: Record<string, unknown>) => void;
}

export function ViewerClient({ scene, projectName = '', isOwner = false, projectId = '', hideBadge = false, variant = 'standalone', onBridge }: Props) {
  const [popup, setPopup] = useState<{ title: string; content: string } | null>(null);
  // 둘러보기 전용 씬은 걷기(플레이) 불가 — 항상 탐색으로만 동작
  const walkDisabled = scene.environment.disableWalk === true;
  // 씬별 기본 진입 모드 — 'play'면 접속하자마자 플레이 모드로 시작 (미설정/둘러보기전용 = 탐색)
  const [playMode, setPlayMode] = useState(scene.environment.defaultMode === 'play' && !walkDisabled);
  // 플레이 모드에서 캐릭터가 근접한 interact 대상 (E 프롬프트 표시용). 탐색 모드에선 항상 null.
  const [interactTarget, setInteractTarget] = useState<{ id: string; name: string } | null>(null);
  // E키를 누를 때마다 증가 — 대화 열기/다음 문장(DialogueAdvanceContext로 3D 트리에 전달)
  const [dialogueNonce, setDialogueNonce] = useState(0);

  // 런타임 오브젝트 표시/숨김 오버라이드 (show/hide/toggle_object 액션) — objectId → visible
  const [visOverride, setVisOverride] = useState<Record<string, boolean>>({});
  // 런타임 콜라이더 통과 오버라이드 (set_passable/set_solid/toggle_collision — 문 열기/닫기) — objectId → passable
  //   true면 플레이 모드에서 콜라이더 제거(시각은 유지, 통과 가능). PlayCanvas로 id Set 전달.
  const [passOverride, setPassOverride] = useState<Record<string, boolean>>({});
  const passableIds = useMemo(() => {
    const s = new Set<string>();
    for (const id in passOverride) if (passOverride[id]) s.add(id);
    return s;
  }, [passOverride]);
  // 카메라 요청 — id가 objectId면 그 오브젝트로 포커스, null이면 초기(홈) 시점으로 복귀
  const [focusRequest, setFocusRequest] = useState<{ id: string | null; t: number } | null>(null);
  const resetCamera = () => setFocusRequest({ id: null, t: Date.now() });
  // 플레이 모드 카메라 포커스 대상 — focus_object가 플레이에서 발동되면 그 오브젝트로 줌(팔로우 대체).
  const [playFocus, setPlayFocus] = useState<{ id: string } | null>(null);
  // 상호작용 진행 중 플래그 — true면 캐릭터 이동 잠금. MOVEMENT_LOCKING_ACTIONS 발동 시 켜짐.
  const [interactionLock, setInteractionLock] = useState(false);
  // 상호작용 종료 — 팝업 닫기·카메라 포커스 복귀·이동 잠금 해제를 한 번에 (팝업 닫기 버튼/Esc가 호출)
  const endInteraction = () => { setPopup(null); setPlayFocus(null); setInteractionLock(false); };
  // Esc로 상호작용 종료 (팝업 없는 포커스 단독일 때도 빠져나올 수 있게)
  useEffect(() => {
    if (!interactionLock) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') endInteraction(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactionLock]);
  // animate_object 액션용 런타임 클립 요청 (objectId → {name, t})
  const [clipRequests, setClipRequests] = useState<Record<string, { name: string; t: number }>>({});

  // ── move_object 액션 — 런타임 위치 오버라이드 (objectId → 현재 렌더 위치) ──
  // visOverride와 같은 방식으로 씬 데이터에 주입해 렌더한다. 모든 뷰어 경로(탐색·인스턴스드·
  // 플레이 RigidBody)가 object.position을 존중하고, rapier RigidBody는 position prop 변경 시
  // setTranslation으로 텔레포트하므로 플레이 모드에선 콜라이더도 함께 이동한다.
  const [posOverride, setPosOverride] = useState<Record<string, Vector3>>({});
  // 진행 중인 이동 애니메이션 — 단일 rAF 루프가 모든 대상을 이징(easeInOutQuad) 갱신
  const moveAnims = useRef<Map<string, { from: Vector3; to: Vector3; start: number; dur: number }>>(new Map());
  const moveRaf = useRef<number | null>(null);
  // 마지막으로 렌더된 위치(애니메이션 도중 재트리거 시 현재 위치에서 이어가기 위함)
  const posCurrent = useRef<Record<string, Vector3>>({});

  const startMove = (targetId: string, to: Vector3, dur: number) => {
    const base = scene.objects.find((o) => o.id === targetId)?.position;
    if (!base) return;
    const from = posCurrent.current[targetId] ?? base;
    moveAnims.current.set(targetId, { from: { ...from }, to, start: performance.now(), dur });
    if (moveRaf.current !== null) return; // 루프가 이미 돌고 있음
    const tick = (now: number) => {
      const next = { ...posCurrent.current };
      moveAnims.current.forEach((a, id) => {
        const t = a.dur <= 0 ? 1 : Math.min(1, (now - a.start) / (a.dur * 1000));
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        next[id] = {
          x: a.from.x + (a.to.x - a.from.x) * e,
          y: a.from.y + (a.to.y - a.from.y) * e,
          z: a.from.z + (a.to.z - a.from.z) * e,
        };
        if (t >= 1) moveAnims.current.delete(id);
      });
      posCurrent.current = next;
      setPosOverride(next);
      moveRaf.current = moveAnims.current.size > 0 ? requestAnimationFrame(tick) : null;
    };
    moveRaf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => {
    if (moveRaf.current !== null) cancelAnimationFrame(moveRaf.current);
  }, []);

  // ── play_sound 액션 — URL별 오디오 엘리먼트 재사용 (반복 트리거 시 무한 생성 방지) ──
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());
  const playSound = (url: string) => {
    let el = audioCache.current.get(url);
    if (!el) {
      el = new Audio(url);
      audioCache.current.set(url, el);
    }
    el.currentTime = 0;
    // area 트리거는 사용자 제스처가 아니라 자동재생 정책에 막힐 수 있다 — 조용히 무시
    el.play().catch(() => {});
  };
  useEffect(() => {
    const cache = audioCache.current;
    return () => {
      cache.forEach((el) => { el.pause(); el.src = ''; });
      cache.clear();
    };
  }, []);

  // 오버라이드를 씬 데이터에 반영해 렌더 (모든 뷰어 경로가 object.visible을 존중하므로 이걸로 충분)
  const effectiveScene = useMemo(() => {
    if (Object.keys(visOverride).length === 0 && Object.keys(posOverride).length === 0) return scene;
    return {
      ...scene,
      objects: scene.objects.map((o) => {
        const vis = o.id in visOverride ? visOverride[o.id] : o.visible;
        const pos = posOverride[o.id] ?? o.position;
        return vis === o.visible && pos === o.position ? o : { ...o, visible: vis, position: pos };
      }),
    };
  }, [scene, visOverride, posOverride]);
  const [isTouch, setIsTouch] = useState(false);
  const supabase = useState(() => createBrowserSupabase())[0];
  const mobileInputRef = useRef({ fwd: 0, strafe: 0, jump: false });

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // 모드 전환 시 근접 프롬프트 + 진행 중 상호작용(포커스/잠금) 정리 — 잠금이 다음 모드로 새는 것 방지
  useEffect(() => {
    if (!playMode) setInteractTarget(null);
    setPlayFocus(null);
    setInteractionLock(false);
  }, [playMode]);

  // 방문 이벤트 수집
  useEffect(() => {
    supabase.from('scene_events').insert({ scene_id: scene.sceneId, event_type: 'view' });
  }, [scene.sceneId, supabase]);

  const trackEvent = (eventType: string, objectId?: string, objectName?: string) => {
    supabase.from('scene_events').insert({
      scene_id: scene.sceneId,
      event_type: eventType,
      object_id: objectId,
      object_name: objectName,
    });
  };

  const handleObjectEvent = (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => {
    if (trigger === 'click') trackEvent('click', obj.id, obj.name);
    if (trigger === 'area_enter') trackEvent('area_enter', obj.id, obj.name);
    if (trigger === 'area_exit') trackEvent('area_exit', obj.id, obj.name);
    if (trigger === 'interact') { trackEvent('interact', obj.id, obj.name); setDialogueNonce((n) => n + 1); }

    const matchingEvents = obj.events.filter((e) => e.trigger === trigger);
    for (const ev of matchingEvents) {
      if (ev.action === 'open_url' && ev.value) {
        // area_enter는 사용자 제스처가 아닌 물리 콜백이라 브라우저가 window.open을
        // 차단할 수 있다 — 차단되면 링크가 담긴 팝업으로 폴백
        const opened = window.open(ev.value, '_blank', 'noopener noreferrer');
        if (!opened) setPopup({ title: obj.name, content: ev.value });
      } else if (ev.action === 'show_popup') {
        // 팝업은 뷰어(임베드 포함) 안에 직접 렌더 — 플레이어가 바로 본다.
        setPopup({ title: obj.name, content: ev.value });
        // iframe이면 부모에도 통지(호스트가 자체 UI로 처리하고 싶을 때 선택적으로 구독).
        if (onBridge && window.parent !== window) {
          onBridge({ type: 'park3d:popup', sceneId: scene.sceneId, objectId: obj.id, objectName: obj.name, value: ev.value });
        }
      } else if (ev.action === 'go_to_scene' && ev.value) {
        // 현재 경로의 씬 id를 대상 id로 치환해 이동 → /space·/embed·커스텀도메인 모두 대응.
        // (경로에 현재 씬 id가 없으면 독립 URL 기준으로 폴백)
        const path = window.location.pathname;
        const target = path.includes(scene.sceneId) ? path.replace(scene.sceneId, ev.value) : `/space/${ev.value}`;
        window.location.href = target + window.location.search;
      } else if (ev.action === 'show_object' && ev.value) {
        setVisOverride((v) => ({ ...v, [ev.value]: true }));
      } else if (ev.action === 'hide_object' && ev.value) {
        setVisOverride((v) => ({ ...v, [ev.value]: false }));
      } else if (ev.action === 'toggle_object' && ev.value) {
        setVisOverride((v) => {
          // 현재 표시 상태 = 오버라이드가 있으면 그 값, 없으면 원본 씬의 visible
          const cur = ev.value in v ? v[ev.value] : (scene.objects.find((o) => o.id === ev.value)?.visible ?? true);
          return { ...v, [ev.value]: !cur };
        });
      } else if (ev.action === 'focus_object' && ev.value) {
        // 탐색 모드: OrbitControls 카메라를 대상으로 이동. 플레이 모드: 팔로우 대신 대상 줌(playFocus).
        if (playMode) setPlayFocus({ id: ev.value });
        else setFocusRequest({ id: ev.value, t: Date.now() });
      } else if (ev.action === 'reset_camera') {
        // 카메라를 초기 시점으로 복귀 (탐색 모드)
        resetCamera();
      } else if (ev.action === 'animate_object' && ev.value) {
        // value = "대상objectId|클립이름" → 대상 오브젝트에 클립 재생 요청
        const sep = ev.value.indexOf('|');
        const targetId = sep >= 0 ? ev.value.slice(0, sep) : ev.value;
        const clip = sep >= 0 ? ev.value.slice(sep + 1) : '';
        if (targetId && clip) setClipRequests((m) => ({ ...m, [targetId]: { name: clip, t: Date.now() } }));
      } else if (ev.action === 'play_animation' && ev.value) {
        // 자기 자신 클립 재생 — 모든 트리거에서 동작하도록 clipRequests(→ ViewerObject externalClip)로 라우팅.
        // 핵심: interact(E)에서도 재생돼 "근접 하이라이트+E프롬프트"와 애니메이션이 같은 상호작용에 묶인다.
        // click/hover는 ViewerObject internalClip, area는 PhysicsObject activeClip 경로와 중복되나 같은 클립이라 무해.
        setClipRequests((m) => ({ ...m, [obj.id]: { name: ev.value, t: Date.now() } }));
      } else if (ev.action === 'move_object' && ev.value) {
        // value = "대상objectId|dx,dy,dz|초" — 원래 저장 위치 기준 오프셋으로 부드럽게 이동
        const [targetId, offsetStr, durStr] = ev.value.split('|');
        const base = scene.objects.find((o) => o.id === targetId)?.position;
        if (base) {
          const [dx, dy, dz] = (offsetStr ?? '').split(',').map((s) => parseFloat(s));
          const dur = parseFloat(durStr ?? '');
          startMove(targetId, {
            x: base.x + (Number.isFinite(dx) ? dx : 0),
            y: base.y + (Number.isFinite(dy) ? dy : 0),
            z: base.z + (Number.isFinite(dz) ? dz : 0),
          }, Number.isFinite(dur) ? Math.max(0, dur) : 1);
        }
      } else if (ev.action === 'set_passable' && ev.value) {
        setPassOverride((p) => ({ ...p, [ev.value]: true }));
      } else if (ev.action === 'set_solid' && ev.value) {
        setPassOverride((p) => ({ ...p, [ev.value]: false }));
      } else if (ev.action === 'toggle_collision' && ev.value) {
        setPassOverride((p) => ({ ...p, [ev.value]: !p[ev.value] }));
      } else if (ev.action === 'play_sound' && ev.value) {
        playSound(ev.value);
      } else if (ev.action === 'emit_event') {
        // Event Bridge — 임베드(iframe)일 때만 부모 페이지로 커스텀 이벤트 전송
        if (onBridge && window.parent !== window) {
          onBridge({ type: 'park3d:event', sceneId: scene.sceneId, objectId: obj.id, objectName: obj.name, trigger, value: ev.value });
        }
      }
    }
    // 이동 잠금 — 플레이 모드에서 이동을 막는 액션(팝업·포커스 등)이 하나라도 발동되면 상호작용 잠금.
    // 해제는 endInteraction()(팝업 닫기/Esc). 중앙 목록 MOVEMENT_LOCKING_ACTIONS로 확장 관리.
    if (playMode && matchingEvents.some((e) => MOVEMENT_LOCKING_ACTIONS.has(e.action))) {
      setInteractionLock(true);
    }
  };

  // E 프롬프트/버튼 표시 조건 — 근접 대상이 interact 이벤트를 갖거나, E로 여는 대화(show='interact')일 때.
  // (항상/근접 표시 대화나 자동 넘김은 E 프롬프트 없이 말풍선만 뜨거나 내부 'E ▶' 힌트로 안내)
  const interactTargetObj = interactTarget ? effectiveScene.objects.find((o) => o.id === interactTarget.id) : null;
  const interactTargetDlg = interactTargetObj ? effectiveDialogue(interactTargetObj) : null;
  const interactTargetHasE = !!interactTargetObj?.events.some((e) => e.trigger === 'interact')
    || interactTargetDlg?.show === 'interact';

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-canvas">
      <ViewerCanvas scene={effectiveScene} playMode={playMode} onObjectClick={handleObjectEvent} mobileInputRef={mobileInputRef} focusRequest={focusRequest} clipRequests={clipRequests} onInteractPromptChange={(obj) => setInteractTarget(obj ? { id: obj.id, name: obj.name } : null)} interactHighlightId={interactTarget?.id ?? null} dialogueNonce={dialogueNonce} passableIds={passableIds} playFocusId={playFocus?.id ?? null} movementLocked={interactionLock} />

      {/* 상단 오버레이 — 독립 URL(/space)에서만 풀 UI */}
      {variant === 'standalone' && (
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {isOwner && (
            <button
              onClick={() => {
                if (window.opener) window.close();
                else window.location.href = `/editor/${projectId}`;
              }}
              className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-white/10 text-white text-xs px-3 py-1.5 rounded-xs hover:bg-black/70 transition-colors"
            >
              ← 에디터로
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="text-white/60 text-xs font-medium bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-xs">
            {projectName}
          </span>
          {/* 시점 초기화 — 탐색 모드에서 카메라를 초기 위치로 복귀 (포커스 후 되돌리기) */}
          {!playMode && (
            <button
              onClick={resetCamera}
              title="카메라를 처음 시점으로"
              className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 text-white/70 text-xs px-3 py-1.5 rounded-xs hover:bg-black/60 transition-colors"
            >
              ⌂ 시점 초기화
            </button>
          )}
          {/* 둘러보기 전용 씬은 플레이 토글 자체를 숨김 (캐릭터 소환 불가) */}
          {!walkDisabled && (
            <button
              onClick={() => setPlayMode((v) => !v)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xs border backdrop-blur-sm transition-all ${
                playMode
                  ? 'bg-primary/80 border-primary/50 text-white'
                  : 'bg-black/40 border-white/10 text-white/70 hover:bg-black/60'
              }`}
            >
              {playMode ? '⏹ 탐색 모드' : '▶ 플레이'}
            </button>
          )}
        </div>
      </div>
      )}

      {/* 임베드는 모드 전환 버튼 없음 — 씬의 "기본 진입 모드"로 고정(몰입형). */}

      {playMode && !isTouch && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm border border-white/10 rounded-xs px-4 py-2 text-white/50 text-xs flex items-center gap-3">
            <span>WASD 이동</span>
            <span className="text-white/20">|</span>
            <span>Space 점프</span>
            <span className="text-white/20">|</span>
            <span>E 상호작용</span>
            <span className="text-white/20">|</span>
            <span>마우스 드래그 시점</span>
          </div>
        </div>
      )}

      {/* 근접 상호작용 프롬프트 (데스크톱) — 범위 내 대상이 있을 때만. E 키캡만 표시(대상은 3D 하이라이트로 구분) */}
      {playMode && !isTouch && interactTarget && interactTargetHasE && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none">
          <kbd className="inline-flex items-center justify-center min-w-[40px] h-10 px-3 bg-black/65 backdrop-blur-sm border border-white/25 rounded-xs text-white text-base font-bold shadow-lg">E</kbd>
        </div>
      )}

      {/* 근접 상호작용 버튼 (모바일) */}
      {playMode && isTouch && interactTarget && interactTargetHasE && (
        <button
          onClick={() => {
            const obj = effectiveScene.objects.find((o) => o.id === interactTarget.id);
            if (obj) handleObjectEvent(obj, 'interact');
          }}
          className="absolute bottom-32 right-6 z-20 flex items-center justify-center w-16 h-16 rounded-full bg-primary/80 border border-primary/50 text-white text-2xl font-bold backdrop-blur-sm active:scale-95 transition-transform"
        >
          E
        </button>
      )}

      {playMode && isTouch && <MobileControls inputRef={mobileInputRef} />}

      {/* Park3D 배지 — 독립 URL, Free 플랜만 */}
      {variant === 'standalone' && !hideBadge && (
        <a
          href="https://park3d.io"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 text-white/50 hover:text-white/80 text-[10px] px-2.5 py-1.5 rounded-xs transition-colors"
        >
          <span className="text-sm leading-none">⬡</span>
          Powered by Park3D
        </a>
      )}

      {/* 임베드 워터마크 */}
      {variant === 'embed' && (
        <div className="absolute bottom-3 left-3 pointer-events-none">
          <div className="flex items-center gap-1 bg-black/30 backdrop-blur-sm text-white/30 text-[9px] px-2 py-1 rounded-xs">
            <span className="text-xs leading-none">⬡</span>
            Park3D
          </div>
        </div>
      )}

      {/* 팝업 모달 */}
      {popup && (
        <div className="absolute inset-0 flex items-center justify-center p-4 z-50">
          {/* 배경(overlay) 클릭으로는 닫히지 않음 — 오직 '닫기' 버튼으로만. 뒤 캔버스 클릭도 이 div가 가림 */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-modal">
            <h3 className="text-lg font-bold text-slate-900 mb-3">{popup.title}</h3>
            <RichContent value={popup.content} onLight />
            <button
              onClick={endInteraction}
              className="mt-5 w-full py-2.5 rounded-xs bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold text-sm hover:from-violet-500 hover:to-cyan-500 transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 포커스 단독(팝업 없음) — 투명 차단막으로 뒤 캔버스 클릭 차단. 우상단 닫기 버튼 + Esc로 복귀 */}
      {interactionLock && !popup && (
        <>
          <div className="absolute inset-0 z-40" />
          <button
            onClick={endInteraction}
            className="absolute top-4 right-4 z-50 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-xs font-semibold px-3 py-2 rounded-xs hover:bg-black/70 transition-colors"
          >
            ✕ 닫기 <span className="text-white/50">(Esc)</span>
          </button>
        </>
      )}
    </div>
  );
}
