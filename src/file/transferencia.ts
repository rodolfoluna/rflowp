/**
 * Entrada y salida de archivos hacia fuera de la app.
 *
 * Se usa la descarga clásica (`<a download>`) y `<input type="file">` en vez de
 * la File System Access API porque esta última no existe en Safari ni en el
 * navegador de iOS, que es justo donde van a estar la mitad de los alumnos.
 * La descarga y el selector de archivos funcionan en las tres plataformas.
 */

/** Provoca la descarga de un archivo de texto con el nombre indicado. */
export function descargar(nombre: string, contenido: string): void {
   const blob = new Blob([contenido], { type: 'application/octet-stream' });
   const url = URL.createObjectURL(blob);

   const enlace = document.createElement('a');
   enlace.href = url;
   enlace.download = nombre;
   document.body.appendChild(enlace);
   enlace.click();
   enlace.remove();

   // Liberar de inmediato aborta la descarga en algunos navegadores; se espera
   // un momento a que la haya tomado.
   setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Lee como texto un archivo elegido por el usuario. */
export async function leerArchivoDeDisco(archivo: File): Promise<string> {
   // Un `.algx` de un algoritmo escolar no llega ni a 100 KB. Un archivo mucho
   // mayor no es uno de los nuestros, y conviene rechazarlo antes de intentar
   // parsear megabytes de algo indebido.
   const TOPE = 5 * 1024 * 1024;
   if (archivo.size > TOPE) {
      throw new Error('Ese archivo es demasiado grande para ser un algoritmo.');
   }
   return archivo.text();
}
