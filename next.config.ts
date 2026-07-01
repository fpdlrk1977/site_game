import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const cors = [{ key: 'Access-Control-Allow-Origin', value: '*' }];
    return [
      {
        // <script type="module">는 항상 CORS 모드로 fetch되므로(클래식 script와 다름),
        // 다른 origin의 사이트에 embed.js를 삽입하려면 CORS 허용이 필요하다.
        source: '/embed.js',
        headers: cors,
      },
      {
        // embed.js 안에서 Text3D가 폰트 JSON을 fetch할 때도 마찬가지로 다른 origin에서
        // 요청하므로 CORS 허용이 필요하다 (assetUrl()이 우리 서버 origin으로 절대경로화함).
        source: '/fonts/:path*',
        headers: cors,
      },
    ];
  },
};

export default nextConfig;
