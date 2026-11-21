import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 站点部署在 GitHub Pages 的子路径下（如 /Current-Affairs-News/），
// base 用相对路径 './' 即可在任意子路径下工作，无需为每个域名单独构建。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 数据 JSON 直接作为静态资源复制到 dist/data/
    assetsInlineLimit: 4096,
  },
  // 开发时把 data/ 目录作为静态资源提供
  publicDir: 'public',
});
