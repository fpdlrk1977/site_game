'use client';

// Scenes 섹션 — 좌측 패널 상단의 씬 목록(전환·추가·삭제·메인 씬 지정).
//   2026-07-21: 상단 바의 드롭다운(SceneSwitcher)을 여기로 **옮기면서** 인라인 목록으로 바꿨다.
//   드롭다운 시절의 키보드 순환 탐색(useListNav)은 인라인 목록엔 맞지 않아 뺐다.

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, House, ChevronDown, ChevronRight, Copy, Pencil } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { usePlan } from '@/hooks/usePlan';
import { createBrowserSupabase } from '@/lib/supabase';
import { normalizeSceneData } from '@/types/scene';
import { SCENE_TEMPLATES } from '@/lib/sceneTemplates';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { setMainScene } from '../actions';

interface SceneItem {
  id: string;
  name: string;
}

// ── 템플릿 선택 모달 ──────────────────────────────────────
function TemplatePickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (templateId: string, name: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState('empty');
  const [name, setName] = useState('새 씬');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-sm w-full max-w-lg shadow-modal overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">씬 템플릿 선택</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* 템플릿 그리드 */}
          <div className="grid grid-cols-3 gap-2.5">
            {SCENE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`p-3 rounded-xs border text-left transition-all ${
                  selected === t.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border/60 bg-background/50'
                }`}
              >
                <div className="text-2xl mb-1.5">{t.emoji}</div>
                <p className="text-xs font-semibold text-foreground">{t.name}</p>
                <p className="text-[10px] text-muted mt-0.5 leading-relaxed">{t.description}</p>
              </button>
            ))}
          </div>

          {/* 씬 이름 */}
          <div>
            <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1.5">
              씬 이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSelect(selected, name.trim())}
              className="w-full bg-background border border-border rounded-xs px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="씬 이름..."
              autoFocus
            />
          </div>
        </div>

        <div className="px-5 pb-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xs text-sm text-muted hover:bg-background transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => name.trim() && onSelect(selected, name.trim())}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-xs text-sm font-semibold bg-gradient-to-r from-violet-600 to-cyan-600 text-white hover:from-violet-500 hover:to-cyan-500 transition-all disabled:opacity-40"
          >
            씬 만들기
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Scenes 섹션 ───────────────────────────────────────────
export function ScenesSection() {
  const { projectId, sceneId, isModified, loadScene } = useSceneStore();
  const { can } = usePlan();
  const [open, setOpen] = useState(true);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [mainSceneId, setMainSceneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 우클릭 메뉴 + 인라인 이름 변경
  const [menu, setMenu] = useState<{ x: number; y: number; sceneId: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // 씬 목록 + 메인 씬 — 드롭다운 시절엔 '열 때' 불렀지만 인라인은 항상 보이므로 마운트 시 1회.
  useEffect(() => {
    if (!projectId) return;
    const supabase = createBrowserSupabase();
    supabase.from('scenes').select('id, name').eq('project_id', projectId).order('created_at')
      .then(({ data }) => setScenes(data ?? []));
    supabase.from('projects').select('default_scene_id').eq('id', projectId).single()
      .then(({ data }) => setMainSceneId((data?.default_scene_id as string | null) ?? null));
  }, [projectId]);

  const switchScene = async (targetId: string) => {
    if (targetId === sceneId) return;
    if (isModified && !confirm('저장하지 않은 변경사항이 있습니다. 전환하면 사라집니다.')) return;
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase
        .from('scenes')
        .select('id, scene_data, project_id, version')
        .eq('id', targetId)
        .single();
      if (data && projectId) {
        loadScene(
          normalizeSceneData((data.scene_data as Record<string, unknown>) ?? {}, projectId, data.id),
          typeof data.version === 'number' ? data.version : 1,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAddScene = () => {
    if (!can('multiScene')) {
      alert('다중 씬은 Pro 플랜 이상에서 사용 가능합니다.');
      return;
    }
    setShowTemplatePicker(true);
  };

  const createFromTemplate = async (templateId: string, sceneName: string) => {
    if (!projectId) return;
    setShowTemplatePicker(false);
    setBusy(true);
    try {
      const template = SCENE_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;
      const supabase = createBrowserSupabase();
      const newId = crypto.randomUUID();
      const sceneData = template.build(projectId, newId);
      await supabase.from('scenes').insert({
        id: newId,
        project_id: projectId,
        name: sceneName,
        scene_data: sceneData,
      });
      setScenes((prev) => [...prev, { id: newId, name: sceneName }]);
      await switchScene(newId);
    } finally {
      setBusy(false);
    }
  };

  const deleteScene = async (targetId: string, name: string) => {
    if (scenes.length <= 1) { alert('마지막 씬은 삭제할 수 없습니다.'); return; }
    if (!confirm(`"${name}" 씬을 삭제할까요? 복구할 수 없습니다.`)) return;
    await createBrowserSupabase().from('scenes').delete().eq('id', targetId);
    const remaining = scenes.filter((s) => s.id !== targetId);
    setScenes(remaining);
    if (targetId === sceneId) await switchScene(remaining[0].id);
  };

  // 이름 변경 — 트리 오브젝트와 같은 인라인 편집. 빈 이름은 무시하고 되돌린다.
  const renameScene = async (targetId: string, name: string) => {
    const next = name.trim();
    setRenamingId(null);
    const cur = scenes.find((s) => s.id === targetId);
    if (!next || !cur || next === cur.name) return;
    setScenes((prev) => prev.map((s) => (s.id === targetId ? { ...s, name: next } : s)));
    await createBrowserSupabase().from('scenes').update({ name: next }).eq('id', targetId);
  };

  // 씬 복사 — scene_data를 통째로 복제해 새 씬으로. 복사본은 원본 바로 뒤에 놓고 전환하지 않는다
  //   (작업 중이던 씬을 지키기 위함 — 원하면 목록에서 눌러 들어간다).
  //   scene_data 안의 sceneId만 새 id로 바꾼다. projectId는 그대로(같은 프로젝트 내 복사).
  const duplicateScene = async (targetId: string, name: string) => {
    if (!projectId) return;
    if (!can('multiScene')) { alert('다중 씬은 Pro 플랜 이상에서 사용 가능합니다.'); return; }
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.from('scenes').select('scene_data').eq('id', targetId).single();
      const newId = crypto.randomUUID();
      const src = (data?.scene_data as Record<string, unknown>) ?? {};
      await supabase.from('scenes').insert({
        id: newId,
        project_id: projectId,
        name: `${name} 복사본`,
        scene_data: { ...src, sceneId: newId },
      });
      setScenes((prev) => {
        const i = prev.findIndex((s) => s.id === targetId);
        const next = [...prev];
        next.splice(i < 0 ? prev.length : i + 1, 0, { id: newId, name: `${name} 복사본` });
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  // 메인 씬 지정 — 공유 링크/커스텀 도메인으로 들어왔을 때 처음 열리는 씬.
  //   낙관적 갱신 후 실패하면 되돌린다(서버 액션이 소유자·프로젝트 소속을 검증).
  const makeMain = async (targetId: string) => {
    if (!projectId || targetId === mainSceneId) return;
    const prev = mainSceneId;
    setMainSceneId(targetId);
    const res = await setMainScene(projectId, targetId);
    if (!res.ok) {
      setMainSceneId(prev);
      alert(res.error ?? '메인 씬 지정에 실패했습니다.');
    }
  };

  return (
    <div className="shrink-0">
      <div className="flex items-center px-3 py-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-semibold text-foreground hover:text-primary transition-colors"
        >
          Scenes
          {open ? <ChevronDown size={12} className="text-foreground" /> : <ChevronRight size={12} className="text-foreground" />}
        </button>
        <button
          onClick={handleAddScene}
          disabled={busy}
          title="새 씬 추가"
          className="ml-auto w-6 h-6 rounded-xs flex items-center justify-center text-foreground hover:bg-background transition-colors disabled:opacity-40"
        >
          <Plus size={20} />
        </button>
      </div>

      {open && (
        <div className="pb-1">
          {scenes.map((scene) => {
            const isCurrent = scene.id === sceneId;
            const isMain = scene.id === mainSceneId;
            return (
              <div
                key={scene.id}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, sceneId: scene.id }); }}
                className={`group flex items-center h-7 px-1.5 mx-1.5 rounded-xs transition-colors ${
                  isCurrent ? 'bg-foreground/[0.06]' : 'hover:bg-background'
                }`}
              >
                {/* 현재 씬 표시는 체크 아이콘 대신 텍스트 강조 + 행 하이라이트로 — 메인 씬(집)과 헷갈리지 않게. */}
                {renamingId === scene.id ? (
                  <input
                    defaultValue={scene.name}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => renameScene(scene.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameScene(scene.id, e.currentTarget.value);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="flex-1 min-w-0 bg-background border border-border rounded-xs px-1.5 py-0 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <button
                    onClick={() => switchScene(scene.id)}
                    disabled={busy}
                    className="flex items-center flex-1 min-w-0 text-left px-1 disabled:opacity-50"
                  >
                    <span className={`truncate text-[11px] ${isCurrent ? 'text-foreground font-medium' : 'text-foreground/70'}`}>
                      {scene.name}
                    </span>
                  </button>
                )}
                {/* 메인 씬 표식 — 지정된 씬에만 상시 표시(지정/해제는 우클릭 메뉴에서).
                    이름 편집 중엔 입력창에 자리를 내주고 숨긴다(트리와 같은 규칙). */}
                {isMain && renamingId !== scene.id && (
                  <span title="메인 씬 (공유 링크로 열리는 씬)" className="w-5 h-5 shrink-0 flex items-center justify-center text-primary">
                    <House size={12} />
                  </span>
                )}
              </div>
            );
          })}
          {!can('multiScene') && (
            <p className="px-3 pt-1 text-[9px] text-muted/50">다중 씬은 Pro 플랜부터</p>
          )}
        </div>
      )}

      {/* 우클릭 메뉴 — 메인씬 지정 / 복사 / 이름 변경 / 삭제.
          씬이 하나뿐이면 '메인씬 지정'(이미 메인일 수밖에 없음)과 '삭제'(마지막 씬)는 숨긴다. */}
      {menu && (() => {
        const target = scenes.find((s) => s.id === menu.sceneId);
        if (!target) return null;
        const only = scenes.length <= 1;
        const close = () => setMenu(null);
        const item = 'w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-background transition-colors flex items-center gap-2 whitespace-nowrap';
        return (
          <ContextMenu x={menu.x} y={menu.y} onClose={close} className="w-max">
            {!only && target.id !== mainSceneId && (
              <button onClick={() => { makeMain(target.id); close(); }} className={item}>
                <House size={13} className="text-foreground" /> 메인 씬으로 지정
              </button>
            )}
            <button onClick={() => { duplicateScene(target.id, target.name); close(); }} className={item}>
              <Copy size={13} className="text-foreground" /> 복사
            </button>
            <button onClick={() => { setRenamingId(target.id); close(); }} className={item}>
              <Pencil size={13} className="text-foreground" /> 이름 변경
            </button>
            {!only && (
              <>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { deleteScene(target.id, target.name); close(); }}
                  className={`${item} hover:text-red-500`}
                >
                  <X size={13} /> 삭제
                </button>
              </>
            )}
          </ContextMenu>
        );
      })()}

      {showTemplatePicker && typeof document !== 'undefined' && createPortal(
        <TemplatePickerModal
          onSelect={createFromTemplate}
          onClose={() => setShowTemplatePicker(false)}
        />,
        document.body,
      )}
    </div>
  );
}
