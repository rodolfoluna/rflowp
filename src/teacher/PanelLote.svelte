<script lang="ts">
   /**
    * Panel de revisión de un lote de entregas.
    *
    * Descifra todo lo importado, muestra una tabla con la evidencia de cada
    * trabajo y señala los grupos sospechosos. El orden importa: primero las
    * coincidencias, porque es lo que el profesor busca; la tabla completa
    * después, para el repaso normal.
    *
    * Las señales **ordenan la atención, no acusan**. Dos alumnos pueden llegar
    * a la misma solución de un ejercicio sencillo, y en los primeros temas es lo
    * normal. Por eso el texto de la interfaz dice «revisar», nunca «copia».
    */
   import type { Biblioteca } from '../file/biblioteca.svelte';
   import { duracion, verosimilitud, type Verosimilitud } from '../guard/bitacora.svelte';
   import {
      buscarCoincidencias,
      formaDe,
      tamano,
      type Coincidencia,
      type EntregaParaAnalizar,
   } from './analisis';
   import { leerArchivoDeDisco } from '../file/transferencia';

   interface Props {
      biblioteca: Biblioteca;
      onAbrir: (id: string) => void;
      onCerrar: () => void;
   }

   let { biblioteca, onAbrir, onCerrar }: Props = $props();

   interface Fila {
      id: string;
      alumno: string;
      numeroControl: string;
      titulo: string;
      modificado: string;
      /** `null` si no se pudo descifrar con las llaves disponibles. */
      tiempo: number | null;
      sesiones: number | null;
      ediciones: number | null;
      pegados: number | null;
      firmaValida: boolean;
      sospecha: Verosimilitud | null;
      error?: string;
   }

   let filas = $state<Fila[]>([]);
   let coincidencias = $state<Coincidencia[]>([]);
   let revisando = $state(false);
   let mensaje = $state<string | null>(null);
   let entradaArchivos: HTMLInputElement | undefined = $state();

   /** Ids resaltados por pertenecer a un grupo sospechoso. */
   const senalados = $derived(new Set(coincidencias.flatMap((c) => c.ids)));

   async function revisar() {
      revisando = true;
      mensaje = null;

      const nuevasFilas: Fila[] = [];
      const paraAnalizar: EntregaParaAnalizar[] = [];

      for (const resumen of biblioteca.archivos) {
         const comun = {
            id: resumen.id,
            alumno: resumen.autor,
            numeroControl: resumen.numeroControl,
            titulo: resumen.titulo,
            modificado: resumen.modificado,
         };

         try {
            const abierto = await biblioteca.abrir(resumen.id);
            const b = abierto.contenido.bitacora;

            nuevasFilas.push({
               ...comun,
               tiempo: b.segundosActivos,
               sesiones: b.sesiones,
               ediciones: b.ediciones,
               pegados: b.pegadosBloqueados,
               firmaValida: abierto.firmaValida,
               sospecha: verosimilitud(b),
            });

            paraAnalizar.push({
               id: resumen.id,
               numeroControl: resumen.numeroControl,
               nombre: resumen.autor,
               deviceId: '',
               huella: resumen.huella,
               forma: formaDe(abierto.contenido.programa),
               tamano: tamano(abierto.contenido.programa),
            });
         } catch (e) {
            // Un archivo que no se puede abrir sigue contando para las señales
            // de instalación: el encabezado y la huella se leen sin descifrar.
            nuevasFilas.push({
               ...comun,
               tiempo: null,
               sesiones: null,
               ediciones: null,
               pegados: null,
               firmaValida: false,
               sospecha: null,
               error: e instanceof Error ? e.message : 'No se pudo abrir.',
            });
            paraAnalizar.push({
               id: resumen.id,
               numeroControl: resumen.numeroControl,
               nombre: resumen.autor,
               deviceId: '',
               huella: resumen.huella,
            });
         }
      }

      filas = nuevasFilas;
      coincidencias = buscarCoincidencias(paraAnalizar);
      revisando = false;

      if (nuevasFilas.length === 0) {
         mensaje = 'No hay entregas importadas todavía.';
      }
   }

   async function importarVarios(e: Event) {
      const input = e.currentTarget as HTMLInputElement;
      const archivos = [...(input.files ?? [])];
      input.value = '';
      if (archivos.length === 0) return;

      revisando = true;
      let bien = 0;
      const fallidos: string[] = [];

      for (const archivo of archivos) {
         try {
            await biblioteca.importar(await leerArchivoDeDisco(archivo));
            bien += 1;
         } catch {
            fallidos.push(archivo.name);
         }
      }

      await revisar();
      mensaje =
         fallidos.length === 0
            ? `Se importaron ${bien} entregas.`
            : `Se importaron ${bien}. No se pudieron leer: ${fallidos.join(', ')}.`;
   }

   function cuando(iso: string): string {
      const f = new Date(iso);
      if (Number.isNaN(f.getTime())) return '—';
      return f.toLocaleDateString('es-MX', {
         day: 'numeric',
         month: 'short',
         hour: '2-digit',
         minute: '2-digit',
      });
   }

   // Revisar al abrir el panel.
   $effect(() => {
      void revisar();
   });
</script>

<div class="fondo">
   <div class="caja" role="dialog" aria-modal="true" aria-labelledby="titulo-lote">
      <header>
         <h2 id="titulo-lote">Revisar entregas</h2>
         <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
      </header>

      <div class="acciones">
         <button onclick={() => entradaArchivos?.click()} disabled={revisando}>
            Importar entregas…
         </button>
         <button onclick={revisar} disabled={revisando}>
            {revisando ? 'Revisando…' : 'Volver a revisar'}
         </button>
         <input
            bind:this={entradaArchivos}
            type="file"
            accept=".algx,application/json,application/octet-stream"
            multiple
            onchange={importarVarios}
            hidden
         />
      </div>

      {#if mensaje}
         <p class="mensaje" role="status">{mensaje}</p>
      {/if}

      <div class="cuerpo">
         {#if coincidencias.length > 0}
            <section class="senales">
               <h3>{coincidencias.length === 1 ? '1 grupo para revisar' : `${coincidencias.length} grupos para revisar`}</h3>
               <p class="matiz">
                  Estas señales ordenan por dónde empezar; no son una acusación. Dos alumnos
                  pueden resolver igual un ejercicio sencillo.
               </p>
               {#each coincidencias as c, i (i)}
                  <article class="senal {c.tipo}">
                     <strong>
                        {c.tipo === 'instalacion' ? 'Mismo dispositivo' : 'Mismo algoritmo'}
                     </strong>
                     <span class="alumnos">{c.alumnos.join(' · ')}</span>
                     <p>{c.explicacion}</p>
                  </article>
               {/each}
            </section>
         {:else if filas.length > 0 && !revisando}
            <p class="limpio">Sin coincidencias entre las {filas.length} entregas revisadas.</p>
         {/if}

         {#if filas.length > 0}
            <div class="tabla-envoltura">
               <table>
                  <thead>
                     <tr>
                        <th>Alumno</th>
                        <th>Trabajo</th>
                        <th class="num">Tiempo</th>
                        <th class="num">Ses.</th>
                        <th class="num">Edic.</th>
                        <th class="num">Pegar</th>
                        <th>Estado</th>
                     </tr>
                  </thead>
                  <tbody>
                     {#each filas as f (f.id)}
                        <tr class:senalada={senalados.has(f.id)}>
                           <td>
                              <button class="enlace" onclick={() => onAbrir(f.id)}>
                                 {f.alumno}
                              </button>
                              <small>{f.numeroControl}</small>
                           </td>
                           <td>
                              {f.titulo}
                              <small>{cuando(f.modificado)}</small>
                           </td>
                           <td class="num">{f.tiempo === null ? '—' : duracion(f.tiempo)}</td>
                           <td class="num">{f.sesiones ?? '—'}</td>
                           <td class="num">{f.ediciones ?? '—'}</td>
                           <td class="num" class:alerta={(f.pegados ?? 0) > 0}>
                              {f.pegados ?? '—'}
                           </td>
                           <td class="estado">
                              {#if f.error}
                                 <span class="mal">no se pudo abrir</span>
                              {:else}
                                 {#if !f.firmaValida}
                                    <span class="mal">alterado</span>
                                 {/if}
                                 {#if f.sospecha === 'muy-dudosa'}
                                    <span class="mal">poco trabajo</span>
                                 {:else if f.sospecha === 'dudosa'}
                                    <span class="ojo">revisar</span>
                                 {/if}
                                 {#if f.firmaValida && f.sospecha === 'normal'}
                                    <span class="bien">ok</span>
                                 {/if}
                              {/if}
                           </td>
                        </tr>
                     {/each}
                  </tbody>
               </table>
            </div>

            <p class="leyenda">
               <strong>Ses.</strong> veces que se abrió para trabajar ·
               <strong>Edic.</strong> cambios hechos ·
               <strong>Pegar</strong> intentos de pegar que la app bloqueó ·
               <strong>alterado</strong> el encabezado no coincide con la firma.
            </p>
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
      z-index: 62;
   }

   .caja {
      width: min(900px, 100%);
      max-height: min(92dvh, 800px);
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

   .acciones {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--borde);
      flex-shrink: 0;
      flex-wrap: wrap;
   }
   .acciones button {
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 9px;
      padding: 10px 14px;
      cursor: pointer;
      font-size: 14px;
   }
   .acciones button:disabled {
      opacity: 0.55;
      cursor: default;
   }

   .mensaje {
      margin: 0;
      padding: 9px 16px;
      font-size: 12px;
      color: var(--texto-tenue);
      background: var(--fondo);
      border-bottom: 1px solid var(--borde);
      flex-shrink: 0;
   }

   .cuerpo {
      overflow: auto;
      padding: 14px 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
   }

   .senales {
      display: flex;
      flex-direction: column;
      gap: 8px;
   }
   h3 {
      margin: 0;
      font-size: 13px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--error);
   }
   .matiz {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--texto-tenue);
   }

   .senal {
      display: flex;
      flex-direction: column;
      gap: 3px;
      border: 1px solid var(--aviso-borde);
      background: var(--aviso-fondo);
      color: var(--aviso-texto);
      border-radius: 10px;
      padding: 10px 12px;
   }
   .senal.instalacion {
      border-color: var(--error);
      background: transparent;
      color: var(--error);
   }
   .senal strong {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
   }
   .alumnos {
      font-size: 14px;
      font-weight: 600;
      color: var(--texto);
   }
   .senal p {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
   }

   .limpio {
      margin: 0;
      font-size: 13px;
      color: var(--texto-tenue);
   }

   .tabla-envoltura {
      /* La tabla se desborda en pantallas estrechas; se desplaza en su caja
         para no romper el ancho del diálogo. */
      overflow-x: auto;
   }

   table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
   }
   th,
   td {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--borde);
      vertical-align: top;
      white-space: nowrap;
   }
   th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--texto-debil);
      font-weight: 600;
      position: sticky;
      top: 0;
      background: var(--superficie);
   }
   .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
   }

   td small {
      display: block;
      font-size: 11px;
      color: var(--texto-debil);
      font-family: var(--fuente-mono);
   }

   tr.senalada td {
      background: color-mix(in srgb, var(--error) 8%, transparent);
   }

   .enlace {
      border: 0;
      background: transparent;
      color: var(--texto);
      font: inherit;
      font-weight: 600;
      padding: 0;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
   }

   .estado {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      border-bottom: 1px solid var(--borde);
   }
   .estado span {
      font-size: 11px;
      border-radius: 5px;
      padding: 2px 7px;
      white-space: nowrap;
   }
   .mal {
      background: var(--error);
      color: #fff;
   }
   .ojo {
      background: var(--aviso-fondo);
      color: var(--aviso-texto);
      border: 1px solid var(--aviso-borde);
   }
   .bien {
      color: var(--texto-debil);
      border: 1px solid var(--borde);
   }
   .alerta {
      color: var(--error);
      font-weight: 700;
   }

   .leyenda {
      margin: 0;
      font-size: 11px;
      line-height: 1.6;
      color: var(--texto-debil);
   }
</style>
