<script lang="ts">
   /**
    * Crear el PIN en una instalación que ya existía.
    *
    * Tres pasos, en una sola caja:
    *   1. Crear el PIN.
    *   2. Ver el código de identidad.
    *   3. Convertir los archivos que ya había, si los hay.
    *
    * No se puede cerrar sin crear el PIN: todo lo que se guarde a partir de
    * aquí tiene que quedar con la llave que funciona en cualquier aparato, o el
    * alumno descubriría el problema justo el día de la entrega.
    *
    * Convertir no es automático a propósito: reescribe archivos, y el alumno
    * tiene que ver que pasa y cuántos quedaron.
    */
   import { erroresPinDoble } from '../crypto/identidad-llave';
   import type { ResultadoConversion } from '../file/biblioteca.svelte';
   import PinDoble from './PinDoble.svelte';
   import CodigoIdentidad from './CodigoIdentidad.svelte';

   interface Props {
      numeroControl: string;
      nombre: string;
      /** Crea el PIN y devuelve el código y cuántos archivos hay por convertir. */
      onCrear: (pin: string) => Promise<{ codigo: string; pendientes: number }>;
      onConvertir: () => Promise<ResultadoConversion>;
      onTerminar: () => void;
   }

   let { numeroControl, nombre, onCrear, onConvertir, onTerminar }: Props = $props();

   let pin = $state('');
   let confirmacion = $state('');
   let intentado = $state(false);
   let trabajando = $state(false);
   let fallo = $state<string | null>(null);

   let codigo = $state<string | null>(null);
   let pendientes = $state(0);
   let resultado = $state<ResultadoConversion | null>(null);

   async function crear(e: SubmitEvent) {
      e.preventDefault();
      intentado = true;
      if (Object.keys(erroresPinDoble(pin, confirmacion)).length > 0) return;

      trabajando = true;
      fallo = null;
      try {
         const hecho = await onCrear(pin);
         codigo = hecho.codigo;
         pendientes = hecho.pendientes;
      } catch (err) {
         fallo = err instanceof Error ? err.message : 'No se pudo crear el PIN.';
      } finally {
         trabajando = false;
      }
   }

   async function convertir() {
      trabajando = true;
      fallo = null;
      try {
         resultado = await onConvertir();
      } catch (err) {
         fallo = err instanceof Error ? err.message : 'No se pudieron convertir.';
      } finally {
         trabajando = false;
      }
   }
</script>

<div class="fondo">
   <div class="caja" role="dialog" aria-modal="true" aria-labelledby="titulo-pin">
      {#if !codigo}
         <form onsubmit={crear}>
            <h2 id="titulo-pin">Crea tu PIN</h2>
            <p>
               Ahora puedes abrir tus archivos en tu teléfono <strong>y</strong> en tu PC. Para
               eso, tu llave se calcula con tu número de control y un PIN de 6 dígitos que solo
               tú sabes.
            </p>
            <p class="quien">
               <strong>{nombre}</strong> · {numeroControl}
            </p>

            <PinDoble bind:pin bind:confirmacion {intentado} enfocar />

            <p class="aviso">
               Si ya creaste un PIN en otro aparato, escribe <strong>el mismo</strong>. No se
               puede recuperar: si lo olvidas, solo tu profesor podrá abrir tus archivos. No uses
               tu fecha de nacimiento.
            </p>

            {#if fallo}
               <p class="error" role="alert">{fallo}</p>
            {/if}

            <button type="submit" class="principal" disabled={trabajando}>
               {trabajando ? 'Preparando tu llave…' : 'Crear PIN'}
            </button>
         </form>
      {:else}
         <div class="listo">
            <h2 id="titulo-pin">PIN creado</h2>

            <CodigoIdentidad {codigo} />

            {#if pendientes > 0 && !resultado}
               <div class="convertir">
                  <p>
                     {pendientes === 1
                        ? 'Tienes 1 archivo guardado con la llave anterior.'
                        : `Tienes ${pendientes} archivos guardados con la llave anterior.`}
                     Aquí se siguen abriendo, pero en tu otro aparato no, hasta convertirlos.
                     No cambia su contenido, ni su fecha, ni su bitácora.
                  </p>
                  <button class="principal" onclick={convertir} disabled={trabajando}>
                     {trabajando ? 'Convirtiendo…' : `Convertir mis archivos (${pendientes})`}
                  </button>
               </div>
            {/if}

            {#if resultado}
               <p class="resultado" role="status">
                  {resultado.convertidos === 1
                     ? 'Se convirtió 1 archivo.'
                     : `Se convirtieron ${resultado.convertidos} archivos.`}
                  {#if resultado.noSePudieron > 0}
                     {resultado.noSePudieron === 1
                        ? '1 no se pudo: se hizo en otro aparato antes del PIN. Conviértelo desde aquel.'
                        : `${resultado.noSePudieron} no se pudieron: se hicieron en otro aparato antes del PIN. Conviértelos desde aquel.`}
                  {/if}
               </p>
            {/if}

            {#if fallo}
               <p class="error" role="alert">{fallo}</p>
            {/if}

            <button onclick={onTerminar} disabled={trabajando}>
               {pendientes > 0 && !resultado ? 'Ahora no' : 'Continuar'}
            </button>
         </div>
      {/if}
   </div>
</div>

<style>
   .fondo {
      position: fixed;
      inset: 0;
      z-index: 58;
      background: rgb(0 0 0 / 0.6);
      display: grid;
      place-items: center;
      padding: 20px;
      overflow: auto;
   }
   .caja {
      width: min(440px, 100%);
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-radius: 16px;
      padding: 22px;
   }
   form,
   .listo,
   .convertir {
      display: flex;
      flex-direction: column;
      gap: 12px;
   }
   h2 {
      margin: 0;
      font-size: 19px;
      font-weight: 650;
   }
   p {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.5;
      color: var(--texto-tenue);
   }
   p strong {
      color: var(--texto);
   }
   .quien {
      font-size: 13px;
   }
   .aviso {
      font-size: 12px;
      color: var(--texto-debil);
   }
   .error {
      color: var(--error);
   }
   .resultado {
      background: var(--superficie-alta);
      border-radius: 10px;
      padding: 10px 12px;
      color: var(--texto);
   }
   button {
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      font-weight: 600;
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 15px;
      font-family: inherit;
   }
   button.principal {
      border: 0;
      background: var(--acento);
      color: #04140b;
   }
   button:disabled {
      opacity: 0.7;
      cursor: progress;
   }
</style>
