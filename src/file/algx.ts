/**
 * Contenedor `.algx`: el formato en que se guardan y entregan los algoritmos.
 *
 * El archivo tiene dos partes bien separadas:
 *
 *   encabezado  SIEMPRE en claro. Lleva quién lo hizo y cuándo. El profesor
 *               necesita poder leerlo sin descifrar nada para ordenar un lote
 *               de entregas y detectar duplicados.
 *   contenido   el algoritmo y su bitácora. Hoy va en claro; en la fase 5 este
 *               mismo campo pasa a llevar el sobre cifrado, sin que cambie el
 *               resto del contenedor ni el código que lo lee.
 *
 * ⚠️ ESTADO ACTUAL: `alg` vale `"ninguno"`. Los archivos de esta fase **no
 * están protegidos**: cualquiera puede abrirlos con un editor de texto. La
 * protección llega en la fase 5. La app lo dice en pantalla; no se debe usar en
 * un curso real hasta entonces.
 */

import type { Program } from '../core/ast';

/** Versión del formato. Sube cuando el contenedor deje de ser compatible. */
export const FORMATO = 'algx/1';

/** Marca que identifica el archivo antes de intentar interpretarlo. */
const MAGIC = 'RFLOWP';

export type Algoritmo = 'ninguno' | 'A256GCM+ECIES-P256';

export interface AutorArchivo {
   numeroControl: string;
   nombre: string;
   grupo?: string;
}

export interface Encabezado {
   magic: string;
   fmt: string;
   /** Cómo está protegido el contenido. `ninguno` mientras no llegue la fase 5. */
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
 * Registro de procedencia. Es la evidencia que el profesor mira cuando duda de
 * una entrega: un trabajo con dos minutos de edición y cero sesiones previas no
 * se escribió, se copió.
 */
export interface Bitacora {
   /** Cuántas veces se abrió y editó el archivo. */
   sesiones: number;
   /** Segundos con la app en primer plano trabajando en este algoritmo. */
   segundosActivos: number;
   /** Cuántas ediciones se aplicaron en total (texto y diagrama). */
   ediciones: number;
   /** Intentos de pegar texto que la app bloqueó. */
   pegadosBloqueados: number;
}

export interface Contenido {
   programa: Program;
   bitacora: Bitacora;
}

export interface Archivo {
   encabezado: Encabezado;
   contenido: Contenido;
}

export function bitacoraNueva(): Bitacora {
   return { sesiones: 1, segundosActivos: 0, ediciones: 0, pegadosBloqueados: 0 };
}

/** Error con un mensaje pensado para el alumno, no para la consola. */
export class ErrorArchivo extends Error {
   constructor(message: string) {
      super(message);
      this.name = 'ErrorArchivo';
   }
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
   /**
    * El contenido. Hoy es el objeto tal cual; en la fase 5 será una cadena en
    * base64 con el sobre cifrado. Se deja como `unknown` para que el cambio no
    * obligue a tocar el tipo del contenedor.
    */
   contenido: unknown;
}

export function serializar(archivo: Archivo): string {
   const envoltura: Envoltura = {
      magic: MAGIC,
      fmt: archivo.encabezado.fmt,
      alg: archivo.encabezado.alg,
      autor: archivo.encabezado.autor,
      deviceId: archivo.encabezado.deviceId,
      titulo: archivo.encabezado.titulo,
      creado: archivo.encabezado.creado,
      modificado: archivo.encabezado.modificado,
      appVersion: archivo.encabezado.appVersion,
      contenido: archivo.contenido,
   };

   // Sin sangrado: el archivo no está pensado para leerse a mano, y en la
   // fase 5 el contenido será opaco de todos modos.
   return JSON.stringify(envoltura);
}

export function deserializar(texto: string): Archivo {
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

   if (e.alg !== 'ninguno') {
      // Llegará cuando exista la fase 5 y alguien abra un archivo cifrado con
      // una build vieja. Mejor decirlo claro que fallar de forma rara.
      throw new ErrorArchivo(
         'Este archivo está protegido y esta versión de la app no puede abrirlo.',
      );
   }

   const contenido = e.contenido as Partial<Contenido> | undefined;
   if (!contenido || typeof contenido !== 'object' || !contenido.programa) {
      throw new ErrorArchivo('El archivo está incompleto o dañado.');
   }

   if (!e.autor || typeof e.autor.numeroControl !== 'string') {
      throw new ErrorArchivo('El archivo no dice quién lo hizo.');
   }

   return {
      encabezado: {
         magic: MAGIC,
         fmt: e.fmt,
         alg: e.alg,
         autor: e.autor,
         deviceId: e.deviceId ?? '',
         titulo: e.titulo ?? 'Sin título',
         creado: e.creado ?? '',
         modificado: e.modificado ?? '',
         appVersion: e.appVersion ?? '',
      },
      contenido: {
         programa: contenido.programa,
         bitacora: { ...bitacoraNueva(), ...(contenido.bitacora ?? {}) },
      },
   };
}

/**
 * Construye un archivo nuevo a partir del programa y de quién lo escribió.
 */
export function crearArchivo(opciones: {
   programa: Program;
   titulo: string;
   autor: AutorArchivo;
   deviceId: string;
   appVersion: string;
   bitacora?: Bitacora;
   creado?: string;
   ahora?: () => Date;
}): Archivo {
   const ahora = (opciones.ahora ?? (() => new Date()))().toISOString();

   return {
      encabezado: {
         magic: MAGIC,
         fmt: FORMATO,
         alg: 'ninguno',
         autor: opciones.autor,
         deviceId: opciones.deviceId,
         titulo: opciones.titulo,
         creado: opciones.creado ?? ahora,
         modificado: ahora,
         appVersion: opciones.appVersion,
      },
      contenido: {
         programa: opciones.programa,
         bitacora: opciones.bitacora ?? bitacoraNueva(),
      },
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
