<script lang="ts">
   /**
    * Modo profesor: generar el par de llaves del curso, repartir la pública y
    * abrir las entregas con la privada.
    *
    * Es la misma app que usan los alumnos; lo que cambia el modo es tener la
    * llave privada cargada. Mantener una sola base de código evita que las dos
    * versiones se desincronicen justo en la parte criptográfica.
    */
   import {
      archivoLlave,
      generarLlavesProfesor,
      huellaDeLlave,
      importarPrivadaProfesor,
      importarPublicaProfesor,
      leerArchivoLlave,
      type ConfigProfesor,
   } from './llaves';
   import { descargar, leerArchivoDeDisco } from '../file/transferencia';

   interface Props {
      config: ConfigProfesor | null;
      onGuardar: (config: ConfigProfesor) => Promise<void>;
      onQuitar: () => Promise<void>;
      onCerrar: () => void;
   }

   let { config, onGuardar, onQuitar, onCerrar }: Props = $props();

   let mensaje = $state<string | null>(null);
   let error = $state<string | null>(null);
   let generando = $state(false);
   let etiqueta = $state('');
   let entradaLlave: HTMLInputElement | undefined = $state();

   const esProfesor = $derived(config?.privada != null);
   const hayCurso = $derived(config != null);

   function limpiar() {
      mensaje = null;
      error = null;
   }

   async function generar() {
      limpiar();
      const nombre = etiqueta.trim();
      if (!nombre) {
         error = 'Ponle un nombre al curso para no confundir llaves entre materias.';
         return;
      }

      generando = true;
      try {
         const par = await generarLlavesProfesor();
         const huella = await huellaDeLlave(par.publicaJwk);

         // Se descargan las dos ANTES de guardar nada: si el navegador bloquea
         // la descarga, es mejor que el profesor lo vea ahora y no cuando ya
         // crea tener su respaldo.
         descargar(
            `rflowp-llave-PRIVADA-${nombre.replace(/\W+/g, '_')}.json`,
            JSON.stringify(archivoLlave('privada', nombre, par.privadaJwk), null, 2),
         );
         descargar(
            `rflowp-llave-publica-${nombre.replace(/\W+/g, '_')}.json`,
            JSON.stringify(archivoLlave('publica', nombre, par.publicaJwk), null, 2),
         );

         // La privada se vuelve a importar como NO exportable: dentro de la app
         // ya no se puede volver a sacar. El respaldo es el archivo descargado.
         await onGuardar({
            etiqueta: nombre,
            huella,
            publica: par.publica,
            privada: await importarPrivadaProfesor(par.privadaJwk),
         });

         mensaje =
            'Se descargaron las dos llaves. Guarda la PRIVADA en un lugar seguro: si la pierdes, no podrás abrir ninguna entrega del curso.';
      } catch (e) {
         error = e instanceof Error ? e.message : 'No se pudieron generar las llaves.';
      } finally {
         generando = false;
      }
   }

   async function importar(e: Event) {
      limpiar();
      const input = e.currentTarget as HTMLInputElement;
      const archivo = input.files?.[0];
      input.value = '';
      if (!archivo) return;

      try {
         const leida = leerArchivoLlave(await leerArchivoDeDisco(archivo));
         const huella = await huellaDeLlave(leida.jwk);

         if (leida.clase === 'publica') {
            await onGuardar({
               etiqueta: leida.etiqueta,
               huella,
               publica: await importarPublicaProfesor(leida.jwk),
               privada: null,
            });
            mensaje = `Llave del curso «${leida.etiqueta}» configurada. A partir de ahora tu profesor podrá abrir lo que entregues.`;
         } else {
            // Con la privada se puede derivar la pública, pero WebCrypto no lo
            // hace directamente: se guarda solo la privada, que es lo que el
            // profesor necesita para abrir.
            await onGuardar({
               etiqueta: leida.etiqueta,
               huella,
               publica: null,
               privada: await importarPrivadaProfesor(leida.jwk),
            });
            mensaje = `Modo profesor activo para «${leida.etiqueta}». Ya puedes abrir las entregas de tus alumnos.`;
         }
      } catch (err) {
         error = err instanceof Error ? err.message : 'No se pudo leer esa llave.';
      }
   }

   async function quitar() {
      limpiar();
      await onQuitar();
      mensaje = 'Se quitó la llave de este dispositivo.';
   }
</script>

<div class="fondo">
   <div class="caja" role="dialog" aria-modal="true" aria-labelledby="titulo-profesor">
      <header>
         <h2 id="titulo-profesor">Llave del curso</h2>
         <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
      </header>

      <div class="cuerpo">
         {#if hayCurso && config}
            <div class="estado" class:profesor={esProfesor}>
               <strong>{esProfesor ? 'Modo profesor' : 'Curso configurado'}</strong>
               <span class="etiqueta">{config.etiqueta}</span>
               <code>{config.huella}</code>
               <p>
                  {esProfesor
                     ? 'Puedes abrir las entregas de cualquier alumno de este curso.'
                     : 'Lo que guardes y exportes podrá abrirlo tu profesor.'}
               </p>
            </div>
            <button class="secundario" onclick={quitar}>Quitar esta llave</button>
         {:else}
            <p class="aviso" role="alert">
               <strong>No hay llave de curso configurada.</strong>
               Lo que guardes ahora solo lo podrás abrir tú: tu profesor
               <strong>no</strong> podrá revisarlo.
            </p>
         {/if}

         <section>
            <h3>Soy alumno</h3>
            <p class="explica">
               Tu profesor te dará un archivo de llave pública. Impórtalo una vez, al
               principio del curso.
            </p>
            <button onclick={() => entradaLlave?.click()}>Importar llave…</button>
            <input
               bind:this={entradaLlave}
               type="file"
               accept=".json,application/json"
               onchange={importar}
               hidden
            />
         </section>

         <section>
            <h3>Soy profesor</h3>
            <p class="explica">
               Genera el par una sola vez por curso. Se descargan dos archivos: la
               <strong>pública</strong>, que repartes a tus alumnos, y la
               <strong>privada</strong>, que guardas tú y no compartes con nadie.
            </p>
            <label class="campo">
               <span>Nombre del curso</span>
               <input
                  bind:value={etiqueta}
                  placeholder="Algoritmos 3A, 2026"
                  autocomplete="off"
               />
            </label>
            <button onclick={generar} disabled={generando}>
               {generando ? 'Generando…' : 'Generar el par de llaves'}
            </button>
            <p class="peligro">
               Si pierdes la llave privada, <strong>ninguna</strong> entrega de ese curso
               se podrá volver a abrir. Guárdala en dos lugares distintos.
            </p>
         </section>

         {#if mensaje}
            <p class="mensaje" role="status">{mensaje}</p>
         {/if}
         {#if error}
            <p class="mensaje error" role="alert">{error}</p>
         {/if}
      </div>
   </div>
</div>

<style>
   .fondo {
      position: fixed;
      inset: 0;
      background: rgb(0 0 0 / 0.6);
      display: grid;
      place-items: center;
      padding: 16px;
      z-index: 60;
      overflow: auto;
   }

   .caja {
      width: min(460px, 100%);
      max-height: min(90dvh, 720px);
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
   }

   header {
      display: flex;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--borde);
      flex-shrink: 0;
   }
   h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 650;
   }
   .cerrar {
      margin-left: auto;
      border: 0;
      background: transparent;
      color: var(--texto-tenue);
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
   }

   .cuerpo {
      overflow: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
   }

   .estado {
      display: flex;
      flex-direction: column;
      gap: 5px;
      border: 1px solid var(--borde);
      border-radius: 11px;
      padding: 12px;
      background: var(--fondo);
   }
   .estado.profesor {
      border-color: var(--acento);
   }
   .estado strong {
      font-size: 13px;
      color: var(--acento);
      text-transform: uppercase;
      letter-spacing: 0.05em;
   }
   .etiqueta {
      font-size: 15px;
      font-weight: 600;
   }
   .estado code {
      font-family: var(--fuente-mono);
      font-size: 12px;
      color: var(--texto-tenue);
      letter-spacing: 0.06em;
   }
   .estado p {
      margin: 3px 0 0;
      font-size: 12px;
      color: var(--texto-tenue);
      line-height: 1.5;
   }

   .aviso {
      margin: 0;
      background: var(--aviso-fondo);
      color: var(--aviso-texto);
      border: 1px solid var(--aviso-borde);
      border-radius: 11px;
      padding: 11px 13px;
      font-size: 13px;
      line-height: 1.55;
   }

   section {
      display: flex;
      flex-direction: column;
      gap: 9px;
      border-top: 1px solid var(--borde);
      padding-top: 14px;
   }
   h3 {
      margin: 0;
      font-size: 13px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--texto-tenue);
   }
   .explica {
      margin: 0;
      font-size: 13px;
      line-height: 1.55;
      color: var(--texto-tenue);
   }

   .campo {
      display: flex;
      flex-direction: column;
      gap: 5px;
   }
   .campo span {
      font-size: 11px;
      font-weight: 600;
      color: var(--texto-debil);
      text-transform: uppercase;
      letter-spacing: 0.04em;
   }
   .campo input {
      border: 1px solid var(--borde);
      background: var(--fondo);
      color: var(--texto);
      border-radius: 9px;
      padding: 10px 11px;
      /* 16px evita que iOS haga zoom al enfocar el campo. */
      font-size: 16px;
      font-family: inherit;
   }
   .campo input:focus {
      outline: none;
      border-color: var(--acento);
   }

   button {
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 9px;
      padding: 11px;
      cursor: pointer;
      font-size: 14px;
   }
   button:disabled {
      opacity: 0.55;
      cursor: default;
   }
   .secundario {
      color: var(--error);
      border-color: color-mix(in srgb, var(--error) 45%, var(--borde));
      background: transparent;
   }

   .peligro {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--error);
   }

   .mensaje {
      margin: 0;
      font-size: 12px;
      line-height: 1.55;
      background: var(--fondo);
      border: 1px solid var(--borde);
      border-radius: 9px;
      padding: 10px 12px;
      color: var(--texto-tenue);
   }
   .mensaje.error {
      color: var(--error);
      border-color: var(--error);
   }
</style>
