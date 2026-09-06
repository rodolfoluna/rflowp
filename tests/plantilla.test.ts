/**
 * Plantillas: la tarea que el profesor reparte al grupo.
 *
 * Lo que hay que proteger aquí es el **enlace**: el `origenId` que queda en el
 * cuaderno de cada alumno es lo único que permite comparar el ejercicio 3 de
 * uno con el 3 de otro cuando los dos lo renombran. Si ese enlace se pierde en
 * el viaje plantilla → cuaderno → archivo, la revisión vuelve a ser a ojo.
 */

import { describe, it, expect } from 'vitest';
import {
   armarPlantilla,
   deserializarPlantilla,
   huellaDeEnunciados,
   nombreArchivoPlantilla,
   origenDe,
   serializarPlantilla,
   FORMATO_PLANTILLA,
   type EjercicioPlantilla,
} from '../src/file/plantilla';
import { Cuaderno } from '../src/edit/cuaderno.svelte';
import { ErrorArchivo, normalizarContenido } from '../src/file/algx';
import { parse } from '../src/core/parser';
import { print } from '../src/core/printer';
import { formaDe } from '../src/teacher/analisis';

const SUMA = `Proceso suma
   Definir a, b Como Entero
   Leer a, b
   Escribir a + b
FinProceso`;

const EJERCICIOS: EjercicioPlantilla[] = [
   { id: 'p1', nombre: 'Suma', enunciado: 'Lee dos números y escribe su suma.' },
   { id: 'p2', nombre: 'Promedio', enunciado: 'Lee tres calificaciones y promédialas.' },
   { id: 'p3', nombre: 'Mayor', enunciado: 'Di cuál de dos números es mayor.' },
];

/** Cuaderno con ids predecibles, para poder afirmar sobre ellos. */
function nuevo() {
   let n = 0;
   return new Cuaderno(() => `e${++n}`);
}

describe('el archivo de plantilla', () => {
   it('va y vuelve sin perder nada', async () => {
      const plantilla = await armarPlantilla('Tarea 3', EJERCICIOS);
      const vuelta = deserializarPlantilla(serializarPlantilla(plantilla));

      expect(vuelta).toEqual(plantilla);
      expect(vuelta.fmt).toBe(FORMATO_PLANTILLA);
   });

   it('conserva el programa de partida cuando lo lleva', async () => {
      const plantilla = await armarPlantilla('Con código', [
         { id: 'p1', nombre: 'Suma', programa: parse(SUMA).program },
      ]);

      const vuelta = deserializarPlantilla(serializarPlantilla(plantilla));
      // Se compara el pseudocódigo y no el árbol: los ids de nodo se generan
      // en cada parseo y no significan nada.
      expect(print(vuelta.ejercicios[0].programa!)).toBe(SUMA);
   });

   it('va en claro: el enunciado no es secreto', async () => {
      const texto = serializarPlantilla(await armarPlantilla('Tarea 3', EJERCICIOS));
      expect(texto).toContain('Lee dos números y escribe su suma.');
   });

   it('rechaza lo que no es una plantilla', () => {
      expect(() => deserializarPlantilla('{}')).toThrow(ErrorArchivo);
      expect(() => deserializarPlantilla('no es json')).toThrow(ErrorArchivo);
   });

   it('rechaza una plantilla de otra versión con un mensaje claro', async () => {
      const plantilla = await armarPlantilla('Tarea 3', EJERCICIOS);
      const texto = JSON.stringify({ ...plantilla, fmt: 'algxp/99' });

      expect(() => deserializarPlantilla(texto)).toThrow(/otra versión/);
   });

   it('rechaza un ejercicio sin id: sin él no hay enlace posible', async () => {
      const plantilla = await armarPlantilla('Tarea 3', EJERCICIOS);
      const texto = JSON.stringify({
         ...plantilla,
         ejercicios: [{ nombre: 'Suma', enunciado: 'x' }],
      });

      expect(() => deserializarPlantilla(texto)).toThrow(ErrorArchivo);
   });

   it('propone un nombre de archivo utilizable', () => {
      expect(nombreArchivoPlantilla('Tarea 3 — Ciclos')).toBe('Tarea_3_Ciclos.algxp');
      expect(nombreArchivoPlantilla('¡¿?!')).toBe('plantilla.algxp');
   });
});

describe('la huella de los enunciados', () => {
   it('no cambia al reordenar: el alumno puede reordenar su cuaderno', async () => {
      const a = await huellaDeEnunciados([
         { id: 'p1', enunciado: 'uno' },
         { id: 'p2', enunciado: 'dos' },
      ]);
      const b = await huellaDeEnunciados([
         { id: 'p2', enunciado: 'dos' },
         { id: 'p1', enunciado: 'uno' },
      ]);

      expect(a).toBe(b);
   });

   it('cambia si se altera un enunciado', async () => {
      const original = await huellaDeEnunciados([{ id: 'p1', enunciado: 'uno' }]);
      const alterado = await huellaDeEnunciados([{ id: 'p1', enunciado: 'otro' }]);
      const borrado = await huellaDeEnunciados([{ id: 'p1' }]);

      expect(alterado).not.toBe(original);
      expect(borrado).not.toBe(original);
   });

   it('no confunde dos ejercicios que se separan solo por el id', async () => {
      const a = await huellaDeEnunciados([{ id: 'p1', enunciado: 'uno' }]);
      const b = await huellaDeEnunciados([{ id: 'p2', enunciado: 'uno' }]);

      expect(a).not.toBe(b);
   });
});

describe('importar una plantilla', () => {
   it('produce un cuaderno con un ejercicio por enunciado', async () => {
      const plantilla = await armarPlantilla('Tarea 3', EJERCICIOS);
      const c = nuevo();

      c.desdePlantilla(
         origenDe(plantilla),
         plantilla.ejercicios.map((e) => ({
            origenId: e.id,
            nombre: e.nombre,
            enunciado: e.enunciado,
         })),
      );

      expect(c.total).toBe(3);
      expect(c.posicionActiva).toBe(1);
      expect(c.nombreActivo).toBe('Suma');
      expect(c.enunciadoActivo).toBe('Lee dos números y escribe su suma.');
      expect(c.ejercicios.every((e) => e.deLaPlantilla)).toBe(true);
      expect(c.plantilla?.nombre).toBe('Tarea 3');
   });

   it('el enlace sobrevive a renombrar y al viaje por el archivo', async () => {
      const plantilla = await armarPlantilla('Tarea 3', EJERCICIOS);

      const cuadernoDe = (renombrar: string) => {
         const c = nuevo();
         c.desdePlantilla(
            origenDe(plantilla),
            plantilla.ejercicios.map((e) => ({
               origenId: e.id,
               nombre: e.nombre,
               enunciado: e.enunciado,
            })),
         );
         // Cada alumno le pone el nombre que quiere al mismo ejercicio.
         c.renombrar(c.ejercicios[1].id, renombrar);
         c.activar(c.ejercicios[1].id);
         c.activo.escribir(SUMA);
         return normalizarContenido(JSON.parse(JSON.stringify(c.aContenido())));
      };

      const ana = cuadernoDe('Mi promedio');
      const luis = cuadernoDe('ejercicio dos');

      const suyoAna = ana.ejercicios.find((e) => e.origenId === 'p2');
      const suyoLuis = luis.ejercicios.find((e) => e.origenId === 'p2');

      expect(suyoAna?.nombre).toBe('Mi promedio');
      expect(suyoLuis?.nombre).toBe('ejercicio dos');
      // Distinto nombre, mismo ejercicio de la tarea: eso es lo que se compara.
      expect(formaDe(suyoAna!.programa)).toBe(formaDe(suyoLuis!.programa));
   });

   it('reparte el código de partida cuando la plantilla lo trae', async () => {
      const plantilla = await armarPlantilla('Con código', [
         { id: 'p1', nombre: 'Suma', programa: parse(SUMA).program },
      ]);
      const c = nuevo();

      c.desdePlantilla(
         origenDe(plantilla),
         plantilla.ejercicios.map((e) => ({
            origenId: e.id,
            nombre: e.nombre,
            programa: e.programa,
         })),
      );

      expect(c.activo.texto).toBe(SUMA);
   });
});

describe('detectar un enunciado alterado', () => {
   /** Lo que hace el panel: recalcular la huella del cuaderno entregado. */
   const huellaDelCuaderno = (c: Cuaderno) =>
      huellaDeEnunciados(
         c.aContenido()
            .ejercicios.filter((e) => e.origenId)
            .map((e) => ({ id: e.origenId!, enunciado: e.enunciado })),
      );

   async function cuadernoRepartido() {
      const plantilla = await armarPlantilla('Tarea 3', EJERCICIOS);
      const c = nuevo();
      c.desdePlantilla(
         origenDe(plantilla),
         plantilla.ejercicios.map((e) => ({
            origenId: e.id,
            nombre: e.nombre,
            enunciado: e.enunciado,
         })),
      );
      return { plantilla, c };
   }

   it('un cuaderno intacto coincide con la huella de su plantilla', async () => {
      const { plantilla, c } = await cuadernoRepartido();
      expect(await huellaDelCuaderno(c)).toBe(plantilla.huella);
   });

   it('reordenar y renombrar no lo señala', async () => {
      const { plantilla, c } = await cuadernoRepartido();

      c.mover(c.ejercicios[0].id, 2);
      c.renombrar(c.ejercicios[0].id, 'otro nombre');

      expect(await huellaDelCuaderno(c)).toBe(plantilla.huella);
   });

   it('borrar un enunciado sí lo señala', async () => {
      const { plantilla, c } = await cuadernoRepartido();

      c.enunciar(c.ejercicios[1].id, '');

      expect(await huellaDelCuaderno(c)).not.toBe(plantilla.huella);
   });
});

describe('crear una plantilla desde el cuaderno del profesor', () => {
   it('toma los ejercicios que ya hay escritos', async () => {
      const c = nuevo();
      c.activo.escribir(SUMA);
      c.renombrar(c.activoId, 'Suma');
      c.enunciar(c.activoId, 'Lee dos números y escribe su suma.');
      c.agregar('Promedio');

      const esbozo = c.esbozoPlantilla();
      expect(esbozo.map((e) => e.nombre)).toEqual(['Suma', 'Promedio']);
      expect(esbozo[0].enunciado).toBe('Lee dos números y escribe su suma.');
      expect(print(esbozo[0].programa!)).toBe(SUMA);
   });

   it('reexportar conserva los ids, para no romper lo ya repartido', async () => {
      const primera = await armarPlantilla('Tarea 3', EJERCICIOS);

      const c = nuevo();
      c.desdePlantilla(
         origenDe(primera),
         primera.ejercicios.map((e) => ({
            origenId: e.id,
            nombre: e.nombre,
            enunciado: e.enunciado,
         })),
      );

      // El profesor corrige una errata y la vuelve a exportar.
      c.enunciar(c.ejercicios[0].id, 'Lee dos números enteros y escribe su suma.');
      const segunda = await armarPlantilla('Tarea 3', c.esbozoPlantilla(), {
         id: c.plantilla!.id,
      });

      expect(segunda.id).toBe(primera.id);
      expect(segunda.ejercicios.map((e) => e.id)).toEqual(['p1', 'p2', 'p3']);
      // El enunciado cambió, así que la huella también: es lo que la hace útil.
      expect(segunda.huella).not.toBe(primera.huella);
   });
});
