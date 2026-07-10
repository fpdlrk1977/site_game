'use client';

import { useState, useEffect, useRef } from 'react';
import { useSceneStore } from '@/store/sceneStore';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  group: string;
  action: () => void;
}

interface Props {
  onClose: () => void;
}

export function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    objects, selectObject, addObject, addLightObject, requestFocusAll, requestCameraView,
    duplicateInPlace, duplicateSelected, deleteSelected, undo, redo,
    groupSelected, ungroupSelected, toggleWireframe, copyObjectProperties, pasteObjectProperties,
  } = useSceneStore();

  const allCommands: CommandItem[] = [
    { id: 'focus-all', label: '전체 포커스', description: 'Shift+F', icon: '⊹', group: '보기', action: () => { requestFocusAll(); onClose(); } },
    { id: 'view-top', label: '상단 뷰', description: 'Numpad 7', icon: '⊡', group: '보기', action: () => { requestCameraView('top'); onClose(); } },
    { id: 'view-front', label: '전면 뷰', description: 'Numpad 1', icon: '⊡', group: '보기', action: () => { requestCameraView('front'); onClose(); } },
    { id: 'view-right', label: '우측 뷰', description: 'Numpad 3', icon: '⊡', group: '보기', action: () => { requestCameraView('right'); onClose(); } },
    { id: 'wireframe', label: '와이어프레임 토글', icon: '◫', group: '보기', action: () => { toggleWireframe(); onClose(); } },
    { id: 'undo', label: '실행 취소', description: 'Ctrl+Z', icon: '↩', group: '편집', action: () => { undo(); onClose(); } },
    { id: 'redo', label: '다시 실행', description: 'Ctrl+Y', icon: '↪', group: '편집', action: () => { redo(); onClose(); } },
    { id: 'duplicate', label: '복제 (위치 유지)', description: 'Shift+D', icon: '⊕', group: '편집', action: () => { duplicateInPlace(); onClose(); } },
    { id: 'duplicate-offset', label: '복제 (오프셋)', description: 'Ctrl+D', icon: '⊕', group: '편집', action: () => { duplicateSelected(); onClose(); } },
    { id: 'delete', label: '선택 삭제', description: 'Del', icon: '✕', group: '편집', action: () => { deleteSelected(); onClose(); } },
    { id: 'group', label: '그룹 만들기', description: 'Ctrl+G', icon: '▣', group: '편집', action: () => { groupSelected(); onClose(); } },
    { id: 'ungroup', label: '그룹 해제', description: 'Ctrl+Shift+G', icon: '▤', group: '편집', action: () => { ungroupSelected(); onClose(); } },
    { id: 'copy-props', label: '속성 복사', description: 'Ctrl+Shift+C', icon: '⎘', group: '편집', action: () => { copyObjectProperties(); onClose(); } },
    { id: 'paste-props', label: '속성 붙여넣기', description: 'Ctrl+Shift+V', icon: '⎗', group: '편집', action: () => { pasteObjectProperties(); onClose(); } },
    { id: 'add-box', label: '박스 추가', icon: '□', group: '추가', action: () => { addObject('box'); onClose(); } },
    { id: 'add-sphere', label: '구체 추가', icon: '○', group: '추가', action: () => { addObject('sphere'); onClose(); } },
    { id: 'add-cylinder', label: '원기둥 추가', icon: '⬡', group: '추가', action: () => { addObject('cylinder'); onClose(); } },
    { id: 'add-frustum', label: '각뿔대 추가', icon: '⏢', group: '추가', action: () => { addObject('frustum'); onClose(); } },
    { id: 'add-loft', label: '로프트 추가', icon: '⧖', group: '추가', action: () => { addObject('loft'); onClose(); } },
    { id: 'add-plane', label: '평면 추가', icon: '▭', group: '추가', action: () => { addObject('plane'); onClose(); } },
    { id: 'pen-tool', label: '펜 툴 (그려서 3D 만들기)', icon: '✏', group: '추가', action: () => { useSceneStore.getState().setPenToolOpen(true); onClose(); } },
    { id: 'voxel-tool', label: '복셀 (큐브 쌓아 만들기)', icon: '🧊', group: '추가', action: () => { useSceneStore.getState().setVoxelToolOpen(true); onClose(); } },
    { id: 'add-light-point', label: '포인트 라이트 추가', icon: '💡', group: '추가', action: () => { addLightObject('point'); onClose(); } },
    { id: 'add-light-spot', label: '스팟 라이트 추가', icon: '🔦', group: '추가', action: () => { addLightObject('spot'); onClose(); } },
    { id: 'add-light-dir', label: '방향 라이트 추가', icon: '☀️', group: '추가', action: () => { addLightObject('directional'); onClose(); } },
    ...objects.map((o) => ({
      id: `obj-${o.id}`,
      label: o.name,
      description: `오브젝트 (${o.primitiveShape ?? (o.assetId ? 'GLB' : o.isGroup ? '그룹' : '기타')})`,
      icon: o.isGroup ? '▣' : o.assetId ? '◎' : '◉',
      group: '오브젝트',
      action: () => { selectObject(o.id); onClose(); },
    })),
  ];

  const filtered = allCommands.filter((c) => {
    const q = query.toLowerCase();
    return c.label.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || c.group.toLowerCase().includes(q);
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => {
          const next = Math.min(s + 1, filtered.length - 1);
          const el = listRef.current?.children[next] as HTMLElement | undefined;
          el?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => {
          const next = Math.max(s - 1, 0);
          const el = listRef.current?.children[next] as HTMLElement | undefined;
          el?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      }
      if (e.key === 'Enter') { e.preventDefault(); filtered[selected]?.action(); }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [filtered, selected, onClose]);

  const groups = [...new Set(filtered.map((c) => c.group))];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-sidebar border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 검색 입력 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-muted text-base">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="명령어 또는 오브젝트 검색..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted/60 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted hover:text-foreground text-xs">✕</button>
          )}
          <kbd className="text-[10px] text-muted bg-background border border-border rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>

        {/* 결과 목록 */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted text-sm">
              <div className="text-2xl mb-2">🔍</div>
              검색 결과 없음
            </div>
          ) : (
            groups.map((group) => {
              const items = filtered.filter((c) => c.group === group);
              const startIdx = filtered.indexOf(items[0]);
              return (
                <div key={group}>
                  <div className="px-4 py-1 text-[10px] font-semibold text-muted/60 tracking-wider uppercase">
                    {group}
                  </div>
                  {items.map((cmd, localIdx) => {
                    const globalIdx = startIdx + localIdx;
                    const isSelected = globalIdx === selected;
                    return (
                      <div
                        key={cmd.id}
                        onClick={cmd.action}
                        className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/15' : 'hover:bg-background/60'
                        }`}
                      >
                        <span className="text-sm w-4 text-center text-muted shrink-0">{cmd.icon}</span>
                        <span className={`flex-1 text-sm ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>
                          {cmd.label}
                        </span>
                        {cmd.description && (
                          <span className="text-[10px] text-muted bg-background border border-border rounded px-1.5 py-0.5 shrink-0 font-mono">
                            {cmd.description}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* 바닥 힌트 */}
        <div className="px-4 py-2 border-t border-border/50 flex items-center gap-3 text-[10px] text-muted/50">
          <span>↑↓ 이동</span>
          <span>↵ 실행</span>
          <span>ESC 닫기</span>
        </div>
      </div>
    </div>
  );
}
