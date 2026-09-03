/**
 * El documento es donde se juntan las dos formas de editar. Las pruebas de aquí
 * son las que atrapan el fallo más caro del proyecto: que una edición gráfica
 * pise lo que el alumno escribió, o al revés.
 *
 * `documento.svelte.ts` usa runes, así que se prueba con el compilador de
 * Svelte activo (ver `vitest.config.ts`).
 */

import { describe, it, expect } from 'vitest';
import { Documento } from '../src/edit/documento.svelte';
import { crearSentencia, insertar, eliminar, reemplazar } from '../src/edit/mutaciones';
import { print } from '../src/core/printer';

const BASE = `Proceso p
   Definir a Como Entero
   Leer a
   Escribir a
FinProceso`;

describe('sincronización entre texto y árbol', () => {
   it('arranca con el texto parseado', () => {
      const doc = new Documento(BASE);
      expect(doc.errores).toEqual([]);
      expect(doc.texto).toBe(BASE);
      expect(doc.programa.body.length).toBe(3);
   });

   it('al escribir texto válido, adopta el árbol nuevo', () => {
      const doc = new Documento(BASE);
      doc.escribir(`Proceso otro
   Escribir "hola"
FinProceso`);
      expect(doc.errores).toEqual([]);
      expect(doc.programa.name).toBe('otro');
   });

   it('con texto inválido conserva el último árbol válido', () => {
      const doc = new Documento(BASE);
      const arbolBueno = doc.programa;

      doc.escribir(`Proceso p
   Si a > `);

      expect(doc.errores.length).toBeGreaterThan(0);
      expect(doc.desactualizado).toBe(true);
      // El diagrama sigue teniendo algo que dibujar.
      expect(doc.programa).toBe(arbolBueno);
   });

   it('una edición gráfica reimprime el texto', () => {
      const doc = new Documento(BASE);
      const s = crearSentencia('escribir');

      const aplicada = doc.aplicar((p) =>
         insertar(p, { ownerId: p.id, blockKey: 'body', index: p.body.length }, s),
      );

      expect(aplicada).toBe(true);
      expect(doc.texto).toContain('Escribir "mensaje"');
      expect(doc.texto).toBe(print(doc.programa));
      expect(doc.errores).toEqual([]);
   });

   it('no se edita gráficamente mientras el texto tiene errores', () => {
      const doc = new Documento(BASE);
      doc.escribir('Proceso p\n   Si a > ');

      const aplicada = doc.aplicar((p) =>
         insertar(p, { ownerId: p.id, blockKey: 'body', index: 0 }, crearSentencia('leer')),
      );

      // Reimprimir aquí borraría lo que el alumno está escribiendo.
      expect(aplicada).toBe(false);
      expect(doc.texto).toBe('Proceso p\n   Si a > ');
   });

   it('una mutación que no cambia nada no cuenta como edición', () => {
      const doc = new Documento(BASE);
      const aplicada = doc.aplicar((p) => p);
      expect(aplicada).toBe(false);
      expect(doc.puedeDeshacer).toBe(false);
   });

   it('los ids de los nodos sobreviven a una edición gráfica', () => {
      const doc = new Documento(BASE);
      const idDelLeer = doc.programa.body[1].id;

      doc.aplicar((p) =>
         insertar(p, { ownerId: p.id, blockKey: 'body', index: 0 }, crearSentencia('escribir')),
      );

      // El `Leer` original sigue siendo el mismo nodo, ahora corrido un lugar.
      // Si los ids cambiaran, la selección y el resaltado saltarían solos.
      expect(doc.programa.body[2].id).toBe(idDelLeer);
   });
});

describe('historial', () => {
   it('deshace y rehace una inserción', () => {
      const doc = new Documento(BASE);
      const original = doc.texto;

      doc.aplicar((p) =>
         insertar(
            p,
            { ownerId: p.id, blockKey: 'body', index: p.body.length },
            crearSentencia('escribir'),
         ),
      );
      const conBloque = doc.texto;

      expect(doc.puedeDeshacer).toBe(true);
      doc.deshacer();
      expect(doc.texto).toBe(original);
      expect(doc.puedeRehacer).toBe(true);

      doc.rehacer();
      expect(doc.texto).toBe(conBloque);
   });

   it('encadena varias ediciones y las deshace en orden', () => {
      const doc = new Documento(BASE);
      const instantaneas = [doc.texto];

      for (const tipo of ['escribir', 'leer', 'asignacion'] as const) {
         doc.aplicar((p) =>
            insertar(
               p,
               { ownerId: p.id, blockKey: 'body', index: p.body.length },
               crearSentencia(tipo),
            ),
         );
         instantaneas.push(doc.texto);
      }

      for (let i = instantaneas.length - 2; i >= 0; i--) {
         doc.deshacer();
         expect(doc.texto).toBe(instantaneas[i]);
      }
      expect(doc.puedeDeshacer).toBe(false);
   });

   it('escribir a mano invalida el rehacer', () => {
      const doc = new Documento(BASE);
      doc.aplicar((p) =>
         insertar(p, { ownerId: p.id, blockKey: 'body', index: 0 }, crearSentencia('leer')),
      );
      doc.deshacer();
      expect(doc.puedeRehacer).toBe(true);

      doc.escribir(`Proceso p\n   Escribir "otra cosa"\nFinProceso`);
      expect(doc.puedeRehacer).toBe(false);
   });

   it('deshacer sin historial no rompe nada', () => {
      const doc = new Documento(BASE);
      doc.deshacer();
      doc.rehacer();
      expect(doc.texto).toBe(BASE);
   });

   it('cargar un documento limpia el historial', () => {
      const doc = new Documento(BASE);
      doc.aplicar((p) =>
         insertar(p, { ownerId: p.id, blockKey: 'body', index: 0 }, crearSentencia('leer')),
      );
      expect(doc.puedeDeshacer).toBe(true);

      doc.cargar('Proceso nuevo\n   Escribir "hola"\nFinProceso');
      expect(doc.puedeDeshacer).toBe(false);
      expect(doc.programa.name).toBe('nuevo');
   });
});

describe('los comentarios sobreviven a la edición gráfica', () => {
   const CON_COMENTARIOS = `Proceso p
   // explica el algoritmo
   Definir n Como Entero // el dato
   Leer n
   Si n > 0 Entonces
      Escribir "positivo"
      // faltaria el caso cero
   FinSi
FinProceso`;

   it('insertar un bloque no borra ningún comentario', () => {
      const doc = new Documento(CON_COMENTARIOS);
      expect(doc.errores).toEqual([]);

      doc.aplicar((p) =>
         insertar(
            p,
            { ownerId: p.id, blockKey: 'body', index: p.body.length },
            crearSentencia('escribir'),
         ),
      );

      for (const c of ['// explica el algoritmo', '// el dato', '// faltaria el caso cero']) {
         expect(doc.texto, `se perdió ${c}`).toContain(c);
      }
   });

   it('reemplazar una sentencia conserva sus comentarios', () => {
      const doc = new Documento(CON_COMENTARIOS);
      const definir = doc.programa.body[0];

      doc.aplicar((p) => reemplazar(p, definir.id, crearSentencia('asignacion')));

      expect(doc.texto).toContain('// explica el algoritmo');
      expect(doc.texto).toContain('// el dato');
   });

   it('eliminar una sentencia no se lleva su explicación', () => {
      const doc = new Documento(CON_COMENTARIOS);
      const definir = doc.programa.body[0];

      doc.aplicar((p) => eliminar(p, definir.id));

      expect(doc.texto).toContain('// explica el algoritmo');
      expect(doc.texto).not.toContain('Definir n Como Entero');
   });
});
