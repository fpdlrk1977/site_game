'use client';

import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useDropdown } from '@/hooks/useDropdown';

export interface TexItem {
  id: string;
  name: string;
  url: string;
}

interface Props {
  value: string; // 현재 텍스처 URL ('' = 없음)
  textures: TexItem[];
  onChange: (url: string) => void; // '' = 없음(색상)
  onUpload: () => void; // 파일 선택 다이얼로그 열기
  uploading?: boolean;
}

// SelectBox 형태(트리거 + 드롭다운)이되, 드롭다운을 3열 썸네일 그리드로 보여주는 텍스처 전용 픽커.
// 맨 아래엔 넓은 업로드 버튼(assets>texture 등록은 상위 onUpload에서 처리).
export function TexturePicker({ value, textures, onChange, onUpload, uploading }: Props) {
  const { open, openMenu, close, triggerRef, panelRef, panelStyle } = useDropdown<HTMLButtonElement>();
  const selected = textures.find((t) => t.url === value);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 bg-surface border border-border rounded-xs px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {value ? (
          <img src={selected?.url ?? value} alt="" className="w-4 h-4 rounded-sm object-cover shrink-0 border border-border" />
        ) : (
          <span className="w-4 h-4 rounded-sm border border-border shrink-0" />
        )}
        <span className="flex-1 text-left truncate text-[11px]">
          {value ? (selected?.name ?? '현재 텍스처') : '없음 (색상)'}
        </span>
        <ChevronDown size={12} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{ ...panelStyle, maxWidth: 300 }}
          className="bg-sidebar border border-border rounded-xs shadow-2xl shadow-black/30 p-1.5"
        >
          <div className="max-h-52 overflow-y-auto grid grid-cols-3 gap-1.5">
            {/* 없음(색상) 타일 */}
            <button
              onClick={() => { onChange(''); close(); }}
              title="텍스처 없음 (색상)"
              className={`aspect-square rounded-xs border flex items-center justify-center text-[9px] transition-colors ${
                !value ? 'border-primary ring-1 ring-primary text-foreground' : 'border-border text-muted hover:border-border/60'
              }`}
            >
              없음
            </button>
            {textures.map((t) => {
              const sel = t.url === value;
              return (
                <button
                  key={t.id}
                  onClick={() => { onChange(t.url); close(); }}
                  title={t.name}
                  className={`relative aspect-square rounded-xs border overflow-hidden transition-all ${
                    sel ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-border/60'
                  }`}
                >
                  <img src={t.url} alt={t.name} className="absolute inset-0 w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
          {/* 넓은 업로드 버튼 */}
          <button
            onClick={() => { onUpload(); close(); }}
            disabled={uploading}
            className="mt-1.5 w-full py-2 rounded-xs border border-dashed border-border text-muted hover:border-primary/60 hover:text-primary hover:bg-primary/5 text-[10px] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-pre-line"
          >
            {uploading ? '업로드 중...' : '＋ 이미지 업로드\nJPG · PNG · WEBP'}
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
