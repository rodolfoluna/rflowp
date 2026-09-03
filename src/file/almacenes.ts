/**
 * Almacenamiento persistente: identidad y archivos.
 *
 * Se define primero la interfaz y después dos implementaciones: la del
 * navegador y una en memoria. No es ceremonia — IndexedDB y OPFS no existen en
 * Node, así que sin esta separación toda la lógica de guardado quedaría sin
 * pruebas, que es justo la parte donde un error le cuesta al alumno su trabajo.
 *
 * Reparto:
 *   IndexedDB  identidad y, en la fase 5, las llaves no exportables.
 *   OPFS       los algoritmos. Es un sistema de archivos real, privado del
 *              origen, y aguanta archivos grandes mejor que IndexedDB.
 */

import type { Identidad } from '../identity/identidad';

// ---------------------------------------------------------------------------
// Identidad
// ---------------------------------------------------------------------------

export interface AlmacenIdentidad {
   leer(): Promise<Identidad | null>;
   guardar(identidad: Identidad): Promise<void>;
   /** Borra la identidad. La usa «borrar mis datos». */
   borrar(): Promise<void>;
}

const BD_NOMBRE = 'rflowp';
const BD_VERSION = 1;
const ALMACEN_IDENTIDAD = 'identidad';
const CLAVE_IDENTIDAD = 'actual';

function abrirBD(): Promise<IDBDatabase> {
   return new Promise((resolve, reject) => {
      const solicitud = indexedDB.open(BD_NOMBRE, BD_VERSION);

      solicitud.onupgradeneeded = () => {
         const bd = solicitud.result;
         if (!bd.objectStoreNames.contains(ALMACEN_IDENTIDAD)) {
            bd.createObjectStore(ALMACEN_IDENTIDAD);
         }
      };

      solicitud.onsuccess = () => resolve(solicitud.result);
      solicitud.onerror = () => reject(solicitud.error);
      solicitud.onblocked = () =>
         reject(new Error('Hay otra pestaña de RFlowP abierta; ciérrala e intenta de nuevo.'));
   });
}

function transaccion<T>(
   bd: IDBDatabase,
   modo: IDBTransactionMode,
   accion: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
   return new Promise((resolve, reject) => {
      const tx = bd.transaction(ALMACEN_IDENTIDAD, modo);
      const solicitud = accion(tx.objectStore(ALMACEN_IDENTIDAD));
      solicitud.onsuccess = () => resolve(solicitud.result);
      solicitud.onerror = () => reject(solicitud.error);
      tx.onabort = () => reject(tx.error);
   });
}

export function almacenIdentidadIndexedDB(): AlmacenIdentidad {
   return {
      async leer() {
         const bd = await abrirBD();
         try {
            const valor = await transaccion<Identidad | undefined>(bd, 'readonly', (a) =>
               a.get(CLAVE_IDENTIDAD),
            );
            return valor ?? null;
         } finally {
            bd.close();
         }
      },

      async guardar(identidad) {
         const bd = await abrirBD();
         try {
            await transaccion(bd, 'readwrite', (a) => a.put(identidad, CLAVE_IDENTIDAD));
         } finally {
            bd.close();
         }
      },

      async borrar() {
         const bd = await abrirBD();
         try {
            await transaccion(bd, 'readwrite', (a) => a.delete(CLAVE_IDENTIDAD));
         } finally {
            bd.close();
         }
      },
   };
}

/** Implementación en memoria, para pruebas. */
export function almacenIdentidadEnMemoria(inicial: Identidad | null = null): AlmacenIdentidad {
   let actual = inicial;
   return {
      async leer() {
         return actual;
      },
      async guardar(identidad) {
         actual = identidad;
      },
      async borrar() {
         actual = null;
      },
   };
}

// ---------------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------------

export interface EntradaArchivo {
   /** Nombre del archivo dentro del almacén interno. */
   id: string;
   /** Bytes que ocupa. */
   tamano: number;
}

export interface AlmacenArchivos {
   listar(): Promise<EntradaArchivo[]>;
   leer(id: string): Promise<string | null>;
   guardar(id: string, contenido: string): Promise<void>;
   borrar(id: string): Promise<void>;
   /** Vacía el almacén. La usa «borrar mis datos». */
   borrarTodo(): Promise<void>;
}

const CARPETA = 'algoritmos';

async function carpeta(): Promise<FileSystemDirectoryHandle> {
   const raiz = await navigator.storage.getDirectory();
   return raiz.getDirectoryHandle(CARPETA, { create: true });
}

export function almacenArchivosOPFS(): AlmacenArchivos {
   return {
      async listar() {
         const dir = await carpeta();
         const salida: EntradaArchivo[] = [];

         // `entries()` es un iterador asíncrono; TypeScript todavía no lo tiene
         // en los tipos de FileSystemDirectoryHandle en todas las versiones.
         const iterable = dir as unknown as {
            entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
         };

         for await (const [nombre, handle] of iterable.entries()) {
            if (handle.kind !== 'file') continue;
            const archivo = await (handle as FileSystemFileHandle).getFile();
            salida.push({ id: nombre, tamano: archivo.size });
         }

         return salida.sort((a, b) => a.id.localeCompare(b.id));
      },

      async leer(id) {
         const dir = await carpeta();
         try {
            const handle = await dir.getFileHandle(id);
            const archivo = await handle.getFile();
            return archivo.text();
         } catch {
            // No existe: no es un error, simplemente no hay nada.
            return null;
         }
      },

      async guardar(id, contenido) {
         const dir = await carpeta();
         const handle = await dir.getFileHandle(id, { create: true });
         const escritor = await handle.createWritable();
         try {
            await escritor.write(contenido);
         } finally {
            await escritor.close();
         }
      },

      async borrar(id) {
         const dir = await carpeta();
         try {
            await dir.removeEntry(id);
         } catch {
            // Ya no estaba: el resultado deseado se cumple igual.
         }
      },

      async borrarTodo() {
         const raiz = await navigator.storage.getDirectory();
         try {
            await raiz.removeEntry(CARPETA, { recursive: true });
         } catch {
            // La carpeta no existía.
         }
      },
   };
}

/** Implementación en memoria, para pruebas. */
export function almacenArchivosEnMemoria(): AlmacenArchivos {
   const datos = new Map<string, string>();

   return {
      async listar() {
         return [...datos.entries()]
            .map(([id, contenido]) => ({ id, tamano: contenido.length }))
            .sort((a, b) => a.id.localeCompare(b.id));
      },
      async leer(id) {
         return datos.get(id) ?? null;
      },
      async guardar(id, contenido) {
         datos.set(id, contenido);
      },
      async borrar(id) {
         datos.delete(id);
      },
      async borrarTodo() {
         datos.clear();
      },
   };
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

/**
 * Pide al navegador que no desaloje los datos.
 *
 * Importa más de lo que parece: en iOS los datos de un sitio se borran a los
 * siete días sin uso. Los web apps instalados en la pantalla de inicio están
 * exentos de ese plazo, pero pedir persistencia explícitamente es gratis y
 * cubre al que use la app desde el navegador sin instalarla.
 *
 * Devuelve `false` si el navegador la niega o no la soporta; nunca lanza,
 * porque no poder pedirla no debe impedir usar la app.
 */
export async function pedirPersistencia(): Promise<boolean> {
   try {
      if (!navigator.storage?.persist) return false;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
   } catch {
      return false;
   }
}

/** ¿Existe soporte para guardar archivos internamente? */
export function hayOPFS(): boolean {
   return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
}
