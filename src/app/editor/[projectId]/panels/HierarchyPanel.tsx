"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Box,
  Circle,
  Cylinder,
  Cone,
  Hexagon,
  Square,
  Archive,
  Type,
  Image as ImageIcon,
  Play,
  Package,
  Sparkles,
  Grid3x3,
  CircleDot,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Pencil,
  Copy,
  X,
  Ungroup,
  Lightbulb,
  Flashlight,
  Sun,
  PenTool,
  Boxes,
  CirclePile,
  Cog,
  Focus,
  Unlink,
  Donut,
  CircleMinus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSceneStore, isDescendant } from "@/store/sceneStore";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { ObjectNodeSchema } from "@/types/scene";

type DropPos = "before" | "after" | "inside";

const SHAPE_ICONS: Record<string, LucideIcon> = {
  box: Box,
  sphere: CircleDot,
  cylinder: Cylinder,
  plane: Square,
  frustum: Cone,
  loft: Hexagon,
  extrude: PenTool,
  lathe: PenTool, // 펜툴로 만든 돌출/회전체
  voxel: Boxes, // 복셀(live 프리미티브)
  torus: Donut,
};

function getIcon(obj: ObjectNodeSchema, isCopyRoot = false): LucideIcon {
  if (obj.isActuator) return Cog; // 모터형 액추에이터(부품)
  if (obj.clonerClone) return CircleDot; // 클로너가 생성한 복제본
  if (obj.clonerConfig) return Grid3x3; // 클로너 그룹
  if (obj.isGroup && obj.prefabId) return isCopyRoot ? Focus : CirclePile; // 프리팹 루트 — 원본=CirclePile, 사본=Focus
  if (obj.isGroup) return Archive;
  if (obj.light) return obj.light.type === "point" ? Lightbulb : obj.light.type === "spot" ? Flashlight : Sun;
  if (obj.content) return obj.content.type === "text" ? Type : obj.content.type === "image" ? ImageIcon : Play;
  if (obj.voxels) return Boxes; // 복셀로 만든 오브젝트(현재는 GLB로 구워지지만 레시피로 식별)
  if (obj.assetId) return Package;
  if (obj.particle) return Sparkles;
  return SHAPE_ICONS[obj.primitiveShape ?? ""] ?? Circle;
}

function buildFlatList(all: ObjectNodeSchema[], parentId: string | null, expanded: Set<string>): ObjectNodeSchema[] {
  const items = all.filter((o) => o.parentId === parentId);
  const result: ObjectNodeSchema[] = [];
  for (const obj of items) {
    result.push(obj);
    if (obj.isGroup && expanded.has(obj.id)) {
      result.push(...buildFlatList(all, obj.id, expanded));
    }
  }
  return result;
}

interface ItemProps {
  obj: ObjectNodeSchema;
  depth: number;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClickItem: (id: string, index: number, shiftKey: boolean) => void;
  dragEnabled: boolean;
  isDragging: boolean;
  dropPos: DropPos | null;
  onDragStartItem: (id: string) => void;
  onDragOverItem: (id: string, pos: DropPos) => void;
  onDropItem: (id: string) => void;
  onDragEndItem: () => void;
  menuOpen: boolean;
  menuPos: { x: number; y: number } | null;
  onOpenMenu: (x: number, y: number) => void;
  onCloseMenu: () => void;
}

function HierarchyItem({
  obj,
  depth,
  index,
  isExpanded,
  onToggleExpand,
  onClickItem,
  dragEnabled,
  isDragging,
  dropPos,
  onDragStartItem,
  onDragOverItem,
  onDropItem,
  onDragEndItem,
  menuOpen,
  menuPos,
  onOpenMenu,
  onCloseMenu,
}: ItemProps) {
  const {
    selectedId,
    selectedIds,
    updateObject,
    setObjectLocked,
    pushHistory,
    deleteSelected,
    duplicateSelected,
    selectObject,
    ungroupSelected,
    removeMotorKeepParts,
    openPenToolEdit,
    openVoxelEdit,
  } = useSceneStore();
  const objects = useSceneStore((s) => s.objects);
  const prefabs = useSceneStore((s) => s.prefabs);
  const setPrefabMaster = useSceneStore((s) => s.setPrefabMaster);
  const detachPrefabInstance = useSceneStore((s) => s.detachPrefabInstance);
  // 프리팹 루트인지 + 원본/사본 구분. 원본 미지정(레거시)이면 사본 취급 안 함(현행 아이콘 유지).
  const prefabDef = obj.prefabId ? prefabs.find((p) => p.id === obj.prefabId) : undefined;
  const isPrefabRoot = !!(obj.isGroup && obj.prefabId && prefabDef);
  const isMasterRoot = isPrefabRoot && prefabDef!.masterInstanceId === obj.prefabInstanceId;
  const isCopyRoot = isPrefabRoot && !!prefabDef!.masterInstanceId && !isMasterRoot;
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(obj.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelected = selectedIds.length > 0 ? selectedIds.includes(obj.id) : selectedId === obj.id;
  const hasChildren = obj.isGroup;
  // 조상(부모 체인) 중 잠긴 게 있으면 이 행의 잠금은 조상에서 내려온 것 → 개별 해제 불가(버튼 disabled).
  const lockedByAncestor = useMemo(() => {
    let pid = obj.parentId;
    while (pid) {
      const p = objects.find((o) => o.id === pid);
      if (!p) break;
      if (p.locked) return true;
      pid = p.parentId;
    }
    return false;
  }, [objects, obj.parentId]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!editing) setNameValue(obj.name);
  }, [obj.name, editing]);

  const commitRename = () => {
    setEditing(false);
    const t = nameValue.trim();
    if (t && t !== obj.name) {
      updateObject(obj.id, { name: t });
      pushHistory();
    } else setNameValue(obj.name);
  };

  return (
    <div className="relative">
      {/* 드롭 위치 인디케이터 — before/after는 라인, inside(그룹 안)는 링 강조 */}
      {dropPos === "before" && <span className="absolute left-1 right-1 -top-px h-0.5 bg-primary rounded-full z-10 pointer-events-none" />}
      {dropPos === "after" && <span className="absolute left-1 right-1 -bottom-px h-0.5 bg-primary rounded-full z-10 pointer-events-none" />}
      {dropPos === "inside" && <span className="absolute inset-0 rounded-xs ring-2 ring-primary ring-inset bg-primary/10 z-10 pointer-events-none" />}
      <div
        draggable={dragEnabled && !editing}
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStartItem(obj.id);
        }}
        onDragEnd={onDragEndItem}
        onDragOver={(e) => {
          if (!dragEnabled) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const r = (e.clientY - rect.top) / rect.height;
          // 그룹은 3분할(위=앞, 가운데=안, 아래=뒤), 일반 오브젝트는 2분할(앞/뒤)
          const pos: DropPos = obj.isGroup ? (r < 0.25 ? "before" : r > 0.75 ? "after" : "inside") : r < 0.5 ? "before" : "after";
          onDragOverItem(obj.id, pos);
        }}
        onDrop={(e) => {
          if (!dragEnabled) return;
          e.preventDefault();
          onDropItem(obj.id);
        }}
        onClick={(e) => {
          if (editing) return;
          onClickItem(obj.id, index, e.shiftKey);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          selectObject(obj.id);
          onOpenMenu(e.clientX, e.clientY);
        }}
        // 이름 변경은 잠금·그룹 여부와 무관하게 항상 가능(잠금은 뷰포트 조작을 막는 것이지 이름까지 막지 않는다).
        onDoubleClick={() => setEditing(true)}
        className={`flex items-center px-1.5 h-7 rounded-xs cursor-pointer group transition-all text-xs gap-1 ${
          isSelected ? "bg-primary/10 text-foreground" : "text-foreground/70 hover:bg-background"
        } ${!obj.visible ? "opacity-40" : ""} ${obj.locked ? "text-muted" : ""} ${isDragging ? "opacity-30" : ""}`}
      >
        {/* 깊이 인덴트 + 트리 라인 */}
        {Array.from({ length: depth }).map((_, i) => (
          <span key={i} className="shrink-0 w-4 self-stretch relative" style={{ marginLeft: i === 0 ? 8 : 0 }}>
            <span className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />
            {i === depth - 1 && <span className="absolute left-[7px] top-1/2 w-2 h-px bg-border" />}
          </span>
        ))}

        {/* 그룹 펼치기/접기 (그룹일 때만 화살표 표시, 일반 오브젝트는 spacer 없음) */}
        {hasChildren && (
          <span
            // style={{ marginLeft: depth === 0 ? 8 : 0 }}
            className="shrink-0"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="w-4 h-4 flex items-center justify-center text-muted hover:text-foreground transition-colors rounded"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </span>
        )}

        {/* 오브젝트 아이콘 (프리팹은 --prefab 색) */}
        <span
          className={`w-4 flex items-center justify-center shrink-0 ${obj.prefabId ? "" : isSelected ? "text-foreground" : "text-muted/60"}`}
          style={obj.prefabId ? { color: "var(--prefab)" } : undefined}
        >
          {(() => {
            const I = getIcon(obj, isCopyRoot);
            return <I size={14} />;
          })()}
        </span>

        {/* 이름 */}
        {editing ? (
          <input
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setNameValue(obj.name);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-background border border-border rounded px-1.5 py-0 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span
            className={`flex-1 truncate text-[11px] ${!obj.prefabId ? "text-foreground" : ""}`}
            style={obj.prefabId ? { color: "var(--prefab)" } : undefined}
          >
            {obj.name}
          </span>
        )}

        {/* 호버 시 액션 아이콘 (락은 잠긴 경우 항상 표시). 이름 편집 중엔 입력에 자리를 내주고 숨긴다. */}
        {!editing && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateObject(obj.id, { visible: !obj.visible });
              pushHistory();
            }}
            className={`w-5 h-5 flex items-center justify-center text-muted hover:text-foreground transition-colors rounded ${!obj.visible ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            title={obj.visible ? "숨기기" : "표시"}
          >
            {obj.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (lockedByAncestor) return;
              setObjectLocked(obj.id, !obj.locked);
              pushHistory();
            }}
            disabled={lockedByAncestor}
            className={`w-5 h-5 flex items-center justify-center transition-colors rounded ${
              lockedByAncestor
                ? "text-muted/40 opacity-100 cursor-not-allowed"
                : `text-muted hover:text-foreground ${obj.locked ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
            }`}
            title={lockedByAncestor ? "상위 그룹이 잠겨 있어요 (그룹에서 잠금 해제)" : obj.locked ? "잠금 해제" : "잠금"}
          >
            {obj.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
        </div>
        )}
      </div>

      {/* 컨텍스트 메뉴 — 공통 ContextMenu(위치·클램핑·바깥클릭/Esc 닫기). 백드롭 없이 다른 행 우클릭 시 자연 전환. */}
      {menuOpen && menuPos && (
        <ContextMenu x={menuPos.x} y={menuPos.y} onClose={onCloseMenu} className="w-44">
          {/* 이름 변경은 그룹·잠금 포함 모든 오브젝트에서 가능(더블클릭과 동일 규칙). */}
          <button
            onClick={() => {
              onCloseMenu();
              setEditing(true);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
          >
            <Pencil size={13} className="text-foreground" /> 이름 변경
          </button>
          {(obj.primitiveShape === "extrude" || obj.primitiveShape === "lathe") && (
            <button
              onClick={() => {
                onCloseMenu();
                openPenToolEdit(obj.id);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
            >
              <PenTool size={13} className="text-foreground" /> 펜툴로 수정
            </button>
          )}
          {obj.primitiveShape === "voxel" && (
            <button
              onClick={() => {
                onCloseMenu();
                openVoxelEdit(obj.id);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
            >
              <Boxes size={13} className="text-foreground" /> 복셀 수정
            </button>
          )}
          {isPrefabRoot && !isMasterRoot && (
            <>
              <button
                onClick={() => {
                  setPrefabMaster(obj.id);
                  onCloseMenu();
                }}
                title="이 인스턴스를 프리팹 원본으로 지정 — 이후 편집이 모든 사본에 자동 반영됩니다"
                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
              >
                <Focus size={13} style={{ color: "var(--prefab)" }} /> 원본으로 지정
              </button>
              <button
                onClick={() => {
                  detachPrefabInstance(obj.id);
                  onCloseMenu();
                }}
                title="프리팹 링크를 끊어 일반 그룹으로 전환합니다(색상도 기본색). 원본과 다른 사본은 영향 없음"
                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
              >
                <Unlink size={13} className="text-foreground" /> 프리팹 해제
              </button>
            </>
          )}
          {/* 모터는 그룹 해제 대신 '모터만 제거' — 삭제는 연결된 부품까지 지우므로 되돌릴 비파괴 경로가 필요하다.
              (모터도 isGroup이라 예전엔 '그룹 해제'가 뜨긴 했지만 ungroupSelected가 모터를 걸러 아무 일도 안 했다.) */}
          {obj.isActuator && (
            <button
              onClick={() => {
                removeMotorKeepParts(obj.id);
                onCloseMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
            >
              <CircleMinus size={13} className="text-foreground" /> 모터만 제거 (부품 유지)
            </button>
          )}
          {/* 그룹 해제는 일반 그룹만 — 프리팹(원본/사본)·모터는 숨김(사본은 '프리팹 해제', 모터는 위 '모터만 제거') */}
          {obj.isGroup && !obj.prefabId && !obj.isActuator && (
            <button
              onClick={() => {
                ungroupSelected();
                onCloseMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
            >
              <Ungroup size={13} className="text-foreground" /> 그룹 해제
              <span className="ml-auto text-muted/60 text-[10px]">⌃⇧G</span>
            </button>
          )}
          <button
            onClick={() => {
              duplicateSelected();
              onCloseMenu();
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
          >
            <Copy size={13} className="text-foreground" /> 복제
            <span className="ml-auto text-muted/60 text-[10px]">⌃D</span>
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => {
              deleteSelected();
              onCloseMenu();
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-background transition-colors flex items-center gap-2"
          >
            <X size={13} /> 삭제
            <span className="ml-auto text-muted/60 text-[10px]">Del</span>
          </button>
        </ContextMenu>
      )}
    </div>
  );
}

export function HierarchyPanel({ noWrapper = false }: { noWrapper?: boolean }) {
  const { objects, selectedId, selectObject, selectObjects, moveObject } = useSceneStore();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 컨텍스트 메뉴는 패널 레벨에서 단일 관리(한 번에 하나) — 다른 행 우클릭 시 그 행으로 전환.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // 선택된 오브젝트가 그룹 안에 있으면 조상 그룹들을 전부 펼쳐 트리에서 보이게 한다.
  // (뷰포트에서 자식을 더블클릭해 드릴인 선택하면, 중첩이면 부모+상위 그룹이 모두 펼쳐짐)
  useEffect(() => {
    if (!selectedId) return;
    const ancestors: string[] = [];
    let cur = objects.find((o) => o.id === selectedId);
    while (cur?.parentId) {
      ancestors.push(cur.parentId);
      const pid = cur.parentId;
      cur = objects.find((o) => o.id === pid);
    }
    if (ancestors.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestors)
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      return changed ? next : prev;
    });
  }, [selectedId, objects]);
  const anchorIndexRef = useRef<number>(-1);
  // 드래그 이동 상태 — 검색 중에는 순서가 필터링돼 혼란스러우므로 비활성화
  const dragEnabled = !search.trim();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPos } | null>(null);

  const handleDragStartItem = (id: string) => setDragId(id);
  const handleDragEndItem = () => {
    setDragId(null);
    setDropTarget(null);
  };
  const handleDragOverItem = (targetId: string, pos: DropPos) => {
    if (!dragId || dragId === targetId) {
      setDropTarget(null);
      return;
    }
    // 유효하지 않은 드롭(순환)이면 인디케이터를 숨겨 드롭 불가를 표시
    const target = objects.find((o) => o.id === targetId);
    if (!target) {
      setDropTarget(null);
      return;
    }
    if (pos === "inside" && !target.isGroup) {
      setDropTarget(null);
      return;
    }
    const newParentId = pos === "inside" ? targetId : target.parentId;
    // 그룹을 자기 자신·자손 안으로 넣는 순환 방지
    if (newParentId === dragId || (newParentId && isDescendant(objects, newParentId, dragId))) {
      setDropTarget(null);
      return;
    }
    setDropTarget((prev) => (prev?.id === targetId && prev.pos === pos ? prev : { id: targetId, pos }));
  };
  const handleDropItem = (targetId: string) => {
    if (dragId && dropTarget && dropTarget.id === targetId) {
      moveObject(dragId, targetId, dropTarget.pos);
      // 그룹 안으로 넣었으면 결과가 보이도록 자동 펼침
      if (dropTarget.pos === "inside") {
        setExpanded((prev) => new Set(prev).add(targetId));
      }
    }
    handleDragEndItem();
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allObjects = search.trim() ? objects.filter((o) => o.name.toLowerCase().includes(search.toLowerCase())) : objects;

  const flatList = buildFlatList(
    search.trim() ? objects : allObjects,
    null,
    search.trim() ? new Set(objects.filter((o) => o.isGroup).map((o) => o.id)) : expanded,
  );

  const indexMap = useMemo(() => new Map(flatList.map((o, i) => [o.id, i])), [flatList]);

  const handleClickItem = (id: string, index: number, shiftKey: boolean) => {
    if (shiftKey && anchorIndexRef.current >= 0) {
      const from = Math.min(anchorIndexRef.current, index);
      const to = Math.max(anchorIndexRef.current, index);
      selectObjects(flatList.slice(from, to + 1).map((o) => o.id));
    } else {
      anchorIndexRef.current = index;
      selectObject(id);
    }
  };

  const renderTree = (parentId: string | null, depth: number): React.ReactNode[] => {
    const src = search.trim()
      ? objects.filter((o) => o.parentId === parentId && o.name.toLowerCase().includes(search.toLowerCase()))
      : objects.filter((o) => o.parentId === parentId);

    return src.flatMap((obj) => {
      const index = indexMap.get(obj.id) ?? 0;
      const nodes: React.ReactNode[] = [
        <HierarchyItem
          key={obj.id}
          obj={obj}
          depth={depth}
          index={index}
          isExpanded={expanded.has(obj.id)}
          onToggleExpand={() => toggleExpand(obj.id)}
          onClickItem={handleClickItem}
          dragEnabled={dragEnabled}
          isDragging={dragId === obj.id}
          dropPos={dropTarget?.id === obj.id ? dropTarget.pos : null}
          onDragStartItem={handleDragStartItem}
          onDragOverItem={handleDragOverItem}
          onDropItem={handleDropItem}
          onDragEndItem={handleDragEndItem}
          menuOpen={openMenuId === obj.id}
          menuPos={openMenuId === obj.id ? menuPos : null}
          onOpenMenu={(x, y) => {
            setMenuPos({ x, y });
            setOpenMenuId(obj.id);
          }}
          onCloseMenu={() => setOpenMenuId(null)}
        />,
      ];
      if (obj.isGroup && (expanded.has(obj.id) || search.trim())) {
        nodes.push(...renderTree(obj.id, depth + 1));
      }
      return nodes;
    });
  };

  const inner = (
    <>
      <div className="px-2 pt-2 pb-1 shrink-0">
        <input
          type="text"
          placeholder="검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-7 bg-muted/5 dark:bg-muted/10 border border-border rounded-xs px-2.5 text-xs text-foreground placeholder-muted focus:outline-none focus:border-primary transition-colors"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {objects.filter((o) => o.parentId === null).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-muted text-xs leading-relaxed">오브젝트가 없습니다.</p>
          </div>
        ) : (
          renderTree(null, 0)
        )}
      </div>
    </>
  );

  if (noWrapper) return <>{inner}</>;

  return (
    <aside className="flex flex-col bg-sidebar border-r border-border overflow-hidden h-full">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">오브젝트 ({objects.length})</span>
      </div>
      {inner}
    </aside>
  );
}
