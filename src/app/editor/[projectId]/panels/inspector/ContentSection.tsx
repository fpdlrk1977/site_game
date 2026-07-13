'use client';

// Content 섹션 — 텍스트·이미지·영상 콘텐츠 오브젝트 설정.
// InspectorPanel 분리 리팩터: 접힘 상태는 부모가 open/onToggle prop으로 내려준다.

import { useSceneStore } from '@/store/sceneStore';
import { SelectBox } from '@/components/ui/SelectBox';
import { SectionHeader, GroupBox, LabeledNum, Toggle } from './ui';
import type { ObjectNodeSchema, ContentType } from '@/types/scene';

export function ContentSection({ obj, open, onToggle }: { obj: ObjectNodeSchema; open: boolean; onToggle: () => void }) {
  const { updateObject, pushHistory } = useSceneStore();
  if (!obj.content) return null;
  return (
          <GroupBox>
            <SectionHeader title="Content" hint="Text, image and video content. Paste a URL to show rich content like images or YouTube." isOpen={open} onToggle={onToggle} />
            {open && <div className="px-3 pb-4 space-y-1">
              {obj.content.type === 'text' && (
                <>
                  <div>
                    {/* <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">텍스트</span> */}
                    <textarea
                      value={obj.content.text ?? ''}
                      onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, text: e.target.value } })}
                      onBlur={pushHistory}
                      rows={2}
                      className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>
                  <div className='flex gap-2'>
                    <div>
                      <LabeledNum
                        label="Size"
                        value={obj.content.fontSize ?? 0.5}
                        onChange={(v) => updateObject(obj.id, { content: { ...obj.content!, fontSize: v } })}
                        onCommit={pushHistory}
                        min={0.1} max={3} precision={1} dragStep={0.05}
                      />
                    </div>
                    <div>
                      <LabeledNum
                        label="Thickness"
                        value={obj.content.depth ?? 0.1}
                        onChange={(v) => updateObject(obj.id, { content: { ...obj.content!, depth: v } })}
                        onCommit={pushHistory}
                        min={0} max={1} precision={2} dragStep={0.01}
                      />
                    </div>
                  </div>
                </>
              )}

              {(obj.content.type === 'image' || obj.content.type === 'video') && (
                <div>
                  <span className="text-[10px] font-semibold text-muted/50 tracking-wide block mb-1">
                    {obj.content.type === 'image' ? 'Image URL' : 'Video URL'}
                  </span>
                  <input
                    type="text"
                    value={obj.content.url ?? ''}
                    onChange={(e) => updateObject(obj.id, { content: { ...obj.content!, url: e.target.value } })}
                    onBlur={pushHistory}
                    placeholder={obj.content.type === 'image' ? 'https://example.com/img.jpg' : 'https://www.youtube.com/...'}
                    className="w-full bg-surface border border-border rounded-xs px-2.5 py-1.5  text-[11px] text-white placeholder-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>}
          </GroupBox>
  );
}
