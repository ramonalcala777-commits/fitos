import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// base relativa: la web funciona en ramonalcala777-commits.github.io/fitos/
// Tailwind se aplica por postcss.config.mjs, igual que en la versión anterior.
export default defineConfig({base: './', plugins: [react()]});
