/**
 * Llaves: las del alumno y las del profesor.
 *
 * La diferencia importante entre unas y otras es deliberada:
 *
 *   Alumno    `extractable: false`. Ni desde las herramientas del navegador se
 *             puede sacar el material de la llave. Se puede *usar* desde la
 *             consola, pero no copiar a otro dispositivo ni prestársela a un
 *             compañero, que es la propiedad que se busca. Por lo mismo, no hay
 *             frase de respaldo: la habría que poder prestar.
 *
 *   Profesor  exportable, porque tiene que poder guardarla a buen resguardo y
 *             llevarla a otra computadora. Si la pierde, se quedan sin abrir
 *             todas las entregas del curso.
 */

import { base64ABytes, bytesABase64, textoABytes } from './bytes';

// ---------------------------------------------------------------------------
// Llaves del alumno
// ---------------------------------------------------------------------------

export interface LlavesAlumno {
   /** AES-KW 256, envuelve las llaves de contenido de sus archivos. */
   maestra: CryptoKey;
   /** ECDSA P-256 para firmar. */
   firma: CryptoKeyPair;
   /** La pública de firma, ya exportada: va en cada archivo. */
   firmaPublicaJwk: JsonWebKey;
}

export async function generarLlavesAlumno(): Promise<LlavesAlumno> {
   const maestra = await crypto.subtle.generateKey(
      { name: 'AES-KW', length: 256 },
      // No exportable: es lo que impide copiar la identidad a otro dispositivo.
      false,
      ['wrapKey', 'unwrapKey'],
   );

   const firma = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      // La privada no sale nunca; la pública sí, y va dentro de cada archivo.
      false,
      ['sign', 'verify'],
   );

   const firmaPublicaJwk = await crypto.subtle.exportKey('jwk', firma.publicKey);

   return { maestra, firma, firmaPublicaJwk };
}

/**
 * Guarda y recupera las llaves del alumno.
 *
 * Se define como interfaz, igual que el resto del almacenamiento, para poder
 * probar el ciclo completo de cifrado sin IndexedDB.
 */
export interface AlmacenLlaves {
   leer(): Promise<LlavesAlumno | null>;
   guardar(llaves: LlavesAlumno): Promise<void>;
   borrar(): Promise<void>;
}

const BD_NOMBRE = 'rflowp';
const BD_VERSION = 2;
const ALMACEN_IDENTIDAD = 'identidad';
const ALMACEN_LLAVES = 'llaves';
const CLAVE_LLAVES = 'actual';

/**
 * Abre la base compartida con la identidad.
 *
 * Sube a la versión 2 creando el almacén de llaves. Se conserva el de identidad
 * para no borrar los datos de quien ya venía usando la app.
 */
export function abrirBD(): Promise<IDBDatabase> {
   return new Promise((resolve, reject) => {
      const solicitud = indexedDB.open(BD_NOMBRE, BD_VERSION);

      solicitud.onupgradeneeded = () => {
         const bd = solicitud.result;
         if (!bd.objectStoreNames.contains(ALMACEN_IDENTIDAD)) {
            bd.createObjectStore(ALMACEN_IDENTIDAD);
         }
         if (!bd.objectStoreNames.contains(ALMACEN_LLAVES)) {
            bd.createObjectStore(ALMACEN_LLAVES);
         }
      };

      solicitud.onsuccess = () => resolve(solicitud.result);
      solicitud.onerror = () => reject(solicitud.error);
      solicitud.onblocked = () =>
         reject(new Error('Hay otra pestaña de RFlowP abierta; ciérrala e intenta de nuevo.'));
   });
}

/** Lo que se guarda en IndexedDB: los `CryptoKey` se clonan tal cual. */
interface RegistroLlaves {
   maestra: CryptoKey;
   firmaPrivada: CryptoKey;
   firmaPublica: CryptoKey;
   firmaPublicaJwk: JsonWebKey;
}

function operar<T>(
   bd: IDBDatabase,
   modo: IDBTransactionMode,
   accion: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
   return new Promise((resolve, reject) => {
      const tx = bd.transaction(ALMACEN_LLAVES, modo);
      const solicitud = accion(tx.objectStore(ALMACEN_LLAVES));
      solicitud.onsuccess = () => resolve(solicitud.result);
      solicitud.onerror = () => reject(solicitud.error);
      tx.onabort = () => reject(tx.error);
   });
}

export function almacenLlavesIndexedDB(): AlmacenLlaves {
   return {
      async leer() {
         const bd = await abrirBD();
         try {
            const registro = await operar<RegistroLlaves | undefined>(bd, 'readonly', (a) =>
               a.get(CLAVE_LLAVES),
            );
            if (!registro) return null;
            return {
               maestra: registro.maestra,
               firma: {
                  privateKey: registro.firmaPrivada,
                  publicKey: registro.firmaPublica,
               },
               firmaPublicaJwk: registro.firmaPublicaJwk,
            };
         } finally {
            bd.close();
         }
      },

      async guardar(llaves) {
         const bd = await abrirBD();
         try {
            const registro: RegistroLlaves = {
               maestra: llaves.maestra,
               firmaPrivada: llaves.firma.privateKey,
               firmaPublica: llaves.firma.publicKey,
               firmaPublicaJwk: llaves.firmaPublicaJwk,
            };
            await operar(bd, 'readwrite', (a) => a.put(registro, CLAVE_LLAVES));
         } finally {
            bd.close();
         }
      },

      async borrar() {
         const bd = await abrirBD();
         try {
            await operar(bd, 'readwrite', (a) => a.delete(CLAVE_LLAVES));
         } finally {
            bd.close();
         }
      },
   };
}

export function almacenLlavesEnMemoria(inicial: LlavesAlumno | null = null): AlmacenLlaves {
   let actual = inicial;
   return {
      async leer() {
         return actual;
      },
      async guardar(llaves) {
         actual = llaves;
      },
      async borrar() {
         actual = null;
      },
   };
}

// ---------------------------------------------------------------------------
// Llaves del profesor
// ---------------------------------------------------------------------------

/** Formato del archivo que el profesor guarda o reparte. */
export interface ArchivoLlaveProfesor {
   tipo: 'rflowp/llave-profesor';
   clase: 'privada' | 'publica';
   /** Nombre de la materia o grupo, para no confundir llaves entre cursos. */
   etiqueta: string;
   creada: string;
   jwk: JsonWebKey;
}

export interface ParLlavesProfesor {
   privada: CryptoKey;
   publica: CryptoKey;
   privadaJwk: JsonWebKey;
   publicaJwk: JsonWebKey;
}

export async function generarLlavesProfesor(): Promise<ParLlavesProfesor> {
   const par = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      // Exportable: el profesor DEBE poder respaldarla y llevarla a otra
      // computadora. Sin respaldo, perder el equipo es perder el curso entero.
      true,
      ['deriveBits', 'deriveKey'],
   );

   return {
      privada: par.privateKey,
      publica: par.publicKey,
      privadaJwk: await crypto.subtle.exportKey('jwk', par.privateKey),
      publicaJwk: await crypto.subtle.exportKey('jwk', par.publicKey),
   };
}

export function archivoLlave(
   clase: 'privada' | 'publica',
   etiqueta: string,
   jwk: JsonWebKey,
   ahora: () => Date = () => new Date(),
): ArchivoLlaveProfesor {
   return {
      tipo: 'rflowp/llave-profesor',
      clase,
      etiqueta,
      creada: ahora().toISOString(),
      jwk,
   };
}

export class ErrorLlave extends Error {
   constructor(message: string) {
      super(message);
      this.name = 'ErrorLlave';
   }
}

/** Valida y extrae el contenido de un archivo de llave. */
export function leerArchivoLlave(texto: string): ArchivoLlaveProfesor {
   let bruto: unknown;
   try {
      bruto = JSON.parse(texto);
   } catch {
      throw new ErrorLlave('Ese archivo no es una llave de RFlowP.');
   }

   const a = bruto as Partial<ArchivoLlaveProfesor>;
   if (a?.tipo !== 'rflowp/llave-profesor' || !a.jwk) {
      throw new ErrorLlave('Ese archivo no es una llave de RFlowP.');
   }
   if (a.clase !== 'privada' && a.clase !== 'publica') {
      throw new ErrorLlave('La llave no dice si es pública o privada.');
   }

   return {
      tipo: a.tipo,
      clase: a.clase,
      etiqueta: a.etiqueta ?? 'Sin etiqueta',
      creada: a.creada ?? '',
      jwk: a.jwk,
   };
}

export async function importarPublicaProfesor(jwk: JsonWebKey): Promise<CryptoKey> {
   try {
      return await crypto.subtle.importKey(
         'jwk',
         jwk,
         { name: 'ECDH', namedCurve: 'P-256' },
         true,
         // Una pública ECDH no lleva usos propios: sirve como parámetro de la
         // derivación, no para derivar por sí sola.
         [],
      );
   } catch {
      throw new ErrorLlave('La llave pública del profesor no es válida.');
   }
}

export async function importarPrivadaProfesor(jwk: JsonWebKey): Promise<CryptoKey> {
   try {
      return await crypto.subtle.importKey(
         'jwk',
         jwk,
         { name: 'ECDH', namedCurve: 'P-256' },
         false,
         ['deriveBits', 'deriveKey'],
      );
   } catch {
      throw new ErrorLlave('La llave privada del profesor no es válida.');
   }
}

/**
 * Huella corta de una llave de profesor.
 *
 * Sirve para que el profesor confirme de un vistazo que los alumnos tienen la
 * llave del curso correcto, sin comparar cadenas de cientos de caracteres.
 */
export async function huellaDeLlave(jwk: JsonWebKey): Promise<string> {
   const hash = await crypto.subtle.digest(
      'SHA-256',
      textoABytes(`${jwk.x ?? ''}.${jwk.y ?? ''}`),
   );
   const texto = bytesABase64(hash).replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase();
   // En grupos de cuatro se lee y se dicta mucho mejor en voz alta.
   return texto.match(/.{1,4}/g)?.join('-') ?? texto;
}

// ---------------------------------------------------------------------------
// Configuración del curso guardada en el dispositivo
// ---------------------------------------------------------------------------

/**
 * Lo que la app recuerda sobre el profesor del curso.
 *
 * Se guardan `CryptoKey`, no JWK: la privada se importa como **no exportable**,
 * de modo que ni desde las herramientas del navegador se puede volver a sacar
 * de la app. El profesor conserva su respaldo en el archivo que descargó, que
 * es donde debe estar.
 */
export interface ConfigProfesor {
   etiqueta: string;
   huella: string;
   /** Pública del curso: la usan los alumnos al cifrar. */
   publica: CryptoKey | null;
   /** Privada: solo presente cuando la app está en modo profesor. */
   privada: CryptoKey | null;
}

export interface AlmacenProfesor {
   leer(): Promise<ConfigProfesor | null>;
   guardar(config: ConfigProfesor): Promise<void>;
   borrar(): Promise<void>;
}

const CLAVE_PROFESOR = 'profesor';

export function almacenProfesorIndexedDB(): AlmacenProfesor {
   return {
      async leer() {
         const bd = await abrirBD();
         try {
            const valor = await operar<ConfigProfesor | undefined>(bd, 'readonly', (a) =>
               a.get(CLAVE_PROFESOR),
            );
            return valor ?? null;
         } finally {
            bd.close();
         }
      },
      async guardar(config) {
         const bd = await abrirBD();
         try {
            await operar(bd, 'readwrite', (a) => a.put(config, CLAVE_PROFESOR));
         } finally {
            bd.close();
         }
      },
      async borrar() {
         const bd = await abrirBD();
         try {
            await operar(bd, 'readwrite', (a) => a.delete(CLAVE_PROFESOR));
         } finally {
            bd.close();
         }
      },
   };
}

export function almacenProfesorEnMemoria(
   inicial: ConfigProfesor | null = null,
): AlmacenProfesor {
   let actual = inicial;
   return {
      async leer() {
         return actual;
      },
      async guardar(config) {
         actual = config;
      },
      async borrar() {
         actual = null;
      },
   };
}

/** Reexportado para quien solo necesite decodificar. */
export { base64ABytes };
