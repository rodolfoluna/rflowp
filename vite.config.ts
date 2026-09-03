import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
   plugins: [
      svelte(),
      VitePWA({
         // La app debe funcionar completa sin conexión: los alumnos trabajan en
         // el salón, con datos móviles malos o sin ellos.
         registerType: 'autoUpdate',
         includeAssets: ['favicon.svg', 'icono-192.png', 'icono-512.png'],
         workbox: {
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            // Sin red, cualquier navegación cae en el app shell.
            navigateFallback: 'index.html',
         },
         manifest: {
            name: 'RFlowP — Diseño de algoritmos',
            short_name: 'RFlowP',
            description:
               'Diseña algoritmos en pseudocódigo o en diagrama de flujo, ejecútalos y guárdalos.',
            lang: 'es',
            dir: 'ltr',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            orientation: 'any',
            background_color: '#14161a',
            theme_color: '#14161a',
            categories: ['education', 'productivity'],
            icons: [
               { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
               { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
               {
                  src: 'icono-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
               },
            ],
         },
      }),
   ],
});
