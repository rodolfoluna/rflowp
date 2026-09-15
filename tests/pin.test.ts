/**
 * Número de control + PIN: abrir lo propio en cualquier aparato.
 *
 * Lo que se protege aquí son dos promesas que tiran en direcciones opuestas:
 * que el alumno abra lo suyo en su teléfono y en su PC, y que nadie más pueda.
 * Y una tercera que no se ve: que lo que ya existía antes del PIN no se pierda.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser';
import { print } from '../src/core/printer';
import {
   almacenLlavesEnMemoria,
   generarLlavesAlumno,
   generarLlavesProfesor,
   llavesConPin,
   type LlavesAlumno,
} from '../src/crypto/llaves';
import {
   derivarLlave,
   salDe,
   validarPin,
   DERIVACION,
   type ParametrosArgon2,
} from '../src/crypto/identidad-llave';
import { huellaDeFirma } from '../src/crypto/sobre';
import { almacenArchivosEnMemoria, type AlmacenArchivos } from '../src/file/almacenes';
import { Biblioteca, type ContextoCripto } from '../src/file/biblioteca.svelte';
import {
   bitacoraEjercicioNueva,
   bitacoraNueva,
   deserializar,
   type Contenido,
} from '../src/file/algx';
import { buscarCoincidencias } from '../src/teacher/analisis';
import type { Identidad } from '../src/identity/identidad';

/** Argon2 barato: las pruebas comprueban la lógica, no el costo. */
const RAPIDO: ParametrosArgon2 = { memoria: 256, iteraciones: 1, paralelismo: 1 };

const FUENTE = `Proceso p
   Definir a Como Entero
   Leer a
   Escribir a
FinProceso`;

function cuaderno(): Contenido {
   return {
      ejercicios: [
         {
            id: 'e1',
            nombre: 'Ejercicio 1',
            programa: parse(FUENTE).program,
            bitacora: { ...bitacoraEjercicioNueva(), segundosActivos: 420, ediciones: 37 },
         },
      ],
      bitacora: bitacoraNueva(),
   };
}

const ANA: Identidad = {
   numeroControl: '20161234',
   nombre: 'Ana López',
   deviceId: 'telefono-ana',
   creada: '2026-01-15T10:00:00.000Z',
};

/** Un aparato: sus llaves, su almacén y su biblioteca. */
function aparato(llaves: LlavesAlumno | null, profesorPublica: CryptoKey | null, almacen?: AlmacenArchivos) {
   const contexto: ContextoCripto = { alumno: llaves, profesorPublica, profesorPrivada: null };
   let n = 0;
   const bib = new Biblioteca(
      almacen ?? almacenArchivosEnMemoria(),
      '1.2.0',
      () => contexto,
      () => `f${++n}.algx`,
   );
   return { bib, contexto };
}

async function conPin(numero: string, pin: string, anteriores: LlavesAlumno | null = null) {
   return llavesConPin(await derivarLlave(numero, pin, RAPIDO), anteriores);
}

// ---------------------------------------------------------------------------

describe('el PIN', () => {
   it('acepta seis dígitos', () => {
      expect(validarPin('482915')).toBeNull();
   });

   it('rechaza lo que no son seis dígitos', () => {
      for (const malo of ['', '12345', '1234567', '12a456', ' 48291', '48 915']) {
         expect(validarPin(malo), malo).not.toBeNull();
      }
   });

   it('rechaza los que cualquiera prueba primero', () => {
      for (const obvio of ['000000', '111111', '123456', '654321']) {
         expect(validarPin(obvio), obvio).toMatch(/primeros/);
      }
   });

   it('derivar con un PIN inválido falla en vez de dar una llave débil', async () => {
      await expect(derivarLlave('20161234', '1234', RAPIDO)).rejects.toThrow();
   });
});

describe('la sal', () => {
   it('no depende de cómo se escribió el número de control', async () => {
      expect(await salDe(' l20161234 ')).toEqual(await salDe('L20161234'));
   });

   it('cambia con el número: dos alumnos con el mismo PIN tienen llaves distintas', async () => {
      expect(await salDe('20161234')).not.toEqual(await salDe('20165678'));
   });
});

describe('el código de identidad', () => {
   it('es el mismo en cualquier aparato con el mismo número y PIN', async () => {
      const telefono = await derivarLlave('20161234', '482915', RAPIDO);
      const pc = await derivarLlave('20161234', '482915', RAPIDO);
      expect(pc.codigo).toBe(telefono.codigo);
      expect(telefono.codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
   });

   it('cambia si el PIN está mal tecleado', async () => {
      const bien = await derivarLlave('20161234', '482915', RAPIDO);
      const mal = await derivarLlave('20161234', '482916', RAPIDO);
      expect(mal.codigo).not.toBe(bien.codigo);
   });

   it('cambia con otro número de control', async () => {
      const ana = await derivarLlave('20161234', '482915', RAPIDO);
      const luis = await derivarLlave('20165678', '482915', RAPIDO);
      expect(luis.codigo).not.toBe(ana.codigo);
   });

   it('no deja la llave exportable', async () => {
      const { maestra } = await derivarLlave('20161234', '482915', RAPIDO);
      expect(maestra.extractable).toBe(false);
   });
});

// ---------------------------------------------------------------------------

describe('abrir lo propio en otro aparato', () => {
   it('lo hecho en el teléfono se abre en la PC con el mismo número y PIN', async () => {
      const prof = await generarLlavesProfesor();
      const telefono = aparato(await conPin('20161234', '482915'), prof.publica);

      const id = await telefono.bib.guardar({ contenido: cuaderno(), titulo: 'Tarea', identidad: ANA });
      const { texto } = await telefono.bib.paraExportar(id);

      // La PC: otra instalación, llaves calculadas desde cero.
      const pc = aparato(await conPin('20161234', '482915'), prof.publica);
      const importado = await pc.bib.importar(texto);
      const abierto = await pc.bib.abrir(importado);

      expect(abierto.como).toBe('alumno');
      expect(abierto.firmaValida).toBe(true);
      expect(print(abierto.contenido.ejercicios[0].programa)).toBe(FUENTE);
   });

   it('el archivo dice que se cifró con la llave del PIN', async () => {
      const telefono = aparato(await conPin('20161234', '482915'), null);
      const id = await telefono.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: ANA });
      const { carga } = deserializar((await telefono.bib.paraExportar(id)).texto);
      expect(carga.cifrado && carga.sobre.llave).toBe(DERIVACION);
   });

   it('con otro PIN no se abre, y el mensaje apunta al código de identidad', async () => {
      const telefono = aparato(await conPin('20161234', '482915'), null);
      const id = await telefono.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: ANA });
      const { texto } = await telefono.bib.paraExportar(id);

      const pc = aparato(await conPin('20161234', '482916'), null);
      await expect(pc.bib.abrir(await pc.bib.importar(texto))).rejects.toThrow(/código de identidad/);
   });

   it('otro alumno con el mismo PIN tampoco lo abre', async () => {
      const ana = aparato(await conPin('20161234', '482915'), null);
      const id = await ana.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: ANA });
      const { texto } = await ana.bib.paraExportar(id);

      const luis = aparato(await conPin('20165678', '482915'), null);
      await expect(luis.bib.abrir(await luis.bib.importar(texto))).rejects.toThrow();
   });

   it('el profesor lo sigue abriendo', async () => {
      const prof = await generarLlavesProfesor();
      const ana = aparato(await conPin('20161234', '482915'), prof.publica);
      const id = await ana.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: ANA });

      const bibProf = new Biblioteca(
         almacenArchivosEnMemoria(),
         '1.2.0',
         () => ({ alumno: null, profesorPublica: null, profesorPrivada: prof.privada }),
         () => 'p.algx',
      );
      const importado = await bibProf.importar((await ana.bib.paraExportar(id)).texto);
      expect((await bibProf.abrir(importado)).como).toBe('profesor');
   });

   it('lo de su otro aparato cuenta como propio en la lista', async () => {
      const telefono = aparato(await conPin('20161234', '482915'), null);
      const id = await telefono.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: ANA });
      const { texto } = await telefono.bib.paraExportar(id);

      const pc = aparato(await conPin('20161234', '482915'), null);
      pc.bib.titular = '20161234';
      await pc.bib.importar(texto, 'pc-ana');

      expect(pc.bib.archivos[0].propio).toBe(true);
   });
});

// ---------------------------------------------------------------------------

describe('el archivo pertenece a su número de control', () => {
   it('no se deja sobrescribir con otro número', async () => {
      const almacen = almacenArchivosEnMemoria();
      const ana = aparato(await conPin('20161234', '482915'), null, almacen);
      const id = await ana.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: ANA });

      const luis: Identidad = { ...ANA, numeroControl: '20165678', nombre: 'Luis Ruiz' };
      await expect(
         ana.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: luis, id }),
      ).rejects.toThrow(/Ana López \(20161234\)/);

      // Y el archivo sigue siendo de Ana.
      const { encabezado } = deserializar((await almacen.leer(id))!);
      expect(encabezado.autor.numeroControl).toBe('20161234');
   });

   it('su dueño sí lo vuelve a guardar, conservando la fecha de creación', async () => {
      const ana = aparato(await conPin('20161234', '482915'), null);
      const id = await ana.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: ANA });
      const creado = (await ana.bib.abrir(id)).encabezado.creado;

      await ana.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: ANA, id });
      expect((await ana.bib.abrir(id)).encabezado.creado).toBe(creado);
   });
});

describe('la firma sigue siendo del aparato', () => {
   it('crear el PIN no cambia la huella del aparato', async () => {
      const antes = await generarLlavesAlumno();
      const despues = await conPin('20161234', '482915', antes);

      expect(await huellaDeFirma(despues.firmaPublicaJwk)).toBe(
         await huellaDeFirma(antes.firmaPublicaJwk),
      );
   });

   it('usar el PIN de otro en tu teléfono deja tu huella, y el panel lo señala', async () => {
      // Luis tiene su identidad en su teléfono. Borra sus datos y entra como
      // Ana con el PIN de ella: lo del aparato se conserva.
      const almacenLlaves = almacenLlavesEnMemoria();
      const llavesLuis = await conPin('20165678', '271828');
      await almacenLlaves.guardar(llavesLuis);
      await almacenLlaves.borrar();

      const comoAna = await conPin('20161234', '482915', await almacenLlaves.leerAparato());

      const huellaLuis = await huellaDeFirma(llavesLuis.firmaPublicaJwk);
      const huellaComoAna = await huellaDeFirma(comoAna.firmaPublicaJwk);
      expect(huellaComoAna).toBe(huellaLuis);

      const coincidencias = buscarCoincidencias([
         {
            entregaId: 'luis', ejercicioId: 'e1', numeroControl: '20165678',
            nombre: 'Luis Ruiz', nombreEjercicio: 'E1', deviceId: 'x', huella: huellaLuis,
         },
         {
            entregaId: 'ana', ejercicioId: 'e1', numeroControl: '20161234',
            nombre: 'Ana López', nombreEjercicio: 'E1', deviceId: 'x', huella: huellaComoAna,
         },
      ]);
      expect(coincidencias.map((c) => c.tipo)).toContain('instalacion');
   });
});

// ---------------------------------------------------------------------------

describe('archivos de antes del PIN', () => {
   /** Una instalación de antes: llave aleatoria, un archivo guardado. */
   async function instalacionVieja(profesorPublica: CryptoKey | null) {
      const almacen = almacenArchivosEnMemoria();
      const viejas = await generarLlavesAlumno();
      const antes = aparato(viejas, profesorPublica, almacen);
      antes.bib.titular = ANA.numeroControl;
      const id = await antes.bib.guardar({ contenido: cuaderno(), titulo: 'Vieja', identidad: ANA });
      return { almacen, viejas, id, texto: (await antes.bib.paraExportar(id)).texto };
   }

   it('se siguen abriendo en su aparato después de crear el PIN', async () => {
      const { almacen, viejas, id } = await instalacionVieja(null);

      const ahora = aparato(await conPin('20161234', '482915', viejas), null, almacen);
      expect((await ahora.bib.abrir(id)).como).toBe('alumno');
   });

   it('sin convertir, en otro aparato no se abren; el profesor sí', async () => {
      const prof = await generarLlavesProfesor();
      const { texto } = await instalacionVieja(prof.publica);

      const pc = aparato(await conPin('20161234', '482915'), null);
      await expect(pc.bib.abrir(await pc.bib.importar(texto))).rejects.toThrow();

      const bibProf = new Biblioteca(
         almacenArchivosEnMemoria(),
         '1.2.0',
         () => ({ alumno: null, profesorPublica: null, profesorPrivada: prof.privada }),
         () => 'p.algx',
      );
      expect((await bibProf.abrir(await bibProf.importar(texto))).como).toBe('profesor');
   });

   it('convertidos, se abren en otro aparato y conservan todo lo que es evidencia', async () => {
      const { almacen, viejas, id } = await instalacionVieja(null);
      const original = deserializar((await almacen.leer(id))!);

      const ahora = aparato(await conPin('20161234', '482915', viejas), null, almacen);
      ahora.bib.titular = ANA.numeroControl;
      await ahora.bib.refrescar(ANA.deviceId);
      expect(ahora.bib.pendientesDeConvertir).toBe(1);

      const resultado = await ahora.bib.convertirPendientes(ANA);
      expect(resultado).toEqual({ convertidos: 1, noSePudieron: 0 });
      expect(ahora.bib.pendientesDeConvertir).toBe(0);

      const convertido = deserializar((await almacen.leer(id))!);
      expect(convertido.encabezado.autor).toEqual(original.encabezado.autor);
      expect(convertido.encabezado.creado).toBe(original.encabezado.creado);
      expect(convertido.encabezado.modificado).toBe(original.encabezado.modificado);
      expect(convertido.encabezado.deviceId).toBe(original.encabezado.deviceId);
      expect(convertido.carga.cifrado && (await huellaDeFirma(convertido.carga.sobre.firmaPub))).toBe(
         original.carga.cifrado && (await huellaDeFirma(original.carga.sobre.firmaPub)),
      );

      // Ahora sí: la PC lo abre, con la bitácora intacta.
      const pc = aparato(await conPin('20161234', '482915'), null);
      const abierto = await pc.bib.abrir(await pc.bib.importar((await almacen.leer(id))!));
      expect(abierto.firmaValida).toBe(true);
      expect(abierto.contenido.ejercicios[0].bitacora.segundosActivos).toBe(420);
      expect(abierto.contenido.ejercicios[0].bitacora.ediciones).toBe(37);
   });

   it('lo que no se puede abrir en este aparato se cuenta aparte y queda intacto', async () => {
      // Un .algx viejo de Ana hecho en OTRO aparato, importado aquí.
      const deOtroAparato = await instalacionVieja(null);

      const almacen = almacenArchivosEnMemoria();
      const aqui = aparato(await conPin('20161234', '482915', await generarLlavesAlumno()), null, almacen);
      aqui.bib.titular = ANA.numeroControl;
      const id = await aqui.bib.importar(deOtroAparato.texto, ANA.deviceId);

      const resultado = await aqui.bib.convertirPendientes(ANA);
      expect(resultado).toEqual({ convertidos: 0, noSePudieron: 1 });
      expect(await almacen.leer(id)).toBe(deOtroAparato.texto);
   });

   it('no convierte lo de otro número de control', async () => {
      const almacen = almacenArchivosEnMemoria();
      const viejas = await generarLlavesAlumno();
      const antes = aparato(viejas, null, almacen);
      const luis: Identidad = { ...ANA, numeroControl: '20165678', nombre: 'Luis Ruiz' };
      const id = await antes.bib.guardar({ contenido: cuaderno(), titulo: 'De Luis', identidad: luis });
      const textoOriginal = await almacen.leer(id);

      const ahora = aparato(await conPin('20161234', '482915', viejas), null, almacen);
      ahora.bib.titular = ANA.numeroControl;
      await ahora.bib.refrescar(ANA.deviceId);

      await ahora.bib.convertirPendientes(ANA);
      expect(await almacen.leer(id)).toBe(textoOriginal);
   });

   it('convertir sin PIN se niega', async () => {
      const { almacen, viejas } = await instalacionVieja(null);
      const sinPin = aparato(viejas, null, almacen);
      await expect(sinPin.bib.convertirPendientes(ANA)).rejects.toThrow(/PIN/);
   });
});

describe('borrar los datos', () => {
   it('conserva la firma y el deviceId del aparato, y olvida lo del alumno', async () => {
      const almacen = almacenLlavesEnMemoria();
      const llaves = { ...(await conPin('20161234', '482915')), deviceId: 'telefono-ana' };
      await almacen.guardar(llaves);

      await almacen.borrar();

      expect(await almacen.leer()).toBeNull();
      const aparatoRestante = await almacen.leerAparato();
      expect(aparatoRestante?.deviceId).toBe('telefono-ana');
      expect(aparatoRestante?.firma.privateKey).toBe(llaves.firma.privateKey);
   });

   it('entrar otra vez con número y PIN recupera el acceso', async () => {
      const antes = aparato(await conPin('20161234', '482915'), null);
      const id = await antes.bib.guardar({ contenido: cuaderno(), titulo: 'T', identidad: ANA });
      const { texto } = await antes.bib.paraExportar(id);

      // Datos borrados; el alumno vuelve a entrar.
      const despues = aparato(await conPin('20161234', '482915'), null);
      expect((await despues.bib.abrir(await despues.bib.importar(texto))).como).toBe('alumno');
   });
});
