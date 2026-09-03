<script lang="ts">
   /**
    * Borrar los datos locales.
    *
    * Es destructivo e irreversible, así que pide escribir la palabra en vez de
    * un botón que se pulsa sin leer, y dice exactamente qué se va a perder.
    *
    * Sobre la honestidad del texto: en la versión actual los archivos `.algx`
    * que el alumno ya exportó **no están cifrados**, así que borrar la identidad
    * no los vuelve ilegibles. Decir lo contrario sería mentirle. Cuando llegue
    * el cifrado (fase 5), el aviso cambia y pasa a ser cierto: la llave se
    * destruye con la identidad y solo el profesor podrá abrirlos.
    */
   import type { Identidad } from './identidad';

   interface Props {
      identidad: Identidad;
      /** Cuántos algoritmos hay guardados dentro de la app. */
      guardados: number;
      onConfirmar: () => void;
      onCancelar: () => void;
   }

   let { identidad, guardados, onConfirmar, onCancelar }: Props = $props();

   const PALABRA = 'BORRAR';
   let escrito = $state('');
   const puedeBorrar = $derived(escrito.trim().toUpperCase() === PALABRA);

   function enviar(e: SubmitEvent) {
      e.preventDefault();
      if (puedeBorrar) onConfirmar();
   }
</script>

<div class="fondo">
   <div class="caja" role="alertdialog" aria-modal="true" aria-labelledby="titulo-borrar">
   <form onsubmit={enviar}>
      <h2 id="titulo-borrar">Borrar mis datos</h2>

      <p class="que">Se va a borrar de este dispositivo:</p>
      <ul>
         <li>
            Tu identidad: <strong>{identidad.nombre}</strong>, número de control
            <strong>{identidad.numeroControl}</strong>
         </li>
         <li>
            {guardados === 0
               ? 'No hay algoritmos guardados dentro de la app.'
               : guardados === 1
                 ? '1 algoritmo guardado dentro de la app.'
                 : `${guardados} algoritmos guardados dentro de la app.`}
         </li>
      </ul>

      <p class="fuerte">Esto no se puede deshacer.</p>

      <p class="nota">
         Los archivos <code>.algx</code> que ya hayas exportado seguirán existiendo fuera de
         la app. En esta versión todavía <strong>no están protegidos</strong>: se pueden abrir
         sin tu identidad.
      </p>

      <label>
         <span>Escribe <strong>{PALABRA}</strong> para confirmar</span>
         <input
            bind:value={escrito}
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
         />
      </label>

      <div class="botones">
         <button type="button" onclick={onCancelar}>Cancelar</button>
         <button type="submit" class="peligro" disabled={!puedeBorrar}>
            Borrar todo
         </button>
      </div>
   </form>
   </div>
</div>

<style>
   .fondo {
      position: fixed;
      inset: 0;
      background: rgb(0 0 0 / 0.6);
      display: grid;
      place-items: center;
      padding: 20px;
      z-index: 60;
      overflow: auto;
   }

   .caja {
      width: min(440px, 100%);
      background: var(--superficie);
      border: 1px solid var(--error);
      border-radius: 14px;
      padding: 22px;
   }

   .caja form {
      display: flex;
      flex-direction: column;
      gap: 12px;
   }

   h2 {
      margin: 0;
      font-size: 18px;
      color: var(--error);
   }

   .que {
      margin: 0;
      font-size: 14px;
   }

   ul {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--texto-tenue);
   }
   ul strong {
      color: var(--texto);
   }

   .fuerte {
      margin: 0;
      font-size: 14px;
      font-weight: 650;
   }

   .nota {
      margin: 0;
      font-size: 12px;
      line-height: 1.55;
      color: var(--texto-tenue);
      background: var(--aviso-fondo);
      color: var(--aviso-texto);
      border: 1px solid var(--aviso-borde);
      border-radius: 9px;
      padding: 9px 11px;
   }
   .nota code {
      font-family: var(--fuente-mono);
      font-size: 11px;
   }

   label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
   }

   input {
      border: 1px solid var(--borde);
      background: var(--fondo);
      color: var(--texto);
      border-radius: 9px;
      padding: 11px;
      /* 16px evita que iOS haga zoom al enfocar el campo. */
      font-size: 16px;
      font-family: var(--fuente-mono);
      letter-spacing: 0.08em;
   }
   input:focus {
      outline: none;
      border-color: var(--error);
   }

   .botones {
      display: flex;
      gap: 8px;
      margin-top: 2px;
   }
   .botones button {
      flex: 1;
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 9px;
      padding: 12px;
      cursor: pointer;
      font-size: 14px;
   }
   .botones .peligro {
      border-color: var(--error);
      background: var(--error);
      color: #fff;
      font-weight: 600;
   }
   .botones .peligro:disabled {
      background: transparent;
      color: var(--texto-debil);
      border-color: var(--borde);
      cursor: default;
   }
</style>
