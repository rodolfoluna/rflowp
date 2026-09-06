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
 * limita a lo que sirve al objetivo y no se extiende a toda la interfaz, y por
 * eso existe el **apoyo de portapapeles**.
 *
 * El apoyo permite pegar. No se pide permiso al profesor —una app sin servidor
 * no puede comprobarlo, y hacer que un alumno espere autorización para poder
 * escribir sería peor que el problema—, pero cada pegado queda contado en la
 * bitácora como `pegadosPermitidos`, aparte de los bloqueados.
 *
 * Que un alumno lo encienda para copiar es posible. Sale ganando el registro:
 * hoy quien desactiva las guardas desde las herramientas del navegador no deja
 * rastro ninguno, y esto sí lo deja. Y el que lo necesita de verdad puede usar
 * la app, que es lo que se estaba impidiendo.
 *
 * Copiar y cortar siguen bloqueados con el apoyo puesto: la necesidad que
 * cubre es **meter** texto, no sacarlo.
 */

/** Eventos de portapapeles que se cancelan. */
const EVENTOS_PORTAPAPELES = ['copy', 'cut', 'paste'] as const;

/**
 * El apoyo se guarda en `localStorage`, como el tema, y no con la identidad.
 *
 * Es un ajuste del **aparato** y tiene que sobrevivir a «borrar mis datos»: si
 * un alumno necesita el portapapeles para escribir, borrar su identidad no
 * puede dejarlo otra vez sin poder usar la app.
 */
const CLAVE_APOYO = 'rflowp:apoyo-portapapeles';

function leerApoyo(): boolean {
   try {
      return localStorage.getItem(CLAVE_APOYO) === 'si';
   } catch {
      // Modo privado o almacenamiento bloqueado.
      return false;
   }
}

/** Lo mínimo de `document` que las guardas necesitan. */
export interface DestinoDeEventos {
   addEventListener(tipo: string, oyente: (e: Event) => void, captura: boolean): void;
   removeEventListener(tipo: string, oyente: (e: Event) => void, captura: boolean): void;
}

export class Guardas {
   #pegadosBloqueados = $state(0);
   #pegadosPermitidos = $state(0);
   #copiadosBloqueados = $state(0);
   #apoyo = $state(false);
   /** Última acción bloqueada, para avisar en pantalla. */
   #ultimoAviso = $state<string | null>(null);

   constructor() {
      this.#apoyo = leerApoyo();
   }

   get pegadosBloqueados(): number {
      return this.#pegadosBloqueados;
   }

   get pegadosPermitidos(): number {
      return this.#pegadosPermitidos;
   }

   /** ¿Está puesto el apoyo de portapapeles? */
   get apoyo(): boolean {
      return this.#apoyo;
   }

   apoyar(activo: boolean): void {
      this.#apoyo = activo;
      try {
         localStorage.setItem(CLAVE_APOYO, activo ? 'si' : 'no');
      } catch {
         // Sin poder guardarlo vale para esta sesión, que es mejor que nada.
      }
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
   fijarDesdeArchivo(pegados: number, permitidos = 0): void {
      this.#pegadosBloqueados = pegados;
      this.#pegadosPermitidos = permitidos;
   }

   /**
    * Vuelve a cero: algoritmo nuevo o datos borrados.
    *
    * El apoyo NO se toca aquí. Es una adaptación de quien usa el aparato, no
    * parte del trabajo, y quitárselo al empezar un algoritmo nuevo lo dejaría
    * sin poder escribir sin entender por qué.
    */
   reiniciar(): void {
      this.#pegadosBloqueados = 0;
      this.#pegadosPermitidos = 0;
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
    *
    * El destino se inyecta por la misma razón que en el `Cronista`: sin esto,
    * la parte que decide qué se bloquea y qué se cuenta —justo la que produce
    * la evidencia y la que puede dejar a un alumno sin poder escribir— se
    * quedaría sin pruebas, porque en Node no hay `document`.
    */
   activar(destino: DestinoDeEventos = document): () => void {
      const alPortapapeles = (e: Event) => {
         const evento = e as ClipboardEvent;

         if (evento.type === 'paste') {
            if (this.#apoyo) {
               // Pasa, pero queda contado: el profesor tiene que poder verlo.
               this.#pegadosPermitidos += 1;
               return;
            }
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
         // El menú contextual es la otra vía obvia a copiar y pegar. Con el
         // apoyo puesto se deja: en un teclado alternativo suele ser la única
         // forma de llegar a «Pegar».
         if (this.#apoyo) return;
         e.preventDefault();
      };

      // Arrastrar texto de una ventana a otra copia sin tocar el portapapeles.
      // Se separan las dos direcciones: sacar texto es copiar y sigue
      // bloqueado siempre; meterlo es pegar y lo cubre el apoyo.
      const alSacar = (e: Event) => e.preventDefault();
      const alMeter = (e: Event) => {
         if (this.#apoyo) {
            this.#pegadosPermitidos += 1;
            return;
         }
         e.preventDefault();
      };

      for (const tipo of EVENTOS_PORTAPAPELES) {
         destino.addEventListener(tipo, alPortapapeles, true);
      }
      destino.addEventListener('contextmenu', alMenu, true);
      destino.addEventListener('dragstart', alSacar, true);
      destino.addEventListener('drop', alMeter, true);

      return () => {
         for (const tipo of EVENTOS_PORTAPAPELES) {
            destino.removeEventListener(tipo, alPortapapeles, true);
         }
         destino.removeEventListener('contextmenu', alMenu, true);
         destino.removeEventListener('dragstart', alSacar, true);
         destino.removeEventListener('drop', alMeter, true);
      };
   }
}
