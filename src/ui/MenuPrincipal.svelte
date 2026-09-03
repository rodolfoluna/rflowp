<script lang="ts">
   /**
    * Menú de acciones del documento.
    *
    * Se agrupan aquí en vez de repartirlas por la barra superior porque a
    * 375 px no caben, y porque son acciones que se usan de vez en cuando: lo
    * que se toca todo el rato (deshacer, cambiar de vista, ejecutar) sigue
    * directo en la barra.
    */
   import { iniciales, type Identidad } from '../identity/identidad';

   interface Props {
      identidad: Identidad;
      /** Título del algoritmo abierto, si hay uno guardado. */
      tituloActual: string;
      hayArchivoAbierto: boolean;
      onGuardar: () => void;
      onGuardarComo: () => void;
      onNuevo: () => void;
      onArchivos: () => void;
      onExportar: () => void;
      /** Curso configurado, para mostrarlo de un vistazo. `null` si no hay. */
      llaveCurso: string | null;
      onLlaveCurso: () => void;
      onBorrarDatos: () => void;
      onCerrar: () => void;
   }

   let {
      identidad,
      tituloActual,
      hayArchivoAbierto,
      onGuardar,
      onGuardarComo,
      onNuevo,
      onArchivos,
      onExportar,
      llaveCurso,
      onLlaveCurso,
      onBorrarDatos,
      onCerrar,
   }: Props = $props();

   function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
   }
</script>

<svelte:window onkeydown={alTeclear} />

<div
   class="fondo"
   role="button"
   tabindex="-1"
   aria-label="Cerrar el menú"
   onclick={onCerrar}
   onkeydown={(e) => e.key === 'Enter' && onCerrar()}
></div>

<div class="hoja" role="dialog" aria-label="Menú" aria-modal="true">
   <div class="asa" aria-hidden="true"></div>

   <div class="quien">
      <span class="avatar" aria-hidden="true">{iniciales(identidad.nombre)}</span>
      <span class="datos">
         <strong>{identidad.nombre}</strong>
         <small>{identidad.numeroControl}{identidad.grupo ? ` · ${identidad.grupo}` : ''}</small>
      </span>
   </div>

   <p class="documento">
      {hayArchivoAbierto ? `Trabajando en «${tituloActual}»` : 'Este algoritmo no se ha guardado'}
   </p>

   <div class="grupo">
      <button onclick={onGuardar}>
         <span class="icono" aria-hidden="true">💾</span>
         <span class="texto">
            <strong>{hayArchivoAbierto ? 'Guardar' : 'Guardar…'}</strong>
            <small>Conserva el algoritmo dentro de la app</small>
         </span>
      </button>

      {#if hayArchivoAbierto}
         <button onclick={onGuardarComo}>
            <span class="icono" aria-hidden="true">📄</span>
            <span class="texto">
               <strong>Guardar como…</strong>
               <small>Crea una copia con otro nombre</small>
            </span>
         </button>
      {/if}

      <button onclick={onExportar}>
         <span class="icono" aria-hidden="true">⤓</span>
         <span class="texto">
            <strong>Exportar .algx</strong>
            <small>Descarga el archivo para entregarlo</small>
         </span>
      </button>

      <button onclick={onArchivos}>
         <span class="icono" aria-hidden="true">📚</span>
         <span class="texto">
            <strong>Mis algoritmos</strong>
            <small>Abrir, importar o borrar</small>
         </span>
      </button>

      <button onclick={onNuevo}>
         <span class="icono" aria-hidden="true">✨</span>
         <span class="texto">
            <strong>Nuevo algoritmo</strong>
            <small>Empezar desde cero</small>
         </span>
      </button>

      <button onclick={onLlaveCurso} class:pendiente={!llaveCurso}>
         <span class="icono" aria-hidden="true">🔑</span>
         <span class="texto">
            <strong>Llave del curso</strong>
            <small>
               {llaveCurso ?? 'Sin configurar: tu profesor no podrá abrir tus entregas'}
            </small>
         </span>
      </button>
   </div>

   <div class="grupo peligroso">
      <button onclick={onBorrarDatos}>
         <span class="icono" aria-hidden="true">⚠️</span>
         <span class="texto">
            <strong>Borrar mis datos</strong>
            <small>Elimina tu identidad y todo lo guardado</small>
         </span>
      </button>
   </div>

   <button class="cancelar" onclick={onCerrar}>Cerrar</button>
</div>

<style>
   .fondo {
      position: fixed;
      inset: 0;
      background: rgb(0 0 0 / 0.5);
      border: 0;
      z-index: 40;
   }

   .hoja {
      position: fixed;
      z-index: 41;
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
      max-height: 85dvh;
      overflow: auto;
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

   .quien {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 4px 2px 10px;
      border-bottom: 1px solid var(--borde);
   }
   .avatar {
      width: 38px;
      height: 38px;
      flex-shrink: 0;
      border-radius: 50%;
      background: var(--acento);
      color: #04140b;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 14px;
   }
   .datos {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
   }
   .datos strong {
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
   }
   .datos small {
      font-size: 12px;
      color: var(--texto-tenue);
      font-family: var(--fuente-mono);
   }

   .documento {
      margin: 0;
      font-size: 12px;
      color: var(--texto-tenue);
      padding: 0 2px;
   }

   .grupo {
      display: flex;
      flex-direction: column;
      gap: 4px;
   }

   .grupo button {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      text-align: left;
      border: 1px solid var(--borde);
      background: var(--fondo);
      color: var(--texto);
      border-radius: 11px;
      padding: 10px 12px;
      cursor: pointer;
      /* 52px: objetivo táctil cómodo para el pulgar. */
      min-height: 52px;
   }
   .grupo button:hover {
      background: var(--superficie-alta);
   }

   .icono {
      font-size: 17px;
      flex-shrink: 0;
      width: 22px;
      text-align: center;
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
   }
   .texto small {
      font-size: 12px;
      color: var(--texto-tenue);
   }

   /* Sin llave de curso, las entregas no le sirven al profesor: se avisa. */
   .grupo button.pendiente {
      border-color: var(--aviso-borde);
   }
   .grupo button.pendiente small {
      color: var(--aviso-texto);
   }

   .peligroso button {
      border-color: color-mix(in srgb, var(--error) 45%, var(--borde));
   }
   .peligroso strong {
      color: var(--error);
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

   /* PC: recuadro centrado en vez de hoja inferior. */
   @media (min-width: 861px) {
      .hoja {
         left: auto;
         right: 14px;
         top: 58px;
         bottom: auto;
         width: 340px;
         border-radius: 14px;
         border: 1px solid var(--borde);
         max-height: calc(100dvh - 80px);
         padding-bottom: 16px;
         box-shadow: 0 12px 32px rgb(0 0 0 / 0.2);
      }
   }
</style>
