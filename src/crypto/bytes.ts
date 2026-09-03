/**
 * Conversiones de bytes y compresión.
 *
 * Todo lo criptográfico viaja como base64 dentro de un JSON, así que estas
 * conversiones están en el camino de cada archivo que se guarda o se abre.
 */

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

/**
 * Bytes respaldados por un `ArrayBuffer` normal.
 *
 * TypeScript distingue desde hace poco entre `Uint8Array<ArrayBuffer>` y
 * `Uint8Array<ArrayBufferLike>`, y WebCrypto solo acepta el primero: un
 * `SharedArrayBuffer` no vale como `BufferSource`. Nombrar el tipo evita
 * sembrar castos por todo el módulo criptográfico.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export function textoABytes(texto: string): Bytes {
   // `TextEncoder` siempre reserva un `ArrayBuffer` nuevo, nunca compartido,
   // así que el tipo es exacto aunque la firma de la API no lo diga.
   return codificador.encode(texto) as Bytes;
}

export function bytesATexto(bytes: ArrayBuffer | Uint8Array): string {
   return decodificador.decode(bytes);
}

export function bytesABase64(bytes: ArrayBuffer | Uint8Array): string {
   const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

   // En trozos: pasar cientos de miles de argumentos a `apply` revienta la
   // pila en archivos grandes.
   const TROZO = 0x8000;
   let binario = '';
   for (let i = 0; i < vista.length; i += TROZO) {
      binario += String.fromCharCode(...vista.subarray(i, i + TROZO));
   }
   return btoa(binario);
}

export function base64ABytes(texto: string): Bytes {
   const binario = atob(texto);
   const salida = new Uint8Array(binario.length);
   for (let i = 0; i < binario.length; i++) {
      salida[i] = binario.charCodeAt(i);
   }
   return salida;
}

/** Concatena varios bloques de bytes en uno solo. */
export function concatenar(...bloques: Uint8Array[]): Bytes {
   const total = bloques.reduce((suma, b) => suma + b.length, 0);
   const salida = new Uint8Array(total);
   let offset = 0;
   for (const bloque of bloques) {
      salida.set(bloque, offset);
      offset += bloque.length;
   }
   return salida;
}

// ---------------------------------------------------------------------------
// Compresión
// ---------------------------------------------------------------------------

export type Compresion = 'deflate-raw' | 'ninguna';

/** ¿El entorno sabe comprimir? Navegadores viejos y algunos WebView no. */
export function hayCompresion(): boolean {
   return typeof CompressionStream !== 'undefined';
}

async function pasarPorStream(
   datos: Uint8Array,
   stream: CompressionStream | DecompressionStream,
): Promise<Bytes> {
   const entrada = new Blob([datos as BlobPart]).stream();
   const salida = entrada.pipeThrough(stream as unknown as ReadableWritablePair);
   const buffer = await new Response(salida as unknown as BodyInit).arrayBuffer();
   return new Uint8Array(buffer);
}

/**
 * Comprime si se puede. Devuelve además qué método se usó, porque el archivo
 * tiene que registrarlo: si se comprimió en un navegador y se abre en otro que
 * no sabe descomprimir, hay que poder decirlo en vez de devolver basura.
 */
export async function comprimir(
   datos: Bytes,
): Promise<{ bytes: Bytes; metodo: Compresion }> {
   if (!hayCompresion()) return { bytes: datos, metodo: 'ninguna' };
   try {
      const bytes = await pasarPorStream(datos, new CompressionStream('deflate-raw'));
      return { bytes, metodo: 'deflate-raw' };
   } catch {
      // Si falla por lo que sea, seguir sin comprimir es preferible a no poder
      // guardar el trabajo del alumno.
      return { bytes: datos, metodo: 'ninguna' };
   }
}

export async function descomprimir(
   datos: Bytes,
   metodo: Compresion,
): Promise<Bytes> {
   if (metodo === 'ninguna') return datos;

   if (!hayCompresion()) {
      throw new Error(
         'Este archivo está comprimido y el navegador no sabe descomprimirlo. Ábrelo en un navegador más reciente.',
      );
   }

   return pasarPorStream(datos, new DecompressionStream('deflate-raw'));
}
