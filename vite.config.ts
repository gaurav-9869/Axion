import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  const githubRepo = process.env.GITHUB_REPOSITORY;
  const basePath = githubRepo ? `/${githubRepo.split('/')[1]}/` : './';

  return {
    base: basePath,
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          short_name: "Axion",
          name: "Axion Workspace",
          icons: [
            {
              src: "icon-192.png",
              type: "image/png",
              sizes: "192x192",
              purpose: "any maskable"
            },
            {
              src: "icon-512.png",
              type: "image/png",
              sizes: "512x512",
              purpose: "any maskable"
            }
          ],
          start_url: ".",
          scope: ".",
          background_color: "#060a12",
          theme_color: "#10B981",
          display: "standalone",
          orientation: "any"
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts: true,
      host: '0.0.0.0',
    },
  };
});
