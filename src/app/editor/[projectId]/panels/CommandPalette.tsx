'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Command as CommandIcon, X, Search, Maximize, Frame, Grid3x3, Undo2, Redo2,
  CopyPlus, Copy, Trash2, Group, Ungroup, ClipboardCopy, ClipboardPaste,
  Box, Circle, Cylinder, Cone, Hexagon, Square, PenTool, Boxes, Donut,
  Lightbulb, Flashlight, Sun, Folder, Package, CircleDot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
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
    { id: 'focus-all', label: '전체 포커스', description: 'Shift+F', icon: Maximize, group: '보기', action: () => { requestFocusAll(); onClose(); } },
    { id: 'view-top', label: '상단 뷰', description: 'Numpad 7', icon: Frame, group: '보기', action: () => { requestCameraView('top'); onClose(); } },
    { id: 'view-front', label: '전면 뷰', description: 'Numpad 1', icon: Frame, group: '보기', action: () => { requestCameraView('front'); onClose(); } },
    { id: 'view-right', label: '우측 뷰', description: 'Numpad 3', icon: Frame, group: '보기', action: () => { requestCameraView('right'); onClose(); } },
    { id: 'wireframe', label: '와이어프레임 토글', icon: Grid3x3, group: '보기', action: () => { toggleWireframe(); onClose(); } },
    { id: 'undo', label: '실행 취소', description: 'Ctrl+Z', icon: Undo2, group: '편집', action: () => { undo(); onClose(); } },
    { id: 'redo', label: '다시 실행', description: 'Ctrl+Y', icon: Redo2, group: '편집', action: () => { redo(); onClose(); } },
    { id: 'duplicate', label: '복제 (위치 유지)', description: 'Shift+D', icon: CopyPlus, group: '편집', action: () => { duplicateInPlace(); onClose(); } },
    { id: 'duplicate-offset', label: '복제 (오프셋)', description: 'Ctrl+D', icon: Copy, group: '편집', action: () => { duplicateSelected(); onClose(); } },
    { id: 'delete', label: '선택 삭제', description: 'Del', icon: Trash2, group: '편집', action: () => { deleteSelected(); onClose(); } },
    { id: 'group', label: '그룹 만들기', description: 'Ctrl+G', icon: Group, group: '편집', action: () => { groupSelected(); onClose(); } },
    { id: 'ungroup', label: '그룹 해제', description: 'Ctrl+Shift+G', icon: Ungroup, group: '편집', action: () => { ungroupSelected(); onClose(); } },
    { id: 'copy-props', label: '속성 복사', description: 'Ctrl+Shift+C', icon: ClipboardCopy, group: '편집', action: () => { copyObjectProperties(); onClose(); } },
    { id: 'paste-props', label: '속성 붙여넣기', description: 'Ctrl+Shift+V', icon: ClipboardPaste, group: '편집', action: () => { pasteObjectProperties(); onClose(); } },
    { id: 'add-box', label: '박스 추가', icon: Box, group: '추가', action: () => { addObject('box'); onClose(); } },
    { id: 'add-sphere', label: '구체 추가', icon: Circle, group: '추가', action: () => { addObject('sphere'); onClose(); } },
    { id: 'add-cylinder', label: '원기둥 추가', icon: Cylinder, group: '추가', action: () => { addObject('cylinder'); onClose(); } },
    { id: 'add-frustum', label: '각뿔대 추가', icon: Cone, group: '추가', action: () => { addObject('frustum'); onClose(); } },
    { id: 'add-loft', label: '로프트 추가', icon: Hexagon, group: '추가', action: () => { addObject('loft'); onClose(); } },
    { id: 'add-plane', label: '평면 추가', icon: Square, group: '추가', action: () => { addObject('plane'); onClose(); } },
    { id: 'add-torus', label: '도넛(토러스) 추가', icon: Donut, group: '추가', action: () => { addObject('torus'); onClose(); } },
    { id: 'pen-tool', label: '펜 툴 (그려서 3D 만들기)', icon: PenTool, group: '추가', action: () => { useSceneStore.getState().setPenToolOpen(true); onClose(); } },
    { id: 'voxel-tool', label: '복셀 (큐브 쌓아 만들기)', icon: Boxes, group: '추가', action: () => { useSceneStore.getState().setVoxelToolOpen(true); onClose(); } },
    { id: 'add-light-point', label: '포인트 라이트 추가', icon: Lightbulb, group: '추가', action: () => { addLightObject('point'); onClose(); } },
    { id: 'add-light-spot', label: '스팟 라이트 추가', icon: Flashlight, group: '추가', action: () => { addLightObject('spot'); onClose(); } },
    { id: 'add-light-dir', label: '방향 라이트 추가', icon: Sun, group: '추가', action: () => { addLightObject('directional'); onClose(); } },
    ...objects.map((o) => ({
      id: `obj-${o.id}`,
      label: o.name,
      description: `오브젝트 (${o.primitiveShape ?? (o.assetId ? 'GLB' : o.isGroup ? '그룹' : '기타')})`,
      icon: (o.isGroup ? Folder : o.assetId ? Package : CircleDot) as LucideIcon,
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
        className="w-full max-w-lg bg-sidebar border border-border rounded-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 검색 입력 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <CommandIcon size={16} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="명령어 또는 오브젝트 검색..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted/60 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted hover:text-foreground"><X size={14} /></button>
          )}
          <kbd className="text-[10px] text-muted bg-background border border-border rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>

        {/* 결과 목록 */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted text-sm">
              <Search size={22} className="mx-auto mb-2 opacity-60" />
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
                        <span className="w-4 flex items-center justify-center text-muted shrink-0"><cmd.icon size={15} /></span>
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
