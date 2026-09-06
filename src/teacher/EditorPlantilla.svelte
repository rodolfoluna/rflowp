<script lang="ts">
   /**
    * Crear y exportar la plantilla que el profesor reparte al grupo.
    *
    * No es un editor aparte: el profesor arma la tarea en la app como cualquier
    * cuaderno —agrega ejercicios, les pone nombre, escribe el código de partida
    * si quiere— y aquí solo añade lo que el cuaderno no tiene: el enunciado de
    * cada ejercicio y el nombre de la tarea. Rehacer una lista de ejercicios
    * dentro de este panel sería duplicar la que ya existe.
    *
    * Los enunciados se guardan en el propio cuaderno, así que el profesor puede
    * guardarlo, corregirlo la semana que viene y volver a exportar la plantilla.
    */
   import type { Cuaderno } from '../edit/cuaderno.svelte';
   import { descargar } from '../file/transferencia';
   import {
      armarPlantilla,
      nombreArchivoPlantilla,
      serializarPlantilla,
   } from '../file/plantilla';

   interface Props {
      cuaderno: Cuaderno;
      /** Título del archivo abierto: es el nombre natural de la tarea. */
      tituloActual: string;
      onCerrar: () => void;
   }

   let { cuaderno, tituloActual, onCerrar }: Props = $props();

   // El valor inicial y nada más: a partir de aquí lo escribe el profesor. El
   // panel se crea al abrirlo, así que arranca con el nombre vigente.
   // svelte-ignore state_referenced_locally
   let nombre = $state(cuaderno.plantilla?.nombre || tituloActual || 'Tarea');
   let conCodigo = $state(false);
   let mensaje = $state<string | null>(null);
   let error = $state<string | null>(null);

   const ejercicios = $derived(cuaderno.ejercicios);
   const sinEnunciado = $derived(ejercicios.filter((e) => !e.enunciado).length);

   async function exportar() {
      error = null;
      try {
         const plantilla = await armarPlantilla(
            nombre,
            cuaderno.esbozoPlantilla().map((e) => ({
               id: e.id,
               nombre: e.nombre,
               ...(e.enunciado ? { enunciado: e.enunciado } : {}),
               // Sin código de partida, cada alumno recibe el esqueleto vacío.
               ...(conCodigo && e.programa ? { programa: e.programa } : {}),
            })),
            // Reexportar conserva el id: los cuadernos ya repartidos siguen
            // apuntando a esta misma tarea.
            cuaderno.plantilla ? { id: cuaderno.plantilla.id } : {},
         );

         const archivo = nombreArchivoPlantilla(plantilla.nombre);
         descargar(archivo, serializarPlantilla(plantilla));
         mensaje = `Se descargó ${archivo}. Repártela al grupo como cualquier archivo.`;
      } catch (e) {
         error = e instanceof Error ? e.message : 'No se pudo crear la plantilla.';
      }
   }

   function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
   }
</script>

<svelte:window onkeydown={alTeclear} />

<div class="fondo" role="presentation">
   <div class="caja" role="dialog" aria-modal="true" aria-label="Crear plantilla">
      <header>
         <h2>Crear plantilla</h2>
         <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
      </header>

      <div class="cuerpo">
         <p class="explica">
            La plantilla lleva los enunciados y va <strong>sin cifrar</strong>: la lee todo
            el grupo. Lo que se protege es la solución de cada alumno, no el enunciado.
         </p>

         <label class="campo">
            <span>Nombre de la tarea</span>
            <input bind:value={nombre} maxlength="60" placeholder="Tarea 3 — Ciclos" />
         </label>

         <div class="ejercicios">
            {#each ejercicios as ejercicio, i (ejercicio.id)}
               <label class="campo enunciado">
                  <span>
                     <em>{i + 1}.</em>
                     {ejercicio.nombre}
                  </span>
                  <textarea
                     rows="3"
                     placeholder="Qué tiene que resolver el alumno en este ejercicio"
                     value={ejercicio.enunciado ?? ''}
                     oninput={(e) => cuaderno.enunciar(ejercicio.id, e.currentTarget.value)}
                  ></textarea>
               </label>
            {/each}
         </div>

         <label class="opcion">
            <input type="checkbox" bind:checked={conCodigo} />
            <span>
               <strong>Incluir mi código como punto de partida</strong>
               <small>
                  Cada alumno abre la plantilla con lo que hay escrito ahora. Sin marcar,
                  todos empiezan con el proceso vacío.
               </small>
            </span>
         </label>

         {#if sinEnunciado > 0}
            <p class="nota">
               {sinEnunciado === 1
                  ? 'Un ejercicio se queda sin enunciado.'
                  : `${sinEnunciado} ejercicios se quedan sin enunciado.`}
               Se puede repartir así, pero el alumno solo verá el nombre.
            </p>
         {/if}

         {#if error}
            <p class="mensaje error" role="alert">{error}</p>
         {:else if mensaje}
            <p class="mensaje" role="status">{mensaje}</p>
         {/if}
      </div>

      <footer>
         <button class="cancelar" onclick={onCerrar}>Cerrar</button>
         <button class="principal" onclick={exportar}>
            Exportar plantilla ({ejercicios.length}
            {ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'})
         </button>
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
      width: min(620px, 100%);
      max-height: min(92dvh, 820px);
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
      font-size: 13px;
      color: var(--texto-tenue);
      line-height: 1.5;
   }

   .campo {
      display: flex;
      flex-direction: column;
      gap: 6px;
   }
   .campo > span {
      font-size: 12.5px;
      color: var(--texto-tenue);
      font-weight: 600;
   }
   .campo em {
      font-style: normal;
      color: var(--texto-debil);
      font-family: var(--fuente-mono);
   }

   .campo input,
   textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--fondo);
      color: var(--texto);
      border: 1px solid var(--borde);
      border-radius: 9px;
      padding: 9px 11px;
      font: inherit;
      font-size: 14px;
   }
   textarea {
      resize: vertical;
      line-height: 1.45;
   }
   .campo input:focus,
   textarea:focus {
      outline: 2px solid var(--acento);
      outline-offset: -1px;
   }

   .ejercicios {
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-top: 1px solid var(--borde);
      border-bottom: 1px solid var(--borde);
      padding: 14px 0;
   }

   .opcion {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      cursor: pointer;
   }
   .opcion input {
      margin-top: 3px;
      flex-shrink: 0;
   }
   .opcion span {
      display: flex;
      flex-direction: column;
      gap: 2px;
   }
   .opcion strong {
      font-size: 13.5px;
      font-weight: 600;
   }
   .opcion small {
      font-size: 12.5px;
      color: var(--texto-tenue);
      line-height: 1.45;
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
   footer button {
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 9px;
      padding: 10px 14px;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
   }
   footer .principal {
      background: var(--acento);
      border-color: var(--acento);
      color: #04140b;
      font-weight: 600;
   }
</style>
