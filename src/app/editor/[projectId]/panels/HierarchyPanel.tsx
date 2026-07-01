'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import type { ObjectNodeSchema } from '@/types/scene';

const SHAPE_ICONS: Record<string, string> = {
  box: '⬛', sphere: '⬤', cylinder: '⬭', plane: '▬',
};

function getIcon(obj: ObjectNodeSchema) {
  if (obj.isGroup) return '📁';
  if (obj.content) return obj.content.type === 'text' ? '𝐓' : obj.content.type === 'image' ? '🖼' : '▶';
  if (obj.assetId) return '📦';
  if (obj.particle) return '✨';
  return SHAPE_ICONS[obj.primitiveShape ?? ''] ?? '○';
}

// 트리를 펼쳐진 상태 기준으로 선형화 (range 선택용)
function buildFlatList(
  all: ObjectNodeSchema[],
  parentId: string | null,
  expanded: Set<string>,
): ObjectNodeSchema[] {
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
}

function HierarchyItem({ obj, depth, index, isExpanded, onToggleExpand, onClickItem }: ItemProps) {
  const { selectedId, selectedIds, updateObject, deleteSelected, duplicateSelected, selectObject, ungroupSelected } = useSceneStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(obj.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelected = selectedIds.length > 0 ? selectedIds.includes(obj.id) : selectedId === obj.id;
  const hasChildren = obj.isGroup;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!editing) setNameValue(obj.name);
  }, [obj.name, editing]);

  const commitRename = () => {
    setEditing(false);
    const t = nameValue.trim();
    if (t && t !== obj.name) updateObject(obj.id, { name: t });
    else setNameValue(obj.name);
  };

  return (
    <div className="relative">
      <div
        onClick={(e) => { if (editing) return; onClickItem(obj.id, index, e.shiftKey); }}
        onContextMenu={(e) => { e.preventDefault(); selectObject(obj.id); setMenuOpen(true); }}
        onDoubleClick={() => !obj.locked && !obj.isGroup && setEditing(true)}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        className={`flex items-center gap-1.5 pr-2 py-1 rounded-md cursor-pointer group transition-all text-xs ${
          isSelected ? 'bg-violet-600/30 text-white' : 'text-zinc-300 hover:bg-zinc-800'
        } ${!obj.visible ? 'opacity-40' : ''} ${obj.locked ? 'text-zinc-500' : ''}`}
      >
        {/* 그룹 펼치기/접기 */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className="w-4 text-center text-[10px] text-zinc-500 hover:text-white transition-colors shrink-0"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span className="text-[10px] w-4 text-center opacity-60 shrink-0">{getIcon(obj)}</span>

        {editing ? (
          <input
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setNameValue(obj.name); setEditing(false); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-1 py-0 text-xs text-white focus:outline-none"
          />
        ) : (
          <span className="flex-1 truncate text-[11px]">{obj.name}</span>
        )}

        {/* 호버 시 아이콘 */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
          <button onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { visible: !obj.visible }); }}
            className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors">
            <span className="text-[10px]">{obj.visible ? '👁' : '🙈'}</span>
          </button>
          <button onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { locked: !obj.locked }); }}
            className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors">
            <span className="text-[10px]">{obj.locked ? '🔒' : '🔓'}</span>
          </button>
        </div>
      </div>

      {/* 컨텍스트 메뉴 */}
      {menuOpen && isSelected && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-2 top-full mt-0.5 w-40 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
            {!obj.isGroup && (
              <button onClick={() => { setMenuOpen(false); setEditing(true); }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors">
                이름 변경
              </button>
            )}
            {obj.isGroup && (
              <button onClick={() => { ungroupSelected(); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors">
                그룹 해제 (Ctrl+Shift+G)
              </button>
            )}
            <button onClick={() => { duplicateSelected(); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors">
              복제 (Ctrl+D)
            </button>
            <div className="border-t border-zinc-700 my-1" />
            <button onClick={() => { deleteSelected(); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 transition-colors">
              삭제 (Del)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function HierarchyPanel() {
  const { objects, selectObject, selectObjects } = useSceneStore();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const anchorIndexRef = useRef<number>(-1);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 검색 시 모든 그룹 자동 펼침
  const allObjects = search.trim()
    ? objects.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : objects;

  // 펼쳐진 트리의 선형 목록 (range 선택용)
  const flatList = buildFlatList(
    search.trim() ? objects : allObjects,
    null,
    search.trim() ? new Set(objects.filter((o) => o.isGroup).map((o) => o.id)) : expanded,
  );

  const indexMap = useMemo(
    () => new Map(flatList.map((o, i) => [o.id, i])),
    [flatList],
  );

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
        />,
      ];
      if (obj.isGroup && (expanded.has(obj.id) || search.trim())) {
        nodes.push(...renderTree(obj.id, depth + 1));
      }
      return nodes;
    });
  };

  return (
    <aside className="flex flex-col bg-zinc-950 border-r border-zinc-800 overflow-hidden h-full">
      {/* 헤더 */}
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          오브젝트 ({objects.length})
        </span>
      </div>

      <div className="px-2 pt-2 pb-1 shrink-0">
        <input type="text" placeholder="검색..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {objects.filter((o) => o.parentId === null).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-zinc-600 text-xs leading-relaxed">오브젝트가 없습니다.</p>
          </div>
        ) : (
          renderTree(null, 0)
        )}
      </div>
    </aside>
  );
}
