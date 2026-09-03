<script lang="ts">
   /**
    * Shell de la aplicación.
    *
    * Mantiene el AST como fuente de verdad y lo proyecta en las dos vistas.
    * En PC se muestran lado a lado; en móvil se alternan con pestañas, porque
    * partir una pantalla de 375 px en dos no sirve para ninguna de las dos.
    */
   import Diagram from './chart/Diagram.svelte';
   import { parse, type ParseError } from './core/parser';
   import { layout } from './chart/layout';
   import { run, type Effect, RuntimeError } from './core/interpreter';
   import { EJEMPLO_INICIAL } from './ui/ejemplos';

   type Vista = 'codigo' | 'diagrama';
   type LineaSalida = { texto: string; tipo: 'salida' | 'error' | 'info' };

   let fuente = $state(EJEMPLO_INICIAL);
   let vista = $state<Vista>('codigo');
   let salida = $state<LineaSalida[]>([]);
   let ejecutando = $state(false);
   let nodoActivo = $state<string | undefined>(undefined);
   let nodoSeleccionado = $state<string | undefined>(undefined);

   /** Petición de dato pendiente mientras corre el algoritmo. */
   let pidiendo = $state<{ variable: string } | null>(null);
   let respuesta = $state('');
   let resolverEntrada: ((valor: string) => void) | null = null;

   // -- Proyecciones del AST ------------------------------------------------

   const analisis = $derived(parse(fuente));

   /**
    * Último árbol que compiló sin errores.
    *
    * Es la pieza que hace usable la edición en vivo: mientras el alumno escribe
    * a medias, el diagrama conserva el último estado válido en vez de vaciarse
    * y volver a aparecer en cada tecla.
    */
   let ultimoValido = $state(parse(EJEMPLO_INICIAL).program);
   $effect(() => {
      if (analisis.errors.length === 0) {
         ultimoValido = analisis.program;
      }
   });

   const diagrama = $derived(layout(ultimoValido));
   const errores = $derived(analisis.errors);
   const desactualizado = $derived(errores.length > 0);

   // -- Ejecución -----------------------------------------------------------

   function escribir(texto: string, tipo: LineaSalida['tipo'] = 'salida') {
      salida = [...salida, { texto, tipo }];
   }

   async function ejecutar() {
      if (ejecutando) return;

      if (errores.length > 0) {
         escribir('Corrige los errores antes de ejecutar.', 'error');
         return;
      }

      salida = [];
      ejecutando = true;
      nodoActivo = undefined;

      const gen = run(analisis.program);
      let pendiente: string | undefined;
      let linea = '';

      try {
         let paso = gen.next();
         let desdeElUltimoRespiro = 0;

         while (!paso.done) {
            const efecto: Effect = paso.value;

            if (efecto.kind === 'output') {
               linea += efecto.text;
               if (efecto.newline) {
                  escribir(linea);
                  linea = '';
               }
            } else if (efecto.kind === 'input') {
               if (linea) {
                  escribir(linea);
                  linea = '';
               }
               pendiente = await pedirDato(efecto.variable);
            } else {
               nodoActivo = efecto.nodeId;
            }

            // Ceder al navegador de vez en cuando: sin esto, un ciclo largo
            // congela la interfaz y en móvil parece que la app se colgó.
            desdeElUltimoRespiro += 1;
            if (desdeElUltimoRespiro >= 2000) {
               desdeElUltimoRespiro = 0;
               await new Promise((r) => setTimeout(r, 0));
            }

            paso = pendiente !== undefined ? gen.next(pendiente) : gen.next();
            pendiente = undefined;
         }

         if (linea) escribir(linea);
         escribir('— Ejecución terminada —', 'info');
      } catch (e) {
         if (linea) escribir(linea);
         if (e instanceof RuntimeError) {
            escribir(
               e.line ? `Error en la línea ${e.line}: ${e.message}` : `Error: ${e.message}`,
               'error',
            );
            nodoSeleccionado = e.nodeId;
         } else {
            throw e;
         }
      } finally {
         ejecutando = false;
         nodoActivo = undefined;
         pidiendo = null;
         resolverEntrada = null;
      }
   }

   function pedirDato(variable: string): Promise<string> {
      pidiendo = { variable };
      respuesta = '';
      return new Promise((resolve) => {
         resolverEntrada = (valor) => {
            pidiendo = null;
            resolve(valor);
         };
      });
   }

   function enviarDato(e: SubmitEvent) {
      e.preventDefault();
      resolverEntrada?.(respuesta);
      respuesta = '';
   }

   function irALinea(err: ParseError) {
      vista = 'codigo';
      const area = document.getElementById('editor') as HTMLTextAreaElement | null;
      if (!area) return;
      const lineas = fuente.split('\n');
      let offset = 0;
      for (let i = 0; i < err.line - 1 && i < lineas.length; i++) {
         offset += lineas[i].length + 1;
      }
      area.focus();
      area.setSelectionRange(offset + err.col - 1, offset + err.col - 1);
   }

   const numerosDeLinea = $derived(fuente.split('\n').map((_, i) => i + 1));
</script>

<div class="app">
   <header>
      <div class="marca">
         <strong>RFlowP</strong>
         <span class="sub">Algoritmos</span>
      </div>

      <nav class="pestanas" role="tablist">
         <button
            role="tab"
            aria-selected={vista === 'codigo'}
            class:activa={vista === 'codigo'}
            onclick={() => (vista = 'codigo')}
         >
            Pseudocódigo
         </button>
         <button
            role="tab"
            aria-selected={vista === 'diagrama'}
            class:activa={vista === 'diagrama'}
            onclick={() => (vista = 'diagrama')}
         >
            Diagrama
         </button>
      </nav>

      <button class="ejecutar" onclick={ejecutar} disabled={ejecutando}>
         {ejecutando ? 'Ejecutando…' : '▶ Ejecutar'}
      </button>
   </header>

   <main>
      <section class="panel codigo" class:oculto-movil={vista !== 'codigo'}>
         <div class="editor-caja">
            <div class="gutter" aria-hidden="true">
               {#each numerosDeLinea as n (n)}
                  <span class:con-error={errores.some((e) => e.line === n)}>{n}</span>
               {/each}
            </div>
            <textarea
               id="editor"
               bind:value={fuente}
               spellcheck="false"
               autocapitalize="off"
               aria-label="Editor de pseudocódigo"
            ></textarea>
         </div>

         {#if errores.length > 0}
            <div class="errores" role="alert">
               <div class="errores-titulo">
                  {errores.length === 1 ? '1 error' : `${errores.length} errores`}
               </div>
               <ul>
                  {#each errores.slice(0, 6) as err, i (i)}
                     <li>
                        <button onclick={() => irALinea(err)}>
                           <span class="linea">línea {err.line}</span>
                           {err.message}
                        </button>
                     </li>
                  {/each}
               </ul>
            </div>
         {/if}
      </section>

      <section class="panel diagrama" class:oculto-movil={vista !== 'diagrama'}>
         {#if desactualizado}
            <div class="aviso">
               El diagrama muestra la última versión que sí compiló.
            </div>
         {/if}
         <Diagram
            diagram={diagrama}
            activeNodeId={nodoActivo}
            selectedNodeId={nodoSeleccionado}
            onSelect={(id) => (nodoSeleccionado = id)}
         />
      </section>
   </main>

   <section class="consola" aria-label="Salida del algoritmo">
      <div class="consola-barra">
         <span>Consola</span>
         <button onclick={() => (salida = [])} disabled={salida.length === 0}>Limpiar</button>
      </div>
      <div class="consola-texto">
         {#if salida.length === 0}
            <p class="vacio">Presiona «Ejecutar» para correr tu algoritmo.</p>
         {/if}
         {#each salida as l, i (i)}
            <div class={l.tipo}>{l.texto}</div>
         {/each}
      </div>
   </section>

   {#if pidiendo}
      <div class="modal-fondo">
         <form class="modal" onsubmit={enviarDato}>
            <label for="dato">
               El algoritmo espera un valor para <code>{pidiendo.variable}</code>
            </label>
            <!-- svelte-ignore a11y_autofocus -->
            <input id="dato" bind:value={respuesta} autocomplete="off" autofocus />
            <button type="submit">Aceptar</button>
         </form>
      </div>
   {/if}
</div>

<style>
   .app {
      display: flex;
      flex-direction: column;
      height: 100dvh;
      background: var(--fondo);
      color: var(--texto);
   }

   header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: var(--superficie);
      border-bottom: 1px solid var(--borde);
      flex-shrink: 0;
   }

   .marca {
      display: flex;
      align-items: baseline;
      gap: 8px;
   }
   .marca strong {
      font-size: 17px;
      letter-spacing: -0.02em;
   }
   .sub {
      color: var(--texto-tenue);
      font-size: 12px;
   }

   .pestanas {
      display: flex;
      gap: 4px;
      margin-left: auto;
      background: var(--fondo);
      padding: 3px;
      border-radius: 10px;
   }
   .pestanas button {
      border: 0;
      background: transparent;
      color: var(--texto-tenue);
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
   }
   .pestanas button.activa {
      background: var(--superficie-alta);
      color: var(--texto);
   }

   .ejecutar {
      border: 0;
      background: var(--acento);
      color: #04140b;
      font-weight: 600;
      padding: 9px 16px;
      border-radius: 9px;
      cursor: pointer;
      font-size: 14px;
   }
   .ejecutar:disabled {
      opacity: 0.55;
      cursor: default;
   }

   main {
      flex: 1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      min-height: 0;
   }

   .panel {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      position: relative;
   }
   .panel.codigo {
      border-right: 1px solid var(--borde);
   }

   .editor-caja {
      flex: 1;
      display: flex;
      min-height: 0;
      overflow: auto;
      background: var(--fondo);
   }

   .gutter {
      display: flex;
      flex-direction: column;
      padding: 14px 8px 14px 12px;
      text-align: right;
      color: var(--texto-debil);
      font-family: var(--fuente-mono);
      font-size: 14px;
      line-height: 1.6;
      user-select: none;
      background: var(--superficie);
      border-right: 1px solid var(--borde);
   }
   .gutter .con-error {
      color: var(--error);
      font-weight: 700;
   }

   textarea {
      flex: 1;
      border: 0;
      outline: none;
      resize: none;
      background: transparent;
      color: var(--texto);
      font-family: var(--fuente-mono);
      font-size: 14px;
      line-height: 1.6;
      padding: 14px 14px 14px 10px;
      white-space: pre;
      overflow-wrap: normal;
      tab-size: 3;
   }

   .errores {
      border-top: 1px solid var(--borde);
      background: var(--superficie);
      max-height: 30%;
      overflow: auto;
      flex-shrink: 0;
   }
   .errores-titulo {
      padding: 8px 14px 4px;
      font-size: 12px;
      font-weight: 700;
      color: var(--error);
      text-transform: uppercase;
      letter-spacing: 0.04em;
   }
   .errores ul {
      margin: 0;
      padding: 0 0 8px;
      list-style: none;
   }
   .errores button {
      display: block;
      width: 100%;
      text-align: left;
      border: 0;
      background: transparent;
      color: var(--texto);
      padding: 5px 14px;
      font-size: 13px;
      cursor: pointer;
   }
   .errores button:hover {
      background: var(--superficie-alta);
   }
   .linea {
      color: var(--texto-tenue);
      margin-right: 6px;
      font-family: var(--fuente-mono);
      font-size: 12px;
   }

   .aviso {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2;
      background: var(--aviso-fondo);
      color: var(--aviso-texto);
      border: 1px solid var(--aviso-borde);
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12px;
      pointer-events: none;
   }

   .consola {
      flex-shrink: 0;
      height: 30vh;
      max-height: 260px;
      display: flex;
      flex-direction: column;
      border-top: 1px solid var(--borde);
      background: var(--superficie);
   }
   .consola-barra {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 14px;
      font-size: 12px;
      color: var(--texto-tenue);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--borde);
   }
   .consola-barra button {
      border: 1px solid var(--borde);
      background: transparent;
      color: var(--texto-tenue);
      border-radius: 7px;
      padding: 3px 10px;
      font-size: 11px;
      cursor: pointer;
      text-transform: none;
      letter-spacing: 0;
   }
   .consola-barra button:disabled {
      opacity: 0.4;
      cursor: default;
   }
   .consola-texto {
      flex: 1;
      overflow: auto;
      padding: 10px 14px;
      font-family: var(--fuente-mono);
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
   }
   .consola-texto .error {
      color: var(--error);
   }
   .consola-texto .info {
      color: var(--texto-debil);
   }
   .vacio {
      color: var(--texto-debil);
      margin: 0;
      font-family: system-ui, sans-serif;
   }

   .modal-fondo {
      position: fixed;
      inset: 0;
      background: rgb(0 0 0 / 0.55);
      display: grid;
      place-items: center;
      padding: 20px;
      z-index: 10;
   }
   .modal {
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-radius: 14px;
      padding: 20px;
      width: min(420px, 100%);
      display: flex;
      flex-direction: column;
      gap: 12px;
   }
   .modal label {
      font-size: 14px;
   }
   .modal code {
      font-family: var(--fuente-mono);
      background: var(--fondo);
      padding: 2px 6px;
      border-radius: 5px;
   }
   .modal input {
      border: 1px solid var(--borde);
      background: var(--fondo);
      color: var(--texto);
      border-radius: 9px;
      padding: 11px 12px;
      font-size: 16px; /* 16px evita que iOS haga zoom al enfocar */
      font-family: var(--fuente-mono);
   }
   .modal button {
      border: 0;
      background: var(--acento);
      color: #04140b;
      font-weight: 600;
      padding: 11px;
      border-radius: 9px;
      cursor: pointer;
      font-size: 15px;
   }

   /* --- Móvil: una vista a la vez ------------------------------------- */
   @media (max-width: 860px) {
      main {
         grid-template-columns: 1fr;
      }
      .panel.oculto-movil {
         display: none;
      }
      .panel.codigo {
         border-right: 0;
      }
      .consola {
         height: 26vh;
      }
   }

   /* En pantallas anchas las pestañas no hacen falta. */
   @media (min-width: 861px) {
      .pestanas {
         display: none;
      }
   }
</style>
