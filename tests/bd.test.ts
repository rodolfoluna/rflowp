/**
 * Guardas sobre el esquema de la base de datos local.
 *
 * Estas pruebas miran el código fuente en vez de ejecutarlo, que es raro pero
 * aquí está justificado: IndexedDB no existe en Node, y el fallo que previenen
 * ya ocurrió en producción.
 *
 * Lo que pasó: `almacenes.ts` abría la base `rflowp` con versión 1 y
 * `llaves.ts` con la 2. En cuanto la segunda actualizaba el esquema, toda
 * apertura con la versión 1 fallaba con `VersionError`, y como consecuencia:
 *
 *   · la identidad del alumno no se guardaba y la app le pedía registrarse en
 *     cada arranque;
 *   · aparecía un aviso falso de «este navegador no deja guardar», que además
 *     tapaba media pantalla en el teléfono.
 *
 * Una prueba de comportamiento no lo habría atrapado sin un IndexedDB
 * simulado; una que vigila que la versión viva en un solo sitio, sí.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const DUENO_DEL_ESQUEMA = join('src', 'file', 'bd.ts');

/** Todos los archivos de código bajo `src/`. */
function archivosFuente(dir = SRC): string[] {
   const salida: string[] = [];
   for (const entrada of readdirSync(dir)) {
      const ruta = join(dir, entrada);
      if (statSync(ruta).isDirectory()) {
         salida.push(...archivosFuente(ruta));
      } else if (/\.(ts|svelte)$/.test(entrada)) {
         salida.push(ruta);
      }
   }
   return salida;
}

/** Quita comentarios, para no confundir una mención con una llamada real. */
function sinComentarios(codigo: string): string {
   return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('esquema de la base de datos', () => {
   const fuentes = archivosFuente().map((ruta) => ({
      ruta: ruta.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', ''),
      codigo: sinComentarios(readFileSync(ruta, 'utf-8')),
   }));

   it('solo `file/bd.ts` abre la base de datos', () => {
      const culpables = fuentes
         .filter((f) => f.codigo.includes('indexedDB.open'))
         .map((f) => f.ruta);

      // Si esto falla, alguien volvió a repartir la versión del esquema y el
      // `VersionError` está a un despiste de volver.
      expect(culpables).toEqual([DUENO_DEL_ESQUEMA]);
   });

   it('la versión del esquema se declara una sola vez', () => {
      const declaraciones = fuentes.filter((f) =>
         /const\s+VERSION\s*=\s*\d+/.test(f.codigo) || /BD_VERSION\s*=\s*\d+/.test(f.codigo),
      );
      expect(declaraciones.map((f) => f.ruta)).toEqual([DUENO_DEL_ESQUEMA]);
   });

   it('el nombre de la base se declara una sola vez', () => {
      const declaraciones = fuentes.filter((f) => /=\s*'rflowp'/.test(f.codigo));
      expect(declaraciones.map((f) => f.ruta)).toEqual([DUENO_DEL_ESQUEMA]);
   });

   it('los almacenes que usa la app existen en el esquema', () => {
      const bd = fuentes.find((f) => f.ruta === DUENO_DEL_ESQUEMA);
      expect(bd).toBeDefined();
      // Si se añade un almacén nuevo hay que declararlo aquí y subir VERSION.
      expect(bd!.codigo).toContain("ALMACEN_IDENTIDAD = 'identidad'");
      expect(bd!.codigo).toContain("ALMACEN_LLAVES = 'llaves'");
   });
});
