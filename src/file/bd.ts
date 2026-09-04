/**
 * La base de datos local. **Un solo dueño del esquema.**
 *
 * Existe porque tener la versión repartida entre módulos ya causó un fallo
 * serio: `almacenes.ts` abría `rflowp` con versión 1 y `llaves.ts` con la 2, y
 * en cuanto la segunda actualizaba la base, toda apertura con la versión 1
 * fallaba con `VersionError`. Consecuencias reales, en producción:
 *
 *   · la identidad del alumno no llegaba a guardarse, así que la app le pedía
 *     registrarse cada vez que la abría;
 *   · saltaba el aviso de «este navegador no deja guardar», que era falso.
 *
 * Regla, y hay una prueba que la vigila: **nadie más llama a `indexedDB.open`.**
 * Añadir un almacén nuevo es añadirlo aquí y subir `VERSION`.
 */

const NOMBRE = 'rflowp';

/**
 * Versión del esquema. Subirla ejecuta `onupgradeneeded` en las instalaciones
 * existentes; los almacenes se crean solo si faltan, así que nadie pierde datos.
 */
const VERSION = 2;

export const ALMACEN_IDENTIDAD = 'identidad';
export const ALMACEN_LLAVES = 'llaves';

const ALMACENES = [ALMACEN_IDENTIDAD, ALMACEN_LLAVES] as const;

export type NombreAlmacen = (typeof ALMACENES)[number];

export function abrirBD(): Promise<IDBDatabase> {
   return new Promise((resolve, reject) => {
      const solicitud = indexedDB.open(NOMBRE, VERSION);

      solicitud.onupgradeneeded = () => {
         const bd = solicitud.result;
         for (const almacen of ALMACENES) {
            if (!bd.objectStoreNames.contains(almacen)) {
               bd.createObjectStore(almacen);
            }
         }
      };

      solicitud.onsuccess = () => resolve(solicitud.result);
      solicitud.onerror = () => reject(solicitud.error);
      solicitud.onblocked = () =>
         reject(new Error('Hay otra pestaña de RFlowP abierta; ciérrala e intenta de nuevo.'));
   });
}

/**
 * Ejecuta una operación sobre un almacén y cierra la conexión al terminar.
 *
 * Abrir y cerrar en cada operación no es lo más rápido, pero evita que una
 * conexión abierta bloquee una futura actualización de esquema, que es
 * exactamente el tipo de fallo que este módulo existe para prevenir.
 */
export async function operar<T>(
   almacen: NombreAlmacen,
   modo: IDBTransactionMode,
   accion: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
   const bd = await abrirBD();
   try {
      return await new Promise<T>((resolve, reject) => {
         const tx = bd.transaction(almacen, modo);
         const solicitud = accion(tx.objectStore(almacen));
         solicitud.onsuccess = () => resolve(solicitud.result);
         solicitud.onerror = () => reject(solicitud.error);
         tx.onabort = () => reject(tx.error);
      });
   } finally {
      bd.close();
   }
}
