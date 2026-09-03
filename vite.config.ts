import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Carpeta desde la que se sirve la app.
 *
 * Por omisión, la raíz del dominio. Si se publica en una subcarpeta —el caso
 * típico es GitHub Pages, `usuario.github.io/rflowp/`— hay que decirlo aquí:
 *
 *    RFLOWP_BASE=/rflowp/ npm run build
 *
 * No basta con pasarle `--base` a Vite: el manifiesto de la PWA lleva su propio
 * `start_url` y `scope`, y si esos apuntan a la raíz mientras la app vive en una
 * subcarpeta, el navegador se niega a instalarla o la instala apuntando a una
 * dirección que no existe.
 */
const base = normalizarBase(process.env.RFLOWP_BASE ?? '/');

/** Vite exige que la base empiece y termine en `/`. */
function normalizarBase(valor: string): string {
   let salida = valor.trim() || '/';
   if (!salida.startsWith('/')) salida = `/${salida}`;
   if (!salida.endsWith('/')) salida = `${salida}/`;
   return salida;
}

export default defineConfig({
   base,
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
            navigateFallback: `${base}index.html`,
         },
         manifest: {
            name: 'RFlowP — Diseño de algoritmos',
            short_name: 'RFlowP',
            description:
               'Diseña algoritmos en pseudocódigo o en diagrama de flujo, ejecútalos y guárdalos.',
            lang: 'es',
            dir: 'ltr',
            start_url: base,
            scope: base,
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
