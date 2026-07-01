import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// 기존 사이트에 <script type="module" src=".../embed.js" data-scene="SCENE_ID">
// 한 줄로 삽입되는 완전히 독립적인 뷰어 번들. Next.js 앱과는 별도 빌드 파이프라인이며,
// 에디터 코드(components/editor 등)를 전혀 포함하지 않는다.
//
// formats: 'es'(진짜 ES 모듈)를 쓰는 이유 — IIFE로 빌드하면 @react-three/rapier의
// WASM 로더가 사용하는 import.meta.url이 깨진 값으로 치환되어 물리 엔진(플레이 모드)이
// 로드 실패한다. type="module" 스크립트는 브라우저가 실제 모듈로 실행하므로
// import.meta.url이 올바르게 이 파일 자신의 URL을 가리킨다.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
  // Next.js/webpack과 달리 Vite는 process.env를 자동으로 채워주지 않는다.
  // react-dom/three 계열 라이브러리들이 내부에서 process.env.NODE_ENV를 참조하므로,
  // 브라우저에 process 전역이 없어 "process is not defined"로 죽는 것을 방지한다.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': '{}',
  },
  publicDir: false, // Next.js의 public/ 정적 파일 복사 기능은 이 빌드와 무관하므로 비활성화
  build: {
    outDir: path.resolve(__dirname, '../public'),
    emptyOutDir: false, // public/의 다른 정적 파일(favicon 등)을 지우지 않음
    lib: {
      entry: path.resolve(__dirname, 'main.tsx'),
      name: 'Park3DEmbed',
      formats: ['es'],
      fileName: () => 'embed.js',
    },
    rollupOptions: {
      output: {
        // 'es' 포맷은 기본적으로 동적 import를 별도 청크 파일로 쪼개므로,
        // <script> 하나로 끝나도록 codeSplitting을 꺼서 전부 한 파일에 인라인한다
        // (output 레벨 옵션 — build.codeSplitting에 두면 조용히 무시된다)
        codeSplitting: false,
      },
    },
  },
});
