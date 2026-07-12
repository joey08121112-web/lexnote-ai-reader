import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: process.env.NODE_ENV === 'production' ? undefined : {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    tsconfigPaths()
  ],
  server: {
    // 局域网访问（iPad 调试用）
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // pdfjs-dist worker 需要优化依赖
  optimizeDeps: {
    include: ['pdfjs-dist', 'epubjs', 'mammoth/mammoth.browser', 'jspdf'],
    // transformers.js 是纯 ESM 大包，预构建会卡死/超时，排除后运行时按需加载
    exclude: ['@huggingface/transformers'],
  },
})
