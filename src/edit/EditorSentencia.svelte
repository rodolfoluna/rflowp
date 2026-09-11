<script lang="ts">
   /**
    * Panel de edición de la sentencia seleccionada en el diagrama.
    *
    * Cada tipo de sentencia enseña sus propios campos. Se construye una
    * sentencia nueva y se sustituye la anterior en el árbol, en vez de mutarla:
    * así `reemplazar` puede conservar los comentarios y el historial de
    * deshacer sigue siendo una lista de árboles.
    */
   import { untrack } from 'svelte';
   import EditorExpresion from './EditorExpresion.svelte';
   import { printExpression } from '../core/printer';
   import { DATA_TYPES, nextId, type DataType, type Expression, type Program, type Statement } from '../core/ast';
   import {
      agregarCaso,
      alternarSiNo,
      buscarNodo,
      eliminar,
      eliminarCaso,
      mover,
      puedeMover,
      reemplazar,
      variablesDeclaradas,
   } from './mutaciones';
   import { labelFor } from '../chart/layout';

   interface Props {
      programa: Program;
      nodoId: string;
      onAplicar: (mutacion: (p: Program) => Program) => void;
      onCerrar: () => void;
   }

   let { programa, nodoId, onAplicar, onCerrar }: Props = $props();

   /**
    * Qué parte de una lista está abierta para editar.
    *
    * Se muestra una sola: cada `EditorExpresion` trae su propio teclado de
    * símbolos, y apilar tres deja el panel en un rollo imposible de usar con el
    * pulgar. Las demás se ven como una fila que se toca para abrirla, que es el
    * mismo gesto que ya usa la lista de ejercicios.
    */
   let parteAbierta = $state(0);

   const nodo = $derived(buscarNodo(programa, nodoId));
   const sentencia = $derived(
      nodo && nodo.kind !== 'Program' && nodo.kind !== 'SwitchCase'
         ? (nodo as Statement)
         : undefined,
   );
   const caso = $derived(nodo?.kind === 'SwitchCase' ? nodo : undefined);
   const nombres = $derived(variablesDeclaradas(programa));

   /** Al seleccionar otro símbolo se vuelve a la primera parte. */
   $effect(() => {
      nodoId;
      untrack(() => (parteAbierta = 0));
   });

   /** La abierta, sin salirse si se quitó una parte. */
   function abierta(total: number): number {
      return Math.min(parteAbierta, Math.max(0, total - 1));
   }

   /** Sustituye la sentencia por una versión modificada. */
   function editar(cambio: (s: Statement) => Statement) {
      const actual = sentencia;
      if (!actual) return;
      onAplicar((p) => reemplazar(p, nodoId, cambio(structuredClone(actual))));
   }

   const IDENTIFICADOR = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ_]*$/;

   function esNombreValido(n: string): boolean {
      return IDENTIFICADOR.test(n.trim());
   }

   /**
    * Sustituye los valores de un caso de `Segun`.
    *
    * No pasa por `editar` porque un `SwitchCase` no es una sentencia y
    * `reemplazar` no lo alcanza: hay que buscarlo dentro de una copia del
    * árbol.
    */
   function editarCaso(cambio: (pruebas: Expression[]) => Expression[]) {
      onAplicar((p) => {
         const copia = structuredClone(p);
         const c = buscarNodo(copia, nodoId);
         if (c?.kind !== 'SwitchCase') return p;
         c.tests = cambio(c.tests).map((e) => structuredClone(e));
         return copia;
      });
   }

   /** Una parte de salida en blanco, lista para que el alumno la escriba. */
   function textoVacio(): Expression {
      return { kind: 'StringLiteral', id: nextId('str'), value: '', quote: '"' };
   }

   /** Convierte texto a un identificador o acceso a arreglo, si es válido. */
   function comoDestino(texto: string): Expression | undefined {
      const limpio = texto.trim();
      if (esNombreValido(limpio)) {
         return { kind: 'Identifier', id: nextId('id'), name: limpio };
      }
      return undefined;
   }

   // -- Acciones comunes ----------------------------------------------------

   function borrar() {
      onAplicar((p) => eliminar(p, nodoId));
      onCerrar();
   }

   function subir() {
      onAplicar((p) => mover(p, nodoId, -1));
   }

   function bajar() {
      onAplicar((p) => mover(p, nodoId, 1));
   }
</script>

<div class="panel">
   <header>
      <div class="titulo">
         <span class="tipo">{sentencia ? nombreDeTipo(sentencia) : 'Caso'}</span>
         <span class="resumen">{sentencia ? labelFor(sentencia).replace('\n', ' ') : ''}</span>
      </div>
      <button class="cerrar" onclick={onCerrar} aria-label="Cerrar el panel">✕</button>
   </header>

   <div class="cuerpo">
      {#if caso}
         <!-- Un caso de Segun: sus valores y la opción de quitarlo. -->
         <p class="nota">
            {caso.tests.length === 0
               ? 'Rama por descarte: se toma cuando ningún otro caso coincide.'
               : `Se toma cuando el valor es ${caso.tests.map(printExpression).join(' o ')}.`}
         </p>
         <!--
            Un caso puede cubrir varios valores (`1, 2, 3:`). Se editan todos
            aquí por lo mismo que las partes de una salida: si no, el alumno
            tiene que bajar al pseudocódigo para tocar el segundo.
            La rama por descarte no lleva valores y no admite que se le añadan:
            darle uno la convertiría en otra cosa.
         -->
         {#each caso.tests as prueba, i (prueba.id)}
            {#if i === abierta(caso.tests.length)}
               <div class="parte">
                  <EditorExpresion
                     valor={prueba}
                     etiqueta={caso.tests.length === 1
                        ? 'Valor del caso'
                        : `Valor ${i + 1} de ${caso.tests.length}`}
                     variables={nombres.variables}
                     arreglos={nombres.arreglos}
                     onCambio={(e) =>
                        editarCaso((pruebas) => pruebas.map((x, n) => (n === i ? e : x)))}
                  />
                  {#if caso.tests.length > 1}
                     <button
                        class="quitar"
                        onclick={() => editarCaso((pruebas) => pruebas.filter((_, n) => n !== i))}
                     >
                        Quitar este valor
                     </button>
                  {/if}
               </div>
            {:else}
               <button class="otra-parte" onclick={() => (parteAbierta = i)}>
                  <span class="pos">{i + 1}</span>
                  <span class="valor">{printExpression(prueba)}</span>
               </button>
            {/if}
         {/each}
         {#if caso.tests.length > 0}
            <button
               class="agregar"
               onclick={() => {
                  parteAbierta = caso.tests.length;
                  editarCaso((pruebas) => [...pruebas, textoVacio()]);
               }}
            >
               + Agregar otro valor
            </button>
         {/if}
         <button class="peligro" onclick={() => { onAplicar((p) => eliminarCaso(p, nodoId)); onCerrar(); }}>
            Quitar este caso
         </button>

      {:else if sentencia?.kind === 'AssignStatement'}
         <label class="campo">
            <span>Variable</span>
            <input
               value={printExpression(sentencia.target)}
               onchange={(e) => {
                  const destino = comoDestino(e.currentTarget.value);
                  if (destino && destino.kind === 'Identifier') {
                     editar((s) => ({ ...(s as typeof sentencia), target: destino }));
                  } else {
                     e.currentTarget.value = printExpression(sentencia.target);
                  }
               }}
            />
         </label>
         <EditorExpresion
            valor={sentencia.value}
            etiqueta="Valor a guardar"
            variables={nombres.variables}
            arreglos={nombres.arreglos}
            onCambio={(v) => editar((s) => ({ ...(s as typeof sentencia), value: v }))}
         />

      {:else if sentencia?.kind === 'ReadStatement'}
         <label class="campo">
            <span>Variables a leer (separadas por coma)</span>
            <input
               value={sentencia.targets.map(printExpression).join(', ')}
               onchange={(e) => {
                  const partes = e.currentTarget.value.split(',').map((t) => t.trim());
                  const destinos = partes.map(comoDestino);
                  if (destinos.every((d) => d !== undefined) && destinos.length > 0) {
                     editar((s) => ({
                        ...(s as typeof sentencia),
                        targets: destinos as Array<Extract<Expression, { kind: 'Identifier' }>>,
                     }));
                  } else {
                     e.currentTarget.value = sentencia.targets.map(printExpression).join(', ');
                  }
               }}
            />
         </label>
         <p class="nota">La app pedirá un valor por cada variable al ejecutar.</p>

      {:else if sentencia?.kind === 'WriteStatement'}
         <!--
            Una parte por expresión. `Escribir "Hola, ", nombre` son dos, y
            editar solo la primera obligaba a bajar al pseudocódigo justo en el
            caso más común de todos: un mensaje con un valor dentro.
         -->
         {#each sentencia.values as parte, i (parte.id)}
            {#if i === abierta(sentencia.values.length)}
               <div class="parte">
                  <EditorExpresion
                     valor={parte}
                     etiqueta={sentencia.values.length === 1
                        ? 'Qué mostrar'
                        : `Parte ${i + 1} de ${sentencia.values.length}`}
                     variables={nombres.variables}
                     arreglos={nombres.arreglos}
                     onCambio={(v) =>
                        editar((s) => {
                           const w = s as typeof sentencia;
                           return { ...w, values: w.values.map((x, n) => (n === i ? v : x)) };
                        })}
                  />
                  {#if sentencia.values.length > 1}
                     <button
                        class="quitar"
                        onclick={() =>
                           editar((s) => {
                              const w = s as typeof sentencia;
                              return { ...w, values: w.values.filter((_, n) => n !== i) };
                           })}
                     >
                        Quitar esta parte
                     </button>
                  {/if}
               </div>
            {:else}
               <button class="otra-parte" onclick={() => (parteAbierta = i)}>
                  <span class="pos">{i + 1}</span>
                  <span class="valor">{printExpression(parte)}</span>
               </button>
            {/if}
         {/each}
         <button
            class="agregar"
            onclick={() => {
               parteAbierta = sentencia.values.length;
               editar((s) => {
                  const w = s as typeof sentencia;
                  return { ...w, values: [...w.values, textoVacio()] };
               });
            }}
         >
            + Agregar otra parte
         </button>
         {#if sentencia.values.length > 1}
            <p class="nota">Las partes se muestran seguidas, sin separación entre ellas.</p>
         {/if}
         <label class="interruptor">
            <input
               type="checkbox"
               checked={sentencia.noNewline}
               onchange={(e) => {
                  const marcado = e.currentTarget.checked;
                  editar((s) => ({ ...(s as typeof sentencia), noNewline: marcado }));
               }}
            />
            <span>Sin saltar de línea</span>
         </label>

      {:else if sentencia?.kind === 'DefineStatement'}
         <label class="campo">
            <span>Nombres (separados por coma)</span>
            <input
               value={sentencia.names.join(', ')}
               onchange={(e) => {
                  const partes = e.currentTarget.value.split(',').map((t) => t.trim());
                  if (partes.length > 0 && partes.every(esNombreValido)) {
                     editar((s) => ({ ...(s as typeof sentencia), names: partes }));
                  } else {
                     e.currentTarget.value = sentencia.names.join(', ');
                  }
               }}
            />
         </label>
         <label class="campo">
            <span>Tipo de dato</span>
            <select
               value={sentencia.dataType}
               onchange={(e) => {
                  const t = e.currentTarget.value as DataType;
                  editar((s) => ({ ...(s as typeof sentencia), dataType: t }));
               }}
            >
               {#each DATA_TYPES as t (t)}
                  <option value={t}>{t}</option>
               {/each}
            </select>
         </label>

      {:else if sentencia?.kind === 'DimensionStatement'}
         <label class="campo">
            <span>Nombre del arreglo</span>
            <input
               value={sentencia.arrays[0]?.name ?? ''}
               onchange={(e) => {
                  const n = e.currentTarget.value.trim();
                  if (esNombreValido(n)) {
                     editar((s) => {
                        const d = s as typeof sentencia;
                        return { ...d, arrays: [{ ...d.arrays[0], name: n }, ...d.arrays.slice(1)] };
                     });
                  } else {
                     e.currentTarget.value = sentencia.arrays[0]?.name ?? '';
                  }
               }}
            />
         </label>
         {#if sentencia.arrays[0]}
            <EditorExpresion
               valor={sentencia.arrays[0].sizes[0]}
               etiqueta="Tamaño"
               variables={nombres.variables}
               arreglos={nombres.arreglos}
               onCambio={(v) =>
                  editar((s) => {
                     const d = s as typeof sentencia;
                     return {
                        ...d,
                        arrays: [
                           { ...d.arrays[0], sizes: [v, ...d.arrays[0].sizes.slice(1)] },
                           ...d.arrays.slice(1),
                        ],
                     };
                  })}
            />
         {/if}

      {:else if sentencia?.kind === 'IfStatement'}
         <EditorExpresion
            valor={sentencia.test}
            etiqueta="Condición"
            variables={nombres.variables}
            arreglos={nombres.arreglos}
            onCambio={(v) => editar((s) => ({ ...(s as typeof sentencia), test: v }))}
         />
         <button
            class="secundario"
            onclick={() => onAplicar((p) => alternarSiNo(p, nodoId))}
            disabled={sentencia.alternate !== undefined && sentencia.alternate.length > 0}
         >
            {sentencia.alternate === undefined ? 'Agregar rama SiNo' : 'Quitar rama SiNo'}
         </button>
         {#if sentencia.alternate !== undefined && sentencia.alternate.length > 0}
            <p class="nota">
               La rama SiNo tiene contenido; vacíala antes de quitarla para no perder trabajo.
            </p>
         {/if}

      {:else if sentencia?.kind === 'WhileStatement'}
         <EditorExpresion
            valor={sentencia.test}
            etiqueta="Se repite mientras…"
            variables={nombres.variables}
            arreglos={nombres.arreglos}
            onCambio={(v) => editar((s) => ({ ...(s as typeof sentencia), test: v }))}
         />

      {:else if sentencia?.kind === 'RepeatStatement'}
         <EditorExpresion
            valor={sentencia.test}
            etiqueta="Se repite hasta que…"
            variables={nombres.variables}
            arreglos={nombres.arreglos}
            onCambio={(v) => editar((s) => ({ ...(s as typeof sentencia), test: v }))}
         />
         <p class="nota">El cuerpo se ejecuta al menos una vez.</p>

      {:else if sentencia?.kind === 'ForStatement'}
         <label class="campo">
            <span>Variable de control</span>
            <input
               value={sentencia.variable.name}
               onchange={(e) => {
                  const destino = comoDestino(e.currentTarget.value);
                  if (destino && destino.kind === 'Identifier') {
                     editar((s) => ({ ...(s as typeof sentencia), variable: destino }));
                  } else {
                     e.currentTarget.value = sentencia.variable.name;
                  }
               }}
            />
         </label>
         <EditorExpresion
            valor={sentencia.from}
            etiqueta="Desde"
            variables={nombres.variables}
            arreglos={nombres.arreglos}
            onCambio={(v) => editar((s) => ({ ...(s as typeof sentencia), from: v }))}
         />
         <EditorExpresion
            valor={sentencia.to}
            etiqueta="Hasta"
            variables={nombres.variables}
            arreglos={nombres.arreglos}
            onCambio={(v) => editar((s) => ({ ...(s as typeof sentencia), to: v }))}
         />
         <EditorExpresion
            valor={sentencia.step ?? { kind: 'NumberLiteral', id: 'tmp', value: 1, raw: '1' }}
            etiqueta="Con paso"
            variables={nombres.variables}
            arreglos={nombres.arreglos}
            onCambio={(v) => editar((s) => ({ ...(s as typeof sentencia), step: v }))}
         />

      {:else if sentencia?.kind === 'SwitchStatement'}
         <EditorExpresion
            valor={sentencia.discriminant}
            etiqueta="Valor a comparar"
            variables={nombres.variables}
            arreglos={nombres.arreglos}
            onCambio={(v) => editar((s) => ({ ...(s as typeof sentencia), discriminant: v }))}
         />
         <button
            class="secundario"
            onclick={() =>
               onAplicar((p) =>
                  agregarCaso(p, nodoId, {
                     kind: 'NumberLiteral',
                     id: nextId('num'),
                     value: 0,
                     raw: '0',
                  }),
               )}
         >
            Agregar un caso
         </button>
         <p class="nota">
            Toca un rombo del diagrama para editar o quitar ese caso.
         </p>
      {/if}
   </div>

   {#if sentencia}
      <footer>
         <button onclick={subir} disabled={!puedeMover(programa, nodoId, -1)} aria-label="Subir">
            ↑
         </button>
         <button onclick={bajar} disabled={!puedeMover(programa, nodoId, 1)} aria-label="Bajar">
            ↓
         </button>
         <button class="peligro" onclick={borrar}>Eliminar</button>
      </footer>
   {/if}
</div>

<script module lang="ts">
   import type { Statement as St } from '../core/ast';

   /** Nombre legible del tipo de sentencia, para el encabezado del panel. */
   export function nombreDeTipo(s: St): string {
      switch (s.kind) {
         case 'AssignStatement': return 'Asignación';
         case 'ReadStatement': return 'Lectura';
         case 'WriteStatement': return 'Salida';
         case 'DefineStatement': return 'Definición';
         case 'DimensionStatement': return 'Arreglo';
         case 'IfStatement': return 'Si…Entonces';
         case 'WhileStatement': return 'Mientras';
         case 'RepeatStatement': return 'Repetir';
         case 'ForStatement': return 'Para';
         case 'SwitchStatement': return 'Según';
      }
   }
</script>

<style>
   .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--superficie);
      min-height: 0;
   }

   header {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--borde);
      flex-shrink: 0;
   }

   .titulo {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
   }
   .tipo {
      font-size: 11px;
      font-weight: 700;
      color: var(--acento);
      text-transform: uppercase;
      letter-spacing: 0.06em;
   }
   .resumen {
      font-family: var(--fuente-mono);
      font-size: 13px;
      color: var(--texto);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
   }

   .cerrar {
      margin-left: auto;
      border: 0;
      background: transparent;
      color: var(--texto-tenue);
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
      flex-shrink: 0;
   }

   .cuerpo {
      flex: 1;
      overflow: auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
   }

   .campo {
      display: flex;
      flex-direction: column;
      gap: 6px;
   }
   .campo span {
      font-size: 12px;
      font-weight: 600;
      color: var(--texto-tenue);
      text-transform: uppercase;
      letter-spacing: 0.04em;
   }
   .campo input,
   .campo select {
      border: 1px solid var(--borde);
      background: var(--fondo);
      color: var(--texto);
      border-radius: 9px;
      padding: 10px 12px;
      font-family: var(--fuente-mono);
      /* 16px evita el zoom automático de iOS al enfocar. */
      font-size: 16px;
   }
   .campo input:focus,
   .campo select:focus {
      outline: none;
      border-color: var(--acento);
   }

   .interruptor {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 14px;
      cursor: pointer;
   }
   .interruptor input {
      width: 18px;
      height: 18px;
      accent-color: var(--acento);
   }

   .nota {
      margin: 0;
      font-size: 12px;
      color: var(--texto-tenue);
      line-height: 1.5;
   }

   /* Las partes de una salida: cada una con su editor y su forma de quitarla. */
   .parte {
      display: flex;
      flex-direction: column;
      gap: 5px;
   }
   /* Las partes cerradas: una fila que se toca para abrirla. */
   .otra-parte {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      text-align: left;
      border: 1px solid var(--borde);
      background: var(--fondo);
      color: var(--texto);
      border-radius: 9px;
      min-height: 42px;
      padding: 0 11px;
      cursor: pointer;
      font-family: inherit;
      font-size: 13.5px;
   }
   .otra-parte:hover {
      background: var(--superficie-alta);
   }
   .otra-parte .pos {
      font-family: var(--fuente-mono);
      font-size: 11px;
      color: var(--texto-debil);
      flex-shrink: 0;
   }
   .otra-parte .valor {
      font-family: var(--fuente-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
   }

   .quitar {
      align-self: flex-start;
      border: 0;
      background: transparent;
      color: var(--texto-debil);
      font-size: 12px;
      padding: 3px 0;
      cursor: pointer;
      text-decoration: underline;
      font-family: inherit;
   }
   .quitar:hover {
      color: var(--error);
   }
   .agregar {
      border: 1px dashed var(--borde);
      background: transparent;
      color: var(--texto-tenue);
      border-radius: 9px;
      /* Alto cómodo para el pulgar: se toca en el panel de un móvil. */
      min-height: 42px;
      padding: 0 12px;
      cursor: pointer;
      font-size: 13.5px;
      font-family: inherit;
   }
   .agregar:hover {
      border-style: solid;
      color: var(--texto);
   }

   .secundario {
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 9px;
      padding: 10px;
      cursor: pointer;
      font-size: 14px;
   }
   .secundario:disabled {
      opacity: 0.5;
      cursor: default;
   }

   /*
    * El pie se queda fijo mientras el cuerpo se desplaza: «Eliminar» y las
    * flechas son lo que más se busca y no pueden depender de haber leído
    * hasta el final del formulario.
    */
   footer {
      display: flex;
      gap: 8px;
      padding: 12px 14px;
      /* En un teléfono sin bordes, la barra de gestos se come este borde. */
      padding-bottom: max(12px, env(safe-area-inset-bottom));
      border-top: 1px solid var(--borde);
      flex-shrink: 0;
      background: var(--superficie);
   }
   footer button {
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 9px;
      min-width: 44px;
      min-height: 42px;
      padding: 0 12px;
      cursor: pointer;
      font-size: 15px;
   }
   footer button:disabled {
      opacity: 0.4;
      cursor: default;
   }

   .peligro {
      margin-left: auto;
      border-color: var(--error) !important;
      color: var(--error) !important;
      background: transparent !important;
   }
</style>
