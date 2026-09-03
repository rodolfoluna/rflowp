/**
 * Preferencia de tema: claro, oscuro o el del sistema.
 *
 * Se guarda en `localStorage` y no en IndexedDB junto al resto: es una
 * preferencia del **aparato**, no del alumno, y debe sobrevivir a «borrar mis
 * datos». Si un alumno usa la app con el tema oscuro porque le cansa menos la
 * vista, borrar su identidad no tiene por qué devolverle el fondo blanco.
 *
 * También por eso se lee de forma síncrona al arrancar: aplicarlo después del
 * primer pintado produciría un destello blanco, que en un salón a oscuras es
 * exactamente lo que se quería evitar.
 */

export type Tema = 'sistema' | 'claro' | 'oscuro';

const CLAVE = 'rflowp:tema';

/** Color de la barra del navegador, por tema. Debe casar con `--fondo`. */
const COLOR_BARRA: Record<'claro' | 'oscuro', string> = {
   claro: '#f6f7f9',
   oscuro: '#14161a',
};

function esTema(valor: unknown): valor is Tema {
   return valor === 'sistema' || valor === 'claro' || valor === 'oscuro';
}

/** Lee la preferencia guardada. Nunca lanza: sin ella la app funciona igual. */
export function leerTema(): Tema {
   try {
      const guardado = localStorage.getItem(CLAVE);
      return esTema(guardado) ? guardado : 'sistema';
   } catch {
      // Modo privado o almacenamiento bloqueado.
      return 'sistema';
   }
}

/** ¿Qué tema se está viendo de hecho, resolviendo `sistema`? */
export function temaEfectivo(tema: Tema): 'claro' | 'oscuro' {
   if (tema !== 'sistema') return tema;
   if (typeof window === 'undefined' || !window.matchMedia) return 'claro';
   return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

/**
 * Aplica el tema al documento.
 *
 * Con `sistema` se quita el atributo en vez de escribir su valor resuelto: así
 * el CSS sigue reaccionando solo si el usuario cambia el ajuste del teléfono
 * mientras la app está abierta.
 */
export function aplicarTema(tema: Tema): void {
   if (typeof document === 'undefined') return;

   const raiz = document.documentElement;
   if (tema === 'sistema') {
      raiz.removeAttribute('data-tema');
   } else {
      raiz.setAttribute('data-tema', tema);
   }

   const meta = document.querySelector('meta[name="theme-color"]');
   if (meta) meta.setAttribute('content', COLOR_BARRA[temaEfectivo(tema)]);
}

/**
 * Estado reactivo del tema.
 *
 * Se aplica al construirse para que el primer pintado ya salga con el tema
 * correcto.
 */
export class PreferenciaTema {
   #tema = $state<Tema>('sistema');

   constructor() {
      this.#tema = leerTema();
      aplicarTema(this.#tema);

      // Con `sistema`, seguir el ajuste del aparato en vivo.
      if (typeof window !== 'undefined' && window.matchMedia) {
         window
            .matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', () => {
               if (this.#tema === 'sistema') aplicarTema('sistema');
            });
      }
   }

   get tema(): Tema {
      return this.#tema;
   }

   get efectivo(): 'claro' | 'oscuro' {
      return temaEfectivo(this.#tema);
   }

   elegir(tema: Tema): void {
      this.#tema = tema;
      aplicarTema(tema);
      try {
         localStorage.setItem(CLAVE, tema);
      } catch {
         // Sin poder guardarlo, el tema vale para esta sesión y ya.
      }
   }
}
