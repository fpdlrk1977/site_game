"use client";

// 씬 전환 — 프로젝트명 아래 **드롭다운 하나**.
//   2026-07-31: 좌패널을 헤더만 남기고 비우면서 인라인 `ScenesSection`이 사라졌다.
//   목록을 다시 인라인으로 펼치면 패널이 도로 길어지므로, 전환만 드롭다운으로 되살린다.
//
// ★ 새 씬은 **빈 씬**이다 — 템플릿 선택(쇼룸·갤러리·광장·카페)은 뺐다.
//   그건 구 오브젝트 시스템으로 지은 장면이라 브릭에선 의미가 없다.
//
// ⚠️ 씬을 갈아끼우면 브릭 저장소도 그 씬으로 붙어야 한다 — `BrickScene`이 `sceneId`를 보고
//   `attachBrickStorage`를 다시 호출하므로 여기선 `loadScene`만 하면 된다.

import { useState, useEffect } from "react";
import { ChevronDown, Plus, House, Copy, Pencil, Trash2, Check, X } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { usePlan } from "@/hooks/usePlan";
import { createBrowserSupabase } from "@/lib/supabase";
import { normalizeSceneData } from "@/types/scene";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { setMainScene } from "../actions";

interface SceneItem {
  id: string;
  name: string;
}

const ACT = "w-5 h-5 shrink-0 rounded-xs flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 hover:bg-background transition-opacity";

export function SceneSwitcher() {
  const { projectId, sceneId, isModified, loadScene } = useSceneStore();
  const { can } = usePlan();
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [mainSceneId, setMainSceneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const supabase = createBrowserSupabase();
    supabase
      .from("scenes")
      .select("id, name")
      .eq("project_id", projectId)
      .order("created_at")
      .then(({ data }) => setScenes(data ?? []));
    supabase
      .from("projects")
      .select("default_scene_id")
      .eq("id", projectId)
      .single()
      .then(({ data }) => setMainSceneId((data?.default_scene_id as string | null) ?? null));
  }, [projectId]);

  const current = scenes.find((s) => s.id === sceneId);

  const switchScene = async (targetId: string) => {
    if (targetId === sceneId) return;
    if (isModified && !confirm("저장하지 않은 변경사항이 있습니다. 전환하면 사라집니다.")) return;
    setBusy(true);
    try {
      const { data } = await createBrowserSupabase()
        .from("scenes")
        .select("id, scene_data, version")
        .eq("id", targetId)
        .single();
      if (data && projectId) {
        loadScene(
          normalizeSceneData((data.scene_data as Record<string, unknown>) ?? {}, projectId, data.id),
          typeof data.version === "number" ? data.version : 1,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  // 새 씬 = 빈 씬. 브릭은 `brick_chunks`에 따로 쌓이므로 scene_data는 껍데기면 된다.
  const createScene = async (name: string) => {
    setAdding(false);
    const next = name.trim();
    if (!projectId || !next) return;
    if (!can("multiScene")) {
      alert("다중 씬은 Pro 플랜 이상에서 사용 가능합니다.");
      return;
    }
    setBusy(true);
    try {
      const newId = crypto.randomUUID();
      await createBrowserSupabase().from("scenes").insert({
        id: newId,
        project_id: projectId,
        name: next,
        scene_data: normalizeSceneData({}, projectId, newId),
      });
      setScenes((prev) => [...prev, { id: newId, name: next }]);
      await switchScene(newId);
    } finally {
      setBusy(false);
    }
  };

  const renameScene = async (targetId: string, name: string) => {
    const next = name.trim();
    setRenamingId(null);
    const cur = scenes.find((s) => s.id === targetId);
    if (!next || !cur || next === cur.name) return;
    setScenes((prev) => prev.map((s) => (s.id === targetId ? { ...s, name: next } : s)));
    await createBrowserSupabase().from("scenes").update({ name: next }).eq("id", targetId);
  };

  // 복사본은 원본 바로 뒤에 놓고 **전환하지 않는다**(작업 중이던 씬을 지킨다).
  //   ⚠️ 브릭은 복사되지 않는다 — `brick_chunks`가 씬 id로 묶여 있고 여기선 scene_data만 복제한다.
  const duplicateScene = async (targetId: string, name: string) => {
    if (!projectId) return;
    if (!can("multiScene")) {
      alert("다중 씬은 Pro 플랜 이상에서 사용 가능합니다.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.from("scenes").select("scene_data").eq("id", targetId).single();
      const newId = crypto.randomUUID();
      const src = (data?.scene_data as Record<string, unknown>) ?? {};
      await supabase.from("scenes").insert({
        id: newId,
        project_id: projectId,
        name: `${name} 복사본`,
        scene_data: { ...src, sceneId: newId },
      });
      setScenes((prev) => {
        const i = prev.findIndex((s) => s.id === targetId);
        const nextList = [...prev];
        nextList.splice(i < 0 ? prev.length : i + 1, 0, { id: newId, name: `${name} 복사본` });
        return nextList;
      });
    } finally {
      setBusy(false);
    }
  };

  const deleteScene = async (targetId: string, name: string) => {
    if (scenes.length <= 1) {
      alert("마지막 씬은 삭제할 수 없습니다.");
      return;
    }
    if (!confirm(`"${name}" 씬을 삭제할까요? 복구할 수 없습니다.`)) return;
    await createBrowserSupabase().from("scenes").delete().eq("id", targetId);
    const remaining = scenes.filter((s) => s.id !== targetId);
    setScenes(remaining);
    if (targetId === sceneId) await switchScene(remaining[0].id);
  };

  // 메인 씬 = 공유 링크/커스텀 도메인으로 들어왔을 때 처음 열리는 씬.
  //   낙관적 갱신 후 실패하면 되돌린다(서버 액션이 소유자·프로젝트 소속을 검증).
  const makeMain = async (targetId: string) => {
    if (!projectId || targetId === mainSceneId) return;
    const prev = mainSceneId;
    setMainSceneId(targetId);
    const res = await setMainScene(projectId, targetId);
    if (!res.ok) {
      setMainSceneId(prev);
      alert(res.error ?? "메인 씬 지정에 실패했습니다.");
    }
  };

  return (
    <DropdownMenu
      placement="bottom-start"
      panelClassName="min-w-[240px] py-1"
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          onClick={toggle}
          title="씬 전환"
          className="w-full flex items-center gap-1 px-1 py-0.5 rounded-xs text-[11px] text-foreground/70 hover:bg-background transition-colors"
        >
          <span className="truncate">{current?.name ?? "씬"}</span>
          <ChevronDown size={12} className={`shrink-0 text-foreground ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {() => (
        <>
          {scenes.map((scene) => {
            const isCurrent = scene.id === sceneId;
            const isMain = scene.id === mainSceneId;
            return (
              <div
                key={scene.id}
                className={`group flex items-center gap-0.5 h-7 px-1.5 mx-1 rounded-xs ${
                  isCurrent ? "bg-muted/5 dark:bg-muted/10" : "hover:bg-background"
                }`}
              >
                {renamingId === scene.id ? (
                  <input
                    defaultValue={scene.name}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => renameScene(scene.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameScene(scene.id, e.currentTarget.value);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="flex-1 min-w-0 bg-background border border-border rounded-xs px-1.5 py-0 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <>
                    <button
                      onClick={() => switchScene(scene.id)}
                      disabled={busy}
                      className="flex-1 min-w-0 text-left px-1 disabled:opacity-50"
                    >
                      <span className={`truncate block text-[11px] ${isCurrent ? "text-foreground font-medium" : "text-foreground/70"}`}>
                        {scene.name}
                      </span>
                    </button>
                    {/* 메인 씬은 상시 표식, 나머지는 hover 시 '지정' 버튼 */}
                    {isMain ? (
                      <span title="메인 씬 (공유 링크로 열리는 씬)" className="w-5 h-5 shrink-0 flex items-center justify-center text-primary">
                        <House size={12} />
                      </span>
                    ) : (
                      <button onClick={() => makeMain(scene.id)} title="메인 씬으로 지정" className={ACT}>
                        <House size={12} />
                      </button>
                    )}
                    <button onClick={() => setRenamingId(scene.id)} title="이름 변경" className={ACT}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => duplicateScene(scene.id, scene.name)} title="복사 (브릭은 복사되지 않음)" className={ACT}>
                      <Copy size={12} />
                    </button>
                    {/* 마지막 씬은 삭제 버튼 자체를 숨긴다 — 눌러도 아무 일 없는 항목을 만들지 않는다 */}
                    {scenes.length > 1 && (
                      <button onClick={() => deleteScene(scene.id, scene.name)} title="삭제" className={`${ACT} hover:text-danger`}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div className="border-t border-border/60 mt-1 pt-1">
            {adding ? (
              <div className="flex items-center gap-0.5 h-7 px-1.5 mx-1">
                <input
                  defaultValue="새 씬"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createScene(e.currentTarget.value);
                    if (e.key === "Escape") setAdding(false);
                  }}
                  className="flex-1 min-w-0 bg-background border border-border rounded-xs px-1.5 py-0 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onMouseDown={(e) => {
                    // blur보다 먼저 값을 읽어야 한다 — 입력창이 사라지면 못 읽는다
                    e.preventDefault();
                    const input = e.currentTarget.parentElement?.querySelector("input");
                    if (input) createScene(input.value);
                  }}
                  title="만들기"
                  className="w-5 h-5 shrink-0 rounded-xs flex items-center justify-center text-foreground hover:bg-background"
                >
                  <Check size={12} />
                </button>
                <button onClick={() => setAdding(false)} title="취소" className="w-5 h-5 shrink-0 rounded-xs flex items-center justify-center text-foreground hover:bg-background">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                disabled={busy}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-foreground hover:bg-background transition-colors text-left disabled:opacity-40"
              >
                <Plus size={13} className="text-foreground" /> 새 씬
              </button>
            )}
          </div>
        </>
      )}
    </DropdownMenu>
  );
}
