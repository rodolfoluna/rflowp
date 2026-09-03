/**
 * Identidad, formato `.algx` y biblioteca.
 *
 * Toda la lógica se prueba contra los almacenes en memoria: sin esa separación
 * el guardado quedaría sin cobertura, y es justo donde un error le cuesta al
 * alumno el trabajo de una tarde.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser';
import { print } from '../src/core/printer';
import {
   crearIdentidad,
   iniciales,
   normalizarControl,
   validar,
   type Identidad,
} from '../src/identity/identidad';
import {
   crearArchivo,
   deserializar,
   ErrorArchivo,
   nombreSugerido,
   serializar,
   bitacoraNueva,
} from '../src/file/algx';
import {
   almacenArchivosEnMemoria,
   almacenIdentidadEnMemoria,
} from '../src/file/almacenes';
import { Biblioteca } from '../src/file/biblioteca.svelte';

const FUENTE = `Proceso p
   Definir a Como Entero
   Leer a
   Escribir a
FinProceso`;

const programa = () => parse(FUENTE).program;

const IDENTIDAD: Identidad = {
   numeroControl: '20161234',
   nombre: 'Ana López',
   grupo: '3A',
   deviceId: 'dispositivo-1',
   creada: '2026-01-15T10:00:00.000Z',
};

// ---------------------------------------------------------------------------

describe('validación de identidad', () => {
   it('acepta datos normales', () => {
      expect(validar({ numeroControl: '20161234', nombre: 'Ana López' })).toEqual([]);
   });

   it('acepta formatos de otras escuelas', () => {
      // No se casa con un formato: cada institución usa el suyo.
      for (const control of ['A12345', '2016630123', 'ITT19M0042']) {
         expect(validar({ numeroControl: control, nombre: 'Juan Pérez' })).toEqual([]);
      }
   });

   it('rechaza campos vacíos', () => {
      const errores = validar({ numeroControl: '', nombre: '' });
      expect(errores.map((e) => e.campo).sort()).toEqual(['nombre', 'numeroControl']);
   });

   it('rechaza símbolos en el número de control', () => {
      const errores = validar({ numeroControl: '2016-1234', nombre: 'Ana López' });
      expect(errores[0].campo).toBe('numeroControl');
   });

   it('rechaza un número de control absurdamente largo', () => {
      const errores = validar({ numeroControl: '1'.repeat(30), nombre: 'Ana López' });
      expect(errores[0].mensaje).toMatch(/largo/);
   });

   it('acepta nombres con acentos y apellidos compuestos', () => {
      expect(
         validar({ numeroControl: '20161234', nombre: "María de la Peña O'Connor" }),
      ).toEqual([]);
   });

   it('normaliza el número de control y limpia el nombre', () => {
      const id = crearIdentidad(
         { numeroControl: ' a12 345 ', nombre: '  Ana   López  ', grupo: ' 3A ' },
         () => 'uuid-fijo',
         () => new Date('2026-02-01T00:00:00Z'),
      );
      expect(id.numeroControl).toBe('A12345');
      expect(id.nombre).toBe('Ana López');
      expect(id.grupo).toBe('3A');
      expect(id.deviceId).toBe('uuid-fijo');
   });

   it('omite el grupo si viene vacío', () => {
      const id = crearIdentidad(
         { numeroControl: '20161234', nombre: 'Ana López', grupo: '   ' },
         () => 'x',
      );
      expect(id.grupo).toBeUndefined();
   });

   it('el deviceId no se deriva del número de control', () => {
      // Si se derivara, conocer el número de un compañero bastaría para
      // suplantar su instalación.
      let n = 0;
      const a = crearIdentidad({ numeroControl: '20161234', nombre: 'Ana López' }, () => `id${++n}`);
      const b = crearIdentidad({ numeroControl: '20161234', nombre: 'Ana López' }, () => `id${++n}`);
      expect(a.deviceId).not.toBe(b.deviceId);
   });

   it('normalizarControl quita espacios internos', () => {
      expect(normalizarControl(' 2016 1234 ')).toBe('20161234');
   });

   it('las iniciales sirven para el avatar', () => {
      expect(iniciales('Ana López')).toBe('AL');
      expect(iniciales('María de la Peña Ruiz')).toBe('MR');
      expect(iniciales('Ana')).toBe('AN');
      expect(iniciales('')).toBe('?');
   });
});

// ---------------------------------------------------------------------------

describe('formato .algx', () => {
   const archivo = () =>
      crearArchivo({
         programa: programa(),
         titulo: 'Suma de dos números',
         autor: { numeroControl: '20161234', nombre: 'Ana López', grupo: '3A' },
         deviceId: 'dispositivo-1',
         appVersion: '0.2.0',
         ahora: () => new Date('2026-03-01T12:00:00Z'),
      });

   it('sobrevive al ciclo de guardar y leer', () => {
      const original = archivo();
      const vuelta = deserializar(serializar(original));

      expect(vuelta.encabezado.autor).toEqual(original.encabezado.autor);
      expect(vuelta.encabezado.titulo).toBe('Suma de dos números');
      expect(vuelta.encabezado.deviceId).toBe('dispositivo-1');
      expect(vuelta.contenido.programa).toEqual(original.contenido.programa);
   });

   it('el encabezado queda legible sin tocar el contenido', () => {
      // El profesor necesita ordenar un lote sin abrir cada algoritmo.
      const bruto = JSON.parse(serializar(archivo()));
      expect(bruto.autor.numeroControl).toBe('20161234');
      expect(bruto.titulo).toBe('Suma de dos números');
   });

   it('rechaza un archivo que no es de la app', () => {
      expect(() => deserializar('hola mundo')).toThrow(ErrorArchivo);
      expect(() => deserializar('{"algo": 1}')).toThrow(/no es un algoritmo/);
   });

   it('rechaza una versión de formato desconocida', () => {
      const bruto = JSON.parse(serializar(archivo()));
      bruto.fmt = 'algx/99';
      expect(() => deserializar(JSON.stringify(bruto))).toThrow(/otra versión/);
   });

   it('avisa en vez de fallar raro ante un archivo protegido', () => {
      // Pasará cuando exista la fase 5 y alguien abra un archivo cifrado con
      // una build vieja.
      const bruto = JSON.parse(serializar(archivo()));
      bruto.alg = 'A256GCM+ECIES-P256';
      expect(() => deserializar(JSON.stringify(bruto))).toThrow(/protegido/);
   });

   it('rechaza un archivo sin programa', () => {
      const bruto = JSON.parse(serializar(archivo()));
      delete bruto.contenido.programa;
      expect(() => deserializar(JSON.stringify(bruto))).toThrow(/incompleto|dañado/);
   });

   it('rellena la bitácora si el archivo es viejo y no la trae', () => {
      const bruto = JSON.parse(serializar(archivo()));
      delete bruto.contenido.bitacora;
      expect(deserializar(JSON.stringify(bruto)).contenido.bitacora).toEqual(bitacoraNueva());
   });

   it('el nombre sugerido identifica al autor y quita acentos', () => {
      const nombre = nombreSugerido(archivo().encabezado);
      expect(nombre).toBe('20161234-Suma_de_dos_numeros.algx');
   });
});

// ---------------------------------------------------------------------------

describe('biblioteca', () => {
   function nueva() {
      let n = 0;
      return new Biblioteca(almacenArchivosEnMemoria(), '0.2.0', () => `id${++n}`);
   }

   it('guarda y vuelve a listar', async () => {
      const bib = nueva();
      await bib.guardar({ programa: programa(), titulo: 'Mi algoritmo', identidad: IDENTIDAD });

      expect(bib.archivos.length).toBe(1);
      expect(bib.archivos[0].titulo).toBe('Mi algoritmo');
      expect(bib.archivos[0].numeroControl).toBe('20161234');
   });

   it('abre lo que guardó, con el programa intacto', async () => {
      const bib = nueva();
      const original = programa();
      const id = await bib.guardar({
         programa: original,
         titulo: 'Mi algoritmo',
         identidad: IDENTIDAD,
      });

      const archivo = await bib.abrir(id);
      // Se compara el pseudocódigo, no el árbol crudo: los `id` de nodo son
      // únicos por sesión y no tiene sentido exigir que coincidan.
      expect(print(archivo.contenido.programa)).toBe(print(original));
      expect(print(archivo.contenido.programa)).toBe(FUENTE);
   });

   it('sobrescribir conserva la fecha de creación original', async () => {
      const bib = nueva();
      const id = await bib.guardar({
         programa: programa(),
         titulo: 'v1',
         identidad: IDENTIDAD,
      });
      const creadoOriginal = (await bib.abrir(id)).encabezado.creado;

      await new Promise((r) => setTimeout(r, 5));
      await bib.guardar({ programa: programa(), titulo: 'v2', identidad: IDENTIDAD, id });

      const despues = await bib.abrir(id);
      // La antigüedad del trabajo es parte de la evidencia; no debe reiniciarse.
      expect(despues.encabezado.creado).toBe(creadoOriginal);
      expect(despues.encabezado.titulo).toBe('v2');
      expect(bib.archivos.length).toBe(1);
   });

   it('un título vacío no deja el archivo sin nombre', async () => {
      const bib = nueva();
      await bib.guardar({ programa: programa(), titulo: '   ', identidad: IDENTIDAD });
      expect(bib.archivos[0].titulo).toBe('Sin título');
   });

   it('borra un algoritmo', async () => {
      const bib = nueva();
      const id = await bib.guardar({
         programa: programa(),
         titulo: 'Temporal',
         identidad: IDENTIDAD,
      });

      await bib.borrar(id);
      expect(bib.archivos).toEqual([]);
      await expect(bib.abrir(id)).rejects.toThrow(/ya no está/);
   });

   it('lista lo más reciente primero', async () => {
      const bib = nueva();
      await bib.guardar({ programa: programa(), titulo: 'primero', identidad: IDENTIDAD });
      await new Promise((r) => setTimeout(r, 5));
      await bib.guardar({ programa: programa(), titulo: 'segundo', identidad: IDENTIDAD });

      expect(bib.archivos.map((a) => a.titulo)).toEqual(['segundo', 'primero']);
   });

   it('marca como ajeno lo que vino de otra instalación', async () => {
      const bib = nueva();
      const otro: Identidad = { ...IDENTIDAD, deviceId: 'otro-dispositivo', nombre: 'Luis Ruiz' };
      await bib.guardar({ programa: programa(), titulo: 'De Luis', identidad: otro });

      await bib.refrescar(IDENTIDAD.deviceId);
      expect(bib.archivos[0].propio).toBe(false);
      expect(bib.archivos[0].autor).toBe('Luis Ruiz');
   });

   it('importa un .algx válido', async () => {
      const origen = nueva();
      const id = await origen.guardar({
         programa: programa(),
         titulo: 'Compartido',
         identidad: IDENTIDAD,
      });
      const { texto } = await origen.paraExportar(id);

      const destino = nueva();
      await destino.importar(texto);
      expect(destino.archivos[0].titulo).toBe('Compartido');
   });

   it('rechaza importar basura sin ensuciar el almacén', async () => {
      const bib = nueva();
      await expect(bib.importar('no soy un algx')).rejects.toThrow(ErrorArchivo);
      expect(bib.archivos).toEqual([]);
   });

   it('un archivo dañado no oculta a los demás', async () => {
      const almacen = almacenArchivosEnMemoria();
      const bib = new Biblioteca(almacen, '0.2.0', () => 'id-fijo.algx');

      await bib.guardar({ programa: programa(), titulo: 'Bueno', identidad: IDENTIDAD });
      await almacen.guardar('roto.algx', '{{{ esto no es json');

      await bib.refrescar();
      expect(bib.archivos.map((a) => a.titulo)).toEqual(['Bueno']);
   });

   it('exportar propone un nombre con el número de control', async () => {
      const bib = nueva();
      const id = await bib.guardar({
         programa: programa(),
         titulo: 'Tarea 3',
         identidad: IDENTIDAD,
      });

      const { nombre } = await bib.paraExportar(id);
      expect(nombre).toBe('20161234-Tarea_3.algx');
   });

   it('el borrador guarda el texto tal cual, aunque no compile', async () => {
      const bib = nueva();
      const aMedias = `Proceso p
   Si a > `;

      await bib.guardarBorrador({ texto: aMedias, titulo: 'En curso' });
      const leido = await bib.leerBorrador();

      // Se guarda el TEXTO y no el árbol justamente por esto: lo que hay que
      // recuperar es lo que el alumno tenía escrito, compile o no.
      expect(leido).toEqual({ texto: aMedias, titulo: 'En curso', archivoId: undefined });
   });

   it('el borrador recuerda a qué archivo pertenecía', async () => {
      const bib = nueva();
      await bib.guardarBorrador({ texto: FUENTE, titulo: 'Tarea', archivoId: 'abc.algx' });
      expect((await bib.leerBorrador())?.archivoId).toBe('abc.algx');
   });

   it('el borrador no aparece en la lista de algoritmos del alumno', async () => {
      const bib = nueva();
      await bib.guardar({ programa: programa(), titulo: 'Real', identidad: IDENTIDAD });
      await bib.guardarBorrador({ texto: FUENTE, titulo: 'En curso' });

      await bib.refrescar(IDENTIDAD.deviceId);
      expect(bib.archivos.map((a) => a.titulo)).toEqual(['Real']);
   });

   it('sin borrador previo devuelve null en vez de fallar', async () => {
      expect(await nueva().leerBorrador()).toBeNull();
   });

   it('un borrador corrupto no rompe el arranque', async () => {
      const almacen = almacenArchivosEnMemoria();
      const bib = new Biblioteca(almacen, '0.4.0', () => 'x');
      await almacen.guardar('_borrador.json', '{{{ roto');
      expect(await bib.leerBorrador()).toBeNull();
   });

   it('borrarTodo vacía la biblioteca', async () => {
      const bib = nueva();
      await bib.guardar({ programa: programa(), titulo: 'a', identidad: IDENTIDAD });
      await bib.guardar({ programa: programa(), titulo: 'b', identidad: IDENTIDAD });

      await bib.borrarTodo();
      expect(bib.archivos).toEqual([]);
   });
});

// ---------------------------------------------------------------------------

describe('almacén de identidad', () => {
   it('guarda, lee y borra', async () => {
      const almacen = almacenIdentidadEnMemoria();
      expect(await almacen.leer()).toBeNull();

      await almacen.guardar(IDENTIDAD);
      expect(await almacen.leer()).toEqual(IDENTIDAD);

      await almacen.borrar();
      expect(await almacen.leer()).toBeNull();
   });
});
