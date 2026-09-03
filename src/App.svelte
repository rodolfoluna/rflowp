<script lang="ts">
   /**
    * Shell de la aplicación.
    *
    * El AST es la fuente de verdad y se proyecta en las dos vistas. En PC se
    * muestran lado a lado; en móvil se alternan con pestañas, porque partir una
    * pantalla de 375 px en dos no sirve para ninguna de las dos.
    */
   import { onMount } from 'svelte';
   import Diagram from './chart/Diagram.svelte';
   import Paleta from './edit/Paleta.svelte';
   import EditorSentencia from './edit/EditorSentencia.svelte';
   import Bienvenida from './identity/Bienvenida.svelte';
   import BorrarDatos from './identity/BorrarDatos.svelte';
   import PanelArchivos from './file/PanelArchivos.svelte';
   import MenuPrincipal from './ui/MenuPrincipal.svelte';
   import PedirTexto from './ui/PedirTexto.svelte';
   import { layout, type InsertPoint } from './chart/layout';
   import { run, type Effect, RuntimeError } from './core/interpreter';
   import type { ParseError } from './core/parser';
   import { print } from './core/printer';
   import type { Program } from './core/ast';
   import { Documento } from './edit/documento.svelte';
   import { crearSentencia, insertar, type Posicion, type TipoSentencia } from './edit/mutaciones';
   import { crearIdentidad, type Identidad } from './identity/identidad';
   import {
      almacenArchivosEnMemoria,
      almacenArchivosOPFS,
      almacenIdentidadIndexedDB,
      hayOPFS,
      pedirPersistencia,
   } from './file/almacenes';
   import { Biblioteca, type ContextoCripto } from './file/biblioteca.svelte';
   import { nombreSugerido } from './file/algx';
   import { descargar } from './file/transferencia';
   import PanelProfesor from './crypto/PanelProfesor.svelte';
   import {
      almacenLlavesIndexedDB,
      almacenProfesorIndexedDB,
      generarLlavesAlumno,
      type ConfigProfesor,
      type LlavesAlumno,
   } from './crypto/llaves';
   import { APP_VERSION } from './ui/version';
   import { EJEMPLO_INICIAL } from './ui/ejemplos';

   type Vista = 'codigo' | 'diagrama';
   type LineaSalida = { texto: string; tipo: 'salida' | 'error' | 'info' };

   const doc = new Documento(EJEMPLO_INICIAL);

   const almacenIdentidad = almacenIdentidadIndexedDB();
   const almacenLlaves = almacenLlavesIndexedDB();
   const almacenProfesor = almacenProfesorIndexedDB();

   /** Llaves de esta instalación. Sin ellas no se puede cifrar ni abrir nada. */
   let llaves = $state.raw<LlavesAlumno | null>(null);
   /** Llave del curso: la pública del profesor y, en modo profesor, la privada. */
   let configProfesor = $state.raw<ConfigProfesor | null>(null);

   const modoProfesor = $derived(configProfesor?.privada != null);

   // Sin OPFS no se puede guardar entre sesiones, pero la app debe seguir
   // siendo usable: se cae a un almacén en memoria y se avisa.
   const biblioteca = new Biblioteca(
      hayOPFS() ? almacenArchivosOPFS() : almacenArchivosEnMemoria(),
      APP_VERSION,
      (): ContextoCripto => ({
         alumno: llaves,
         profesorPublica: configProfesor?.publica ?? null,
         profesorPrivada: configProfesor?.privada ?? null,
      }),
   );

   let identidad = $state<Identidad | null>(null);
   let arrancando = $state(true);
   let sinAlmacenamiento = $state(false);
   let restauradoDeBorrador = false;

   /** Archivo de la biblioteca que está abierto, si lo hay. */
   let archivoAbiertoId = $state<string | undefined>(undefined);
   let tituloActual = $state('Sin título');

   let menuAbierto = $state(false);
   let panelArchivos = $state(false);
   let panelProfesor = $state(false);
   let borrandoDatos = $state(false);
   /** Cuando no es null, se está pidiendo un título para guardar. */
   let pidiendoTitulo = $state<{ como: boolean } | null>(null);
   let aviso = $state<string | null>(null);

   let vista = $state<Vista>('diagrama');
   let salida = $state<LineaSalida[]>([]);
   let ejecutando = $state(false);
   let nodoActivo = $state<string | undefined>(undefined);
   let nodoSeleccionado = $state<string | undefined>(undefined);

   /** Posición pendiente mientras la paleta está abierta. */
   let insercionPendiente = $state<Posicion | null>(null);

   /** Petición de dato pendiente mientras corre el algoritmo. */
   let pidiendo = $state<{ variable: string } | null>(null);
   let respuesta = $state('');
   let resolverEntrada: ((valor: string) => void) | null = null;

   const diagrama = $derived(layout(doc.programa));
   const numerosDeLinea = $derived(doc.texto.split('\n').map((_, i) => i + 1));

   /**
    * Durante la ejecución no se edita, y con errores de sintaxis tampoco.
    * Lo primero, porque mover el árbol dejaría el resaltado apuntando a nodos
    * que ya no existen; lo segundo, porque reimprimir el árbol borraría lo que
    * el alumno está escribiendo a medias.
    */
   const editable = $derived(!ejecutando && doc.errores.length === 0);

   // -- Arranque ------------------------------------------------------------

   onMount(async () => {
      sinAlmacenamiento = !hayOPFS();
      try {
         identidad = await almacenIdentidad.leer();
      } catch {
         // Con IndexedDB bloqueado (modo privado de algunos navegadores) no se
         // puede recordar la identidad, pero se puede trabajar en la sesión.
         identidad = null;
         sinAlmacenamiento = true;
      }

      try {
         llaves = await almacenLlaves.leer();
         configProfesor = await almacenProfesor.leer();
      } catch {
         llaves = null;
      }

      // Identidad sin llaves: pasó por una versión anterior al cifrado. Se le
      // generan ahora para que pueda seguir trabajando.
      if (identidad && !llaves) {
         llaves = await generarLlavesAlumno();
         try {
            await almacenLlaves.guardar(llaves);
         } catch {
            sinAlmacenamiento = true;
         }
      }

      if (identidad) {
         await biblioteca.refrescar(identidad.deviceId);

         // Recuperar el trabajo en curso. Se hace antes de mostrar nada para
         // que el alumno no vea aparecer el ejemplo y luego cambiar solo.
         const borrador = await biblioteca.leerBorrador();
         if (borrador) {
            doc.cargar(borrador.texto);
            tituloActual = borrador.titulo;
            archivoAbiertoId = borrador.archivoId;
            restauradoDeBorrador = true;
         }
      }
      arrancando = false;

      if (restauradoDeBorrador) {
         anunciar('Se recuperó tu trabajo sin guardar');
      }
   });

   /**
    * Guarda el borrador cuando el documento cambia, con un respiro para no
    * escribir en disco en cada tecla.
    *
    * Se guarda el texto y no el árbol a propósito: lo que hay que recuperar es
    * exactamente lo que el alumno tenía escrito, aunque no compile.
    */
   $effect(() => {
      const texto = doc.texto;
      const titulo = tituloActual;
      const archivoId = archivoAbiertoId;

      if (arrancando || !identidad) return;

      const temporizador = setTimeout(() => {
         void biblioteca.guardarBorrador({ texto, titulo, archivoId });
      }, 1200);

      return () => clearTimeout(temporizador);
   });

   async function registrar(datos: {
      numeroControl: string;
      nombre: string;
      grupo?: string;
   }) {
      const nueva = crearIdentidad(datos, () => crypto.randomUUID());
      // Las llaves se generan junto con la identidad: son la misma cosa desde
      // el punto de vista del alumno, y sin ellas no podría guardar nada.
      const nuevasLlaves = await generarLlavesAlumno();

      try {
         await almacenIdentidad.guardar(nueva);
         await almacenLlaves.guardar(nuevasLlaves);
      } catch {
         sinAlmacenamiento = true;
      }
      llaves = nuevasLlaves;
      identidad = nueva;
      // Se pide justo aquí, tras un gesto del usuario: es cuando el navegador
      // es más propenso a concederla.
      await pedirPersistencia();
      await biblioteca.refrescar(nueva.deviceId);
   }

   // -- Archivos ------------------------------------------------------------

   function anunciar(texto: string) {
      aviso = texto;
      setTimeout(() => {
         if (aviso === texto) aviso = null;
      }, 4000);
   }

   async function guardar(titulo?: string) {
      if (!identidad) return;

      // Sin título previo hay que pedirlo: guardar en silencio con un nombre
      // inventado deja al alumno con una lista de «Sin título».
      if (!titulo && !archivoAbiertoId) {
         pidiendoTitulo = { como: false };
         return;
      }

      try {
         const id = await biblioteca.guardar({
            programa: doc.programa,
            titulo: titulo ?? tituloActual,
            identidad,
            id: titulo ? undefined : archivoAbiertoId,
         });
         archivoAbiertoId = id;
         if (titulo) tituloActual = titulo;
         anunciar(`Guardado «${tituloActual}»`);
      } catch (e) {
         anunciar(e instanceof Error ? e.message : 'No se pudo guardar.');
      }
   }

   async function abrirArchivo(id: string) {
      try {
         const archivo = await biblioteca.abrir(id);
         // Se carga como texto para que el árbol y el pseudocódigo queden
         // consistentes desde el primer momento.
         doc.cargar(print(archivo.contenido.programa));
         archivoAbiertoId = id;
         tituloActual = archivo.encabezado.titulo;
         nodoSeleccionado = undefined;
         panelArchivos = false;

         if (archivo.como === 'profesor' && !archivo.firmaValida) {
            // Lo más importante que puede saber un profesor al abrir una
            // entrega: el encabezado no coincide con lo que se firmó.
            anunciar(`⚠ «${tituloActual}»: el archivo fue alterado después de crearse.`);
         } else if (archivo.como === 'profesor') {
            anunciar(`Abierto «${tituloActual}» de ${archivo.encabezado.autor.nombre}`);
         } else {
            anunciar(`Abierto «${tituloActual}»`);
         }
      } catch (e) {
         anunciar(e instanceof Error ? e.message : 'No se pudo abrir.');
      }
   }

   function nuevoAlgoritmo() {
      doc.cargar(EJEMPLO_INICIAL);
      archivoAbiertoId = undefined;
      tituloActual = 'Sin título';
      nodoSeleccionado = undefined;
      menuAbierto = false;
      anunciar('Algoritmo nuevo');
   }

   /** Vuelve a arrancar limpio tras borrar los datos. */
   async function reiniciarDocumento() {
      await biblioteca.borrarBorrador();
      doc.cargar(EJEMPLO_INICIAL);
      archivoAbiertoId = undefined;
      tituloActual = 'Sin título';
   }

   /**
    * Exporta el algoritmo actual, esté guardado o no.
    * Se construye el archivo al vuelo para no obligar a guardar antes de
    * entregar: es un paso extra que el alumno olvidaría justo al final.
    */
   async function exportar() {
      if (!identidad) return;
      menuAbierto = false;

      try {
         const { encabezado, texto } = await biblioteca.construir({
            programa: doc.programa,
            titulo: tituloActual,
            identidad,
         });
         const nombre = nombreSugerido(encabezado);
         descargar(nombre, texto);
         anunciar(
            configProfesor?.publica
               ? `Se descargó ${nombre}`
               : `Se descargó ${nombre}, pero tu profesor no podrá abrirlo: falta la llave del curso.`,
         );
      } catch (e) {
         anunciar(e instanceof Error ? e.message : 'No se pudo exportar.');
      }
   }

   async function borrarDatos() {
      try {
         await almacenIdentidad.borrar();
         // Destruir la llave maestra es lo que hace real la advertencia del
         // diálogo: sin ella, los archivos ya exportados dejan de abrirse en
         // esta app, y solo el profesor puede recuperarlos.
         await almacenLlaves.borrar();
      } catch {
         // Si no se pudo tocar IndexedDB igual se limpia la sesión.
      }
      llaves = null;
      await biblioteca.borrarTodo();

      await reiniciarDocumento();
      identidad = null;
      borrandoDatos = false;
      menuAbierto = false;
      panelArchivos = false;
   }

   // -- Edición gráfica -----------------------------------------------------

   function aplicar(mutacion: (p: Program) => Program) {
      doc.aplicar(mutacion);
   }

   function abrirPaleta(punto: InsertPoint) {
      insercionPendiente = {
         ownerId: punto.ownerId,
         blockKey: punto.blockKey,
         index: punto.index,
      };
   }

   function elegirDeLaPaleta(tipo: TipoSentencia) {
      const posicion = insercionPendiente;
      insercionPendiente = null;
      if (!posicion) return;

      const sentencia = crearSentencia(tipo);
      doc.aplicar((p) => insertar(p, posicion, sentencia));
      // Seleccionar lo recién puesto: el alumno casi siempre quiere editarlo ya.
      nodoSeleccionado = sentencia.id;
   }

   function alSeleccionar(id: string) {
      nodoSeleccionado = nodoSeleccionado === id ? undefined : id;
   }

   // -- Ejecución -----------------------------------------------------------

   function escribir(texto: string, tipo: LineaSalida['tipo'] = 'salida') {
      salida = [...salida, { texto, tipo }];
   }

   async function ejecutar() {
      if (ejecutando) return;

      if (doc.errores.length > 0) {
         escribir('Corrige los errores antes de ejecutar.', 'error');
         return;
      }

      salida = [];
      ejecutando = true;
      nodoActivo = undefined;
      nodoSeleccionado = undefined;

      const gen = run(doc.programa);
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
      const lineas = doc.texto.split('\n');
      let offset = 0;
      for (let i = 0; i < err.line - 1 && i < lineas.length; i++) {
         offset += lineas[i].length + 1;
      }
      area.focus();
      area.setSelectionRange(offset + err.col - 1, offset + err.col - 1);
   }

   function atajos(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;

      // Dentro del editor de texto manda el deshacer nativo del textarea, que
      // es el que el alumno espera mientras escribe.
      if ((e.target as HTMLElement | null)?.id === 'editor') return;

      if (e.key === 'z' && !e.shiftKey) {
         e.preventDefault();
         doc.deshacer();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
         e.preventDefault();
         doc.rehacer();
      }
   }
</script>

<svelte:window onkeydown={atajos} />

{#if arrancando}
   <div class="arrancando">Cargando…</div>
{:else if !identidad}
   <Bienvenida onListo={registrar} />
{:else}
<div class="app">
   <header>
      <div class="marca">
         <strong>RFlowP</strong>
         <span class="sub">Algoritmos</span>
      </div>

      <div class="historial">
         <button
            onclick={() => doc.deshacer()}
            disabled={!doc.puedeDeshacer}
            title="Deshacer"
            aria-label="Deshacer"
         >
            ↶
         </button>
         <button
            onclick={() => doc.rehacer()}
            disabled={!doc.puedeRehacer}
            title="Rehacer"
            aria-label="Rehacer"
         >
            ↷
         </button>
      </div>

      <button
         class="menu"
         onclick={() => (menuAbierto = true)}
         aria-label="Menú y archivos"
         title="Menú y archivos"
      >
         ⋮
      </button>

      <div class="pestanas" role="tablist">
         <button
            role="tab"
            aria-selected={vista === 'codigo'}
            class:activa={vista === 'codigo'}
            onclick={() => (vista = 'codigo')}
         >
            <span class="largo">Pseudocódigo</span><span class="corto">Código</span>
         </button>
         <button
            role="tab"
            aria-selected={vista === 'diagrama'}
            class:activa={vista === 'diagrama'}
            onclick={() => (vista = 'diagrama')}
         >
            Diagrama
         </button>
      </div>

      <button
         class="ejecutar"
         onclick={ejecutar}
         disabled={ejecutando}
         aria-label="Ejecutar el algoritmo"
      >
         <span class="largo">{ejecutando ? 'Ejecutando…' : '▶ Ejecutar'}</span>
         <span class="corto">{ejecutando ? '…' : '▶'}</span>
      </button>
   </header>

   <main>
      <section class="panel codigo" class:oculto-movil={vista !== 'codigo'}>
         <div class="editor-caja">
            <div class="gutter" aria-hidden="true">
               {#each numerosDeLinea as n (n)}
                  <span class:con-error={doc.errores.some((e) => e.line === n)}>{n}</span>
               {/each}
            </div>
            <textarea
               id="editor"
               value={doc.texto}
               oninput={(e) => doc.escribir(e.currentTarget.value)}
               spellcheck="false"
               autocapitalize="off"
               aria-label="Editor de pseudocódigo"
            ></textarea>
         </div>

         {#if doc.errores.length > 0}
            <div class="errores" role="alert">
               <div class="errores-titulo">
                  {doc.errores.length === 1 ? '1 error' : `${doc.errores.length} errores`}
               </div>
               <ul>
                  {#each doc.errores.slice(0, 6) as err, i (i)}
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
         {#if doc.desactualizado}
            <div class="aviso">
               El diagrama muestra la última versión que sí compiló. No se puede editar
               hasta corregir el pseudocódigo.
            </div>
         {/if}

         <Diagram
            diagram={diagrama}
            activeNodeId={nodoActivo}
            selectedNodeId={nodoSeleccionado}
            onSelect={alSeleccionar}
            {editable}
            onInsertar={abrirPaleta}
         />

         {#if nodoSeleccionado && editable}
            <aside class="inspector">
               <EditorSentencia
                  programa={doc.programa}
                  nodoId={nodoSeleccionado}
                  onAplicar={aplicar}
                  onCerrar={() => (nodoSeleccionado = undefined)}
               />
            </aside>
         {/if}
      </section>
   </main>

   <section class="consola" aria-label="Salida del algoritmo">
      <div class="consola-barra">
         <span>Consola</span>
         <button onclick={() => (salida = [])} disabled={salida.length === 0}>Limpiar</button>
      </div>
      <div class="consola-texto">
         {#if salida.length === 0}
            <p class="vacio">
               Toca un <strong>+</strong> del diagrama para agregar un bloque, o presiona
               «Ejecutar».
            </p>
         {/if}
         {#each salida as l, i (i)}
            <div class={l.tipo}>{l.texto}</div>
         {/each}
      </div>
   </section>

   {#if insercionPendiente}
      <Paleta onElegir={elegirDeLaPaleta} onCerrar={() => (insercionPendiente = null)} />
   {/if}

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

   {#if menuAbierto}
      <MenuPrincipal
         {identidad}
         {tituloActual}
         hayArchivoAbierto={archivoAbiertoId !== undefined}
         onGuardar={() => {
            menuAbierto = false;
            guardar();
         }}
         onGuardarComo={() => {
            menuAbierto = false;
            pidiendoTitulo = { como: true };
         }}
         onNuevo={nuevoAlgoritmo}
         onArchivos={() => {
            menuAbierto = false;
            panelArchivos = true;
         }}
         onExportar={exportar}
         onLlaveCurso={() => {
            menuAbierto = false;
            panelProfesor = true;
         }}
         llaveCurso={configProfesor
            ? `${configProfesor.etiqueta}${modoProfesor ? ' · modo profesor' : ''}`
            : null}
         onBorrarDatos={() => {
            menuAbierto = false;
            borrandoDatos = true;
         }}
         onCerrar={() => (menuAbierto = false)}
      />
   {/if}

   {#if panelArchivos}
      <div class="capa-archivos">
         <PanelArchivos
            {biblioteca}
            abiertoId={archivoAbiertoId}
            deviceId={identidad.deviceId}
            onAbrir={abrirArchivo}
            onCerrar={() => (panelArchivos = false)}
         />
      </div>
   {/if}

   {#if pidiendoTitulo}
      <PedirTexto
         titulo={pidiendoTitulo.como ? 'Guardar una copia' : 'Guardar algoritmo'}
         etiqueta="Nombre del algoritmo"
         valorInicial={pidiendoTitulo.como ? `${tituloActual} (copia)` : ''}
         textoBoton="Guardar"
         onAceptar={(titulo) => {
            pidiendoTitulo = null;
            guardar(titulo);
         }}
         onCancelar={() => (pidiendoTitulo = null)}
      />
   {/if}

   {#if panelProfesor}
      <PanelProfesor
         config={configProfesor}
         onGuardar={async (config) => {
            await almacenProfesor.guardar(config);
            configProfesor = config;
         }}
         onQuitar={async () => {
            await almacenProfesor.borrar();
            configProfesor = null;
         }}
         onCerrar={() => (panelProfesor = false)}
      />
   {/if}

   {#if borrandoDatos}
      <BorrarDatos
         {identidad}
         guardados={biblioteca.archivos.length}
         hayLlaveDeProfesor={configProfesor?.publica != null}
         onConfirmar={borrarDatos}
         onCancelar={() => (borrandoDatos = false)}
      />
   {/if}

   {#if aviso}
      <div class="aviso-flotante" role="status">{aviso}</div>
   {/if}

   {#if sinAlmacenamiento}
      <div class="aviso-flotante persistente" role="alert">
         Este navegador no deja guardar en el dispositivo. Podrás trabajar y exportar,
         pero lo guardado se perderá al cerrar.
      </div>
   {/if}
</div>
{/if}

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

   /* Etiquetas alternativas: la larga en PC, la corta en móvil. */
   .corto {
      display: none;
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

   .historial {
      display: flex;
      gap: 4px;
   }
   .historial button {
      border: 1px solid var(--borde);
      background: transparent;
      color: var(--texto);
      border-radius: 8px;
      width: 34px;
      height: 34px;
      font-size: 15px;
      cursor: pointer;
   }
   .historial button:disabled {
      opacity: 0.35;
      cursor: default;
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
      max-width: min(92%, 420px);
      background: var(--aviso-fondo);
      color: var(--aviso-texto);
      border: 1px solid var(--aviso-borde);
      padding: 7px 14px;
      border-radius: 12px;
      font-size: 12px;
      line-height: 1.45;
      text-align: center;
      pointer-events: none;
   }

   /* Inspector: panel lateral en PC, hoja inferior en móvil. */
   .inspector {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 330px;
      border-left: 1px solid var(--borde);
      box-shadow: -8px 0 24px rgb(0 0 0 / 0.14);
      z-index: 5;
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
      z-index: 30;
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

   .arrancando {
      display: grid;
      place-items: center;
      height: 100dvh;
      color: var(--texto-debil);
      font-size: 14px;
   }

   .menu {
      border: 1px solid var(--borde);
      background: transparent;
      color: var(--texto);
      border-radius: 8px;
      width: 34px;
      height: 34px;
      font-size: 17px;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
   }
   .menu:hover {
      background: var(--superficie-alta);
   }

   /* Panel de archivos: lateral en PC, hoja casi completa en móvil. */
   .capa-archivos {
      position: fixed;
      z-index: 45;
      right: 0;
      top: 0;
      bottom: 0;
      width: 340px;
      border-left: 1px solid var(--borde);
      box-shadow: -10px 0 30px rgb(0 0 0 / 0.2);
   }

   .aviso-flotante {
      position: fixed;
      left: 50%;
      bottom: 22px;
      transform: translateX(-50%);
      z-index: 70;
      max-width: min(90vw, 420px);
      background: var(--superficie-alta);
      color: var(--texto);
      border: 1px solid var(--borde);
      border-radius: 999px;
      padding: 9px 18px;
      font-size: 13px;
      text-align: center;
      box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
      pointer-events: none;
   }
   .aviso-flotante.persistente {
      bottom: auto;
      top: 64px;
      border-radius: 12px;
      border-color: var(--aviso-borde);
      background: var(--aviso-fondo);
      color: var(--aviso-texto);
      line-height: 1.45;
   }

   /* --- Móvil: una vista a la vez ------------------------------------- */
   @media (max-width: 860px) {
      /*
       * A 375 px no caben la marca completa, el historial, las dos pestañas y
       * un botón con texto. Se recorta lo prescindible en vez de dejar que el
       * botón de ejecutar se salga de la pantalla.
       */
      header {
         gap: 8px;
         padding: 8px 10px;
      }
      .sub {
         display: none;
      }
      .largo {
         display: none;
      }
      .corto {
         display: inline;
      }
      .pestanas button {
         padding: 7px 10px;
         font-size: 13px;
      }
      .ejecutar {
         padding: 9px 13px;
         font-size: 15px;
      }
      .historial button,
      .menu {
         width: 32px;
         height: 32px;
      }

      .capa-archivos {
         left: 0;
         top: auto;
         width: auto;
         height: 85dvh;
         border-left: 0;
         border-top: 1px solid var(--borde);
         border-radius: 16px 16px 0 0;
         overflow: hidden;
      }

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

      /* El inspector sube desde abajo, al alcance del pulgar. */
      .inspector {
         top: auto;
         left: 0;
         width: auto;
         max-height: 68dvh;
         border-left: 0;
         border-top: 1px solid var(--borde);
         border-radius: 16px 16px 0 0;
         box-shadow: 0 -8px 24px rgb(0 0 0 / 0.2);
         overflow: hidden;
      }
   }

   /* En pantallas anchas las pestañas no hacen falta. */
   @media (min-width: 861px) {
      .pestanas {
         display: none;
      }
   }

   /*
    * Por debajo de 520 px el nombre de la app deja sitio a lo que sí se usa.
    * Con el botón de menú añadido, la barra ya no daba de sí.
    */
   @media (max-width: 520px) {
      .marca {
         display: none;
      }
   }
</style>
