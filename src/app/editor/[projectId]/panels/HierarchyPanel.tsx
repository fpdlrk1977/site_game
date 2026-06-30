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

type PanelTab = 'objects' | 'layers';

interface HierarchyItemProps {
  obj: ObjectNodeSchema;
  index: number;
  onClickItem: (id: string, index: number, shiftKey: boolean) => void;
}

function HierarchyItem({ obj, index, onClickItem }: HierarchyItemProps) {
  const { selectedId, selectedIds, updateObject, deleteSelected, duplicateSelected } = useSceneStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(obj.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelected = selectedIds.length > 0 ? selectedIds.includes(obj.id) : selectedId === obj.id;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!editing) setNameValue(obj.name);
  }, [obj.name, editing]);

  const commitRename = () => {
    setEditing(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== obj.name) updateObject(obj.id, { name: trimmed });
    else setNameValue(obj.name);
  };

  const { selectObject } = useSceneStore();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    selectObject(obj.id);
    setMenuOpen(true);
  };

  return (
    <div className="relative">
      <div
        onClick={(e) => { if (editing) return; onClickItem(obj.id, index, e.shiftKey); }}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => !obj.locked && setEditing(true)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer group transition-all text-xs ${
          isSelected ? 'bg-violet-600/30 text-white' : 'text-zinc-300 hover:bg-zinc-800'
        } ${!obj.visible ? 'opacity-40' : ''} ${obj.locked ? 'text-zinc-500' : ''}`}
      >
        <span className="text-[10px] w-4 text-center opacity-60">
          {obj.content ? (obj.content.type === 'text' ? '𝐓' : obj.content.type === 'image' ? '🖼' : '▶') : (obj.assetId ? '📦' : (SHAPE_ICONS[obj.primitiveShape ?? ''] ?? '○'))}
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
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-1 py-0 text-xs text-white focus:outline-none"
          />
        ) : (
          <span className="flex-1 truncate text-[11px]">{obj.name}</span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
          <button
            onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { visible: !obj.visible }); }}
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-white transition-colors"
            title={obj.visible ? '숨기기' : '표시'}
          >
            <span className="text-[10px]">{obj.visible ? '👁' : '🙈'}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { locked: !obj.locked }); }}
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-white transition-colors"
            title={obj.locked ? '잠금 해제' : '잠금'}
          >
            <span className="text-[10px]">{obj.locked ? '🔒' : '🔓'}</span>
          </button>
        </div>
      </div>

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
  const { objects, layers, toggleLayerVisible, toggleLayerLocked, addLayer, selectObject, selectObjects } = useSceneStore();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<PanelTab>('objects');
  const anchorIndexRef = useRef<number>(-1);

  const roots = objects.filter((o) => o.parentId === null);
  const filtered = search.trim()
    ? roots.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : roots;

  const handleClickItem = (id: string, index: number, shiftKey: boolean) => {
    if (shiftKey && anchorIndexRef.current >= 0) {
      // 범위 선택: anchor ~ 현재 인덱스 사이 모두 선택
      const from = Math.min(anchorIndexRef.current, index);
      const to = Math.max(anchorIndexRef.current, index);
      const rangeIds = filtered.slice(from, to + 1).map((o) => o.id);
      selectObjects(rangeIds);
    } else {
      // 일반 클릭: anchor 갱신 + 단일 선택
      anchorIndexRef.current = index;
      selectObject(id);
    }
  };

  return (
    <aside className="flex flex-col bg-zinc-950 border-r border-zinc-800 overflow-hidden">
      {/* 탭 */}
      <div className="flex border-b border-zinc-800">
        {(['objects', 'layers'] as PanelTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              tab === t ? 'text-white bg-zinc-800/50' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t === 'objects' ? `오브젝트 (${objects.length})` : '레이어'}
          </button>
        ))}
      </div>

      {tab === 'objects' && (
        <>
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
              filtered.map((obj, i) => <HierarchyItem key={obj.id} obj={obj} index={i} onClickItem={handleClickItem} />)
            )}
          </div>
        </>
      )}

      {tab === 'layers' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {Object.entries(layers).map(([key, layer]) => (
            <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
              <span className="flex-1 text-zinc-300 truncate">{layer.name}</span>
              <span className="text-[10px] text-zinc-600">{objects.filter((o) => o.layer === key).length}</span>
              <button
                onClick={() => toggleLayerVisible(key)}
                className="text-zinc-500 hover:text-white transition-colors"
                title={layer.visible ? '숨기기' : '표시'}
              >
                <span className="text-[10px]">{layer.visible ? '👁' : '🙈'}</span>
              </button>
              <button
                onClick={() => toggleLayerLocked(key)}
                className="text-zinc-500 hover:text-white transition-colors"
                title={layer.locked ? '잠금 해제' : '잠금'}
              >
                <span className="text-[10px]">{layer.locked ? '🔒' : '🔓'}</span>
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const name = prompt('레이어 이름');
              if (name?.trim()) addLayer(name.trim());
            }}
            className="w-full py-1.5 text-[10px] text-zinc-500 hover:text-white border border-dashed border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors"
          >
            + 레이어 추가
          </button>
        </div>
      )}
    </aside>
  );
}
