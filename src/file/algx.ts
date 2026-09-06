/**
 * Contenedor `.algx`: el formato en que se guardan y entregan los algoritmos.
 *
 * El archivo tiene dos partes bien separadas:
 *
 *   encabezado  SIEMPRE en claro. Lleva quién lo hizo y cuándo. El profesor
 *               necesita poder ordenar un lote de entregas y detectar
 *               duplicados sin descifrar nada.
 *   carga       el cuaderno —sus ejercicios y sus bitácoras— dentro de un
 *               sobre cifrado.
 *
 * El encabezado va en claro pero **cubierto por la firma**: alterar el nombre o
 * el número de control invalida la firma del archivo.
 *
 * Un archivo es un CUADERNO con varios ejercicios, no un algoritmo suelto: así
 * una tarea de ocho ejercicios se entrega una vez y no ocho.
 *
 * `algx/2` no lee los archivos `algx/1`. Se decidió no escribir un migrador
 * porque no llegó a haber entregas con el formato anterior, y una ruta de
 * migración para archivos que no existen es código difícil de probar y fácil de
 * romper. `deserializar` los rechaza con un mensaje claro.
 */

import type { Program } from '../core/ast';
import { ESQUEMA, type Sobre } from '../crypto/sobre';

/** Versión del formato. Sube cuando el contenedor deje de ser compatible. */
export const FORMATO = 'algx/2';

/** Marca que identifica el archivo antes de intentar interpretarlo. */
const MAGIC = 'RFLOWP';

export type Algoritmo = 'ninguno' | typeof ESQUEMA;

export interface AutorArchivo {
   numeroControl: string;
   nombre: string;
   grupo?: string;
}

export interface Encabezado {
   magic: string;
   fmt: string;
   /** Cómo está protegido el contenido. */
   alg: Algoritmo;
   autor: AutorArchivo;
   /** Instalación que lo generó. Dos entregas con el mismo valor son sospechosas. */
   deviceId: string;
   titulo: string;
   creado: string;
   modificado: string;
   appVersion: string;
}

/**
 * Lo que se midió trabajando en UN ejercicio.
 *
 * Es por ejercicio y no por cuaderno porque es lo que hace útil la revisión:
 * «dedicó 40 minutos al ejercicio 2 y 90 segundos al 5» dice mucho más que un
 * total agregado, y es justo lo que distingue un trabajo hecho de uno
 * transcrito.
 */
export interface BitacoraEjercicio {
   /** Segundos con la app visible y en primer plano en este ejercicio. */
   segundosActivos: number;
   /** Ediciones aplicadas, por texto o por diagrama. */
   ediciones: number;
   /** Intentos de pegar que la app bloqueó mientras se editaba este ejercicio. */
   pegadosBloqueados: number;
   /**
    * Pegados que SÍ pasaron, con el apoyo de portapapeles puesto.
    *
    * El apoyo existe porque bloquear el portapapeles también estorba a quien lo
    * necesita para escribir —dictado, teclado alternativo, lector de pantalla—,
    * y dejar a ese alumno sin poder usar la app no es un precio aceptable.
    *
    * Se cuenta aparte de `pegadosBloqueados` porque no significa lo mismo: uno
    * es un intento frenado y el otro un pegado consentido. Mezclarlos
    * convertiría una adaptación en una sospecha.
    */
   pegadosPermitidos: number;
}

/**
 * Lo del cuaderno entero.
 *
 * `sesiones` vive aquí y no en el ejercicio porque abrir el archivo es un acto
 * del cuaderno; los totales se derivan sumando los ejercicios.
 */
export interface Bitacora extends BitacoraEjercicio {
   /** Cuántas veces se abrió el cuaderno para trabajar. */
   sesiones: number;
}

/** Un algoritmo dentro del cuaderno. */
export interface Ejercicio {
   /** Estable dentro del cuaderno; con él se referencia sin depender del orden. */
   id: string;
   nombre: string;
   /**
    * Lo que hay que resolver. Lo escribe el profesor en la plantilla y el
    * alumno lo ve sin poder editarlo.
    */
   enunciado?: string;
   /**
    * Id de este ejercicio en la plantilla de la que salió.
    *
    * Es lo que permite comparar «el ejercicio 3 de Ana» con «el de Luis» aunque
    * cada uno lo haya renombrado: se emparejan por identificador, no por nombre.
    */
   origenId?: string;
   programa: Program;
   bitacora: BitacoraEjercicio;
}

/** De qué plantilla salió el cuaderno. */
export interface OrigenPlantilla {
   id: string;
   nombre: string;
   /** Huella del enunciado original, para detectar si se alteró. */
   huella: string;
}

/**
 * El contenido de un archivo: un cuaderno con varios ejercicios.
 *
 * Un archivo por tarea en vez de uno por ejercicio: el alumno entrega una vez y
 * el profesor recibe una entrega por alumno en lugar de ocho.
 */
export interface Contenido {
   ejercicios: Ejercicio[];
   plantilla?: OrigenPlantilla;
   bitacora: Bitacora;
}

/** Lo que se puede leer de un archivo sin tener ninguna llave. */
export type Carga =
   | { cifrado: false; contenido: Contenido }
   | { cifrado: true; sobre: Sobre };

export interface ArchivoLeido {
   encabezado: Encabezado;
   carga: Carga;
}

export function bitacoraNueva(): Bitacora {
   return {
      sesiones: 1,
      segundosActivos: 0,
      ediciones: 0,
      pegadosBloqueados: 0,
      pegadosPermitidos: 0,
   };
}

export function bitacoraEjercicioNueva(): BitacoraEjercicio {
   return { segundosActivos: 0, ediciones: 0, pegadosBloqueados: 0, pegadosPermitidos: 0 };
}

/** Totales del cuaderno, sumando sus ejercicios. */
export function totalizarBitacora(
   ejercicios: readonly Ejercicio[],
   sesiones: number,
): Bitacora {
   return ejercicios.reduce<Bitacora>(
      (suma, e) => ({
         sesiones,
         segundosActivos: suma.segundosActivos + e.bitacora.segundosActivos,
         ediciones: suma.ediciones + e.bitacora.ediciones,
         pegadosBloqueados: suma.pegadosBloqueados + e.bitacora.pegadosBloqueados,
         pegadosPermitidos: suma.pegadosPermitidos + e.bitacora.pegadosPermitidos,
      }),
      {
         sesiones,
         segundosActivos: 0,
         ediciones: 0,
         pegadosBloqueados: 0,
         pegadosPermitidos: 0,
      },
   );
}

/** Error con un mensaje pensado para el alumno, no para la consola. */
export class ErrorArchivo extends Error {
   constructor(message: string) {
      super(message);
      this.name = 'ErrorArchivo';
   }
}

// ---------------------------------------------------------------------------
// Encabezado canónico
// ---------------------------------------------------------------------------

/**
 * Serialización determinista del encabezado, para firmar y verificar.
 *
 * Se usa un array y no un objeto porque el orden de las claves de un objeto
 * depende de cómo se construyó: firmar sobre `{a,b}` y verificar sobre `{b,a}`
 * produciría bytes distintos y la firma nunca cuadraría.
 */
export function encabezadoCanonico(e: Encabezado): string {
   return JSON.stringify([
      e.magic,
      e.fmt,
      e.alg,
      e.autor.numeroControl,
      e.autor.nombre,
      e.autor.grupo ?? '',
      e.deviceId,
      e.titulo,
      e.creado,
      e.modificado,
      e.appVersion,
   ]);
}

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

interface Envoltura {
   magic: string;
   fmt: string;
   alg: Algoritmo;
   autor: AutorArchivo;
   deviceId: string;
   titulo: string;
   creado: string;
   modificado: string;
   appVersion: string;
   /** Presente solo en archivos sin cifrar de versiones anteriores. */
   contenido?: unknown;
   /** Presente en los archivos cifrados. */
   sobre?: Sobre;
}

function envolturaDe(encabezado: Encabezado): Omit<Envoltura, 'contenido' | 'sobre'> {
   return {
      magic: MAGIC,
      fmt: encabezado.fmt,
      alg: encabezado.alg,
      autor: encabezado.autor,
      deviceId: encabezado.deviceId,
      titulo: encabezado.titulo,
      creado: encabezado.creado,
      modificado: encabezado.modificado,
      appVersion: encabezado.appVersion,
   };
}

/** Escribe un archivo cifrado. */
export function serializarCifrado(encabezado: Encabezado, sobre: Sobre): string {
   return JSON.stringify({ ...envolturaDe(encabezado), sobre });
}

/** Escribe un archivo sin cifrar. Solo para pruebas y compatibilidad. */
export function serializarEnClaro(encabezado: Encabezado, contenido: Contenido): string {
   return JSON.stringify({
      ...envolturaDe({ ...encabezado, alg: 'ninguno' }),
      alg: 'ninguno' as Algoritmo,
      contenido,
   });
}

export function deserializar(texto: string): ArchivoLeido {
   let bruto: unknown;
   try {
      bruto = JSON.parse(texto);
   } catch {
      throw new ErrorArchivo('Este archivo no es un algoritmo de RFlowP.');
   }

   if (typeof bruto !== 'object' || bruto === null) {
      throw new ErrorArchivo('Este archivo no es un algoritmo de RFlowP.');
   }

   const e = bruto as Partial<Envoltura>;

   if (e.magic !== MAGIC) {
      throw new ErrorArchivo('Este archivo no es un algoritmo de RFlowP.');
   }

   if (e.fmt !== FORMATO) {
      throw new ErrorArchivo(
         `Este archivo se hizo con otra versión de la app (${e.fmt ?? 'desconocida'}) y esta no sabe leerlo.`,
      );
   }

   if (!e.autor || typeof e.autor.numeroControl !== 'string') {
      throw new ErrorArchivo('El archivo no dice quién lo hizo.');
   }

   const encabezado: Encabezado = {
      magic: MAGIC,
      fmt: e.fmt,
      alg: e.alg === ESQUEMA ? ESQUEMA : 'ninguno',
      autor: e.autor,
      deviceId: e.deviceId ?? '',
      titulo: e.titulo ?? 'Sin título',
      creado: e.creado ?? '',
      modificado: e.modificado ?? '',
      appVersion: e.appVersion ?? '',
   };

   if (e.alg === ESQUEMA) {
      if (!e.sobre || typeof e.sobre.ct !== 'string') {
         throw new ErrorArchivo('El archivo está incompleto o dañado.');
      }
      return { encabezado, carga: { cifrado: true, sobre: e.sobre } };
   }

   if (e.alg !== 'ninguno') {
      throw new ErrorArchivo(
         `Este archivo usa una protección que esta versión no conoce (${String(e.alg)}).`,
      );
   }

   return {
      encabezado,
      carga: { cifrado: false, contenido: normalizarContenido(e.contenido) },
   };
}

/**
 * Valida el cuaderno y rellena lo que falte.
 *
 * Se usa en los dos caminos —archivo en claro y sobre recién descifrado— para
 * que no haya dos nociones de «contenido válido» que acaben divergiendo.
 */
export function normalizarContenido(bruto: unknown): Contenido {
   if (typeof bruto !== 'object' || bruto === null) {
      throw new ErrorArchivo('El archivo está incompleto o dañado.');
   }

   const c = bruto as Partial<Contenido>;
   if (!Array.isArray(c.ejercicios) || c.ejercicios.length === 0) {
      throw new ErrorArchivo('El archivo está incompleto o dañado.');
   }

   const ejercicios = c.ejercicios.map((e, i) => {
      if (!e || typeof e !== 'object' || !e.programa) {
         throw new ErrorArchivo('El archivo está incompleto o dañado.');
      }
      return {
         // Un cuaderno sin ids utilizables se repara aquí en vez de fallar: el
         // trabajo del alumno importa más que la pulcritud del archivo.
         id: typeof e.id === 'string' && e.id ? e.id : `ej${i + 1}`,
         nombre: typeof e.nombre === 'string' && e.nombre ? e.nombre : `Ejercicio ${i + 1}`,
         ...(typeof e.enunciado === 'string' ? { enunciado: e.enunciado } : {}),
         ...(typeof e.origenId === 'string' ? { origenId: e.origenId } : {}),
         programa: e.programa,
         bitacora: { ...bitacoraEjercicioNueva(), ...(e.bitacora ?? {}) },
      } satisfies Ejercicio;
   });

   return {
      ejercicios,
      ...(c.plantilla ? { plantilla: c.plantilla } : {}),
      bitacora: { ...bitacoraNueva(), ...(c.bitacora ?? {}) },
   };
}

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

export function crearEncabezado(opciones: {
   titulo: string;
   autor: AutorArchivo;
   deviceId: string;
   appVersion: string;
   alg: Algoritmo;
   creado?: string;
   ahora?: () => Date;
}): Encabezado {
   const ahora = (opciones.ahora ?? (() => new Date()))().toISOString();

   return {
      magic: MAGIC,
      fmt: FORMATO,
      alg: opciones.alg,
      autor: opciones.autor,
      deviceId: opciones.deviceId,
      titulo: opciones.titulo.trim() || 'Sin título',
      creado: opciones.creado ?? ahora,
      modificado: ahora,
      appVersion: opciones.appVersion,
   };
}

/** Nombre de archivo sugerido al exportar: identifica al autor de un vistazo. */
export function nombreSugerido(encabezado: Encabezado): string {
   const limpio = (s: string) =>
      s
         .normalize('NFD')
         .replace(/[̀-ͯ]/g, '')
         .replace(/[^A-Za-z0-9]+/g, '_')
         .replace(/^_+|_+$/g, '')
         .slice(0, 40);

   const partes = [
      limpio(encabezado.autor.numeroControl),
      limpio(encabezado.titulo) || 'algoritmo',
   ].filter(Boolean);

   return `${partes.join('-')}.algx`;
}
