import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relative : l'appli fonctionne quelle que soit l'adresse de publication (GitHub Pages, Netlify…).
// Date de compilation affichée en bas de l'appli (pour comparer les versions Safari / écran d'accueil)
const BUILD = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react()],
});
