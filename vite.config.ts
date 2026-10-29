import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works at any GitHub Pages path (/<repo>/ or /).
  base: './',
  build: {
    // Phaser alone is ~1.2 MB; that's expected for a game bundle.
    chunkSizeWarningLimit: 2000,
  },
});
