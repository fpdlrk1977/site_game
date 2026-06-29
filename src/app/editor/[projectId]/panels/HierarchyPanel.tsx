'use client';

import { useState, useRef, useEffect } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import type { ObjectNodeSchema } from '@/types/scene';

const SHAPE_ICONS: Record<string, string> = {
  box: '⬛',
  sphere: '⬤',
  cylinder: '⬭',
  plane: '▬',
};

function HierarchyItem({ obj }: { obj: ObjectNodeSchema }) {
  const { selectedId, selectObject, updateObject, deleteSelected, duplicateSelected } = useSceneStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(obj.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelected = selectedId === obj.id;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // obj.name이 외부에서 바뀌면 동기화
  useEffect(() => {
    if (!editing) setNameValue(obj.name);
  }, [obj.name, editing]);

  const commitRename = () => {
    setEditing(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== obj.name) updateObject(obj.id, { name: trimmed });
    else setNameValue(obj.name);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    selectObject(obj.id);
    setMenuOpen(true);
  };

  return (
    <div className="relative">
      <div
        onClick={() => !editing && selectObject(obj.id)}
        onContextMenu={handleContextMenu}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer group transition-all text-xs ${
          isSelected ? 'bg-violet-600/30 text-white' : 'text-zinc-300 hover:bg-zinc-800'
        } ${!obj.visible ? 'opacity-40' : ''} ${obj.locked ? 'text-zinc-500' : ''}`}
      >
        <span className="text-[10px] w-4 text-center opacity-60">
          {obj.assetId ? '📦' : (SHAPE_ICONS[obj.primitiveShape ?? ''] ?? '○')}
        </span>

        {editing ? (
          <input
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setNameValue(obj.name); setEditing(false); }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-zinc-700 border border-violet-500 rounded px-1 py-0 text-xs text-white focus:outline-none min-w-0"
          />
        ) : (
          <span
            className="flex-1 truncate"
            onDoubleClick={(e) => { e.stopPropagation(); selectObject(obj.id); setEditing(true); }}
          >
            {obj.name}
          </span>
        )}

        {/* 눈 아이콘 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateObject(obj.id, { visible: !obj.visible });
            if (obj.visible && selectedId === obj.id) selectObject(null);
          }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-700 transition-all"
          title={obj.visible ? '숨기기' : '표시'}
        >
          <span className="text-[10px]">{obj.visible ? '👁' : '🚫'}</span>
        </button>

        {/* 잠금 아이콘 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateObject(obj.id, { locked: !obj.locked });
          }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-700 transition-all"
          title={obj.locked ? '잠금 해제' : '잠금'}
        >
          <span className="text-[10px]">{obj.locked ? '🔒' : '🔓'}</span>
        </button>
      </div>

      {/* 컨텍스트 메뉴 */}
      {menuOpen && isSelected && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-2 top-full mt-0.5 w-36 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
            <button
              onClick={() => { setMenuOpen(false); setEditing(true); }}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              이름 변경
            </button>
            <button
              onClick={() => { duplicateSelected(); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              복제 (Ctrl+D)
            </button>
            <div className="border-t border-zinc-700 my-1" />
            <button
              onClick={() => { deleteSelected(); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 transition-colors"
            >
              삭제 (Del)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function HierarchyPanel() {
  const { objects } = useSceneStore();
  const [search, setSearch] = useState('');

  const roots = objects.filter((o) => o.parentId === null);
  const filtered = search.trim()
    ? roots.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : roots;

  return (
    <aside className="flex flex-col bg-zinc-950 border-r border-zinc-800 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Hierarchy</span>
        <span className="text-xs text-zinc-600">{objects.length}</span>
      </div>

      {/* 검색 */}
      <div className="px-2 pt-2 pb-1">
        <input
          type="text"
          placeholder="오브젝트 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-zinc-600 text-xs leading-relaxed">
              {search ? '검색 결과가 없습니다.' : '오브젝트가 없습니다.\n상단 툴바에서 추가하세요.'}
            </p>
          </div>
        ) : (
          filtered.map((obj) => <HierarchyItem key={obj.id} obj={obj} />)
        )}
      </div>
    </aside>
  );
}
