<script lang="ts">
   /**
    * Panel de revisión de un lote de entregas.
    *
    * Descifra todo lo importado, muestra las coincidencias primero —que es lo
    * que el profesor busca— y luego una fila por entrega con el resumen del
    * cuaderno, desplegable a sus ejercicios.
    *
    * Por qué agrupado y no plano: un grupo de 30 alumnos con 8 ejercicios son
    * 240 algoritmos. Escanear 30 filas y desplegar la que interese es manejable;
    * 240 filas seguidas no dejan ver cómo le fue a un alumno concreto.
    *
    * Las señales **ordenan la atención, no acusan**. Dos alumnos pueden llegar a
    * la misma solución de un ejercicio sencillo, y en los primeros temas es lo
    * normal. Por eso el texto dice «revisar», nunca «copia».
    */
   import type { Biblioteca } from '../file/biblioteca.svelte';
   import { duracion, verosimilitud, type Verosimilitud } from '../guard/bitacora.svelte';
   import {
      buscarCoincidencias,
      formaDe,
      tamano,
      type Coincidencia,
      type EjercicioParaAnalizar,
   } from './analisis';
   import { leerArchivoDeDisco } from '../file/transferencia';
   import { huellaDeEnunciados } from '../file/plantilla';
   import type { BitacoraEjercicio } from '../file/algx';

   interface Props {
      biblioteca: Biblioteca;
      onAbrir: (id: string) => void;
      onCerrar: () => void;
   }

   let { biblioteca, onAbrir, onCerrar }: Props = $props();

   interface FilaEjercicio {
      id: string;
      nombre: string;
      tiempo: number;
      ediciones: number;
      pegados: number;
      sospecha: Verosimilitud;
      /** Sin sentencias: el alumno lo dejó sin empezar. */
      vacio: boolean;
   }

   interface FilaEntrega {
      id: string;
      alumno: string;
      numeroControl: string;
      titulo: string;
      modificado: string;
      firmaValida: boolean;
      /** `null` si no se pudo descifrar con las llaves disponibles. */
      ejercicios: FilaEjercicio[] | null;
      sesiones: number | null;
      tiempoTotal: number | null;
      /** Tarea de la que salió el cuaderno, si vino de una plantilla. */
      plantilla?: string;
      /**
       * Los enunciados ya no son los que repartió el profesor.
       *
       * No es una acusación de copia: casi siempre es que borró el enunciado
       * sin querer. Sirve para saber que este cuaderno no es exactamente la
       * tarea que se repartió antes de compararlo con los demás.
       */
      enunciadoAlterado?: boolean;
      error?: string;
   }

   let filas = $state<FilaEntrega[]>([]);
   let coincidencias = $state<Coincidencia[]>([]);
   let revisando = $state(false);
   let mensaje = $state<string | null>(null);
   let desplegadas = $state<Set<string>>(new Set());
   let entradaArchivos: HTMLInputElement | undefined = $state();

   /** Entregas resaltadas por pertenecer a un grupo sospechoso. */
   const senaladas = $derived(new Set(coincidencias.flatMap((c) => c.entregas)));

   function alternar(id: string) {
      const copia = new Set(desplegadas);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      desplegadas = copia;
   }

   /** Un ejercicio sin sentencias no se juzga: está sin empezar, no copiado. */
   function sospechaDe(b: BitacoraEjercicio, vacio: boolean): Verosimilitud {
      if (vacio) return 'normal';
      return verosimilitud({ ...b, sesiones: 1 });
   }

   async function revisar() {
      revisando = true;
      mensaje = null;

      const nuevasFilas: FilaEntrega[] = [];
      const paraAnalizar: EjercicioParaAnalizar[] = [];

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
            const ejercicios: FilaEjercicio[] = [];

            for (const e of abierto.contenido.ejercicios) {
               const vacio = e.programa.body.length === 0;
               ejercicios.push({
                  id: e.id,
                  nombre: e.nombre,
                  tiempo: e.bitacora.segundosActivos,
                  ediciones: e.bitacora.ediciones,
                  pegados: e.bitacora.pegadosBloqueados,
                  sospecha: sospechaDe(e.bitacora, vacio),
                  vacio,
               });

               // Los vacíos no entran a comparar: coincidirían todos entre sí.
               if (!vacio) {
                  paraAnalizar.push({
                     entregaId: resumen.id,
                     ejercicioId: e.id,
                     numeroControl: resumen.numeroControl,
                     nombre: resumen.autor,
                     nombreEjercicio: e.nombre,
                     deviceId: '',
                     huella: resumen.huella,
                     origenId: e.origenId,
                     forma: formaDe(e.programa),
                     tamano: tamano(e.programa),
                  });
               }
            }

            // De la plantilla solo se guardó la huella, no el archivo: basta
            // para saber si los enunciados siguen siendo los repartidos.
            const origen = abierto.contenido.plantilla;
            const alterado =
               origen !== undefined &&
               origen.huella !== '' &&
               origen.huella !==
                  (await huellaDeEnunciados(
                     abierto.contenido.ejercicios
                        .filter((e) => e.origenId)
                        .map((e) => ({ id: e.origenId as string, enunciado: e.enunciado })),
                  ));

            nuevasFilas.push({
               ...comun,
               firmaValida: abierto.firmaValida,
               ejercicios,
               sesiones: abierto.contenido.bitacora.sesiones,
               tiempoTotal: abierto.contenido.bitacora.segundosActivos,
               ...(origen ? { plantilla: origen.nombre } : {}),
               ...(alterado ? { enunciadoAlterado: true } : {}),
            });
         } catch (e) {
            // Un archivo que no se puede abrir sigue contando para la señal de
            // instalación: el encabezado y la huella se leen sin descifrar.
            nuevasFilas.push({
               ...comun,
               firmaValida: false,
               ejercicios: null,
               sesiones: null,
               tiempoTotal: null,
               error: e instanceof Error ? e.message : 'No se pudo abrir.',
            });
            paraAnalizar.push({
               entregaId: resumen.id,
               ejercicioId: '',
               numeroControl: resumen.numeroControl,
               nombre: resumen.autor,
               nombreEjercicio: '—',
               deviceId: '',
               huella: resumen.huella,
            });
         }
      }

      filas = nuevasFilas;
      coincidencias = buscarCoincidencias(paraAnalizar);
      revisando = false;

      if (nuevasFilas.length === 0) mensaje = 'No hay entregas importadas todavía.';
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

   function hechos(fila: FilaEntrega): string {
      if (!fila.ejercicios) return '—';
      const con = fila.ejercicios.filter((e) => !e.vacio).length;
      return `${con}/${fila.ejercicios.length}`;
   }

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
               <h3>
                  {coincidencias.length === 1
                     ? '1 grupo para revisar'
                     : `${coincidencias.length} grupos para revisar`}
               </h3>
               <p class="matiz">
                  Estas señales ordenan por dónde empezar; no son una acusación. Dos alumnos
                  pueden resolver igual un ejercicio sencillo.
               </p>
               {#each coincidencias as c, i (i)}
                  <article class="senal {c.tipo}">
                     <strong>
                        {c.tipo === 'instalacion' ? 'Mismo dispositivo' : 'Mismo algoritmo'}
                     </strong>
                     <span class="implicados">
                        {#each c.implicados as im, j (j)}
                           {#if j > 0}<span class="sep"> ↔ </span>{/if}<span class="quien"
                              >{im.alumno}</span
                           ><span class="donde"> · {im.ejercicio}</span>
                        {/each}
                     </span>
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
                        <th class="sitio"><span class="oculto">Desplegar</span></th>
                        <th>Alumno</th>
                        <th>Cuaderno</th>
                        <th class="num">Hechos</th>
                        <th class="num">Tiempo</th>
                        <th class="num">Ses.</th>
                        <th>Estado</th>
                     </tr>
                  </thead>
                  <tbody>
                     {#each filas as f (f.id)}
                        <tr class="entrega" class:senalada={senaladas.has(f.id)}>
                           <td class="sitio">
                              <button
                                 class="desplegar"
                                 onclick={() => alternar(f.id)}
                                 disabled={!f.ejercicios}
                                 aria-expanded={desplegadas.has(f.id)}
                                 aria-label={desplegadas.has(f.id) ? 'Plegar' : 'Desplegar'}
                              >
                                 {desplegadas.has(f.id) ? '▾' : '▸'}
                              </button>
                           </td>
                           <td>
                              <button class="enlace" onclick={() => onAbrir(f.id)}>
                                 {f.alumno}
                              </button>
                              <small>{f.numeroControl}</small>
                           </td>
                           <td>
                              {f.titulo}
                              <small>
                                 {cuando(f.modificado)}{f.plantilla ? ` · ${f.plantilla}` : ''}
                              </small>
                           </td>
                           <td class="num">{hechos(f)}</td>
                           <td class="num">
                              {f.tiempoTotal === null ? '—' : duracion(f.tiempoTotal)}
                           </td>
                           <td class="num">{f.sesiones ?? '—'}</td>
                           <td class="estado">
                              {#if f.error}
                                 <span class="mal">no se pudo abrir</span>
                              {:else}
                                 {#if !f.firmaValida}
                                    <span class="mal">alterado</span>
                                 {/if}
                                 {#if f.enunciadoAlterado}
                                    <span class="ojo" title="Los enunciados no son los que se repartieron">
                                       otro enunciado
                                    </span>
                                 {/if}
                                 {#if f.ejercicios?.some((e) => e.sospecha === 'muy-dudosa')}
                                    <span class="mal">poco trabajo</span>
                                 {:else if f.ejercicios?.some((e) => e.sospecha === 'dudosa')}
                                    <span class="ojo">revisar</span>
                                 {:else if f.firmaValida}
                                    <span class="bien">ok</span>
                                 {/if}
                              {/if}
                           </td>
                        </tr>

                        {#if desplegadas.has(f.id) && f.ejercicios}
                           {#each f.ejercicios as e, i (e.id)}
                              <tr class="ejercicio">
                                 <td class="sitio"></td>
                                 <td class="nombre-ejercicio" colspan="2">
                                    <span class="pos">{i + 1}</span>
                                    {e.nombre}
                                 </td>
                                 <td class="num">{e.ediciones} ed.</td>
                                 <td class="num">{e.vacio ? '—' : duracion(e.tiempo)}</td>
                                 <td class="num" class:alerta={e.pegados > 0}>
                                    {e.pegados || ''}
                                 </td>
                                 <td class="estado">
                                    {#if e.vacio}
                                       <span class="vacio">sin empezar</span>
                                    {:else if e.sospecha === 'muy-dudosa'}
                                       <span class="mal">poco trabajo</span>
                                    {:else if e.sospecha === 'dudosa'}
                                       <span class="ojo">revisar</span>
                                    {:else}
                                       <span class="bien">ok</span>
                                    {/if}
                                 </td>
                              </tr>
                           {/each}
                        {/if}
                     {/each}
                  </tbody>
               </table>
            </div>

            <p class="leyenda">
               <strong>Hechos</strong> ejercicios con contenido ·
               <strong>Ses.</strong> veces que se abrió el cuaderno ·
               <strong>ed.</strong> cambios hechos ·
               la columna de pegar cuenta los intentos que la app bloqueó ·
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
      width: min(940px, 100%);
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
   .implicados {
      font-size: 14px;
      color: var(--texto);
   }
   .quien {
      font-weight: 600;
   }
   .donde {
      color: var(--texto-tenue);
      font-size: 13px;
   }
   .sep {
      color: var(--texto-debil);
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
   .sitio {
      width: 28px;
      padding-right: 0;
   }
   .oculto {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
   }

   td small {
      display: block;
      font-size: 11px;
      color: var(--texto-debil);
      font-family: var(--fuente-mono);
   }

   tr.entrega.senalada td {
      background: color-mix(in srgb, var(--error) 8%, transparent);
   }

   /* Las filas de ejercicio se leen como detalle, no como iguales. */
   tr.ejercicio td {
      background: var(--fondo);
      font-size: 12.5px;
      color: var(--texto-tenue);
      border-bottom-color: transparent;
   }
   .nombre-ejercicio {
      color: var(--texto);
   }
   .pos {
      font-family: var(--fuente-mono);
      font-size: 11px;
      color: var(--texto-debil);
      margin-right: 7px;
   }

   .desplegar {
      border: 0;
      background: transparent;
      color: var(--texto-tenue);
      cursor: pointer;
      font-size: 11px;
      width: 24px;
      height: 24px;
      border-radius: 6px;
   }
   .desplegar:hover:not(:disabled) {
      background: var(--superficie-alta);
   }
   .desplegar:disabled {
      opacity: 0.3;
      cursor: default;
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
   .vacio {
      color: var(--texto-debil);
      font-style: italic;
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
