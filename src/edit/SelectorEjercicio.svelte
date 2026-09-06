<script lang="ts">
   /**
    * Selector de ejercicio: `‹ 3/8 · Promedio ›`.
    *
    * No son pestañas a propósito. La barra superior ya tiene las de
    * *Código / Diagrama*; una segunda tira encima deja dos barras apiladas y a
    * 375 px no caben ni tres ejercicios. Este control ocupa lo mismo con 3 que
    * con 20, y las flechas cubren el movimiento que más se usa —al siguiente y
    * al anterior— sin abrir nada.
    */
   import type { Cuaderno } from './cuaderno.svelte';

   interface Props {
      cuaderno: Cuaderno;
      onAbrirLista: () => void;
   }

   let { cuaderno, onAbrirLista }: Props = $props();

   const puede = $derived(cuaderno.puedeAvanzar);
</script>

<div class="selector">
   <button
      class="flecha"
      onclick={() => cuaderno.avanzar(-1)}
      disabled={!puede.atras}
      aria-label="Ejercicio anterior"
      title="Ejercicio anterior"
   >
      ‹
   </button>

   <button class="actual" onclick={onAbrirLista} title="Ver todos los ejercicios">
      <span class="cuenta">{cuaderno.posicionActiva}/{cuaderno.total}</span>
      <span class="nombre">{cuaderno.nombreActivo}</span>
   </button>

   <button
      class="flecha"
      onclick={() => cuaderno.avanzar(1)}
      disabled={!puede.adelante}
      aria-label="Ejercicio siguiente"
      title="Ejercicio siguiente"
   >
      ›
   </button>
</div>

<style>
   .selector {
      display: flex;
      align-items: stretch;
      gap: 2px;
      background: var(--fondo);
      border: 1px solid var(--borde);
      border-radius: 10px;
      padding: 2px;
      min-width: 0;
   }

   .flecha {
      border: 0;
      background: transparent;
      color: var(--texto-tenue);
      /* 30px de ancho: cabe en la barra y sigue siendo acertable con el dedo
         porque el alto lo da el contenedor. */
      width: 30px;
      border-radius: 8px;
      font-size: 19px;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
   }
   .flecha:hover:not(:disabled) {
      background: var(--superficie-alta);
      color: var(--texto);
   }
   .flecha:disabled {
      opacity: 0.3;
      cursor: default;
   }

   .actual {
      display: flex;
      align-items: baseline;
      gap: 7px;
      min-width: 0;
      border: 0;
      background: transparent;
      color: var(--texto);
      border-radius: 8px;
      padding: 5px 9px;
      cursor: pointer;
      font-family: inherit;
   }
   .actual:hover {
      background: var(--superficie-alta);
   }

   .cuenta {
      font-family: var(--fuente-mono);
      font-size: 11px;
      color: var(--texto-debil);
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
   }

   .nombre {
      font-size: 13.5px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      /* Un nombre largo no puede empujar al resto de la barra fuera. */
      max-width: 14ch;
   }

   @media (min-width: 861px) {
      .nombre {
         max-width: 24ch;
      }
   }

   /*
    * En móvil el selector ocupa una fila entera (lo coloca el shell), así que
    * el nombre puede ir centrado y sin recortar: es la información por la que
    * este control existe.
    */
   @media (max-width: 640px) {
      .selector {
         flex: 1;
      }
      .actual {
         flex: 1;
         justify-content: center;
      }
      .nombre {
         max-width: none;
      }
   }
</style>
