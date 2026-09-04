<script lang="ts">
   /**
    * Paleta de bloques: se abre al tocar un `+` del diagrama.
    *
    * En móvil sube desde abajo (hoja inferior) y en PC aparece centrada. La
    * hoja inferior no es un capricho: en un teléfono el pulgar alcanza la mitad
    * inferior de la pantalla, y un menú anclado arriba obliga a recolocar la mano.
    */
   import { PALETA, type TipoSentencia } from './mutaciones';

   interface Props {
      onElegir: (tipo: TipoSentencia) => void;
      onCerrar: () => void;
   }

   let { onElegir, onCerrar }: Props = $props();

   function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
   }
</script>

<svelte:window onkeydown={alTeclear} />

<div
   class="fondo"
   role="button"
   tabindex="-1"
   aria-label="Cerrar la paleta"
   onclick={onCerrar}
   onkeydown={(e) => e.key === 'Enter' && onCerrar()}
></div>

<div class="hoja" role="dialog" aria-label="Elegir el tipo de bloque" aria-modal="true">
   <div class="asa" aria-hidden="true"></div>
   <h2>¿Qué quieres agregar?</h2>

   <ul>
      {#each PALETA as opcion (opcion.tipo)}
         <li>
            <button onclick={() => onElegir(opcion.tipo)}>
               <span class="icono {opcion.simbolo} rol-{opcion.rol}" aria-hidden="true"></span>
               <span class="texto">
                  <strong>{opcion.etiqueta}</strong>
                  <small>{opcion.descripcion}</small>
               </span>
            </button>
         </li>
      {/each}
   </ul>

   <button class="cancelar" onclick={onCerrar}>Cancelar</button>
</div>

<style>
   .fondo {
      position: fixed;
      inset: 0;
      background: rgb(0 0 0 / 0.5);
      border: 0;
      z-index: 20;
   }

   .hoja {
      position: fixed;
      z-index: 21;
      background: var(--superficie);
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px 16px 20px;

      /* Móvil: hoja inferior, al alcance del pulgar. */
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 18px 18px 0 0;
      max-height: 78dvh;
      /* Respeta la barra de gestos de los teléfonos sin bordes. */
      padding-bottom: max(20px, env(safe-area-inset-bottom));
   }

   .asa {
      width: 40px;
      height: 4px;
      border-radius: 2px;
      background: var(--borde);
      margin: 0 auto 2px;
   }

   h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
   }

   ul {
      list-style: none;
      margin: 0;
      padding: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 0;
   }

   li button {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      text-align: left;
      border: 1px solid var(--borde);
      background: var(--fondo);
      color: var(--texto);
      border-radius: 11px;
      padding: 11px 12px;
      cursor: pointer;
      /* 44px de alto mínimo: objetivo táctil cómodo. */
      min-height: 56px;
   }
   li button:hover {
      background: var(--superficie-alta);
   }

   .icono {
      width: 30px;
      height: 22px;
      flex-shrink: 0;
      border: 2px solid var(--borde-simbolo);
   }
   /* La forma la da la clase del símbolo… */
   .icono.process {
      border-radius: 3px;
   }
   .icono.io {
      /* Paralelogramo, como en el diagrama. */
      clip-path: polygon(18% 0, 100% 0, 82% 100%, 0 100%);
      border: 0;
   }
   .icono.decision {
      clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
      border: 0;
   }
   .icono.preparation {
      clip-path: polygon(14% 0, 86% 0, 100% 50%, 86% 100%, 14% 100%, 0 50%);
      border: 0;
   }

   /* …y el color, la función. Igual que en el diagrama, para que el alumno
      reconozca el bloque que acaba de elegir. */
   .icono.rol-asignacion { background: var(--c-asignacion); }
   .icono.rol-declaracion { background: var(--c-declaracion); }
   .icono.rol-entrada { background: var(--c-entrada); }
   .icono.rol-salida { background: var(--c-salida); }
   .icono.rol-condicion { background: var(--c-condicion); }
   .icono.rol-ciclo { background: var(--c-ciclo); }
   .icono.rol-caso { background: var(--c-caso); }
   .icono.rol-para { background: var(--c-para); }

   .texto {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
   }
   .texto strong {
      font-size: 14px;
      font-weight: 600;
   }
   .texto small {
      font-size: 12px;
      color: var(--texto-tenue);
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
      .hoja {
         left: 50%;
         top: 50%;
         right: auto;
         bottom: auto;
         transform: translate(-50%, -50%);
         width: 420px;
         border-radius: 16px;
         max-height: 80dvh;
         padding-bottom: 20px;
         border: 1px solid var(--borde);
      }
   }
</style>
