import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  let basePath = './';
  if (process.env.GITHUB_REPOSITORY) {
      basePath = `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`;
  }
  
  return {
    // Relocking base to your active case-sensitive repository path to prevent asset loading failure
    base: basePath,
    plugins: [react(), tailwindcss()],
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
