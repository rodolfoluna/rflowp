/**
 * Llaves: las del alumno y las del profesor.
 *
 * La diferencia importante entre unas y otras es deliberada:
 *
 *   Alumno    `extractable: false`. Ni desde las herramientas del navegador se
 *             puede sacar el material de la llave. La de CIFRADO se calcula con
 *             número de control y PIN (`identidad-llave.ts`), así que se
 *             obtiene igual en cualquier aparato sin tener que viajar. La de
 *             FIRMA es de cada aparato y no sale de él: es la que delata dos
 *             entregas hechas en el mismo teléfono.
 *
 *   Profesor  exportable, porque tiene que poder guardarla a buen resguardo y
 *             llevarla a otra computadora. Si la pierde, se quedan sin abrir
 *             todas las entregas del curso.
 */

import { base64ABytes, bytesABase64, textoABytes } from './bytes';
import { LLAVE_INCLUIDA } from './llave-del-curso';
import { DERIVACION, type LlaveDerivada, type TipoLlave } from './identidad-llave';
import { ALMACEN_LLAVES, operar } from '../file/bd';

const CLAVE_LLAVES = 'actual';
const CLAVE_APARATO = 'aparato';

// ---------------------------------------------------------------------------
// Llaves del alumno
// ---------------------------------------------------------------------------

/** Lo que pertenece al APARATO y no al alumno: sobrevive a «borrar mis datos». */
export interface LlavesAparato {
   /** ECDSA P-256 para firmar. No sale del aparato. */
   firma: CryptoKeyPair;
   /** La pública de firma, ya exportada: va en cada archivo. */
   firmaPublicaJwk: JsonWebKey;
   /**
    * `deviceId` de la última identidad de este aparato.
    *
    * Se conserva para que borrar los datos y entrar como otro alumno no cambie
    * el rastro que deja el aparato en los archivos.
    */
   deviceId?: string;
}

export interface LlavesAlumno extends LlavesAparato {
   /**
    * AES-KW 256 con la que se cifra lo que se guarda ahora.
    *
    * Con PIN, la calculada con número de control y PIN. En una instalación de
    * antes del PIN, la aleatoria del aparato, hasta que el alumno cree su PIN.
    */
   maestra: CryptoKey;
   /**
    * Código de identidad, para comparar entre aparatos.
    *
    * `null` significa que `maestra` es todavía la del aparato: falta el PIN.
    */
   codigo: string | null;
   /**
    * La llave aleatoria de antes del PIN, conservada **solo para abrir** lo que
    * se cifró con ella. Nunca cifra nada nuevo.
    */
   legado: CryptoKey | null;
}

/** Con qué clase de llave cifra hoy esta instalación. */
export function tipoDeLlave(llaves: LlavesAlumno): TipoLlave {
   return llaves.codigo ? DERIVACION : 'aparato';
}

export async function generarFirmaAparato(): Promise<LlavesAparato> {
   const firma = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      // La privada no sale nunca; la pública sí, y va dentro de cada archivo.
      false,
      ['sign', 'verify'],
   );
   const firmaPublicaJwk = await crypto.subtle.exportKey('jwk', firma.publicKey);
   return { firma, firmaPublicaJwk };
}

/**
 * Llaves de un aparato SIN PIN: maestra aleatoria.
 *
 * Es como funcionaba la app antes del PIN. Se conserva porque describe las
 * instalaciones que ya existen, y porque las pruebas que no tratan del PIN no
 * tienen por qué pagar el costo de Argon2.
 */
export async function generarLlavesAlumno(): Promise<LlavesAlumno> {
   const maestra = await crypto.subtle.generateKey(
      { name: 'AES-KW', length: 256 },
      // No exportable: la llave aleatoria nunca sale del aparato.
      false,
      ['wrapKey', 'unwrapKey'],
   );
   return { ...(await generarFirmaAparato()), maestra, codigo: null, legado: null };
}

/**
 * Llaves con PIN.
 *
 * `anteriores` son las que ya tenía el aparato, si había: se conserva su firma
 * —la huella del aparato no debe cambiar— y, si su maestra era la aleatoria,
 * pasa a `legado` para seguir abriendo lo viejo.
 */
export async function llavesConPin(
   derivada: LlaveDerivada,
   anteriores: LlavesAlumno | LlavesAparato | null,
): Promise<LlavesAlumno> {
   const aparato = anteriores ?? (await generarFirmaAparato());

   let legado: CryptoKey | null = null;
   if (anteriores && 'maestra' in anteriores) {
      legado = anteriores.codigo === null ? anteriores.maestra : anteriores.legado;
   }

   return {
      firma: aparato.firma,
      firmaPublicaJwk: aparato.firmaPublicaJwk,
      ...(aparato.deviceId ? { deviceId: aparato.deviceId } : {}),
      maestra: derivada.maestra,
      codigo: derivada.codigo,
      legado,
   };
}

/**
 * Guarda y recupera las llaves del alumno.
 *
 * Se define como interfaz, igual que el resto del almacenamiento, para poder
 * probar el ciclo completo de cifrado sin IndexedDB.
 */
export interface AlmacenLlaves {
   leer(): Promise<LlavesAlumno | null>;
   /** Guarda las del alumno y, de paso, las del aparato. */
   guardar(llaves: LlavesAlumno): Promise<void>;
   /**
    * Borra lo del ALUMNO: maestra, legado y código. Lo del aparato se queda.
    * La usa «borrar mis datos».
    */
   borrar(): Promise<void>;
   leerAparato(): Promise<LlavesAparato | null>;
   guardarAparato(aparato: LlavesAparato): Promise<void>;
}

/** Lo que se guarda en IndexedDB: los `CryptoKey` se clonan tal cual. */
interface RegistroLlaves {
   maestra: CryptoKey;
   /** Falta en instalaciones de antes del PIN. */
   codigo?: string | null;
   legado?: CryptoKey | null;
   firmaPrivada: CryptoKey;
   firmaPublica: CryptoKey;
   firmaPublicaJwk: JsonWebKey;
}

interface RegistroAparato {
   firmaPrivada: CryptoKey;
   firmaPublica: CryptoKey;
   firmaPublicaJwk: JsonWebKey;
   deviceId?: string;
}

function registroAparato(a: LlavesAparato): RegistroAparato {
   return {
      firmaPrivada: a.firma.privateKey,
      firmaPublica: a.firma.publicKey,
      firmaPublicaJwk: a.firmaPublicaJwk,
      ...(a.deviceId ? { deviceId: a.deviceId } : {}),
   };
}

function aparatoDe(r: RegistroAparato): LlavesAparato {
   return {
      firma: { privateKey: r.firmaPrivada, publicKey: r.firmaPublica },
      firmaPublicaJwk: r.firmaPublicaJwk,
      ...(r.deviceId ? { deviceId: r.deviceId } : {}),
   };
}

export function almacenLlavesIndexedDB(): AlmacenLlaves {
   const leerRegistro = <T>(clave: string) =>
      operar<T | undefined>(ALMACEN_LLAVES, 'readonly', (a) => a.get(clave));

   const api: AlmacenLlaves = {
      async leer() {
         const registro = await leerRegistro<RegistroLlaves>(CLAVE_LLAVES);
         if (!registro) return null;
         const aparato = await leerRegistro<RegistroAparato>(CLAVE_APARATO);
         return {
            ...aparatoDe(aparato ?? registro),
            maestra: registro.maestra,
            codigo: registro.codigo ?? null,
            legado: registro.legado ?? null,
         };
      },

      async guardar(llaves) {
         const registro: RegistroLlaves = {
            maestra: llaves.maestra,
            codigo: llaves.codigo,
            legado: llaves.legado,
            firmaPrivada: llaves.firma.privateKey,
            firmaPublica: llaves.firma.publicKey,
            firmaPublicaJwk: llaves.firmaPublicaJwk,
         };
         await operar(ALMACEN_LLAVES, 'readwrite', (a) => a.put(registro, CLAVE_LLAVES));
         await api.guardarAparato(llaves);
      },

      async borrar() {
         // Antes de borrar se pone a salvo lo del aparato: en las instalaciones
         // anteriores solo existía el registro del alumno.
         if (!(await leerRegistro<RegistroAparato>(CLAVE_APARATO))) {
            const registro = await leerRegistro<RegistroLlaves>(CLAVE_LLAVES);
            if (registro) await api.guardarAparato(aparatoDe(registro));
         }
         await operar(ALMACEN_LLAVES, 'readwrite', (a) => a.delete(CLAVE_LLAVES));
      },

      async leerAparato() {
         const aparato = await leerRegistro<RegistroAparato>(CLAVE_APARATO);
         if (aparato) return aparatoDe(aparato);
         const registro = await leerRegistro<RegistroLlaves>(CLAVE_LLAVES);
         return registro ? aparatoDe(registro) : null;
      },

      async guardarAparato(aparato) {
         const previo = await leerRegistro<RegistroAparato>(CLAVE_APARATO);
         const registro = registroAparato({
            firma: aparato.firma,
            firmaPublicaJwk: aparato.firmaPublicaJwk,
            // Guardar sin deviceId no debe borrar uno ya conocido.
            deviceId: aparato.deviceId ?? previo?.deviceId,
         });
         await operar(ALMACEN_LLAVES, 'readwrite', (a) => a.put(registro, CLAVE_APARATO));
      },
   };
   return api;
}

export function almacenLlavesEnMemoria(inicial: LlavesAlumno | null = null): AlmacenLlaves {
   let actual = inicial;
   let aparato: LlavesAparato | null = inicial;
   const unir = (a: LlavesAparato): LlavesAparato => ({
      firma: a.firma,
      firmaPublicaJwk: a.firmaPublicaJwk,
      ...((a.deviceId ?? aparato?.deviceId) ? { deviceId: a.deviceId ?? aparato?.deviceId } : {}),
   });
   return {
      async leer() {
         return actual;
      },
      async guardar(llaves) {
         actual = llaves;
         aparato = unir(llaves);
      },
      async borrar() {
         actual = null;
      },
      async leerAparato() {
         return aparato;
      },
      async guardarAparato(a) {
         aparato = unir(a);
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
   /**
    * De dónde salió esta llave.
    *
    * `incluida` es la que viene compilada con la app, para que funcione desde
    * el primer arranque; `importada` es la que el profesor puso a mano y que
    * manda sobre la anterior.
    */
   origen: 'incluida' | 'importada';
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
         const valor = await operar<ConfigProfesor | undefined>(ALMACEN_LLAVES, 'readonly', (a) =>
            a.get(CLAVE_PROFESOR),
         );
         if (!valor) return null;
         // Lo guardado antes de que existiera `origen` fue puesto a mano.
         return { ...valor, origen: valor.origen ?? 'importada' };
      },
      async guardar(config) {
         await operar(ALMACEN_LLAVES, 'readwrite', (a) => a.put(config, CLAVE_PROFESOR));
      },
      async borrar() {
         await operar(ALMACEN_LLAVES, 'readwrite', (a) => a.delete(CLAVE_PROFESOR));
      },
   };
}

/**
 * Configuración a partir de la llave que viene con la app.
 *
 * Se usa cuando no hay ninguna guardada, para que un alumno que empieza a
 * trabajar antes de recibir la llave de su profesor no genere archivos que
 * nadie más podrá abrir.
 */
export async function configIncluida(): Promise<ConfigProfesor | null> {
   try {
      return {
         etiqueta: LLAVE_INCLUIDA.etiqueta,
         huella: await huellaDeLlave(LLAVE_INCLUIDA.jwk),
         publica: await importarPublicaProfesor(LLAVE_INCLUIDA.jwk),
         privada: null,
         origen: 'incluida',
      };
   } catch {
      // Una llave incluida inválida no debe impedir usar la app.
      return null;
   }
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
