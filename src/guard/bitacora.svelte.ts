/**
 * Bitácora de edición: cuánto y cómo se trabajó en un algoritmo.
 *
 * Es la parte del proyecto que de verdad distingue un trabajo hecho de uno
 * copiado. El cifrado impide que un alumno lea el archivo de otro; esto delata
 * al que retranscribió a mano lo que le pasó un compañero, que es lo único que
 * la criptografía no puede evitar.
 *
 * Un trabajo escrito de verdad acumula minutos y decenas de ediciones a lo
 * largo de varias sesiones. Uno transcrito en diez minutos de un tirón, no.
 *
 * El tiempo se cuenta **solo con la app visible y en primer plano**: si contara
 * con la pestaña en segundo plano, dejar la app abierta toda la tarde inflaría
 * la cifra y la volvería inútil como evidencia.
 */

import type { Bitacora } from '../file/algx';

/** Cada cuánto se acumula el tiempo activo. */
const TIC_MS = 1000;

/**
 * Si pasa más de esto entre dos tics, se asume que el equipo estuvo suspendido
 * y no se cuenta: dormir el portátil no es trabajar.
 */
const SALTO_MAXIMO_MS = 5000;

export class Cronista {
   #sesiones = $state(1);
   #segundosActivos = $state(0);
   #ediciones = $state(0);

   #temporizador: ReturnType<typeof setInterval> | null = null;
   #ultimoTic = 0;

   /**
    * Cómo se decide si el alumno está trabajando ahora mismo.
    *
    * Se inyecta para poder probar el conteo sin navegador: `document.hasFocus()`
    * no se puede simular, y sin esto la parte que produce la evidencia contra la
    * copia se quedaría sin cobertura.
    */
   constructor(private readonly estaActiva: () => boolean = actividadDelNavegador) {}

   /** Instantánea para guardar dentro del archivo. */
   instantanea(pegadosBloqueados: number): Bitacora {
      return {
         sesiones: this.#sesiones,
         segundosActivos: Math.round(this.#segundosActivos),
         ediciones: this.#ediciones,
         pegadosBloqueados,
      };
   }

   get segundosActivos(): number {
      return Math.round(this.#segundosActivos);
   }

   get ediciones(): number {
      return this.#ediciones;
   }

   get sesiones(): number {
      return this.#sesiones;
   }

   /** Registra una edición: una tecla en el editor o un cambio en el diagrama. */
   anotarEdicion(): void {
      this.#ediciones += 1;
   }

   /**
    * Continúa la bitácora de un archivo que se acaba de abrir.
    * Suma una sesión: abrirlo para seguir trabajando es una sesión más.
    */
   continuar(previa: Bitacora): void {
      this.#sesiones = previa.sesiones + 1;
      this.#segundosActivos = previa.segundosActivos;
      this.#ediciones = previa.ediciones;
   }

   /** Empieza de cero, para un algoritmo nuevo. */
   reiniciar(): void {
      this.#sesiones = 1;
      this.#segundosActivos = 0;
      this.#ediciones = 0;
   }

   /** Arranca el conteo de tiempo. Devuelve la función para pararlo. */
   arrancar(): () => void {
      this.#ultimoTic = Date.now();

      const tic = () => {
         const ahora = Date.now();
         const transcurrido = ahora - this.#ultimoTic;
         this.#ultimoTic = ahora;

         if (!this.estaActiva()) return;
         // Un salto grande significa equipo suspendido o pestaña congelada.
         if (transcurrido > SALTO_MAXIMO_MS) return;

         this.#segundosActivos += transcurrido / 1000;
      };

      this.#temporizador = setInterval(tic, TIC_MS);

      // Al volver de segundo plano se reinicia la referencia para no contar de
      // golpe todo el rato que la pestaña estuvo oculta.
      const alCambiarVisibilidad = () => {
         this.#ultimoTic = Date.now();
      };

      // Fuera del navegador (las pruebas) no hay nada a lo que suscribirse; el
      // conteo funciona igual porque la actividad se inyecta.
      const hayDOM = typeof document !== 'undefined' && typeof window !== 'undefined';
      if (hayDOM) {
         document.addEventListener('visibilitychange', alCambiarVisibilidad);
         window.addEventListener('focus', alCambiarVisibilidad);
      }

      return () => {
         if (this.#temporizador !== null) clearInterval(this.#temporizador);
         this.#temporizador = null;
         if (hayDOM) {
            document.removeEventListener('visibilitychange', alCambiarVisibilidad);
            window.removeEventListener('focus', alCambiarVisibilidad);
         }
      };
   }

}

/**
 * La app cuenta como activa solo si está visible **y** con el foco.
 *
 * Sin la condición de foco, dejar la app abierta en una pestaña de fondo toda
 * la tarde inflaría el tiempo y lo volvería inútil como evidencia.
 */
export function actividadDelNavegador(): boolean {
   if (typeof document === 'undefined') return false;
   if (document.visibilityState !== 'visible') return false;
   return document.hasFocus();
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

/** Duración en texto corto: `3 min`, `1 h 25 min`. */
export function duracion(segundos: number): string {
   if (segundos < 60) return `${Math.round(segundos)} s`;

   const minutos = Math.round(segundos / 60);
   if (minutos < 60) return `${minutos} min`;

   const horas = Math.floor(minutos / 60);
   const resto = minutos % 60;
   return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** Qué tan verosímil es que este trabajo se haya escrito de verdad. */
export type Verosimilitud = 'normal' | 'dudosa' | 'muy-dudosa';

/**
 * Heurística para ordenar la atención del profesor, no para acusar a nadie.
 *
 * Los umbrales son deliberadamente laxos: es preferible dejar pasar una copia
 * que señalar a quien sí trabajó. Un caso marcado significa «vale la pena
 * mirarlo», nunca «esto es copia».
 */
export function verosimilitud(bitacora: Bitacora): Verosimilitud {
   const { segundosActivos, ediciones, sesiones } = bitacora;

   // Escribir un algoritmo completo requiere decenas de ediciones. Muy pocas,
   // en muy poco tiempo, es la firma de una transcripción.
   if (segundosActivos < 120 && ediciones < 30) return 'muy-dudosa';
   if (segundosActivos < 300 && sesiones === 1 && ediciones < 80) return 'dudosa';

   return 'normal';
}
