import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relative : l'appli fonctionne quelle que soit l'adresse de publication (GitHub Pages, Netlify…).
export default defineConfig({
  base: './',
  plugins: [react()],
});
