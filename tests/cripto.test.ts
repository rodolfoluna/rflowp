/**
 * Criptografía del formato `.algx`.
 *
 * Estas son las pruebas que sostienen la promesa central del proyecto:
 * el alumno abre lo suyo, no abre lo de otro, y el profesor abre todo. Si
 * alguna de estas falla, la app miente sobre lo que protege.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser';
import { print } from '../src/core/printer';
import {
   generarLlavesAlumno,
   generarLlavesProfesor,
   archivoLlave,
   leerArchivoLlave,
   importarPrivadaProfesor,
   importarPublicaProfesor,
   huellaDeLlave,
   ErrorLlave,
} from '../src/crypto/llaves';
import { huellaDeFirma } from '../src/crypto/sobre';
import { almacenArchivosEnMemoria } from '../src/file/almacenes';
import { Biblioteca, type ContextoCripto } from '../src/file/biblioteca.svelte';
import { deserializar, ErrorArchivo } from '../src/file/algx';
import type { Identidad } from '../src/identity/identidad';

const FUENTE = `Proceso p
   Definir a Como Entero
   Leer a
   Escribir a
FinProceso`;

const programa = () => parse(FUENTE).program;

function identidad(nombre: string, control: string, device: string): Identidad {
   return {
      numeroControl: control,
      nombre,
      deviceId: device,
      creada: '2026-01-15T10:00:00.000Z',
   };
}

const ANA = identidad('Ana López', '20161234', 'dispositivo-ana');
const LUIS = identidad('Luis Ruiz', '20165678', 'dispositivo-luis');

/** Monta una instalación completa: llaves propias y biblioteca. */
async function instalacion(profesorPublica: CryptoKey | null, profesorPrivada = null as CryptoKey | null) {
   const llaves = await generarLlavesAlumno();
   const contexto: ContextoCripto = {
      alumno: llaves,
      profesorPublica,
      profesorPrivada,
   };
   let n = 0;
   const almacen = almacenArchivosEnMemoria();
   const bib = new Biblioteca(almacen, '0.5.0', () => contexto, () => `f${++n}`);
   return { llaves, contexto, bib, almacen };
}

// ---------------------------------------------------------------------------

describe('quién puede abrir qué', () => {
   it('el alumno abre su propio archivo', async () => {
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);

      const id = await ana.bib.guardar({
         programa: programa(),
         titulo: 'Mi tarea',
         identidad: ANA,
      });

      const abierto = await ana.bib.abrir(id);
      expect(abierto.como).toBe('alumno');
      expect(abierto.firmaValida).toBe(true);
      expect(print(abierto.contenido.programa)).toBe(FUENTE);
   });

   it('otro alumno NO puede abrir el archivo, aunque lo tenga en su dispositivo', async () => {
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);
      const luis = await instalacion(prof.publica);

      const id = await ana.bib.guardar({
         programa: programa(),
         titulo: 'Mi tarea',
         identidad: ANA,
      });
      const { texto } = await ana.bib.paraExportar(id);

      // Luis se lo pasa a su propia app.
      const idEnLuis = await luis.bib.importar(texto);
      await expect(luis.bib.abrir(idEnLuis)).rejects.toThrow(/otra persona|ya no puede abrirlo/);
   });

   it('el profesor abre el archivo de cualquier alumno', async () => {
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);
      const luis = await instalacion(prof.publica);

      const idAna = await ana.bib.guardar({ programa: programa(), titulo: 'A', identidad: ANA });
      const idLuis = await luis.bib.guardar({ programa: programa(), titulo: 'L', identidad: LUIS });

      // El profesor: sin llaves de alumno, con su privada.
      const almacenProf = almacenArchivosEnMemoria();
      let n = 0;
      const bibProf = new Biblioteca(
         almacenProf,
         '0.5.0',
         () => ({ alumno: null, profesorPublica: null, profesorPrivada: prof.privada }),
         () => `p${++n}`,
      );

      for (const [origen, id] of [
         [ana.bib, idAna],
         [luis.bib, idLuis],
      ] as const) {
         const { texto } = await origen.paraExportar(id);
         const importado = await bibProf.importar(texto);
         const abierto = await bibProf.abrir(importado);

         expect(abierto.como).toBe('profesor');
         expect(abierto.firmaValida).toBe(true);
         expect(print(abierto.contenido.programa)).toBe(FUENTE);
      }
   });

   it('la llave de OTRO profesor no abre el archivo', async () => {
      const profA = await generarLlavesProfesor();
      const profB = await generarLlavesProfesor();
      const ana = await instalacion(profA.publica);

      const id = await ana.bib.guardar({ programa: programa(), titulo: 'A', identidad: ANA });
      const { texto } = await ana.bib.paraExportar(id);

      const otro = new Biblioteca(
         almacenArchivosEnMemoria(),
         '0.5.0',
         () => ({ alumno: null, profesorPublica: null, profesorPrivada: profB.privada }),
         () => 'x.algx',
      );
      const importado = await otro.importar(texto);
      await expect(otro.abrir(importado)).rejects.toThrow(/no corresponde/);
   });

   it('sin llave de profesor configurada, el profesor no podrá abrirlo', async () => {
      // Caso importante: si el alumno guarda antes de importar la llave del
      // curso, ese archivo queda solo para él.
      const ana = await instalacion(null);
      const id = await ana.bib.guardar({ programa: programa(), titulo: 'A', identidad: ANA });
      const { texto } = await ana.bib.paraExportar(id);

      const { carga } = deserializar(texto);
      expect(carga.cifrado && carga.sobre.sobreProfesor).toBeNull();

      const prof = await generarLlavesProfesor();
      const bibProf = new Biblioteca(
         almacenArchivosEnMemoria(),
         '0.5.0',
         () => ({ alumno: null, profesorPublica: null, profesorPrivada: prof.privada }),
         () => 'x.algx',
      );
      const importado = await bibProf.importar(texto);
      await expect(bibProf.abrir(importado)).rejects.toThrow();
   });
});

// ---------------------------------------------------------------------------

describe('borrar los datos deja los archivos ilegibles para el alumno', () => {
   it('el alumno pierde el acceso; el profesor lo conserva', async () => {
      const prof = await generarLlavesProfesor();
      const almacen = almacenArchivosEnMemoria();

      // Instalación de Ana, con sus llaves.
      const llavesAna = await generarLlavesAlumno();
      let contexto: ContextoCripto = {
         alumno: llavesAna,
         profesorPublica: prof.publica,
         profesorPrivada: null,
      };
      const bib = new Biblioteca(almacen, '0.5.0', () => contexto, () => 'tarea.algx');

      const id = await bib.guardar({ programa: programa(), titulo: 'Tarea', identidad: ANA });
      expect((await bib.abrir(id)).como).toBe('alumno');

      const { texto } = await bib.paraExportar(id);

      // «Borrar mis datos»: se destruye la llave maestra.
      contexto = { alumno: null, profesorPublica: null, profesorPrivada: null };
      await expect(bib.abrir(id)).rejects.toThrow(/ya no puede abrirlo/);

      // Aunque genere llaves nuevas, no recupera el acceso: es lo que hace real
      // la advertencia del diálogo de borrado.
      contexto = {
         alumno: await generarLlavesAlumno(),
         profesorPublica: prof.publica,
         profesorPrivada: null,
      };
      await expect(bib.abrir(id)).rejects.toThrow();

      // El profesor sigue pudiendo.
      const bibProf = new Biblioteca(
         almacenArchivosEnMemoria(),
         '0.5.0',
         () => ({ alumno: null, profesorPublica: null, profesorPrivada: prof.privada }),
         () => 'x.algx',
      );
      const importado = await bibProf.importar(texto);
      expect((await bibProf.abrir(importado)).como).toBe('profesor');
   });
});

// ---------------------------------------------------------------------------

describe('integridad y firma', () => {
   async function archivoDeAna() {
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);
      const id = await ana.bib.guardar({
         programa: programa(),
         titulo: 'Tarea',
         identidad: ANA,
      });
      const { texto } = await ana.bib.paraExportar(id);
      return { ana, prof, texto };
   }

   it('alterar el texto cifrado hace que el archivo no se abra', async () => {
      const { ana, texto } = await archivoDeAna();
      const bruto = JSON.parse(texto);

      // Cambiar un carácter del ciphertext: AES-GCM lo detecta al autenticar.
      const ct = bruto.sobre.ct;
      bruto.sobre.ct = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);

      await expect(ana.bib.interpretar(JSON.stringify(bruto))).rejects.toThrow(
         /dañado o fue alterado/,
      );
   });

   it('cambiar el nombre del autor invalida la firma', async () => {
      const { ana, texto } = await archivoDeAna();
      const bruto = JSON.parse(texto);
      bruto.autor.nombre = 'Luis Ruiz';

      // Se puede seguir descifrando (el sobre no cambió), pero la firma delata
      // que el encabezado fue tocado.
      const abierto = await ana.bib.interpretar(JSON.stringify(bruto));
      expect(abierto.firmaValida).toBe(false);
      expect(abierto.encabezado.autor.nombre).toBe('Luis Ruiz');
   });

   it('cambiar el número de control invalida la firma', async () => {
      const { ana, texto } = await archivoDeAna();
      const bruto = JSON.parse(texto);
      bruto.autor.numeroControl = '99999999';
      expect((await ana.bib.interpretar(JSON.stringify(bruto))).firmaValida).toBe(false);
   });

   it('cambiar la fecha invalida la firma', async () => {
      const { ana, texto } = await archivoDeAna();
      const bruto = JSON.parse(texto);
      bruto.creado = '2020-01-01T00:00:00.000Z';
      expect((await ana.bib.interpretar(JSON.stringify(bruto))).firmaValida).toBe(false);
   });

   it('un archivo intacto tiene la firma válida', async () => {
      const { ana, texto } = await archivoDeAna();
      expect((await ana.bib.interpretar(texto)).firmaValida).toBe(true);
   });
});

// ---------------------------------------------------------------------------

describe('huellas: cómo se detecta la copia', () => {
   it('dos archivos de la misma instalación comparten huella', async () => {
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);

      await ana.bib.guardar({ programa: programa(), titulo: 'Tarea 1', identidad: ANA });
      await ana.bib.guardar({ programa: programa(), titulo: 'Tarea 2', identidad: ANA });

      const huellas = ana.bib.archivos.map((a) => a.huella);
      expect(huellas[0]).toBeDefined();
      expect(huellas[0]).toBe(huellas[1]);
   });

   it('instalaciones distintas tienen huellas distintas', async () => {
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);
      const luis = await instalacion(prof.publica);

      const a = await huellaDeFirma(ana.llaves.firmaPublicaJwk);
      const l = await huellaDeFirma(luis.llaves.firmaPublicaJwk);
      expect(a).not.toBe(l);
   });

   it('un trabajo entregado por dos alumnos delata su origen común', async () => {
      // Ana hace la tarea; Luis entrega el archivo de Ana con su nombre encima.
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);

      const id = await ana.bib.guardar({ programa: programa(), titulo: 'Tarea', identidad: ANA });
      const { texto } = await ana.bib.paraExportar(id);

      const bruto = JSON.parse(texto);
      bruto.autor.nombre = LUIS.nombre;
      bruto.autor.numeroControl = LUIS.numeroControl;

      const bibProf = new Biblioteca(
         almacenArchivosEnMemoria(),
         '0.5.0',
         () => ({ alumno: null, profesorPublica: null, profesorPrivada: prof.privada }),
         () => `q${Math.random()}.algx`,
      );
      await bibProf.importar(texto);
      await bibProf.importar(JSON.stringify(bruto));

      const [uno, dos] = bibProf.archivos;
      // Nombres distintos, misma instalación de origen.
      expect(uno.numeroControl).not.toBe(dos.numeroControl);
      expect(uno.huella).toBe(dos.huella);
   });
});

// ---------------------------------------------------------------------------

describe('llaves del profesor', () => {
   it('el par se exporta, se lee y vuelve a funcionar', async () => {
      const par = await generarLlavesProfesor();

      const archivoPriv = JSON.stringify(archivoLlave('privada', 'Algoritmos 3A', par.privadaJwk));
      const archivoPub = JSON.stringify(archivoLlave('publica', 'Algoritmos 3A', par.publicaJwk));

      const leidaPriv = leerArchivoLlave(archivoPriv);
      const leidaPub = leerArchivoLlave(archivoPub);
      expect(leidaPriv.clase).toBe('privada');
      expect(leidaPub.etiqueta).toBe('Algoritmos 3A');

      const privada = await importarPrivadaProfesor(leidaPriv.jwk);
      const publica = await importarPublicaProfesor(leidaPub.jwk);

      // El ciclo completo con las llaves reimportadas.
      const ana = await instalacion(publica);
      const id = await ana.bib.guardar({ programa: programa(), titulo: 'T', identidad: ANA });
      const { texto } = await ana.bib.paraExportar(id);

      const bibProf = new Biblioteca(
         almacenArchivosEnMemoria(),
         '0.5.0',
         () => ({ alumno: null, profesorPublica: null, profesorPrivada: privada }),
         () => 'x.algx',
      );
      expect((await bibProf.abrir(await bibProf.importar(texto))).como).toBe('profesor');
   });

   it('rechaza un archivo que no es una llave', async () => {
      expect(() => leerArchivoLlave('hola')).toThrow(ErrorLlave);
      expect(() => leerArchivoLlave('{"tipo":"otra cosa"}')).toThrow(/no es una llave/);
   });

   it('la huella es estable y legible en voz alta', async () => {
      const par = await generarLlavesProfesor();
      const huella = await huellaDeLlave(par.publicaJwk);

      expect(await huellaDeLlave(par.publicaJwk)).toBe(huella);
      expect(huella).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4})+$/);
   });

   it('la pública y la privada del mismo par comparten huella', async () => {
      // Así el profesor puede confirmar que reparte la pública correcta.
      const par = await generarLlavesProfesor();
      expect(await huellaDeLlave(par.publicaJwk)).toBe(await huellaDeLlave(par.privadaJwk));
   });
});

// ---------------------------------------------------------------------------

describe('propiedades del sobre', () => {
   it('cada guardado usa una llave de contenido distinta', async () => {
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);

      const a = await ana.bib.construir({
         programa: programa(),
         titulo: 'T',
         identidad: ANA,
      });
      const b = await ana.bib.construir({
         programa: programa(),
         titulo: 'T',
         identidad: ANA,
      });

      const sa = JSON.parse(a.texto).sobre;
      const sb = JSON.parse(b.texto).sobre;

      // Mismo contenido, cifrados distintos: no se puede saber que dos archivos
      // son iguales solo mirándolos.
      expect(sa.ct).not.toBe(sb.ct);
      expect(sa.iv).not.toBe(sb.iv);
      expect(sa.sobreAlumno).not.toBe(sb.sobreAlumno);
   });

   it('el algoritmo no aparece en claro dentro del archivo', async () => {
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);
      const { texto } = await ana.bib.construir({
         programa: parse(`Proceso secreto
   Escribir "contrasena_del_examen"
FinProceso`).program,
         titulo: 'T',
         identidad: ANA,
      });

      expect(texto).not.toContain('contrasena_del_examen');
      expect(texto).not.toContain('Escribir');
   });

   it('el encabezado sí queda legible sin ninguna llave', async () => {
      // Es lo que permite al profesor ordenar un lote antes de descifrar.
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);
      const { texto } = await ana.bib.construir({
         programa: programa(),
         titulo: 'Tarea 4',
         identidad: ANA,
      });

      const bruto = JSON.parse(texto);
      expect(bruto.autor.numeroControl).toBe('20161234');
      expect(bruto.titulo).toBe('Tarea 4');
      expect(bruto.alg).toBe('A256GCM+ECIES-P256');
   });

   it('los archivos sin cifrar de versiones anteriores se siguen abriendo', async () => {
      const prof = await generarLlavesProfesor();
      const ana = await instalacion(prof.publica);

      const viejo = JSON.stringify({
         magic: 'RFLOWP',
         fmt: 'algx/1',
         alg: 'ninguno',
         autor: { numeroControl: '20161234', nombre: 'Ana López' },
         deviceId: 'dispositivo-ana',
         titulo: 'De antes',
         creado: '2026-01-01T00:00:00.000Z',
         modificado: '2026-01-01T00:00:00.000Z',
         appVersion: '0.4.0',
         contenido: { programa: programa() },
      });

      const abierto = await ana.bib.interpretar(viejo);
      expect(abierto.como).toBe('sin-cifrar');
      expect(abierto.firmaValida).toBe(false);
      expect(print(abierto.contenido.programa)).toBe(FUENTE);
   });

   it('rechaza un esquema de protección desconocido', () => {
      const raro = JSON.stringify({
         magic: 'RFLOWP',
         fmt: 'algx/1',
         alg: 'ALGO-DEL-FUTURO',
         autor: { numeroControl: '1', nombre: 'x' },
      });
      expect(() => deserializar(raro)).toThrow(ErrorArchivo);
      expect(() => deserializar(raro)).toThrow(/no conoce/);
   });
});
