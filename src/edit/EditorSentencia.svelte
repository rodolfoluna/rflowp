<script lang="ts">
   /**
    * Panel de edición de la sentencia seleccionada en el diagrama.
    *
    * Cada tipo de sentencia enseña sus propios campos. Se construye una
    * sentencia nueva y se sustituye la anterior en el árbol, en vez de mutarla:
    * así `reemplazar` puede conservar los comentarios y el historial de
    * deshacer sigue siendo una lista de árboles.
    */
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

   const nodo = $derived(buscarNodo(programa, nodoId));
   const sentencia = $derived(
      nodo && nodo.kind !== 'Program' && nodo.kind !== 'SwitchCase'
         ? (nodo as Statement)
         : undefined,
   );
   const caso = $derived(nodo?.kind === 'SwitchCase' ? nodo : undefined);
   const nombres = $derived(variablesDeclaradas(programa));

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
         {#if caso.tests.length === 1}
            <EditorExpresion
               valor={caso.tests[0]}
               etiqueta="Valor del caso"
               variables={nombres.variables}
               arreglos={nombres.arreglos}
               onCambio={(e) => {
                  const actual = caso;
                  if (!actual) return;
                  onAplicar((p) => {
                     const copia = structuredClone(p);
                     const c = buscarNodo(copia, nodoId);
                     if (c?.kind === 'SwitchCase') c.tests = [structuredClone(e)];
                     return c ? copia : p;
                  });
               }}
            />
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
         <EditorExpresion
            valor={sentencia.values[0] ?? { kind: 'StringLiteral', id: 'tmp', value: '', quote: '"' }}
            etiqueta="Qué mostrar"
            variables={nombres.variables}
            arreglos={nombres.arreglos}
            onCambio={(v) =>
               editar((s) => {
                  const w = s as typeof sentencia;
                  return { ...w, values: [v, ...w.values.slice(1)] };
               })}
         />
         {#if sentencia.values.length > 1}
            <p class="nota">
               Esta salida tiene {sentencia.values.length} partes; aquí se edita la primera.
               Las demás se editan desde el pseudocódigo.
            </p>
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

   footer {
      display: flex;
      gap: 8px;
      padding: 12px 14px;
      border-top: 1px solid var(--borde);
      flex-shrink: 0;
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
