/**
 * Identidad local del alumno.
 *
 * Se captura una sola vez, en el primer arranque, y queda en el dispositivo.
 * No hay cuentas ni servidor: el número de control y el nombre viajan dentro de
 * cada archivo que el alumno genera, y es lo que permite al profesor saber de
 * quién es una entrega.
 *
 * Este módulo es deliberadamente puro (sin IndexedDB ni `crypto` del navegador)
 * para poder probarlo sin un navegador. El guardado vive en `almacen.ts`.
 */

export interface Identidad {
   /** Número de control tal como lo escribió el alumno, normalizado. */
   numeroControl: string;
   nombre: string;
   /** Grupo o materia. Opcional: no todos los profesores lo piden. */
   grupo?: string;
   /**
    * Identificador aleatorio de ESTA instalación.
    *
    * No se deriva del número de control a propósito: si se derivara, cualquiera
    * que conociera el número de un compañero podría reconstruir su identidad.
    * Además es lo que delata a dos entregas salidas del mismo dispositivo.
    */
   deviceId: string;
   /** Cuándo se dio de alta esta instalación. */
   creada: string;
}

export interface ErrorValidacion {
   campo: 'numeroControl' | 'nombre' | 'grupo';
   mensaje: string;
}

/**
 * Rango de longitud aceptado para el número de control.
 *
 * Se mantiene laxo a propósito: cada escuela usa un formato distinto (8 dígitos,
 * con prefijo de año, con letra de carrera…) y rechazar el formato de otra
 * institución convertiría la app en inservible para ella.
 */
const CONTROL_MIN = 4;
const CONTROL_MAX = 20;
const NOMBRE_MIN = 3;
const NOMBRE_MAX = 80;
const GRUPO_MAX = 40;

/** Solo letras y dígitos: ni espacios ni guiones ni acentos. */
const CONTROL_VALIDO = /^[A-Za-z0-9]+$/;

/** Al menos una letra; se permiten espacios, acentos, apóstrofos y guiones. */
const NOMBRE_VALIDO = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]*$/;

/** Quita espacios sobrantes y colapsa los internos. */
export function limpiar(texto: string): string {
   return texto.trim().replace(/\s+/g, ' ');
}

/** Normaliza el número de control: sin espacios y en mayúsculas. */
export function normalizarControl(texto: string): string {
   return texto.replace(/\s+/g, '').toUpperCase();
}

/**
 * Valida los datos del formulario de bienvenida.
 * Devuelve la lista de problemas; vacía significa que todo está bien.
 */
export function validar(datos: {
   numeroControl: string;
   nombre: string;
   grupo?: string;
}): ErrorValidacion[] {
   const errores: ErrorValidacion[] = [];

   const control = normalizarControl(datos.numeroControl);
   if (control.length === 0) {
      errores.push({ campo: 'numeroControl', mensaje: 'Escribe tu número de control.' });
   } else if (control.length < CONTROL_MIN) {
      errores.push({
         campo: 'numeroControl',
         mensaje: `El número de control es muy corto (mínimo ${CONTROL_MIN} caracteres).`,
      });
   } else if (control.length > CONTROL_MAX) {
      errores.push({
         campo: 'numeroControl',
         mensaje: `El número de control es muy largo (máximo ${CONTROL_MAX} caracteres).`,
      });
   } else if (!CONTROL_VALIDO.test(control)) {
      errores.push({
         campo: 'numeroControl',
         mensaje: 'El número de control solo puede tener letras y números.',
      });
   }

   const nombre = limpiar(datos.nombre);
   if (nombre.length === 0) {
      errores.push({ campo: 'nombre', mensaje: 'Escribe tu nombre completo.' });
   } else if (nombre.length < NOMBRE_MIN) {
      errores.push({ campo: 'nombre', mensaje: 'El nombre es muy corto.' });
   } else if (nombre.length > NOMBRE_MAX) {
      errores.push({ campo: 'nombre', mensaje: 'El nombre es muy largo.' });
   } else if (!NOMBRE_VALIDO.test(nombre)) {
      errores.push({
         campo: 'nombre',
         mensaje: 'El nombre debe empezar con una letra y no llevar símbolos raros.',
      });
   }

   const grupo = limpiar(datos.grupo ?? '');
   if (grupo.length > GRUPO_MAX) {
      errores.push({ campo: 'grupo', mensaje: 'El grupo es muy largo.' });
   }

   return errores;
}

/**
 * Construye la identidad a partir de datos ya validados.
 *
 * `generarId` y `ahora` se inyectan para que las pruebas sean deterministas y
 * para no atar este módulo a las APIs del navegador.
 */
export function crearIdentidad(
   datos: { numeroControl: string; nombre: string; grupo?: string },
   generarId: () => string,
   ahora: () => Date = () => new Date(),
): Identidad {
   const grupo = limpiar(datos.grupo ?? '');

   return {
      numeroControl: normalizarControl(datos.numeroControl),
      nombre: limpiar(datos.nombre),
      ...(grupo ? { grupo } : {}),
      deviceId: generarId(),
      creada: ahora().toISOString(),
   };
}

/** Iniciales para el avatar de la barra superior. */
export function iniciales(nombre: string): string {
   const partes = limpiar(nombre).split(' ').filter(Boolean);
   if (partes.length === 0) return '?';
   if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
   return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
