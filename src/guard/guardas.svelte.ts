/**
 * Guardas contra copiar y pegar.
 *
 * Qué son y qué no: **fricción deliberada**, no una barrera. Un alumno con
 * conocimientos abre las herramientas del navegador y las desactiva en un
 * minuto, y nadie puede impedir que fotografíe la pantalla y retranscriba. Lo
 * que sí consiguen es que pegar código de fuera deje de ser el camino cómodo, y
 * —más importante— que cada intento quede registrado en la bitácora del
 * archivo, que es lo que el profesor mirará cuando dude de una entrega.
 *
 * Costo que hay que asumir con los ojos abiertos: esto también estorba a quien
 * usa el portapapeles por necesidad (lectores de pantalla, teclados
 * alternativos, alumnos con dificultades motrices). Por eso el bloqueo se
 * limita a lo que sirve al objetivo y no se extiende a toda la interfaz.
 */

/** Eventos de portapapeles que se cancelan. */
const EVENTOS_PORTAPAPELES = ['copy', 'cut', 'paste'] as const;

export class Guardas {
   #pegadosBloqueados = $state(0);
   #copiadosBloqueados = $state(0);
   /** Última acción bloqueada, para avisar en pantalla. */
   #ultimoAviso = $state<string | null>(null);

   get pegadosBloqueados(): number {
      return this.#pegadosBloqueados;
   }

   get copiadosBloqueados(): number {
      return this.#copiadosBloqueados;
   }

   get aviso(): string | null {
      return this.#ultimoAviso;
   }

   descartarAviso(): void {
      this.#ultimoAviso = null;
   }

   /**
    * Pone el contador en lo que traía el archivo que se acaba de abrir.
    *
    * Es una asignación y no una suma: el contador pertenece al **documento**,
    * no a la sesión. Si se acumulara, un intento de pegar mientras se trabajaba
    * en un algoritmo aparecería después en la bitácora de otro, y eso es
    * evidencia falsa contra el alumno.
    */
   fijarDesdeArchivo(pegados: number): void {
      this.#pegadosBloqueados = pegados;
   }

   /** Vuelve a cero: algoritmo nuevo o datos borrados. */
   reiniciar(): void {
      this.#pegadosBloqueados = 0;
      this.#copiadosBloqueados = 0;
   }

   #anunciar(texto: string): void {
      this.#ultimoAviso = texto;
      setTimeout(() => {
         if (this.#ultimoAviso === texto) this.#ultimoAviso = null;
      }, 3500);
   }

   /**
    * Instala las guardas. Devuelve la función para quitarlas.
    *
    * Se registran en fase de captura para adelantarse a cualquier manejo que
    * hagan los componentes.
    */
   activar(): () => void {
      const alPortapapeles = (e: Event) => {
         const evento = e as ClipboardEvent;

         if (evento.type === 'paste') {
            this.#pegadosBloqueados += 1;
            this.#anunciar('Aquí no se puede pegar. Escríbelo tú.');
         } else {
            this.#copiadosBloqueados += 1;
            this.#anunciar('Copiar está desactivado en esta app.');
         }

         evento.preventDefault();
         evento.stopPropagation();
      };

      const alMenu = (e: Event) => {
         // El menú contextual es la otra vía obvia a copiar y pegar.
         e.preventDefault();
      };

      const alArrastrar = (e: Event) => {
         // Arrastrar texto de una ventana a otra copia sin tocar el portapapeles.
         e.preventDefault();
      };

      for (const tipo of EVENTOS_PORTAPAPELES) {
         document.addEventListener(tipo, alPortapapeles, true);
      }
      document.addEventListener('contextmenu', alMenu, true);
      document.addEventListener('dragstart', alArrastrar, true);
      document.addEventListener('drop', alArrastrar, true);

      return () => {
         for (const tipo of EVENTOS_PORTAPAPELES) {
            document.removeEventListener(tipo, alPortapapeles, true);
         }
         document.removeEventListener('contextmenu', alMenu, true);
         document.removeEventListener('dragstart', alArrastrar, true);
         document.removeEventListener('drop', alArrastrar, true);
      };
   }
}
