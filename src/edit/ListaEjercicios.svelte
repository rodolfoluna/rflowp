<script lang="ts">
   /**
    * Todos los ejercicios del cuaderno: abrir, crear, renombrar, reordenar y borrar.
    *
    * Hoja inferior en móvil y panel centrado en PC, con el mismo patrón que
    * `Paleta.svelte` y `MenuPrincipal.svelte`, para que el alumno reconozca el
    * gesto y no tenga que aprender una interacción nueva.
    *
    * Muestra el estado de cada uno —vacío, con errores, listo— para que se vea
    * lo que falta por hacer sin entrar en cada ejercicio.
    */
   import type { Cuaderno, EstadoEjercicio } from './cuaderno.svelte';

   interface Props {
      cuaderno: Cuaderno;
      /** Renombrar abre el diálogo de texto del shell, que ya existe. */
      onRenombrar: (id: string, nombreActual: string) => void;
      onCerrar: () => void;
   }

   let { cuaderno, onRenombrar, onCerrar }: Props = $props();

   let confirmandoBorrado = $state<string | null>(null);

   const ETIQUETA: Record<EstadoEjercicio, string> = {
      vacio: 'sin empezar',
      'con-errores': 'con errores',
      listo: 'listo',
   };

   function elegir(id: string) {
      cuaderno.activar(id);
      onCerrar();
   }

   function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
   }
</script>

<svelte:window onkeydown={alTeclear} />

<div
   class="fondo"
   role="button"
   tabindex="-1"
   aria-label="Cerrar la lista"
   onclick={onCerrar}
   onkeydown={(e) => e.key === 'Enter' && onCerrar()}
></div>

<div class="hoja" role="dialog" aria-label="Ejercicios del cuaderno" aria-modal="true">
   <div class="asa" aria-hidden="true"></div>

   <header>
      <h2>Ejercicios</h2>
      <span class="cuenta">{cuaderno.total}</span>
   </header>

   <ul>
      {#each cuaderno.ejercicios as ejercicio, i (ejercicio.id)}
         <li class:activo={ejercicio.activo}>
            <button class="principal" onclick={() => elegir(ejercicio.id)}>
               <span class="posicion">{i + 1}</span>
               <span class="texto">
                  <strong>{ejercicio.nombre}</strong>
                  <small class="estado {ejercicio.estado}">
                     {ETIQUETA[ejercicio.estado]}
                     {#if ejercicio.deLaPlantilla}
                        · de la tarea
                     {/if}
                  </small>
               </span>
            </button>

            <div class="botones">
               <button
                  onclick={() => cuaderno.mover(ejercicio.id, -1)}
                  disabled={i === 0}
                  aria-label="Subir"
                  title="Subir"
               >
                  ↑
               </button>
               <button
                  onclick={() => cuaderno.mover(ejercicio.id, 1)}
                  disabled={i === cuaderno.total - 1}
                  aria-label="Bajar"
                  title="Bajar"
               >
                  ↓
               </button>
               <button
                  onclick={() => onRenombrar(ejercicio.id, ejercicio.nombre)}
                  aria-label="Renombrar"
                  title="Renombrar"
               >
                  ✎
               </button>
               <button
                  class="peligro"
                  onclick={() => (confirmandoBorrado = ejercicio.id)}
                  disabled={cuaderno.total <= 1}
                  aria-label="Borrar"
                  title={cuaderno.total <= 1
                     ? 'Un cuaderno no puede quedarse sin ejercicios'
                     : 'Borrar'}
               >
                  🗑
               </button>
            </div>

            {#if confirmandoBorrado === ejercicio.id}
               <div class="confirmar">
                  <span>¿Borrar «{ejercicio.nombre}» y todo lo que tiene dentro?</span>
                  <button
                     class="peligro"
                     onclick={() => {
                        cuaderno.eliminar(ejercicio.id);
                        confirmandoBorrado = null;
                     }}
                  >
                     Sí, borrar
                  </button>
                  <button onclick={() => (confirmandoBorrado = null)}>Cancelar</button>
               </div>
            {/if}
         </li>
      {/each}
   </ul>

   <button class="agregar" onclick={() => { cuaderno.agregar(); onCerrar(); }}>
      + Agregar ejercicio
   </button>
   <button class="cancelar" onclick={onCerrar}>Cerrar</button>
</div>

<style>
   .fondo {
      position: fixed;
      inset: 0;
      background: rgb(0 0 0 / 0.5);
      border: 0;
      z-index: 24;
   }

   .hoja {
      position: fixed;
      z-index: 25;
      background: var(--superficie);
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 16px 20px;

      /* Móvil: hoja inferior, al alcance del pulgar. */
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 18px 18px 0 0;
      max-height: 82dvh;
      padding-bottom: max(20px, env(safe-area-inset-bottom));
   }

   .asa {
      width: 40px;
      height: 4px;
      border-radius: 2px;
      background: var(--borde);
      margin: 0 auto 2px;
      flex-shrink: 0;
   }

   header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-shrink: 0;
   }
   h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 650;
   }
   header .cuenta {
      font-family: var(--fuente-mono);
      font-size: 12px;
      color: var(--texto-debil);
   }

   ul {
      list-style: none;
      margin: 0;
      padding: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-height: 0;
   }

   li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 3px;
      border: 1px solid var(--borde);
      border-radius: 11px;
      background: var(--fondo);
      padding: 3px;
   }
   li.activo {
      border-color: var(--acento);
   }

   .principal {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 11px;
      text-align: left;
      border: 0;
      background: transparent;
      color: var(--texto);
      padding: 8px 9px;
      cursor: pointer;
      border-radius: 8px;
      /* 48px: objetivo táctil cómodo en una lista que se recorre con el pulgar. */
      min-height: 48px;
   }
   .principal:hover {
      background: var(--superficie-alta);
   }

   .posicion {
      font-family: var(--fuente-mono);
      font-size: 12px;
      color: var(--texto-debil);
      flex-shrink: 0;
      width: 16px;
      text-align: right;
      font-variant-numeric: tabular-nums;
   }

   .texto {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
   }
   .texto strong {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
   }

   .estado {
      font-size: 11.5px;
      color: var(--texto-debil);
   }
   .estado.con-errores {
      color: var(--error);
   }
   .estado.listo {
      color: var(--acento);
   }

   .botones {
      display: flex;
      gap: 1px;
      flex-shrink: 0;
   }
   .botones button {
      border: 0;
      background: transparent;
      color: var(--texto-tenue);
      /* Con el pulgar: 40px es el mínimo que se acierta sin fallar. Con ratón
         sobran, y a partir de 861px la lista es un panel lateral. */
      width: 40px;
      height: 40px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
   }
   .botones button:hover:not(:disabled) {
      background: var(--superficie-alta);
   }
   .botones button:disabled {
      opacity: 0.3;
      cursor: default;
   }

   .confirmar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 8px;
      border-top: 1px dashed var(--borde);
      font-size: 12px;
   }
   .confirmar span {
      flex: 1;
      min-width: 140px;
   }
   .confirmar button {
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 7px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
   }

   .peligro {
      color: var(--error) !important;
   }

   .agregar {
      border: 1px dashed var(--borde);
      background: transparent;
      color: var(--texto);
      border-radius: 10px;
      padding: 12px;
      cursor: pointer;
      font-size: 14px;
      flex-shrink: 0;
   }
   .agregar:hover {
      border-color: var(--acento);
      color: var(--acento);
   }

   .cancelar {
      border: 1px solid var(--borde);
      background: transparent;
      color: var(--texto);
      border-radius: 10px;
      padding: 11px;
      cursor: pointer;
      font-size: 14px;
      flex-shrink: 0;
   }

   /* PC: recuadro centrado, no hoja inferior. */
   @media (min-width: 861px) {
      .botones button {
         width: 32px;
         height: 32px;
      }

      .hoja {
         left: 50%;
         top: 50%;
         right: auto;
         bottom: auto;
         transform: translate(-50%, -50%);
         width: 480px;
         border-radius: 16px;
         max-height: 80dvh;
         padding-bottom: 20px;
         border: 1px solid var(--borde);
      }
   }
</style>
