/**
 * La llave del alumno, calculada a partir de su número de control y su PIN.
 *
 * Es lo que permite abrir los archivos en cualquiera de sus aparatos: el mismo
 * número y el mismo PIN dan siempre la misma llave, sin servidor y sin que la
 * llave tenga que viajar.
 *
 * El número de control **no es el secreto**: los compañeros se lo saben. Entra
 * en la sal para que dos alumnos con el mismo PIN tengan llaves distintas y
 * para que nadie pueda precalcular una tabla que sirva para todo el grupo. El
 * secreto es el PIN.
 *
 * Por qué Argon2id y no PBKDF2 (que sí trae el navegador): un PIN de 6 dígitos
 * son un millón de posibilidades, y quien tenga el `.algx` de un compañero
 * puede probarlas todas en su computadora, sin límite de intentos. PBKDF2 en
 * una tarjeta gráfica las recorre en minutos. Argon2id exige memoria por cada
 * intento, que es justo lo que las tarjetas gráficas no tienen de sobra, y lo
 * lleva a días. **Sigue siendo disuasión, no protección**: un PIN corto no
 * resiste a alguien decidido y con tiempo.
 *
 * Solo se deriva la llave de **cifrado**. La de firma sigue siendo de cada
 * aparato a propósito: si Luis usa el PIN de Ana en su teléfono, sus archivos
 * salen con la firma del teléfono de Luis y el panel del profesor lo ve.
 */

import { argon2id } from 'hash-wasm';
import { bytesABase64, textoABytes, type Bytes } from './bytes';
import { normalizarControl } from '../identity/identidad';

/** Cómo se envolvió la llave de contenido de un archivo. Viaja en el sobre. */
export type TipoLlave = 'aparato' | 'argon2id-v1';

/** La derivación actual. Si cambian los parámetros, cambia el nombre. */
export const DERIVACION: TipoLlave = 'argon2id-v1';

/** Separa esta sal de cualquier otro uso futuro de SHA-256. */
const CONTEXTO_SAL = 'RFlowP/alumno/v1|';

export interface ParametrosArgon2 {
   /** Memoria por intento, en KiB. */
   memoria: number;
   iteraciones: number;
   paralelismo: number;
}

/**
 * 64 MiB y 3 pasadas: entre 1 y 2 segundos en un teléfono modesto, que es lo
 * que se puede pedir una vez por aparato. Cambiarlos deja sin abrir todos los
 * archivos hechos con los anteriores: si hace falta, se crea `argon2id-v2`.
 */
export const PARAMETROS: ParametrosArgon2 = {
   memoria: 64 * 1024,
   iteraciones: 3,
   paralelismo: 1,
};

/** Solo seis dígitos. */
const PIN_VALIDO = /^\d{6}$/;

export function validarPin(pin: string): string | null {
   if (pin.length === 0) return 'Escribe un PIN de 6 dígitos.';
   if (!PIN_VALIDO.test(pin)) return 'El PIN tiene que ser de 6 dígitos, sin letras ni espacios.';
   // Los que cualquiera prueba primero. No se prohíbe una lista larga: con un
   // millón de posibilidades, quitar unas pocas no cambia la fuerza, y cansar
   // al alumno sí le hace elegir su fecha de nacimiento.
   if (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321') {
      return 'Ese PIN es de los primeros que alguien probaría. Elige otro.';
   }
   return null;
}

export interface LlaveDerivada {
   /** AES-KW 256, no exportable. Envuelve las llaves de contenido. */
   maestra: CryptoKey;
   /**
    * Código corto para comparar entre aparatos, como «K7QM-2XPA».
    *
    * Existe porque en un aparato nuevo no hay contra qué comprobar el PIN: uno
    * mal tecleado daría otra llave en silencio, y el alumno crearía archivos
    * que no se abren en sus otros aparatos. Si el código coincide, el PIN está
    * bien.
    */
   codigo: string;
}

/** Sal de un número de control. Pública y determinista a propósito. */
export async function salDe(numeroControl: string): Promise<Bytes> {
   const hash = await crypto.subtle.digest(
      'SHA-256',
      textoABytes(CONTEXTO_SAL + normalizarControl(numeroControl)),
   );
   return new Uint8Array(hash);
}

export async function derivarLlave(
   numeroControl: string,
   pin: string,
   parametros: ParametrosArgon2 = PARAMETROS,
): Promise<LlaveDerivada> {
   const problema = validarPin(pin);
   if (problema) throw new Error(problema);

   const bytes = await argon2id({
      password: pin,
      salt: await salDe(numeroControl),
      parallelism: parametros.paralelismo,
      iterations: parametros.iteraciones,
      memorySize: parametros.memoria,
      hashLength: 32,
      outputType: 'binary',
   });

   // Los bytes crudos no se conservan: se convierten enseguida en una llave
   // base no exportable, y de ella salen las demás.
   const base = await crypto.subtle.importKey('raw', bytes as Bytes, 'HKDF', false, [
      'deriveKey',
      'deriveBits',
   ]);
   bytes.fill(0);

   const hkdf = (info: string): HkdfParams => ({
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0) as Bytes,
      info: textoABytes(`RFlowP/alumno/${info}`),
   });

   const maestra = await crypto.subtle.deriveKey(
      hkdf('maestra'),
      base,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey'],
   );

   const bitsCodigo = await crypto.subtle.deriveBits(hkdf('codigo'), base, 96);

   return { maestra, codigo: formatearCodigo(bitsCodigo) };
}

/** Ocho caracteres en dos grupos de cuatro: se dicta y se compara bien. */
function formatearCodigo(bits: ArrayBuffer): string {
   const texto = bytesABase64(bits)
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      // Fuera los que se confunden al leerlos en una pantalla pequeña.
      .replace(/[0O1IL]/g, '')
      .slice(0, 8)
      .padEnd(8, 'X');
   return `${texto.slice(0, 4)}-${texto.slice(4)}`;
}

/**
 * Deriva en un hilo aparte para no congelar la pantalla.
 *
 * Si el navegador no puede crear el hilo (algunos visores integrados), se hace
 * en el principal: tarda lo mismo y la pantalla se detiene un momento, que es
 * mejor que no poder entrar.
 */
export async function derivarLlaveEnSegundoPlano(
   numeroControl: string,
   pin: string,
): Promise<LlaveDerivada> {
   const problema = validarPin(pin);
   if (problema) throw new Error(problema);

   let hilo: Worker;
   try {
      hilo = new Worker(new URL('./derivar.worker.ts', import.meta.url), { type: 'module' });
   } catch {
      return derivarLlave(numeroControl, pin);
   }

   try {
      return await new Promise<LlaveDerivada>((resolve, reject) => {
         hilo.onmessage = (e: MessageEvent) => {
            if (e.data?.ok) resolve({ maestra: e.data.maestra, codigo: e.data.codigo });
            else reject(new Error(e.data?.error ?? 'No se pudo preparar tu llave.'));
         };
         hilo.onerror = () => reject(new Error('fallo-del-hilo'));
         hilo.postMessage({ numeroControl, pin });
      });
   } catch (e) {
      if (e instanceof Error && e.message === 'fallo-del-hilo') {
         return derivarLlave(numeroControl, pin);
      }
      throw e;
   } finally {
      hilo.terminate();
   }
}

/** Errores del par PIN + confirmación, para los formularios. */
export function erroresPinDoble(pin: string, confirmacion: string): {
   pin?: string;
   confirmacion?: string;
} {
   const problema = validarPin(pin);
   if (problema) return { pin: problema };
   if (confirmacion !== pin) return { confirmacion: 'Los dos PIN no coinciden.' };
   return {};
}
