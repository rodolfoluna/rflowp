/**
 * Biblioteca: los algoritmos guardados dentro de la app.
 *
 * Se apoya en la interfaz `AlmacenArchivos`, no en OPFS directamente, para
 * poder probar toda esta lógica sin navegador.
 *
 * El nombre del archivo interno es un identificador aleatorio, no el título.
 * Así renombrar un algoritmo no implica mover archivos ni arriesgarse a pisar
 * otro que se llame igual, y dos algoritmos pueden compartir título sin chocar.
 */

import type { Program } from '../core/ast';
import type { Identidad } from '../identity/identidad';
import {
   crearArchivo,
   deserializar,
   nombreSugerido,
   serializar,
   type Archivo,
   type Bitacora,
} from './algx';
import type { AlmacenArchivos } from './almacenes';

/**
 * Prefijo de los archivos internos de la app, que no son algoritmos del alumno
 * y no deben aparecer en su lista.
 */
const PREFIJO_INTERNO = '_';

/** Dónde vive el borrador automático. */
const BORRADOR = '_borrador.json';

/** Lo que se conserva del trabajo en curso entre sesiones. */
export interface Borrador {
   /** Pseudocódigo tal cual, incluidos los errores a medio escribir. */
   texto: string;
   titulo: string;
   /** Archivo de la biblioteca al que corresponde, si estaba abierto uno. */
   archivoId?: string;
}

export interface ResumenArchivo {
   id: string;
   titulo: string;
   creado: string;
   modificado: string;
   /** Quién lo hizo. Puede no ser el usuario actual, si se importó. */
   autor: string;
   numeroControl: string;
   /** ¿Lo escribió esta instalación? Lo demás se marca como importado. */
   propio: boolean;
   tamano: number;
}

export class Biblioteca {
   #archivos = $state.raw<ResumenArchivo[]>([]);
   #cargando = $state(false);
   #error = $state<string | null>(null);

   constructor(
      private readonly almacen: AlmacenArchivos,
      private readonly appVersion: string,
      private readonly generarId: () => string = () => crypto.randomUUID(),
   ) {}

   get archivos(): ResumenArchivo[] {
      return this.#archivos;
   }

   get cargando(): boolean {
      return this.#cargando;
   }

   get error(): string | null {
      return this.#error;
   }

   /** Relee el índice desde el almacén. */
   async refrescar(deviceIdActual?: string): Promise<void> {
      this.#cargando = true;
      this.#error = null;

      try {
         const entradas = await this.almacen.listar();
         const resumenes: ResumenArchivo[] = [];

         for (const entrada of entradas) {
            // Los archivos internos (el borrador) no son del alumno.
            if (entrada.id.startsWith(PREFIJO_INTERNO)) continue;
            const texto = await this.almacen.leer(entrada.id);
            if (!texto) continue;

            try {
               const { encabezado } = deserializar(texto);
               resumenes.push({
                  id: entrada.id,
                  titulo: encabezado.titulo,
                  creado: encabezado.creado,
                  modificado: encabezado.modificado,
                  autor: encabezado.autor.nombre,
                  numeroControl: encabezado.autor.numeroControl,
                  propio: !deviceIdActual || encabezado.deviceId === deviceIdActual,
                  tamano: entrada.tamano,
               });
            } catch {
               // Un archivo dañado no debe impedir ver los demás. Se omite del
               // listado; borrarlo solo sería peor, porque quizá se recupere.
            }
         }

         this.#archivos = resumenes.sort((a, b) => b.modificado.localeCompare(a.modificado));
      } catch (e) {
         this.#error = e instanceof Error ? e.message : 'No se pudo leer la lista de algoritmos.';
      } finally {
         this.#cargando = false;
      }
   }

   /**
    * Guarda un algoritmo. Si se pasa `id`, sobrescribe ese archivo conservando
    * su fecha de creación y su bitácora acumulada.
    */
   async guardar(opciones: {
      programa: Program;
      titulo: string;
      identidad: Identidad;
      id?: string;
      bitacora?: Bitacora;
   }): Promise<string> {
      const id = opciones.id ?? `${this.generarId()}.algx`;

      // Al sobrescribir se conserva la fecha de creación original: es parte de
      // la evidencia de que el trabajo se hizo a lo largo del tiempo.
      let creado: string | undefined;
      if (opciones.id) {
         const previo = await this.almacen.leer(opciones.id);
         if (previo) {
            try {
               creado = deserializar(previo).encabezado.creado;
            } catch {
               // Archivo previo ilegible: se guarda como si fuera nuevo.
            }
         }
      }

      const archivo = crearArchivo({
         programa: opciones.programa,
         titulo: opciones.titulo.trim() || 'Sin título',
         autor: {
            numeroControl: opciones.identidad.numeroControl,
            nombre: opciones.identidad.nombre,
            ...(opciones.identidad.grupo ? { grupo: opciones.identidad.grupo } : {}),
         },
         deviceId: opciones.identidad.deviceId,
         appVersion: this.appVersion,
         bitacora: opciones.bitacora,
         creado,
      });

      await this.almacen.guardar(id, serializar(archivo));
      await this.refrescar(opciones.identidad.deviceId);
      return id;
   }

   async abrir(id: string): Promise<Archivo> {
      const texto = await this.almacen.leer(id);
      if (!texto) throw new Error('Ese algoritmo ya no está guardado.');
      return deserializar(texto);
   }

   async borrar(id: string, deviceIdActual?: string): Promise<void> {
      await this.almacen.borrar(id);
      await this.refrescar(deviceIdActual);
   }

   async borrarTodo(): Promise<void> {
      await this.almacen.borrarTodo();
      this.#archivos = [];
   }

   /** Guarda un `.algx` que viene de fuera (por ejemplo, del profesor). */
   async importar(texto: string, deviceIdActual?: string): Promise<string> {
      // Se valida antes de escribir: mejor rechazarlo que meter basura al almacén.
      deserializar(texto);
      const id = `${this.generarId()}.algx`;
      await this.almacen.guardar(id, texto);
      await this.refrescar(deviceIdActual);
      return id;
   }

   // -- Borrador automático -------------------------------------------------
   //
   // Guarda el trabajo en curso, con errores de sintaxis y todo, para que
   // recargar la página o que el navegador cierre la pestaña no cueste una
   // tarde de trabajo. Se guarda el TEXTO y no el árbol justamente porque el
   // texto a medio escribir puede no compilar, y es lo que hay que recuperar.

   async guardarBorrador(borrador: Borrador): Promise<void> {
      try {
         await this.almacen.guardar(BORRADOR, JSON.stringify(borrador));
      } catch {
         // Un borrador que no se pudo escribir no debe interrumpir la edición.
      }
   }

   async leerBorrador(): Promise<Borrador | null> {
      try {
         const texto = await this.almacen.leer(BORRADOR);
         if (!texto) return null;
         const bruto = JSON.parse(texto) as Partial<Borrador>;
         if (typeof bruto.texto !== 'string') return null;
         return {
            texto: bruto.texto,
            titulo: typeof bruto.titulo === 'string' ? bruto.titulo : 'Sin título',
            archivoId: typeof bruto.archivoId === 'string' ? bruto.archivoId : undefined,
         };
      } catch {
         return null;
      }
   }

   async borrarBorrador(): Promise<void> {
      await this.almacen.borrar(BORRADOR);
   }

   /** Texto y nombre para exportar el archivo hacia fuera de la app. */
   async paraExportar(id: string): Promise<{ nombre: string; texto: string }> {
      const texto = await this.almacen.leer(id);
      if (!texto) throw new Error('Ese algoritmo ya no está guardado.');
      const { encabezado } = deserializar(texto);
      return { nombre: nombreSugerido(encabezado), texto };
   }
}
