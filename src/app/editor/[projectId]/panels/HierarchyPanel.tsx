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
        className={`flex items-center gap-1.5 pr-2 py-[3px] rounded-xs cursor-pointer group transition-all text-xs ${
          isSelected
            ? 'bg-primary/20 text-foreground'
            : 'text-foreground/70 hover:bg-surface'
        } ${!obj.visible ? 'opacity-40' : ''} ${obj.locked ? 'text-muted' : ''}`}
      >
        {/* 깊이 인덴트 + 트리 라인 */}
        {Array.from({ length: depth }).map((_, i) => (
          <span
            key={i}
            className="shrink-0 w-4 self-stretch relative"
            style={{ marginLeft: i === 0 ? 8 : 0 }}
          >
            <span className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />
            {i === depth - 1 && (
              <span className="absolute left-[7px] top-1/2 w-2 h-px bg-border" />
            )}
          </span>
        ))}

        {/* 그룹 펼치기/접기 (그룹일 때만 화살표 표시, 일반 오브젝트는 spacer 없음) */}
        {hasChildren && (
          <span style={{ marginLeft: depth === 0 ? 8 : 0 }} className="shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
              className="w-4 h-4 flex items-center justify-center text-[9px] text-muted hover:text-foreground transition-colors rounded"
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          </span>
        )}

        {/* 오브젝트 아이콘 */}
        <span
          style={{ marginLeft: !hasChildren && depth === 0 ? 8 : 0 }}
          className={`text-[11px] w-4 text-center shrink-0 ${isSelected ? 'opacity-90' : 'opacity-50'}`}
        >
          {getIcon(obj)}
        </span>

        {/* 이름 */}
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
            className="flex-1 bg-background border border-border rounded px-1.5 py-0 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span className={`flex-1 truncate text-[11px] font-medium ${isSelected ? 'text-foreground' : 'text-foreground/70'}`}>
            {obj.name}
          </span>
        )}

        {/* 호버 시 액션 아이콘 (락은 잠긴 경우 항상 표시) */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { visible: !obj.visible }); }}
            className="w-5 h-5 flex items-center justify-center text-muted hover:text-foreground transition-colors rounded opacity-0 group-hover:opacity-100"
            title={obj.visible ? '숨기기' : '표시'}
          >
            <span className="text-[10px]">{obj.visible ? '👁' : '🙈'}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { locked: !obj.locked }); }}
            className={`w-5 h-5 flex items-center justify-center text-muted hover:text-foreground transition-colors rounded ${obj.locked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            title={obj.locked ? '잠금 해제' : '잠금'}
          >
            <span className="text-[10px]">{obj.locked ? '🔒' : '🔓'}</span>
          </button>
        </div>
      </div>

      {/* 컨텍스트 메뉴 */}
      {menuOpen && isSelected && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-2 top-full mt-0.5 w-44 bg-surface border border-border rounded-xs shadow-2xl shadow-black/30 z-50 py-1 overflow-hidden">
            {!obj.isGroup && (
              <button
                onClick={() => { setMenuOpen(false); setEditing(true); }}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
              >
                <span className="text-muted">✏</span> 이름 변경
              </button>
            )}
            {obj.isGroup && (
              <button
                onClick={() => { ungroupSelected(); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
              >
                <span className="text-muted">⊞</span> 그룹 해제
                <span className="ml-auto text-muted/60 text-[10px]">⌃⇧G</span>
              </button>
            )}
            <button
              onClick={() => { duplicateSelected(); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-background transition-colors flex items-center gap-2"
            >
              <span className="text-muted">⎘</span> 복제
              <span className="ml-auto text-muted/60 text-[10px]">⌃D</span>
            </button>
            <div className="border-t border-border my-1" />
            <button
              onClick={() => { deleteSelected(); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-background transition-colors flex items-center gap-2"
            >
              <span>✕</span> 삭제
              <span className="ml-auto text-muted/60 text-[10px]">Del</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function HierarchyPanel({ noWrapper = false }: { noWrapper?: boolean }) {
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

  const allObjects = search.trim()
    ? objects.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : objects;

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

  const inner = (
    <>
      <div className="px-2 pt-2 pb-1 shrink-0">
        <input type="text" placeholder="검색..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-background border border-border rounded-xs px-2.5 py-1 text-xs text-foreground placeholder-muted focus:outline-none focus:border-primary transition-colors"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
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
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
          오브젝트 ({objects.length})
        </span>
      </div>
      {inner}
    </aside>
  );
}
