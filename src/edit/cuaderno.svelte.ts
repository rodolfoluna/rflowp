/**
 * El cuaderno: varios ejercicios en un mismo archivo.
 *
 * Una tarea de ocho ejercicios se trabaja junta y se entrega una vez, en lugar
 * de exportar ocho archivos y recogerlos ocho veces.
 *
 * **Reutiliza `Documento` tal cual**, una instancia por ejercicio. Ahí ya está
 * resuelto lo difícil —la sincronización texto↔árbol, el deshacer, conservar el
 * último árbol válido mientras se escribe a medias— y está probado. El
 * `Cuaderno` solo gestiona la colección.
 *
 * De ese reparto sale gratis una propiedad que el alumno espera: **deshacer es
 * por ejercicio**. Deshacer en el ejercicio 3 no toca al 1.
 */

import { print } from '../core/printer';
import type { Program } from '../core/ast';
import {
   bitacoraEjercicioNueva,
   totalizarBitacora,
   type BitacoraEjercicio,
   type Contenido,
   type Ejercicio,
   type OrigenPlantilla,
} from '../file/algx';
import type { EjercicioPlantilla } from '../file/plantilla';
import { Documento } from './documento.svelte';

/** Un ejercicio nuevo empieza con el esqueleto mínimo que ya compila. */
export function esqueletoDe(nombre: string): string {
   // El nombre del proceso tiene que ser un identificador válido.
   const identificador =
      nombre
         .normalize('NFD')
         .replace(/[̀-ͯ]/g, '')
         .replace(/[^A-Za-z0-9]+/g, '_')
         .replace(/^_+|_+$/g, '')
         .replace(/^(\d)/, '_$1') || 'ejercicio';

   return `Proceso ${identificador}\n   \nFinProceso`;
}

/** Cómo está un ejercicio, para que la lista lo muestre de un vistazo. */
export type EstadoEjercicio = 'vacio' | 'con-errores' | 'listo';

export interface ResumenEjercicio {
   id: string;
   nombre: string;
   enunciado?: string;
   /** Viene de una plantilla: su enunciado no se edita. */
   deLaPlantilla: boolean;
   estado: EstadoEjercicio;
   activo: boolean;
}

/** Estado interno de cada ejercicio: su documento y lo que no vive en él. */
interface Hoja {
   id: string;
   nombre: string;
   enunciado?: string;
   origenId?: string;
   doc: Documento;
   bitacora: BitacoraEjercicio;
}

/** Un cuaderno recién creado, con un ejercicio en blanco. */
function hojaNueva(id: string, nombre: string, texto?: string): Hoja {
   return {
      id,
      nombre,
      doc: new Documento(texto ?? esqueletoDe(nombre)),
      bitacora: bitacoraEjercicioNueva(),
   };
}

export class Cuaderno {
   #hojas = $state.raw<Hoja[]>([]);
   #activoId = $state('');
   #sesiones = $state(1);
   #plantilla = $state.raw<OrigenPlantilla | undefined>(undefined);

   constructor(
      private readonly generarId: () => string = () => crypto.randomUUID(),
   ) {
      const primera = hojaNueva(this.generarId(), 'Ejercicio 1');
      this.#hojas = [primera];
      this.#activoId = primera.id;
   }

   // -- Lectura -------------------------------------------------------------

   /** El documento que se está editando. Es lo que ve el editor y el diagrama. */
   get activo(): Documento {
      return this.#hoja(this.#activoId).doc;
   }

   get activoId(): string {
      return this.#activoId;
   }

   get plantilla(): OrigenPlantilla | undefined {
      return this.#plantilla;
   }

   /** Posición del ejercicio activo, 1-indexada, para mostrar «3/8». */
   get posicionActiva(): number {
      return this.#hojas.findIndex((h) => h.id === this.#activoId) + 1;
   }

   get total(): number {
      return this.#hojas.length;
   }

   get nombreActivo(): string {
      return this.#hoja(this.#activoId).nombre;
   }

   get enunciadoActivo(): string | undefined {
      return this.#hoja(this.#activoId).enunciado;
   }

   get ejercicios(): ResumenEjercicio[] {
      return this.#hojas.map((h) => ({
         id: h.id,
         nombre: h.nombre,
         ...(h.enunciado ? { enunciado: h.enunciado } : {}),
         deLaPlantilla: h.origenId !== undefined,
         estado: estadoDe(h),
         activo: h.id === this.#activoId,
      }));
   }

   #hoja(id: string): Hoja {
      const h = this.#hojas.find((x) => x.id === id);
      // No debería pasar: el id activo siempre sale de la propia lista.
      if (!h) throw new Error(`No existe el ejercicio ${id}`);
      return h;
   }

   // -- Navegación ----------------------------------------------------------

   activar(id: string): void {
      if (this.#hojas.some((h) => h.id === id)) this.#activoId = id;
   }

   /** Pasa al anterior o al siguiente. No da la vuelta al llegar al extremo. */
   avanzar(delta: -1 | 1): void {
      const i = this.#hojas.findIndex((h) => h.id === this.#activoId);
      const destino = i + delta;
      if (destino >= 0 && destino < this.#hojas.length) {
         this.#activoId = this.#hojas[destino].id;
      }
   }

   get puedeAvanzar(): { atras: boolean; adelante: boolean } {
      const i = this.#hojas.findIndex((h) => h.id === this.#activoId);
      return { atras: i > 0, adelante: i < this.#hojas.length - 1 };
   }

   // -- Edición de la colección ---------------------------------------------

   /** Crea un ejercicio al final y lo deja activo. Devuelve su id. */
   agregar(nombre?: string): string {
      const titulo = (nombre ?? `Ejercicio ${this.#hojas.length + 1}`).trim() || 'Ejercicio';
      const hoja = hojaNueva(this.generarId(), titulo);
      this.#hojas = [...this.#hojas, hoja];
      this.#activoId = hoja.id;
      return hoja.id;
   }

   renombrar(id: string, nombre: string): void {
      const limpio = nombre.trim();
      if (!limpio) return;
      this.#hojas = this.#hojas.map((h) => (h.id === id ? { ...h, nombre: limpio } : h));
   }

   /**
    * Borra un ejercicio. **Nunca deja el cuaderno vacío**: un cuaderno sin
    * ejercicios no tendría nada que editar ni que mostrar.
    */
   eliminar(id: string): boolean {
      if (this.#hojas.length <= 1) return false;

      const i = this.#hojas.findIndex((h) => h.id === id);
      if (i < 0) return false;

      this.#hojas = this.#hojas.filter((h) => h.id !== id);

      // Si se borró el activo, pasa al vecino: al siguiente, o al anterior si
      // era el último.
      if (this.#activoId === id) {
         this.#activoId = this.#hojas[Math.min(i, this.#hojas.length - 1)].id;
      }
      return true;
   }

   mover(id: string, delta: -1 | 1): boolean {
      const i = this.#hojas.findIndex((h) => h.id === id);
      const destino = i + delta;
      if (i < 0 || destino < 0 || destino >= this.#hojas.length) return false;

      const copia = [...this.#hojas];
      [copia[i], copia[destino]] = [copia[destino], copia[i]];
      this.#hojas = copia;
      return true;
   }

   // -- Bitácora ------------------------------------------------------------

   /** Suma lo trabajado al ejercicio indicado. */
   anotar(id: string, cambio: Partial<BitacoraEjercicio>): void {
      this.#hojas = this.#hojas.map((h) =>
         h.id === id ? { ...h, bitacora: { ...h.bitacora, ...cambio } } : h,
      );
   }

   /**
    * Devuelve `undefined` si el ejercicio ya no está, en vez de lanzar.
    *
    * Pasa de verdad: al abrir un archivo o recuperar el borrador, el cuaderno
    * se reemplaza entero y quien estuviera midiendo el ejercicio anterior se
    * queda con un id que ya no existe. Es una carrera legítima, no un error, y
    * no puede tumbar la app justo al guardar.
    */
   bitacoraDe(id: string): BitacoraEjercicio | undefined {
      return this.#hojas.find((h) => h.id === id)?.bitacora;
   }

   /** ¿Sigue existiendo ese ejercicio? */
   tiene(id: string): boolean {
      return this.#hojas.some((h) => h.id === id);
   }

   // -- Carga y guardado ----------------------------------------------------

   /**
    * Vuelca el cuaderno al formato del archivo.
    *
    * Cada ejercicio se guarda con el árbol de SU documento, que es el último que
    * compiló. Si un ejercicio tiene errores de sintaxis a medio escribir, se
    * guarda su última versión válida en vez de nada.
    */
   aContenido(): Contenido {
      const ejercicios: Ejercicio[] = this.#hojas.map((h) => ({
         id: h.id,
         nombre: h.nombre,
         ...(h.enunciado ? { enunciado: h.enunciado } : {}),
         ...(h.origenId ? { origenId: h.origenId } : {}),
         programa: h.doc.programa,
         bitacora: h.bitacora,
      }));

      return {
         ejercicios,
         ...(this.#plantilla ? { plantilla: this.#plantilla } : {}),
         bitacora: totalizarBitacora(ejercicios, this.#sesiones),
      };
   }

   /** Reemplaza el cuaderno con el contenido de un archivo abierto. */
   cargar(contenido: Contenido, activoId?: string): void {
      this.#hojas = contenido.ejercicios.map((e) => ({
         id: e.id,
         nombre: e.nombre,
         ...(e.enunciado ? { enunciado: e.enunciado } : {}),
         ...(e.origenId ? { origenId: e.origenId } : {}),
         doc: new Documento(print(e.programa)),
         bitacora: e.bitacora,
      }));

      this.#plantilla = contenido.plantilla;
      // Abrir para seguir trabajando cuenta como una sesión más.
      this.#sesiones = contenido.bitacora.sesiones + 1;
      this.#activoId =
         activoId && this.#hojas.some((h) => h.id === activoId)
            ? activoId
            : this.#hojas[0].id;
   }

   /** Empieza de cero, con un solo ejercicio en blanco. */
   reiniciar(): void {
      const primera = hojaNueva(this.generarId(), 'Ejercicio 1');
      this.#hojas = [primera];
      this.#activoId = primera.id;
      this.#plantilla = undefined;
      this.#sesiones = 1;
   }

   get sesiones(): number {
      return this.#sesiones;
   }

   // -- Borrador ------------------------------------------------------------

   /**
    * Lo que se guarda para recuperar el trabajo tras cerrar la app.
    *
    * Guarda el TEXTO de cada ejercicio y no su árbol: lo que hay que recuperar
    * es exactamente lo que el alumno tenía escrito, aunque no compile.
    */
   aBorrador(): BorradorCuaderno {
      return {
         activoId: this.#activoId,
         sesiones: this.#sesiones,
         ...(this.#plantilla ? { plantilla: this.#plantilla } : {}),
         ejercicios: this.#hojas.map((h) => ({
            id: h.id,
            nombre: h.nombre,
            ...(h.enunciado ? { enunciado: h.enunciado } : {}),
            ...(h.origenId ? { origenId: h.origenId } : {}),
            texto: h.doc.texto,
            bitacora: h.bitacora,
         })),
      };
   }

   desdeBorrador(borrador: BorradorCuaderno): void {
      if (borrador.ejercicios.length === 0) return;

      this.#hojas = borrador.ejercicios.map((e) => ({
         id: e.id,
         nombre: e.nombre,
         ...(e.enunciado ? { enunciado: e.enunciado } : {}),
         ...(e.origenId ? { origenId: e.origenId } : {}),
         doc: new Documento(e.texto),
         bitacora: { ...bitacoraEjercicioNueva(), ...e.bitacora },
      }));

      this.#plantilla = borrador.plantilla;
      this.#sesiones = borrador.sesiones ?? 1;
      this.#activoId = this.#hojas.some((h) => h.id === borrador.activoId)
         ? borrador.activoId
         : this.#hojas[0].id;
   }

   /**
    * Los ejercicios vistos como plantilla, para que el profesor la reparta.
    *
    * Se conserva el `origenId` cuando lo hay: si el profesor abre su propia
    * plantilla, la corrige y la vuelve a exportar, los ids no cambian y los
    * cuadernos ya repartidos siguen enlazados con ella.
    */
   esbozoPlantilla(): EjercicioPlantilla[] {
      return this.#hojas.map((h) => ({
         id: h.origenId ?? h.id,
         nombre: h.nombre,
         ...(h.enunciado ? { enunciado: h.enunciado } : {}),
         programa: h.doc.programa,
      }));
   }

   /**
    * Escribe el enunciado de un ejercicio.
    *
    * Solo lo usa el editor de plantillas: para el alumno el enunciado es de
    * lectura y la interfaz no ofrece dónde tocarlo.
    */
   enunciar(id: string, enunciado: string): void {
      const texto = enunciado.trim();
      this.#hojas = this.#hojas.map((h) =>
         h.id === id ? { ...h, ...(texto ? { enunciado: texto } : { enunciado: undefined }) } : h,
      );
   }

   /** Instala los ejercicios de una plantilla en un cuaderno nuevo. */
   desdePlantilla(
      origen: OrigenPlantilla,
      ejercicios: Array<{
         origenId: string;
         nombre: string;
         enunciado?: string;
         programa?: Program;
      }>,
   ): void {
      if (ejercicios.length === 0) return;

      this.#hojas = ejercicios.map((e) => ({
         id: this.generarId(),
         nombre: e.nombre,
         ...(e.enunciado ? { enunciado: e.enunciado } : {}),
         origenId: e.origenId,
         doc: new Documento(e.programa ? print(e.programa) : esqueletoDe(e.nombre)),
         bitacora: bitacoraEjercicioNueva(),
      }));

      this.#plantilla = origen;
      this.#sesiones = 1;
      this.#activoId = this.#hojas[0].id;
   }
}

// ---------------------------------------------------------------------------

export interface BorradorEjercicio {
   id: string;
   nombre: string;
   enunciado?: string;
   origenId?: string;
   texto: string;
   bitacora: BitacoraEjercicio;
}

export interface BorradorCuaderno {
   activoId: string;
   sesiones?: number;
   plantilla?: OrigenPlantilla;
   ejercicios: BorradorEjercicio[];
}

/**
 * Un ejercicio está «vacío» si su programa no tiene sentencias.
 *
 * Sirve para que la lista distinga de un vistazo lo que falta por hacer de lo
 * que ya está, sin obligar al alumno a entrar en cada uno.
 */
function estadoDe(hoja: Hoja): EstadoEjercicio {
   if (hoja.doc.errores.length > 0) return 'con-errores';
   return hoja.doc.programa.body.length === 0 ? 'vacio' : 'listo';
}
