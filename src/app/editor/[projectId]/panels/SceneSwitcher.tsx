'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, Check } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { usePlan } from '@/hooks/usePlan';
import { useDropdown } from '@/hooks/useDropdown';
import { useListNav } from '@/hooks/useListNav';
import { createBrowserSupabase } from '@/lib/supabase';
import { normalizeSceneData } from '@/types/scene';
import { SCENE_TEMPLATES } from '@/lib/sceneTemplates';

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

// ── SceneSwitcher ─────────────────────────────────────────
export function SceneSwitcher() {
  const { projectId, sceneId, isModified, loadScene } = useSceneStore();
  const { can } = usePlan();
  const { open, openMenu, close, triggerRef, panelRef, panelStyle } = useDropdown<HTMLButtonElement>();
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [busy, setBusy] = useState(false);
  // 씬 목록 + "새 씬 추가" 항목까지 합쳐 순환 탐색 (삭제 버튼은 키보드 탐색 대상 아님)
  const [highlight, setHighlight] = useListNav(scenes.length + 1, open);

  const currentScene = scenes.find((s) => s.id === sceneId);

  useEffect(() => {
    if (!open || !projectId) return;
    createBrowserSupabase()
      .from('scenes')
      .select('id, name')
      .eq('project_id', projectId)
      .order('created_at')
      .then(({ data }) => setScenes(data ?? []));
  }, [open, projectId]);

  const openSwitcher = () => {
    const idx = scenes.findIndex((s) => s.id === sceneId);
    setHighlight(idx >= 0 ? idx : 0);
    openMenu();
  };

  const switchScene = async (targetId: string) => {
    if (targetId === sceneId) { close(); return; }
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
          normalizeSceneData(
            (data.scene_data as Record<string, unknown>) ?? {},
            projectId,
            data.id,
          ),
          typeof data.version === 'number' ? data.version : 1,
        );
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  const handleAddScene = () => {
    if (!can('multiScene')) {
      alert('다중 씬은 Pro 플랜 이상에서 사용 가능합니다.');
      return;
    }
    close();
    setShowTemplatePicker(true);
  };

  // 하이라이트가 바뀌면(키보드 이동) 스크롤 위치를 따라간다
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open, panelRef]);

  // Enter/Space로 하이라이트된 항목 실행, Tab 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (highlight < scenes.length) switchScene(scenes[highlight].id);
        else handleAddScene();
      }
      if (e.key === 'Tab') close();
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlight, scenes]);

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
      const newScene = { id: newId, name: sceneName };
      setScenes((prev) => [...prev, newScene]);
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

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => {
          if (busy) return;
          if (open) close(); else openSwitcher();
        }}
        onKeyDown={(e) => {
          if (busy || open) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openSwitcher();
          }
        }}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1 px-2.5 py-1 rounded-xs bg-background text-foreground hover:bg-surface transition-colors text-xs max-w-[140px] disabled:opacity-50"
      >
        <span className="text-[10px] text-muted shrink-0">씬</span>
        <span className="truncate flex-1 text-left">{currentScene?.name ?? '...'}</span>
        <ChevronDown size={12} className="text-muted shrink-0" />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          style={panelStyle}
          className="w-52 bg-surface border border-border rounded-xs shadow-dropdown py-1 overflow-hidden"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">
            씬 목록
          </div>
          {scenes.map((scene, idx) => (
            <div
              key={scene.id}
              data-idx={idx}
              onMouseEnter={() => setHighlight(idx)}
              className={`flex items-center group ${idx === highlight ? 'bg-background' : ''}`}
            >
              <button
                onClick={() => switchScene(scene.id)}
                className={`flex-1 text-left px-3 py-2 text-xs transition-colors ${
                  scene.id === sceneId
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground hover:bg-background'
                }`}
              >
                {scene.id === sceneId && <Check size={12} className="inline mr-1.5 opacity-70" />}
                {scene.name}
              </button>
              {scene.id !== sceneId && (
                <button
                  onClick={() => deleteScene(scene.id, scene.name)}
                  className="hidden group-hover:flex w-7 items-center justify-center py-2 text-muted/60 hover:text-danger transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          <div className="border-t border-border my-1" />
          <button
            data-idx={scenes.length}
            onMouseEnter={() => setHighlight(scenes.length)}
            onClick={handleAddScene}
            disabled={busy}
            className={`w-full text-left px-3 py-2 text-xs text-muted hover:bg-background hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-40 ${
              highlight === scenes.length ? 'bg-background text-foreground' : ''
            }`}
          >
            <span>+</span> 새 씬 추가
            {!can('multiScene') && (
              <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white">
                Pro
              </span>
            )}
          </button>
        </div>,
        document.body,
      )}

      {showTemplatePicker && typeof document !== 'undefined' && createPortal(
        <TemplatePickerModal
          onSelect={createFromTemplate}
          onClose={() => setShowTemplatePicker(false)}
        />,
        document.body,
      )}
    </>
  );
}
