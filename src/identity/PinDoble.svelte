<script lang="ts">
   /**
    * PIN y su confirmación.
    *
    * Se pide dos veces porque un PIN mal tecleado no da error: da OTRA llave, y
    * el alumno crearía en silencio archivos que no se abren en sus demás
    * aparatos. Dos veces no lo evita del todo —para eso está el código de
    * identidad—, pero corta el caso más común.
    */
   import { erroresPinDoble } from '../crypto/identidad-llave';

   interface Props {
      pin: string;
      confirmacion: string;
      /** Los errores no se muestran hasta que se intenta continuar. */
      intentado: boolean;
      /** Solo para el primer campo, al abrir la pantalla. */
      enfocar?: boolean;
   }

   let { pin = $bindable(), confirmacion = $bindable(), intentado, enfocar = false }: Props =
      $props();

   const errores = $derived(intentado ? erroresPinDoble(pin, confirmacion) : {});

   /** Solo dígitos, como máximo seis: el teclado numérico a veces deja pasar otros. */
   const limpiar = (v: string) => v.replace(/\D/g, '').slice(0, 6);
</script>

<label class="campo">
   <span>PIN de 6 dígitos</span>
   <!-- svelte-ignore a11y_autofocus -->
   <input
      value={pin}
      oninput={(e) => {
         pin = limpiar(e.currentTarget.value);
         e.currentTarget.value = pin;
      }}
      type="password"
      inputmode="numeric"
      autocomplete="off"
      maxlength="6"
      autofocus={enfocar}
      aria-invalid={errores.pin ? 'true' : undefined}
   />
   {#if errores.pin}
      <small class="error">{errores.pin}</small>
   {/if}
</label>

<label class="campo">
   <span>Repite el PIN</span>
   <input
      value={confirmacion}
      oninput={(e) => {
         confirmacion = limpiar(e.currentTarget.value);
         e.currentTarget.value = confirmacion;
      }}
      type="password"
      inputmode="numeric"
      autocomplete="off"
      maxlength="6"
      aria-invalid={errores.confirmacion ? 'true' : undefined}
   />
   {#if errores.confirmacion}
      <small class="error">{errores.confirmacion}</small>
   {/if}
</label>

<style>
   .campo {
      display: flex;
      flex-direction: column;
      gap: 6px;
   }
   .campo > span {
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
      border-radius: 10px;
      padding: 12px;
      /* 16px evita que iOS haga zoom al enfocar el campo. */
      font-size: 16px;
      font-family: var(--fuente-mono);
      letter-spacing: 0.3em;
   }
   input:focus {
      outline: none;
      border-color: var(--acento);
   }
   input[aria-invalid='true'] {
      border-color: var(--error);
   }
   .error {
      color: var(--error);
      font-size: 12px;
   }
</style>
