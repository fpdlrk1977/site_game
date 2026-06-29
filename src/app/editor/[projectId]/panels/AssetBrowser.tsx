'use client';

export function AssetBrowser() {
  return (
    <div className="flex items-center gap-3 px-4 bg-zinc-950 border-t border-zinc-800 overflow-x-auto">
      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">Assets</span>
      <div className="flex items-center gap-2 py-2">
        <div className="w-16 h-16 rounded-xl border-2 border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 hover:border-zinc-500 hover:text-zinc-400 transition-all cursor-pointer shrink-0 text-xl">
          +
        </div>
        <p className="text-xs text-zinc-600 max-w-[200px] leading-relaxed">
          .glb 파일을 드래그하거나 클릭해서 업로드
          <br />
          <span className="text-zinc-700">(Phase 2에서 완성됩니다)</span>
        </p>
      </div>
    </div>
  );
}
