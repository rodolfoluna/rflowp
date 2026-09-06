/**
 * Identidad, contenedor `.algx` y biblioteca.
 *
 * Lo específicamente criptográfico (quién abre qué, firmas, huellas) vive en
 * `cripto.test.ts`. Aquí se prueba la mecánica: validación de datos, el
 * contenedor, y el guardado/listado/borrado.
 *
 * Todo contra los almacenes en memoria: sin esa separación el guardado
 * quedaría sin cobertura, y es justo donde un error le cuesta al alumno el
 * trabajo de una tarde.
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
   crearEncabezado,
   deserializar,
   ErrorArchivo,
   nombreSugerido,
   serializarEnClaro,
   bitacoraNueva,
   bitacoraEjercicioNueva,
   encabezadoCanonico,
   type Contenido,
} from '../src/file/algx';
import type { Program } from '../src/core/ast';
import {
   almacenArchivosEnMemoria,
   almacenIdentidadEnMemoria,
} from '../src/file/almacenes';
import { Biblioteca, type ContextoCripto } from '../src/file/biblioteca.svelte';
import { generarLlavesAlumno, generarLlavesProfesor } from '../src/crypto/llaves';

const FUENTE = `Proceso p
   Definir a Como Entero
   Leer a
   Escribir a
FinProceso`;

const programa = () => parse(FUENTE).program;

/** Cuaderno de prueba a partir de uno o varios programas. */
function cuadernoDe(...programas: Program[]): Contenido {
   return {
      ejercicios: programas.map((p, i) => ({
         id: `e${i + 1}`,
         nombre: `Ejercicio ${i + 1}`,
         programa: p,
         bitacora: bitacoraEjercicioNueva(),
      })),
      bitacora: bitacoraNueva(),
   };
}

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

describe('contenedor .algx', () => {
   const encabezado = () =>
      crearEncabezado({
         titulo: 'Suma de dos números',
         autor: { numeroControl: '20161234', nombre: 'Ana López', grupo: '3A' },
         deviceId: 'dispositivo-1',
         appVersion: '0.5.0',
         alg: 'ninguno',
         ahora: () => new Date('2026-03-01T12:00:00Z'),
      });

   const contenido = (): Contenido => cuadernoDe(programa());

   it('sobrevive al ciclo de escribir y leer', () => {
      const e = encabezado();
      const leido = deserializar(serializarEnClaro(e, contenido()));

      expect(leido.encabezado.autor).toEqual(e.autor);
      expect(leido.encabezado.titulo).toBe('Suma de dos números');
      expect(leido.encabezado.deviceId).toBe('dispositivo-1');
      expect(leido.carga.cifrado).toBe(false);
      if (!leido.carga.cifrado) {
         expect(print(leido.carga.contenido.ejercicios[0].programa)).toBe(FUENTE);
      }
   });

   it('rechaza un archivo que no es de la app', () => {
      expect(() => deserializar('hola mundo')).toThrow(ErrorArchivo);
      expect(() => deserializar('{"algo": 1}')).toThrow(/no es un algoritmo/);
   });

   it('rechaza una versión de formato desconocida', () => {
      const bruto = JSON.parse(serializarEnClaro(encabezado(), contenido()));
      bruto.fmt = 'algx/99';
      expect(() => deserializar(JSON.stringify(bruto))).toThrow(/otra versión/);
   });

   it('rechaza un cuaderno sin ejercicios', () => {
      const bruto = JSON.parse(serializarEnClaro(encabezado(), contenido()));
      bruto.contenido.ejercicios = [];
      expect(() => deserializar(JSON.stringify(bruto))).toThrow(/incompleto|dañado/);
   });

   it('rellena la bitácora si el archivo no la trae', () => {
      const bruto = JSON.parse(serializarEnClaro(encabezado(), contenido()));
      delete bruto.contenido.bitacora;
      const leido = deserializar(JSON.stringify(bruto));
      expect(leido.carga.cifrado).toBe(false);
      if (!leido.carga.cifrado) {
         expect(leido.carga.contenido.bitacora).toEqual(bitacoraNueva());
      }
   });

   it('el nombre sugerido identifica al autor y quita acentos', () => {
      expect(nombreSugerido(encabezado())).toBe('20161234-Suma_de_dos_numeros.algx');
   });

   it('el encabezado canónico no depende del orden de construcción', () => {
      // De esto depende que firmar y verificar produzcan los mismos bytes.
      const a = encabezado();
      const b: typeof a = {
         appVersion: a.appVersion,
         modificado: a.modificado,
         creado: a.creado,
         titulo: a.titulo,
         deviceId: a.deviceId,
         autor: a.autor,
         alg: a.alg,
         fmt: a.fmt,
         magic: a.magic,
      };
      expect(encabezadoCanonico(b)).toBe(encabezadoCanonico(a));
   });

   it('el encabezado canónico cambia si cambia cualquier campo', () => {
      const a = encabezado();
      const original = encabezadoCanonico(a);

      expect(encabezadoCanonico({ ...a, titulo: 'Otro' })).not.toBe(original);
      expect(
         encabezadoCanonico({ ...a, autor: { ...a.autor, numeroControl: '999' } }),
      ).not.toBe(original);
      expect(encabezadoCanonico({ ...a, creado: '2020-01-01' })).not.toBe(original);
   });
});

// ---------------------------------------------------------------------------

describe('biblioteca', () => {
   /** Instalación completa con llaves reales: `guardar` ya cifra. */
   async function nueva() {
      const alumno = await generarLlavesAlumno();
      const profesor = await generarLlavesProfesor();
      const contexto: ContextoCripto = {
         alumno,
         profesorPublica: profesor.publica,
         profesorPrivada: null,
      };
      let n = 0;
      const almacen = almacenArchivosEnMemoria();
      return {
         almacen,
         bib: new Biblioteca(almacen, '0.5.0', () => contexto, () => `id${++n}.algx`),
      };
   }

   it('guarda y vuelve a listar', async () => {
      const { bib } = await nueva();
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'Mi algoritmo', identidad: IDENTIDAD });

      expect(bib.archivos.length).toBe(1);
      expect(bib.archivos[0].titulo).toBe('Mi algoritmo');
      expect(bib.archivos[0].numeroControl).toBe('20161234');
      expect(bib.archivos[0].cifrado).toBe(true);
   });

   it('abre lo que guardó, con el programa intacto', async () => {
      const { bib } = await nueva();
      const original = programa();
      const id = await bib.guardar({
         contenido: cuadernoDe(original),
         titulo: 'Mi algoritmo',
         identidad: IDENTIDAD,
      });

      const archivo = await bib.abrir(id);
      // Se compara el pseudocódigo, no el árbol crudo: los `id` de nodo son
      // únicos por sesión y no tiene sentido exigir que coincidan.
      expect(print(archivo.contenido.ejercicios[0].programa)).toBe(print(original));
      expect(print(archivo.contenido.ejercicios[0].programa)).toBe(FUENTE);
   });

   it('sobrescribir conserva la fecha de creación original', async () => {
      const { bib } = await nueva();
      const id = await bib.guardar({
         contenido: cuadernoDe(programa()),
         titulo: 'v1',
         identidad: IDENTIDAD,
      });
      const creadoOriginal = (await bib.abrir(id)).encabezado.creado;

      await new Promise((r) => setTimeout(r, 5));
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'v2', identidad: IDENTIDAD, id });

      const despues = await bib.abrir(id);
      // La antigüedad del trabajo es parte de la evidencia; no debe reiniciarse.
      expect(despues.encabezado.creado).toBe(creadoOriginal);
      expect(despues.encabezado.titulo).toBe('v2');
      expect(bib.archivos.length).toBe(1);
   });

   it('un título vacío no deja el archivo sin nombre', async () => {
      const { bib } = await nueva();
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: '   ', identidad: IDENTIDAD });
      expect(bib.archivos[0].titulo).toBe('Sin título');
   });

   it('borra un algoritmo', async () => {
      const { bib } = await nueva();
      const id = await bib.guardar({
         contenido: cuadernoDe(programa()),
         titulo: 'Temporal',
         identidad: IDENTIDAD,
      });

      await bib.borrar(id);
      expect(bib.archivos).toEqual([]);
      await expect(bib.abrir(id)).rejects.toThrow(/ya no está/);
   });

   it('lista lo más reciente primero', async () => {
      const { bib } = await nueva();
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'primero', identidad: IDENTIDAD });
      await new Promise((r) => setTimeout(r, 5));
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'segundo', identidad: IDENTIDAD });

      expect(bib.archivos.map((a) => a.titulo)).toEqual(['segundo', 'primero']);
   });

   it('marca como ajeno lo que vino de otra instalación', async () => {
      const { bib } = await nueva();
      const otro: Identidad = { ...IDENTIDAD, deviceId: 'otro-dispositivo', nombre: 'Luis Ruiz' };
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'De Luis', identidad: otro });

      await bib.refrescar(IDENTIDAD.deviceId);
      expect(bib.archivos[0].propio).toBe(false);
      expect(bib.archivos[0].autor).toBe('Luis Ruiz');
   });

   it('importa un .algx válido', async () => {
      const origen = await nueva();
      const id = await origen.bib.guardar({
         contenido: cuadernoDe(programa()),
         titulo: 'Compartido',
         identidad: IDENTIDAD,
      });
      const { texto } = await origen.bib.paraExportar(id);

      const destino = await nueva();
      await destino.bib.importar(texto);
      expect(destino.bib.archivos[0].titulo).toBe('Compartido');
   });

   it('rechaza importar basura sin ensuciar el almacén', async () => {
      const { bib } = await nueva();
      await expect(bib.importar('no soy un algx')).rejects.toThrow(ErrorArchivo);
      expect(bib.archivos).toEqual([]);
   });

   it('un archivo dañado no oculta a los demás', async () => {
      const { bib, almacen } = await nueva();
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'Bueno', identidad: IDENTIDAD });
      await almacen.guardar('roto.algx', '{{{ esto no es json');

      await bib.refrescar();
      expect(bib.archivos.map((a) => a.titulo)).toEqual(['Bueno']);
   });

   it('exportar propone un nombre con el número de control', async () => {
      const { bib } = await nueva();
      const id = await bib.guardar({
         contenido: cuadernoDe(programa()),
         titulo: 'Tarea 3',
         identidad: IDENTIDAD,
      });

      const { nombre } = await bib.paraExportar(id);
      expect(nombre).toBe('20161234-Tarea_3.algx');
   });

   it('el borrador guarda el texto de cada ejercicio, aunque no compile', async () => {
      const { bib } = await nueva();
      const aMedias = `Proceso p
   Si a > `;

      await bib.guardarBorrador({
         titulo: 'En curso',
         cuaderno: {
            activoId: 'e1',
            ejercicios: [
               { id: 'e1', nombre: 'Uno', texto: aMedias, bitacora: bitacoraEjercicioNueva() },
               { id: 'e2', nombre: 'Dos', texto: FUENTE, bitacora: bitacoraEjercicioNueva() },
            ],
         },
      });

      // Se guarda el TEXTO y no el árbol justamente por esto: lo que hay que
      // recuperar es lo que el alumno tenía escrito, compile o no.
      const leido = await bib.leerBorrador();
      expect(leido?.cuaderno.ejercicios[0].texto).toBe(aMedias);
      expect(leido?.cuaderno.ejercicios[1].texto).toBe(FUENTE);
   });

   it('el borrador recuerda a qué archivo pertenecía y qué ejercicio estaba abierto', async () => {
      const { bib } = await nueva();
      await bib.guardarBorrador({
         titulo: 'Tarea',
         archivoId: 'abc.algx',
         cuaderno: {
            activoId: 'e2',
            ejercicios: [
               { id: 'e1', nombre: 'Uno', texto: FUENTE, bitacora: bitacoraEjercicioNueva() },
               { id: 'e2', nombre: 'Dos', texto: FUENTE, bitacora: bitacoraEjercicioNueva() },
            ],
         },
      });

      const leido = await bib.leerBorrador();
      expect(leido?.archivoId).toBe('abc.algx');
      expect(leido?.cuaderno.activoId).toBe('e2');
   });

   it('el borrador no aparece en la lista de algoritmos del alumno', async () => {
      const { bib } = await nueva();
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'Real', identidad: IDENTIDAD });
      await bib.guardarBorrador({
         titulo: 'En curso',
         cuaderno: {
            activoId: 'e1',
            ejercicios: [
               { id: 'e1', nombre: 'Uno', texto: FUENTE, bitacora: bitacoraEjercicioNueva() },
            ],
         },
      });

      await bib.refrescar(IDENTIDAD.deviceId);
      expect(bib.archivos.map((a) => a.titulo)).toEqual(['Real']);
   });

   it('sin borrador previo devuelve null en vez de fallar', async () => {
      const { bib } = await nueva();
      expect(await bib.leerBorrador()).toBeNull();
   });

   it('un borrador corrupto no rompe el arranque', async () => {
      const { bib, almacen } = await nueva();
      await almacen.guardar('_borrador.json', '{{{ roto');
      expect(await bib.leerBorrador()).toBeNull();
   });

   it('borrarTodo vacía la biblioteca', async () => {
      const { bib } = await nueva();
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'a', identidad: IDENTIDAD });
      await bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'b', identidad: IDENTIDAD });

      await bib.borrarTodo();
      expect(bib.archivos).toEqual([]);
   });

   it('sin llaves no se puede guardar, y lo dice', async () => {
      const bib = new Biblioteca(
         almacenArchivosEnMemoria(),
         '0.5.0',
         () => ({ alumno: null, profesorPublica: null, profesorPrivada: null }),
         () => 'x.algx',
      );
      await expect(
         bib.guardar({ contenido: cuadernoDe(programa()), titulo: 'T', identidad: IDENTIDAD }),
      ).rejects.toThrow(/llaves/);
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
