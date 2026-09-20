import { defineConfig } from 'vite';

// base './' pour que le build fonctionne dans le WebView de Capacitor (Android/iOS)
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
