/**
 * Biblioteca: los algoritmos guardados dentro de la app.
 *
 * Se apoya en la interfaz `AlmacenArchivos`, no en OPFS directamente, para
 * poder probar toda esta lógica —cifrado incluido— sin navegador.
 *
 * El nombre del archivo interno es un identificador aleatorio, no el título.
 * Así renombrar un algoritmo no implica mover archivos ni arriesgarse a pisar
 * otro que se llame igual, y dos algoritmos pueden compartir título sin chocar.
 */

import type { Program } from '../core/ast';
import type { Identidad } from '../identity/identidad';
import type { LlavesAlumno } from '../crypto/llaves';
import {
   cifrar,
   descifrar,
   ESQUEMA,
   huellaDeFirma,
   type ComoSeAbrio,
} from '../crypto/sobre';
import {
   bitacoraNueva,
   crearEncabezado,
   deserializar,
   encabezadoCanonico,
   ErrorArchivo,
   nombreSugerido,
   serializarCifrado,
   type Bitacora,
   type Contenido,
   type Encabezado,
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

/** Llaves disponibles ahora mismo. La biblioteca las consulta al vuelo. */
export interface ContextoCripto {
   /** Llaves de esta instalación. `null` si aún no hay identidad. */
   alumno: LlavesAlumno | null;
   /** Pública del profesor del curso, si está configurada. */
   profesorPublica: CryptoKey | null;
   /** Privada del profesor, solo cuando la app está en modo profesor. */
   profesorPrivada: CryptoKey | null;
}

export interface ResumenArchivo {
   id: string;
   titulo: string;
   creado: string;
   modificado: string;
   /** Quién dice haberlo hecho. */
   autor: string;
   numeroControl: string;
   /** ¿Lo escribió esta instalación? Lo demás se marca como ajeno. */
   propio: boolean;
   cifrado: boolean;
   /**
    * Huella de la llave de firma. Dos entregas con la misma huella salieron de
    * la misma instalación: es la señal más útil para detectar copias.
    */
   huella?: string;
   tamano: number;
}

export interface ArchivoAbierto {
   encabezado: Encabezado;
   contenido: Contenido;
   /** Con qué llave se pudo abrir. */
   como: ComoSeAbrio | 'sin-cifrar';
   /** `false` si el archivo fue alterado después de generarse. */
   firmaValida: boolean;
}

export class Biblioteca {
   #archivos = $state.raw<ResumenArchivo[]>([]);
   #cargando = $state(false);
   #error = $state<string | null>(null);

   constructor(
      private readonly almacen: AlmacenArchivos,
      private readonly appVersion: string,
      private readonly cripto: () => ContextoCripto,
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
               const { encabezado, carga } = deserializar(texto);

               // El encabezado se lee sin ninguna llave: por eso el profesor
               // puede ordenar un lote entero sin descifrar nada.
               resumenes.push({
                  id: entrada.id,
                  titulo: encabezado.titulo,
                  creado: encabezado.creado,
                  modificado: encabezado.modificado,
                  autor: encabezado.autor.nombre,
                  numeroControl: encabezado.autor.numeroControl,
                  propio: !deviceIdActual || encabezado.deviceId === deviceIdActual,
                  cifrado: carga.cifrado,
                  huella: carga.cifrado ? await huellaDeFirma(carga.sobre.firmaPub) : undefined,
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

   // -- Guardar -------------------------------------------------------------

   /**
    * Construye el archivo cifrado. Se expone aparte de `guardar` porque
    * exportar no debe obligar a guardar antes: es el paso que el alumno
    * olvidaría justo al entregar.
    */
   async construir(opciones: {
      programa: Program;
      titulo: string;
      identidad: Identidad;
      bitacora?: Bitacora;
      creado?: string;
   }): Promise<{ encabezado: Encabezado; texto: string }> {
      const { alumno, profesorPublica } = this.cripto();
      if (!alumno) {
         throw new ErrorArchivo('Todavía no hay llaves en este dispositivo.');
      }

      const encabezado = crearEncabezado({
         titulo: opciones.titulo,
         autor: {
            numeroControl: opciones.identidad.numeroControl,
            nombre: opciones.identidad.nombre,
            ...(opciones.identidad.grupo ? { grupo: opciones.identidad.grupo } : {}),
         },
         deviceId: opciones.identidad.deviceId,
         appVersion: this.appVersion,
         alg: ESQUEMA,
         creado: opciones.creado,
      });

      const contenido: Contenido = {
         programa: opciones.programa,
         bitacora: opciones.bitacora ?? bitacoraNueva(),
      };

      const sobre = await cifrar({
         contenido: JSON.stringify(contenido),
         llaveAlumno: alumno.maestra,
         firmaPrivada: alumno.firma.privateKey,
         firmaPublica: alumno.firmaPublicaJwk,
         profesorPublica,
         encabezadoCanonico: encabezadoCanonico(encabezado),
      });

      return { encabezado, texto: serializarCifrado(encabezado, sobre) };
   }

   /**
    * Guarda un algoritmo. Si se pasa `id`, sobrescribe ese archivo conservando
    * su fecha de creación.
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

      const { texto } = await this.construir({ ...opciones, creado });
      await this.almacen.guardar(id, texto);
      await this.refrescar(opciones.identidad.deviceId);
      return id;
   }

   // -- Abrir ---------------------------------------------------------------

   async abrir(id: string): Promise<ArchivoAbierto> {
      const texto = await this.almacen.leer(id);
      if (!texto) throw new ErrorArchivo('Ese algoritmo ya no está guardado.');
      return this.interpretar(texto);
   }

   /** Descifra y valida un `.algx` con las llaves disponibles. */
   async interpretar(texto: string): Promise<ArchivoAbierto> {
      const { encabezado, carga } = deserializar(texto);

      if (!carga.cifrado) {
         // Archivo de una versión anterior al cifrado: se sigue abriendo para
         // que nadie pierda a mitad de curso lo que ya tenía hecho.
         return {
            encabezado,
            contenido: carga.contenido,
            como: 'sin-cifrar',
            firmaValida: false,
         };
      }

      const { alumno, profesorPrivada } = this.cripto();
      const resultado = await descifrar({
         sobre: carga.sobre,
         encabezadoCanonico: encabezadoCanonico(encabezado),
         llaveAlumno: alumno?.maestra ?? null,
         profesorPrivada,
      });

      let contenido: Contenido;
      try {
         const bruto = JSON.parse(resultado.contenido) as Partial<Contenido>;
         if (!bruto.programa) throw new Error('sin programa');
         contenido = {
            programa: bruto.programa,
            bitacora: { ...bitacoraNueva(), ...(bruto.bitacora ?? {}) },
         };
      } catch {
         throw new ErrorArchivo('El archivo se descifró pero su contenido está dañado.');
      }

      return {
         encabezado,
         contenido,
         como: resultado.como,
         firmaValida: resultado.firmaValida,
      };
   }

   async borrar(id: string, deviceIdActual?: string): Promise<void> {
      await this.almacen.borrar(id);
      await this.refrescar(deviceIdActual);
   }

   async borrarTodo(): Promise<void> {
      await this.almacen.borrarTodo();
      this.#archivos = [];
   }

   /** Guarda un `.algx` que viene de fuera (por ejemplo, de un alumno). */
   async importar(texto: string, deviceIdActual?: string): Promise<string> {
      // Se valida el contenedor antes de escribir; no se exige poder
      // descifrarlo, porque el profesor importa archivos que no son suyos y
      // un alumno puede recibir uno que no podrá abrir.
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
   //
   // El borrador NO se cifra: vive en el almacén privado del origen, del que ya
   // dependen las llaves, y cifrarlo obligaría a descifrar antes de poder
   // mostrar nada al arrancar.

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
      if (!texto) throw new ErrorArchivo('Ese algoritmo ya no está guardado.');
      const { encabezado } = deserializar(texto);
      return { nombre: nombreSugerido(encabezado), texto };
   }
}
