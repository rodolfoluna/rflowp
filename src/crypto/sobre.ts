/**
 * El sobre criptográfico de un archivo `.algx`.
 *
 * Esquema, y por qué cada pieza:
 *
 *   1. Se genera una llave de contenido (CEK) aleatoria, distinta en cada
 *      guardado, y con ella se cifra el algoritmo (AES-GCM 256).
 *   2. Esa CEK se envuelve DOS veces:
 *        · con la llave maestra del alumno  → puede reabrir su propio trabajo;
 *        · con la llave pública del profesor → puede abrir el de cualquiera.
 *      Envolver dos veces, en vez de cifrar dos veces el contenido, mantiene el
 *      archivo pequeño y hace trivial añadir más destinatarios después.
 *   3. Se firma el conjunto con la llave de firma del alumno.
 *
 * De aquí sale la propiedad que pedía el proyecto: al borrar sus datos, el
 * alumno destruye su llave maestra y sus archivos dejan de abrirse **para él**,
 * mientras el profesor los sigue abriendo con la suya.
 *
 * ── Lo que esta firma SÍ y NO garantiza ────────────────────────────────────
 *
 * La pública de firma viaja dentro del propio archivo, así que quien entienda
 * el formato puede fabricar uno con la identidad que quiera: no hay ninguna
 * autoridad que ate un número de control a una llave. Lo que la firma da es:
 *
 *   · detectar que un archivo recibido fue alterado después de generarse;
 *   · **enlazar** entregas: la misma `firmaPub` en dos trabajos significa que
 *     salieron de la misma instalación. Ahí está el valor real contra la copia.
 *
 * Es disuasión y trazabilidad, no seguridad frente a un adversario capaz.
 */

import {
   base64ABytes,
   bytesABase64,
   comprimir,
   descomprimir,
   textoABytes,
   bytesATexto,
   concatenar,
   type Bytes,
   type Compresion,
} from './bytes';

/** Identificador del esquema, tal como aparece en el campo `alg`. */
export const ESQUEMA = 'A256GCM+ECIES-P256';

/** Contexto de la derivación HKDF. Separa este uso de cualquier otro futuro. */
const INFO_HKDF = 'RFlowP/sobre-profesor/v1';

export interface SobreProfesor {
   /** Pública efímera del emisor, en formato `raw`. */
   ephPub: string;
   /** CEK envuelta con la llave derivada. */
   envuelta: string;
}

/** Todo lo criptográfico que se guarda dentro del archivo. */
export interface Sobre {
   comp: Compresion;
   iv: string;
   ct: string;
   sobreAlumno: string;
   /** `null` cuando no hay llave de profesor configurada. */
   sobreProfesor: SobreProfesor | null;
   /** Pública ECDSA del alumno, para verificar la firma y enlazar entregas. */
   firmaPub: JsonWebKey;
   firma: string;
}

export class ErrorCripto extends Error {
   constructor(message: string) {
      super(message);
      this.name = 'ErrorCripto';
   }
}

// ---------------------------------------------------------------------------
// Derivación hacia el profesor
// ---------------------------------------------------------------------------

/** ECDH efímero + HKDF → una llave AES-KW de un solo uso. */
async function derivarKekProfesor(
   privada: CryptoKey,
   publica: CryptoKey,
): Promise<CryptoKey> {
   const bits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: publica },
      privada,
      256,
   );

   const material = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);

   return crypto.subtle.deriveKey(
      {
         name: 'HKDF',
         hash: 'SHA-256',
         // Sin sal: el secreto ECDH ya es aleatorio y de un solo uso, y una sal
         // habría que transportarla sin aportar nada aquí.
         salt: new Uint8Array(0) as Bytes,
         info: textoABytes(INFO_HKDF),
      } satisfies HkdfParams,
      material,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey'],
   );
}

// ---------------------------------------------------------------------------
// Datos que cubre la firma
// ---------------------------------------------------------------------------

/**
 * Bytes sobre los que se firma: el encabezado en claro más el texto cifrado.
 *
 * El encabezado se serializa con las claves en un orden fijo para que firmar y
 * verificar produzcan exactamente los mismos bytes; `JSON.stringify` de un
 * objeto construido en otro orden daría otra cadena y la firma no cuadraría.
 */
export function datosFirmados(
   encabezadoCanonico: string,
   ciphertext: Bytes,
): Bytes {
   return concatenar(textoABytes(encabezadoCanonico), ciphertext);
}

// ---------------------------------------------------------------------------
// Cifrar
// ---------------------------------------------------------------------------

export interface OpcionesCifrado {
   /** El contenido del archivo, ya en JSON. */
   contenido: string;
   /** Llave maestra del alumno (AES-KW, no exportable). */
   llaveAlumno: CryptoKey;
   /** Privada ECDSA del alumno (no exportable). */
   firmaPrivada: CryptoKey;
   /** Pública ECDSA del alumno, ya exportada como JWK. */
   firmaPublica: JsonWebKey;
   /** Pública ECDH del profesor. `null` si no hay ninguna configurada. */
   profesorPublica: CryptoKey | null;
   /**
    * Encabezado en claro, ya serializado de forma canónica. Entra en la firma.
    */
   encabezadoCanonico: string;
}

export async function cifrar(opciones: OpcionesCifrado): Promise<Sobre> {
   // La CEK se genera exportable a propósito: hay que poder envolverla. Nunca
   // se guarda ni sale del proceso en claro.
   const cek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
   ]);

   const { bytes: comprimido, metodo } = await comprimir(textoABytes(opciones.contenido));

   // 96 bits es el tamaño de IV recomendado para GCM, y es nuevo en cada
   // guardado porque la CEK también lo es.
   const iv = crypto.getRandomValues(new Uint8Array(12));
   const ct: Bytes = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cek, comprimido),
   );

   const sobreAlumno = await crypto.subtle.wrapKey('raw', cek, opciones.llaveAlumno, 'AES-KW');

   let sobreProfesor: SobreProfesor | null = null;
   if (opciones.profesorPublica) {
      const efimera = await crypto.subtle.generateKey(
         { name: 'ECDH', namedCurve: 'P-256' },
         true,
         ['deriveBits'],
      );
      const kek = await derivarKekProfesor(efimera.privateKey, opciones.profesorPublica);
      sobreProfesor = {
         ephPub: bytesABase64(await crypto.subtle.exportKey('raw', efimera.publicKey)),
         envuelta: bytesABase64(await crypto.subtle.wrapKey('raw', cek, kek, 'AES-KW')),
      };
   }

   const firma = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      opciones.firmaPrivada,
      datosFirmados(opciones.encabezadoCanonico, ct),
   );

   return {
      comp: metodo,
      iv: bytesABase64(iv),
      ct: bytesABase64(ct),
      sobreAlumno: bytesABase64(sobreAlumno),
      sobreProfesor,
      firmaPub: opciones.firmaPublica,
      firma: bytesABase64(firma),
   };
}

// ---------------------------------------------------------------------------
// Descifrar
// ---------------------------------------------------------------------------

/** Con qué llave se abrió el archivo. Lo usa la interfaz para explicarlo. */
export type ComoSeAbrio = 'alumno' | 'profesor';

export interface OpcionesDescifrado {
   sobre: Sobre;
   encabezadoCanonico: string;
   /** Llave maestra del alumno, si esta instalación tiene una. */
   llaveAlumno?: CryptoKey | null;
   /** Privada ECDH del profesor, si está en modo profesor. */
   profesorPrivada?: CryptoKey | null;
}

export interface ResultadoDescifrado {
   contenido: string;
   como: ComoSeAbrio;
   /** ¿La firma cuadra con el contenido y el encabezado? */
   firmaValida: boolean;
}

async function abrirCek(opciones: OpcionesDescifrado): Promise<{
   cek: CryptoKey;
   como: ComoSeAbrio;
}> {
   const { sobre } = opciones;

   // Se intenta primero con la llave del alumno: es el caso normal, y evita
   // trabajo de curva elíptica cuando no hace falta.
   if (opciones.llaveAlumno) {
      try {
         const cek = await crypto.subtle.unwrapKey(
            'raw',
            base64ABytes(sobre.sobreAlumno),
            opciones.llaveAlumno,
            'AES-KW',
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt'],
         );
         return { cek, como: 'alumno' };
      } catch {
         // No es de esta instalación. Se sigue con la llave del profesor.
      }
   }

   if (opciones.profesorPrivada && sobre.sobreProfesor) {
      try {
         const efimeraPublica = await crypto.subtle.importKey(
            'raw',
            base64ABytes(sobre.sobreProfesor.ephPub),
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            [],
         );
         const kek = await derivarKekProfesor(opciones.profesorPrivada, efimeraPublica);
         const cek = await crypto.subtle.unwrapKey(
            'raw',
            base64ABytes(sobre.sobreProfesor.envuelta),
            kek,
            'AES-KW',
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt'],
         );
         return { cek, como: 'profesor' };
      } catch {
         throw new ErrorCripto(
            'La llave de profesor no corresponde a este archivo. ¿Es de otra materia o de otro curso?',
         );
      }
   }

   throw new ErrorCripto(
      'Este algoritmo lo hizo otra persona o se creó antes de que borraras tus datos, así que esta app ya no puede abrirlo. Tu profesor sí puede.',
   );
}

export async function descifrar(
   opciones: OpcionesDescifrado,
): Promise<ResultadoDescifrado> {
   const { sobre } = opciones;
   const ct = base64ABytes(sobre.ct);

   const { cek, como } = await abrirCek(opciones);

   let claro: Uint8Array;
   try {
      const descifrado = await crypto.subtle.decrypt(
         { name: 'AES-GCM', iv: base64ABytes(sobre.iv) },
         cek,
         ct,
      );
      claro = await descomprimir(new Uint8Array(descifrado), sobre.comp);
   } catch (e) {
      if (e instanceof Error && e.message.includes('descomprimirlo')) throw e;
      // AES-GCM falla al autenticar si alguien tocó el texto cifrado.
      throw new ErrorCripto('El archivo está dañado o fue alterado.');
   }

   // La firma se comprueba después de descifrar para poder informar de las dos
   // cosas por separado: un archivo puede abrirse y aun así estar manipulado.
   let firmaValida = false;
   try {
      const publica = await crypto.subtle.importKey(
         'jwk',
         sobre.firmaPub,
         { name: 'ECDSA', namedCurve: 'P-256' },
         false,
         ['verify'],
      );
      firmaValida = await crypto.subtle.verify(
         { name: 'ECDSA', hash: 'SHA-256' },
         publica,
         base64ABytes(sobre.firma),
         datosFirmados(opciones.encabezadoCanonico, ct),
      );
   } catch {
      firmaValida = false;
   }

   return { contenido: bytesATexto(claro), como, firmaValida };
}

/**
 * Huella corta de la llave de firma, para comparar entregas de un vistazo.
 *
 * Dos trabajos con la misma huella salieron de la misma instalación. Es la
 * señal más útil del panel del profesor.
 */
export async function huellaDeFirma(publica: JsonWebKey): Promise<string> {
   // Se usan las coordenadas de la curva, que identifican la llave y no
   // dependen de cómo se serializó el JWK.
   const material = textoABytes(`${publica.x ?? ''}.${publica.y ?? ''}`);
   const hash = await crypto.subtle.digest('SHA-256', material);
   return bytesABase64(hash).replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase();
}
