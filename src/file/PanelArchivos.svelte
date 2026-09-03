<script lang="ts">
   /**
    * Los algoritmos guardados: abrir, exportar, importar y borrar.
    *
    * Panel lateral en PC y hoja a pantalla casi completa en móvil, donde una
    * lista con acciones no cabe en una tira estrecha.
    */
   import type { Biblioteca, ResumenArchivo } from './biblioteca.svelte';
   import { descargar, leerArchivoDeDisco } from './transferencia';

   interface Props {
      biblioteca: Biblioteca;
      /** Archivo abierto ahora mismo, para marcarlo en la lista. */
      abiertoId?: string;
      deviceId: string;
      onAbrir: (id: string) => void;
      onCerrar: () => void;
   }

   let { biblioteca, abiertoId, deviceId, onAbrir, onCerrar }: Props = $props();

   let confirmandoBorrado = $state<string | null>(null);
   let mensaje = $state<string | null>(null);
   let entradaArchivo: HTMLInputElement | undefined = $state();

   function cuando(iso: string): string {
      if (!iso) return '';
      const fecha = new Date(iso);
      if (Number.isNaN(fecha.getTime())) return '';

      const ahora = Date.now();
      const minutos = Math.round((ahora - fecha.getTime()) / 60000);
      if (minutos < 1) return 'hace un momento';
      if (minutos < 60) return `hace ${minutos} min`;
      if (minutos < 60 * 24) return `hace ${Math.round(minutos / 60)} h`;

      return fecha.toLocaleDateString('es-MX', {
         day: 'numeric',
         month: 'short',
         year: fecha.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      });
   }

   async function exportar(archivo: ResumenArchivo) {
      try {
         const { nombre, texto } = await biblioteca.paraExportar(archivo.id);
         descargar(nombre, texto);
         mensaje = `Se descargó ${nombre}`;
      } catch (e) {
         mensaje = e instanceof Error ? e.message : 'No se pudo exportar.';
      }
   }

   async function borrar(id: string) {
      await biblioteca.borrar(id, deviceId);
      confirmandoBorrado = null;
      mensaje = 'Algoritmo borrado.';
   }

   async function importar(e: Event) {
      const input = e.currentTarget as HTMLInputElement;
      const archivo = input.files?.[0];
      // Se limpia siempre: si no, elegir el mismo archivo dos veces no dispara
      // el evento la segunda.
      input.value = '';
      if (!archivo) return;

      try {
         const texto = await leerArchivoDeDisco(archivo);
         await biblioteca.importar(texto, deviceId);
         mensaje = `Se importó ${archivo.name}`;
      } catch (err) {
         mensaje = err instanceof Error ? err.message : 'No se pudo abrir ese archivo.';
      }
   }
</script>

<aside class="panel" aria-label="Algoritmos guardados">
   <header>
      <h2>Mis algoritmos</h2>
      <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
   </header>

   <div class="acciones">
      <button onclick={() => entradaArchivo?.click()}>Importar .algx</button>
      <input
         bind:this={entradaArchivo}
         type="file"
         accept=".algx,application/json"
         onchange={importar}
         hidden
      />
   </div>

   {#if mensaje}
      <p class="mensaje" role="status">{mensaje}</p>
   {/if}

   {#if biblioteca.error}
      <p class="mensaje error" role="alert">{biblioteca.error}</p>
   {/if}

   <div class="lista">
      {#if biblioteca.cargando && biblioteca.archivos.length === 0}
         <p class="vacio">Cargando…</p>
      {:else if biblioteca.archivos.length === 0}
         <p class="vacio">
            Todavía no has guardado nada. Usa <strong>Guardar</strong> para conservar el
            algoritmo en el que estás trabajando.
         </p>
      {/if}

      {#each biblioteca.archivos as archivo (archivo.id)}
         <article class="archivo" class:abierto={archivo.id === abiertoId}>
            <button class="principal" onclick={() => onAbrir(archivo.id)}>
               <span class="titulo">{archivo.titulo}</span>
               <span class="meta">
                  {cuando(archivo.modificado)}
                  {#if !archivo.propio}
                     · <span class="ajeno">de {archivo.autor}</span>
                  {/if}
               </span>
            </button>

            <div class="botones">
               <button onclick={() => exportar(archivo)} aria-label="Exportar" title="Exportar">
                  ⤓
               </button>
               <button
                  class="peligro"
                  onclick={() => (confirmandoBorrado = archivo.id)}
                  aria-label="Borrar"
                  title="Borrar"
               >
                  🗑
               </button>
            </div>

            {#if confirmandoBorrado === archivo.id}
               <div class="confirmar">
                  <span>¿Borrar «{archivo.titulo}»?</span>
                  <button class="peligro" onclick={() => borrar(archivo.id)}>Sí, borrar</button>
                  <button onclick={() => (confirmandoBorrado = null)}>Cancelar</button>
               </div>
            {/if}
         </article>
      {/each}
   </div>
</aside>

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
      align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid var(--borde);
      flex-shrink: 0;
   }
   h2 {
      margin: 0;
      font-size: 15px;
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

   .acciones {
      padding: 10px 14px;
      border-bottom: 1px solid var(--borde);
      flex-shrink: 0;
   }
   .acciones button {
      width: 100%;
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 9px;
      padding: 10px;
      cursor: pointer;
      font-size: 14px;
   }

   .mensaje {
      margin: 0;
      padding: 9px 14px;
      font-size: 12px;
      color: var(--texto-tenue);
      background: var(--fondo);
      border-bottom: 1px solid var(--borde);
   }
   .mensaje.error {
      color: var(--error);
   }

   .lista {
      flex: 1;
      overflow: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 0;
   }

   .vacio {
      margin: 12px 8px;
      font-size: 13px;
      line-height: 1.55;
      color: var(--texto-debil);
   }

   .archivo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      border: 1px solid var(--borde);
      border-radius: 10px;
      background: var(--fondo);
      padding: 4px;
   }
   .archivo.abierto {
      border-color: var(--acento);
   }

   .principal {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      align-items: flex-start;
      text-align: left;
      border: 0;
      background: transparent;
      color: var(--texto);
      padding: 7px 8px;
      cursor: pointer;
      border-radius: 7px;
   }
   .principal:hover {
      background: var(--superficie-alta);
   }

   .titulo {
      font-size: 14px;
      font-weight: 600;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
   }
   .meta {
      font-size: 11px;
      color: var(--texto-debil);
   }
   .ajeno {
      color: var(--aviso-texto);
   }

   .botones {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
   }
   .botones button {
      border: 0;
      background: transparent;
      color: var(--texto-tenue);
      /* 36px: objetivo táctil mínimo aceptable en una lista densa. */
      width: 36px;
      height: 36px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
   }
   .botones button:hover {
      background: var(--superficie-alta);
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
      min-width: 120px;
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
</style>
