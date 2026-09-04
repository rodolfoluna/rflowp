<script lang="ts">
   /**
    * Editor de expresiones con teclado propio.
    *
    * Tres razones para no usar solo el teclado del sistema:
    *  - En móvil, teclear `<>` o `%` entre teclados de símbolos es un suplicio.
    *  - Las fichas de variables evitan la mitad de los errores de escritura,
    *    que son variables mal tecleadas.
    *  - De paso elimina la vía natural de pegar código de fuera, que es uno de
    *    los objetivos del proyecto.
    *
    * El campo sigue siendo texto y se valida con `parseExpresion`, es decir con
    * la MISMA gramática del editor de pseudocódigo. Tener dos nociones de
    * "expresión válida" sería garantía de que acaben divergiendo.
    */
   import { untrack } from 'svelte';
   import { parseExpresion } from '../core/parser';
   import { printExpression } from '../core/printer';
   import type { Expression } from '../core/ast';

   interface Props {
      /** Expresión inicial. */
      valor: Expression;
      etiqueta: string;
      variables: string[];
      arreglos: string[];
      /** Solo se llama con expresiones que ya parsearon bien. */
      onCambio: (expresion: Expression) => void;
   }

   let { valor, etiqueta, variables, arreglos, onCambio }: Props = $props();

   // El borrador arranca con la expresión recibida. `untrack` deja claro que es
   // un valor inicial y no una dependencia: sin él, Svelte avisa (con razón) de
   // que se está capturando solo la primera lectura de una prop reactiva.
   let texto = $state(untrack(() => printExpression(valor)));
   let campo: HTMLInputElement | undefined = $state();

   /**
    * Reinicia el borrador cuando llega otra expresión: al seleccionar otro
    * símbolo, o después de aplicar un cambio (que produce un nodo nuevo).
    * La escritura va dentro de `untrack` para que el efecto dependa solo de
    * `valor` y no se vuelva a disparar con cada tecla.
    */
   $effect(() => {
      const recibido = printExpression(valor);
      untrack(() => {
         texto = recibido;
      });
   });

   const analisis = $derived(parseExpresion(texto));
   const valida = $derived(analisis.expresion !== null);
   const sinCambios = $derived(texto === printExpression(valor));

   const OPERADORES = ['+', '-', '*', '/', '%', '^'];
   const COMPARADORES = ['=', '<>', '<', '<=', '>', '>='];
   const LOGICOS = ['Y', 'O', 'NO'];
   const FUNCIONES = ['raiz', 'abs', 'trunc', 'redon', 'longitud', 'azar'];

   /** Inserta texto en la posición del cursor, no al final. */
   function insertar(fragmento: string, desplazarCursor = 0) {
      const el = campo;
      const inicio = el?.selectionStart ?? texto.length;
      const fin = el?.selectionEnd ?? texto.length;

      texto = texto.slice(0, inicio) + fragmento + texto.slice(fin);

      const nuevaPos = inicio + fragmento.length + desplazarCursor;
      queueMicrotask(() => {
         el?.focus();
         el?.setSelectionRange(nuevaPos, nuevaPos);
      });
   }

   function insertarOperador(op: string) {
      // Los operadores en palabra necesitan espacios alrededor para no pegarse
      // al identificador anterior y volverse otro nombre.
      const necesitaEspacios = /^[A-Za-z]+$/.test(op);
      insertar(necesitaEspacios ? ` ${op} ` : ` ${op} `);
   }

   function borrar() {
      const el = campo;
      const inicio = el?.selectionStart ?? texto.length;
      const fin = el?.selectionEnd ?? texto.length;

      if (inicio !== fin) {
         texto = texto.slice(0, inicio) + texto.slice(fin);
         queueMicrotask(() => el?.setSelectionRange(inicio, inicio));
      } else if (inicio > 0) {
         texto = texto.slice(0, inicio - 1) + texto.slice(inicio);
         queueMicrotask(() => el?.setSelectionRange(inicio - 1, inicio - 1));
      }
      el?.focus();
   }

   function aceptar() {
      if (analisis.expresion) onCambio(analisis.expresion);
   }

   function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Enter') {
         e.preventDefault();
         aceptar();
      }
   }
</script>

<div class="editor">
   <label for="expr">{etiqueta}</label>

   <div class="campo" class:invalida={!valida && texto.trim() !== ''}>
      <input
         id="expr"
         bind:this={campo}
         bind:value={texto}
         onkeydown={alTeclear}
         spellcheck="false"
         autocapitalize="off"
         autocomplete="off"
         inputmode="text"
      />
      <button class="borrar" onclick={borrar} aria-label="Borrar un carácter">⌫</button>
   </div>

   {#if !valida && texto.trim() !== ''}
      <p class="error">{analisis.errores[0]?.message}</p>
   {/if}

   <div class="teclado">
      {#if variables.length > 0 || arreglos.length > 0}
         <div class="fila fichas">
            {#each variables as v (v)}
               <button class="ficha var" onclick={() => insertar(v)}>{v}</button>
            {/each}
            {#each arreglos as a (a)}
               <!-- El cursor queda dentro de los corchetes, listo para el índice. -->
               <button class="ficha arr" onclick={() => insertar(`${a}[]`, -1)}>
                  {a}[ ]
               </button>
            {/each}
         </div>
      {/if}

      <div class="fila">
         {#each OPERADORES as op (op)}
            <button class="tecla" onclick={() => insertarOperador(op)}>{op}</button>
         {/each}
         <button class="tecla" onclick={() => insertar('(')}>(</button>
         <button class="tecla" onclick={() => insertar(')')}>)</button>
      </div>

      <div class="fila">
         {#each COMPARADORES as op (op)}
            <button class="tecla" onclick={() => insertarOperador(op)}>{op}</button>
         {/each}
      </div>

      <div class="fila">
         {#each LOGICOS as op (op)}
            <button class="tecla palabra" onclick={() => insertarOperador(op)}>{op}</button>
         {/each}
         <button class="tecla palabra" onclick={() => insertar('Verdadero')}>Verdadero</button>
         <button class="tecla palabra" onclick={() => insertar('Falso')}>Falso</button>
      </div>

      <div class="fila">
         {#each FUNCIONES as f (f)}
            <button class="tecla palabra" onclick={() => insertar(`${f}()`, -1)}>
               {f}()
            </button>
         {/each}
         <button class="tecla palabra" onclick={() => insertar('""', -1)}>" "</button>
      </div>
   </div>

   <button class="aceptar" onclick={aceptar} disabled={!valida || sinCambios}>
      {sinCambios ? 'Sin cambios' : valida ? 'Aplicar' : 'Corrige la expresión'}
   </button>
</div>

<style>
   .editor {
      display: flex;
      flex-direction: column;
      gap: 8px;
   }

   label {
      font-size: 12px;
      font-weight: 600;
      color: var(--texto-tenue);
      text-transform: uppercase;
      letter-spacing: 0.04em;
   }

   .campo {
      display: flex;
      align-items: stretch;
      border: 1px solid var(--borde);
      border-radius: 9px;
      background: var(--fondo);
      overflow: hidden;
   }
   .campo:focus-within {
      border-color: var(--acento);
   }
   .campo.invalida {
      border-color: var(--error);
   }

   input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--texto);
      font-family: var(--fuente-mono);
      /* 16px evita que iOS haga zoom al enfocar el campo. */
      font-size: 16px;
      padding: 10px 12px;
   }

   .borrar {
      border: 0;
      border-left: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      padding: 0 14px;
      cursor: pointer;
      font-size: 15px;
   }

   .error {
      margin: 0;
      color: var(--error);
      font-size: 12px;
   }

   .teclado {
      display: flex;
      flex-direction: column;
      gap: 6px;
   }

   .fila {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
   }

   .fila.fichas {
      padding-bottom: 6px;
      border-bottom: 1px dashed var(--borde);
   }

   .tecla,
   .ficha {
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 7px;
      /* 40px de alto: el mínimo cómodo para el pulgar. */
      min-width: 40px;
      min-height: 40px;
      padding: 0 10px;
      font-family: var(--fuente-mono);
      font-size: 14px;
      cursor: pointer;
   }
   .tecla:active,
   .ficha:active {
      background: var(--acento);
      color: #04140b;
   }

   .tecla.palabra {
      font-size: 13px;
   }

   .ficha.var {
      background: color-mix(in srgb, var(--c-entrada) 30%, var(--superficie-alta));
      border-color: var(--c-entrada);
   }
   .ficha.arr {
      background: color-mix(in srgb, var(--c-para) 30%, var(--superficie-alta));
      border-color: var(--c-para);
   }

   .aceptar {
      border: 0;
      background: var(--acento);
      color: #04140b;
      font-weight: 600;
      padding: 11px;
      border-radius: 9px;
      cursor: pointer;
      font-size: 15px;
   }
   .aceptar:disabled {
      background: var(--superficie-alta);
      color: var(--texto-debil);
      cursor: default;
   }
</style>
