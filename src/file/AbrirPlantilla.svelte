<script lang="ts">
   /**
    * Abrir la plantilla que repartió el profesor.
    *
    * Importar una plantilla **reemplaza el cuaderno entero**, así que no basta
    * con elegir el archivo: primero se muestra qué trae y se pide confirmación.
    * Es la única acción de la app que puede tirar el trabajo de varios
    * ejercicios de una vez.
    */
   import { deserializarPlantilla, type Plantilla } from './plantilla';
   import { leerArchivoDeDisco } from './transferencia';

   interface Props {
      /** Ejercicios que se perderían al reemplazar el cuaderno. */
      ejerciciosActuales: number;
      hayTrabajoSinGuardar: boolean;
      onImportar: (plantilla: Plantilla) => void;
      onCerrar: () => void;
   }

   let { ejerciciosActuales, hayTrabajoSinGuardar, onImportar, onCerrar }: Props = $props();

   let elegida = $state<Plantilla | null>(null);
   let error = $state<string | null>(null);
   let entrada: HTMLInputElement | undefined = $state();

   async function elegir(e: Event) {
      const input = e.currentTarget as HTMLInputElement;
      const archivo = input.files?.[0];
      // Se limpia siempre: si no, elegir el mismo archivo dos veces no dispara
      // el evento la segunda.
      input.value = '';
      if (!archivo) return;

      error = null;
      try {
         elegida = deserializarPlantilla(await leerArchivoDeDisco(archivo));
      } catch (err) {
         elegida = null;
         error = err instanceof Error ? err.message : 'No se pudo abrir esa plantilla.';
      }
   }

   function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
   }
</script>

<svelte:window onkeydown={alTeclear} />

<div class="fondo" role="presentation">
   <div class="caja" role="dialog" aria-modal="true" aria-label="Abrir plantilla">
      <header>
         <h2>Abrir plantilla</h2>
         <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
      </header>

      <div class="cuerpo">
         {#if !elegida}
            <p class="explica">
               Una plantilla es el archivo <code>.algxp</code> que reparte tu profesor. Trae
               los ejercicios de la tarea con su enunciado.
            </p>

            <button class="principal" onclick={() => entrada?.click()}>
               Elegir archivo .algxp
            </button>
            <input
               bind:this={entrada}
               type="file"
               accept=".algxp,application/json"
               onchange={elegir}
               hidden
            />

            {#if error}
               <p class="mensaje error" role="alert">{error}</p>
            {/if}
         {:else}
            <p class="explica">
               <strong>{elegida.nombre}</strong> — {elegida.ejercicios.length}
               {elegida.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}.
            </p>

            <ol class="lista">
               {#each elegida.ejercicios as ejercicio (ejercicio.id)}
                  <li>
                     <strong>{ejercicio.nombre}</strong>
                     {#if ejercicio.enunciado}
                        <small>{ejercicio.enunciado}</small>
                     {/if}
                  </li>
               {/each}
            </ol>

            <p class="nota" class:peligro={hayTrabajoSinGuardar}>
               Al abrirla se reemplaza tu cuaderno actual ({ejerciciosActuales}
               {ejerciciosActuales === 1 ? 'ejercicio' : 'ejercicios'}).
               {#if hayTrabajoSinGuardar}
                  <strong>Tienes trabajo sin guardar: guárdalo antes.</strong>
               {/if}
            </p>
         {/if}
      </div>

      <footer>
         <button class="cancelar" onclick={onCerrar}>Cancelar</button>
         {#if elegida}
            {@const plantilla = elegida}
            <button class="principal" onclick={() => onImportar(plantilla)}>
               Reemplazar y empezar
            </button>
         {/if}
      </footer>
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
      z-index: 62;
   }

   .caja {
      width: min(520px, 100%);
      max-height: min(92dvh, 760px);
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
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
   }

   .explica {
      margin: 0;
      font-size: 13.5px;
      color: var(--texto-tenue);
      line-height: 1.5;
   }
   .explica strong {
      color: var(--texto);
   }
   code {
      font-family: var(--fuente-mono);
      font-size: 12.5px;
      background: var(--superficie-alta);
      border-radius: 5px;
      padding: 1px 5px;
   }

   .lista {
      margin: 0;
      padding-left: 22px;
      display: flex;
      flex-direction: column;
      gap: 9px;
   }
   .lista li {
      font-size: 13.5px;
   }
   .lista small {
      display: block;
      color: var(--texto-tenue);
      font-size: 12.5px;
      line-height: 1.45;
      margin-top: 2px;
   }

   .nota,
   .mensaje {
      margin: 0;
      font-size: 13px;
      color: var(--texto-tenue);
      background: var(--superficie-alta);
      border-radius: 9px;
      padding: 9px 11px;
      line-height: 1.45;
   }
   .nota.peligro {
      background: var(--aviso-fondo);
      color: var(--aviso-texto);
      border: 1px solid var(--aviso-borde);
   }
   .mensaje.error {
      color: var(--error);
   }

   footer {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--borde);
      flex-shrink: 0;
   }
   footer button,
   .cuerpo button {
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 9px;
      padding: 10px 14px;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
   }
   .principal {
      background: var(--acento);
      border-color: var(--acento);
      color: #04140b;
      font-weight: 600;
   }
</style>
