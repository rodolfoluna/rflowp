/**
 * El documento: mantiene el AST y su proyección en texto sincronizados.
 *
 * Hay dos formas de editar y cada una entra por un lado distinto:
 *
 *   escribir(texto)   el alumno teclea  → parsear → adoptar el árbol si compila
 *   aplicar(mutación) el alumno toca el diagrama → mutar → reimprimir el texto
 *
 * No se muerden la cola porque `escribir` solo lo llama el `oninput` del
 * editor, y asignar el texto desde el código no dispara ese evento. Si algún
 * día el editor pasa a CodeMirror, hay que comprobar que sigue siendo así:
 * readoptar el árbol tras una edición gráfica daría un árbol equivalente pero
 * con `id` nuevos, y la selección y el resaltado de ejecución se apoyan en ellos.
 */

import { parse, type ParseError } from '../core/parser';
import { print } from '../core/printer';
import type { Program } from '../core/ast';

interface Instantanea {
   texto: string;
   programa: Program;
}

/** Cuántos pasos de deshacer se conservan. */
const TOPE_HISTORIAL = 100;

export class Documento {
   #texto = $state('');
   #errores = $state<ParseError[]>([]);

   /**
    * El árbol y el historial usan `$state.raw`, no `$state`.
    *
    * `$state` envuelve los objetos en un proxy reactivo profundo, y aquí eso es
    * a la vez innecesario y dañino: las mutaciones nunca modifican el árbol en
    * sitio, siempre devuelven uno nuevo, así que basta con reaccionar al
    * reemplazo. Además `structuredClone` —del que dependen todas las
    * mutaciones— no puede clonar un Proxy y falla con `DataCloneError`.
    */
   #programa = $state.raw<Program>(undefined as unknown as Program);
   #historial = $state.raw<Instantanea[]>([]);
   #futuro = $state.raw<Instantanea[]>([]);

   constructor(fuenteInicial: string) {
      const resultado = parse(fuenteInicial);
      this.#texto = fuenteInicial;
      this.#programa = resultado.program;
      this.#errores = resultado.errors;
   }

   get texto(): string {
      return this.#texto;
   }

   /**
    * El último árbol que compiló.
    *
    * Mientras el texto tiene errores, esto conserva la última versión válida:
    * es lo que permite que el diagrama no se vacíe y vuelva a aparecer con cada
    * tecla mientras el alumno escribe a medias.
    */
   get programa(): Program {
      return this.#programa;
   }

   get errores(): ParseError[] {
      return this.#errores;
   }

   /** ¿El diagrama muestra algo distinto de lo que dice el texto ahora mismo? */
   get desactualizado(): boolean {
      return this.#errores.length > 0;
   }

   get puedeDeshacer(): boolean {
      return this.#historial.length > 0;
   }

   get puedeRehacer(): boolean {
      return this.#futuro.length > 0;
   }

   // -- Edición por texto ---------------------------------------------------

   /** El alumno tecleó en el editor. */
   escribir(texto: string): void {
      if (texto === this.#texto) return;

      this.#texto = texto;
      const resultado = parse(texto);
      this.#errores = resultado.errors;

      if (resultado.errors.length === 0) {
         this.#programa = resultado.program;
      }

      // Escribir a mano invalida el rehacer, como en cualquier editor.
      this.#futuro = [];
   }

   // -- Edición por diagrama ------------------------------------------------

   /**
    * Aplica una mutación al árbol y reimprime el texto.
    *
    * Si la mutación devuelve el mismo árbol (porque no había nada que hacer),
    * no se guarda un paso de deshacer vacío.
    */
   aplicar(mutacion: (programa: Program) => Program): boolean {
      // Con errores de sintaxis pendientes, el árbol y el texto no coinciden.
      // Reimprimir aquí borraría lo que el alumno está escribiendo.
      if (this.#errores.length > 0) return false;

      const siguiente = mutacion(this.#programa);
      if (siguiente === this.#programa) return false;

      this.#empujarHistorial();

      this.#programa = siguiente;
      const texto = print(siguiente);
      this.#texto = texto;
      this.#errores = [];
      this.#futuro = [];

      return true;
   }

   // -- Historial -----------------------------------------------------------

   #empujarHistorial(): void {
      this.#historial = [
         ...this.#historial.slice(-(TOPE_HISTORIAL - 1)),
         { texto: this.#texto, programa: this.#programa },
      ];
   }

   deshacer(): void {
      const anterior = this.#historial.at(-1);
      if (!anterior) return;

      this.#historial = this.#historial.slice(0, -1);
      this.#futuro = [{ texto: this.#texto, programa: this.#programa }, ...this.#futuro];
      this.#restaurar(anterior);
   }

   rehacer(): void {
      const siguiente = this.#futuro[0];
      if (!siguiente) return;

      this.#futuro = this.#futuro.slice(1);
      this.#historial = [...this.#historial, { texto: this.#texto, programa: this.#programa }];
      this.#restaurar(siguiente);
   }

   #restaurar(estado: Instantanea): void {
      this.#programa = estado.programa;
      this.#texto = estado.texto;
      this.#errores = parse(estado.texto).errors;
   }

   /** Reemplaza el documento entero. Lo usará abrir un archivo, en la fase 4. */
   cargar(texto: string): void {
      const resultado = parse(texto);
      this.#texto = texto;
      this.#programa = resultado.program;
      this.#errores = resultado.errors;
      this.#historial = [];
      this.#futuro = [];
   }
}
