'use client';

/**
 * 팝업/미리보기 본문 렌더러.
 * 값 문자열이 이미지·영상·YouTube/Vimeo·일반 URL·텍스트 중 무엇인지 자동 판별해 알맞게 표시한다.
 * (show_popup 액션의 value 하나로 리치 콘텐츠를 지원 — 별도 스키마 필드 불필요)
 */
export function RichContent({ value }: { value: string }) {
  const v = (value ?? '').trim();
  if (!v) return <p className="text-sm text-muted">(내용 없음)</p>;

  const yt = v.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return (
      <div className="relative w-full aspect-video rounded-xs overflow-hidden bg-black">
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${yt[1]}`}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  const vimeo = v.match(/vimeo\.com\/(\d+)/);
  if (vimeo) {
    return (
      <div className="relative w-full aspect-video rounded-xs overflow-hidden bg-black">
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://player.vimeo.com/video/${vimeo[1]}`}
          title="Vimeo"
          allowFullScreen
        />
      </div>
    );
  }

  if (/\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(v)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={v} alt="" className="w-full max-h-[60vh] object-contain rounded-xs" />;
  }

  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(v)) {
    return <video src={v} controls className="w-full max-h-[60vh] rounded-xs bg-black" />;
  }

  if (/^https?:\/\//i.test(v)) {
    return (
      <a
        href={v}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary text-sm leading-relaxed underline break-all hover:opacity-80 transition-opacity"
      >
        {v}
      </a>
    );
  }

  return <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{v}</p>;
}
