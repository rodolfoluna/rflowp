<script lang="ts">
   import { untrack } from 'svelte';

   /**
    * Diálogo genérico para pedir una línea de texto.
    *
    * Existe porque `window.prompt` está bloqueado o se ve fatal en varios
    * navegadores móviles, y porque así el campo puede llevar el tamaño de
    * fuente que evita el zoom automático de iOS.
    */
   interface Props {
      titulo: string;
      etiqueta: string;
      valorInicial?: string;
      textoBoton?: string;
      onAceptar: (valor: string) => void;
      onCancelar: () => void;
   }

   let {
      titulo,
      etiqueta,
      valorInicial = '',
      textoBoton = 'Aceptar',
      onAceptar,
      onCancelar,
   }: Props = $props();

   // `untrack` declara que esto es un valor inicial y no una dependencia: el
   // componente se monta de nuevo cada vez que se abre, así que basta.
   let valor = $state(untrack(() => valorInicial));
   const valido = $derived(valor.trim().length > 0);

   function enviar(e: SubmitEvent) {
      e.preventDefault();
      if (valido) onAceptar(valor.trim());
   }

   function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelar();
   }
</script>

<svelte:window onkeydown={alTeclear} />

<div class="fondo">
   <form class="caja" onsubmit={enviar}>
      <h2>{titulo}</h2>
      <label>
         <span>{etiqueta}</span>
         <!-- svelte-ignore a11y_autofocus -->
         <input bind:value={valor} autocomplete="off" spellcheck="false" autofocus />
      </label>
      <div class="botones">
         <button type="button" onclick={onCancelar}>Cancelar</button>
         <button type="submit" class="principal" disabled={!valido}>{textoBoton}</button>
      </div>
   </form>
</div>

<style>
   .fondo {
      position: fixed;
      inset: 0;
      background: rgb(0 0 0 / 0.55);
      display: grid;
      place-items: center;
      padding: 20px;
      z-index: 55;
   }

   .caja {
      width: min(420px, 100%);
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
   }

   h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 650;
   }

   label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--texto-tenue);
      text-transform: uppercase;
      letter-spacing: 0.04em;
   }

   input {
      border: 1px solid var(--borde);
      background: var(--fondo);
      color: var(--texto);
      border-radius: 9px;
      padding: 11px 12px;
      /* 16px evita que iOS haga zoom al enfocar el campo. */
      font-size: 16px;
      font-family: inherit;
      font-weight: 400;
      text-transform: none;
      letter-spacing: 0;
   }
   input:focus {
      outline: none;
      border-color: var(--acento);
   }

   .botones {
      display: flex;
      gap: 8px;
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
   .botones .principal {
      border: 0;
      background: var(--acento);
      color: #04140b;
      font-weight: 650;
   }
   .botones .principal:disabled {
      background: var(--superficie-alta);
      color: var(--texto-debil);
      cursor: default;
   }
</style>
