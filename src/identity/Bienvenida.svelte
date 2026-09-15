<script lang="ts">
   /**
    * Primer arranque en un aparato: número de control, nombre y PIN.
    *
    * No es una pantalla de registro: no hay cuenta y nada sale del aparato. El
    * PIN no se guarda ni se envía: junto con el número de control calcula la
    * llave que abre los archivos del alumno, y por eso el mismo número y el
    * mismo PIN sirven en cualquiera de sus aparatos. Se explica en la propia
    * pantalla, porque un formulario que pide datos sin decir para qué genera
    * desconfianza con razón.
    */
   import { validar, type ErrorValidacion } from './identidad';
   import { erroresPinDoble } from '../crypto/identidad-llave';
   import PinDoble from './PinDoble.svelte';

   interface Props {
      onListo: (datos: {
         numeroControl: string;
         nombre: string;
         grupo?: string;
         pin: string;
      }) => Promise<void>;
   }

   let { onListo }: Props = $props();

   let numeroControl = $state('');
   let nombre = $state('');
   let grupo = $state('');
   let pin = $state('');
   let confirmacion = $state('');
   let preparando = $state(false);
   let fallo = $state<string | null>(null);

   /** Los errores no se muestran hasta que el alumno intenta continuar. */
   let intentado = $state(false);

   const errores = $derived(validar({ numeroControl, nombre, grupo }));
   const errorDe = $derived(
      (campo: ErrorValidacion['campo']) =>
         intentado ? errores.find((e) => e.campo === campo)?.mensaje : undefined,
   );

   async function enviar(e: SubmitEvent) {
      e.preventDefault();
      intentado = true;
      if (errores.length > 0 || Object.keys(erroresPinDoble(pin, confirmacion)).length > 0) return;

      preparando = true;
      fallo = null;
      try {
         await onListo({ numeroControl, nombre, grupo, pin });
      } catch (err) {
         fallo = err instanceof Error ? err.message : 'No se pudo preparar tu llave.';
         preparando = false;
      }
   }
</script>

<div class="pantalla">
   <form onsubmit={enviar}>
      <div class="marca">
         <strong>RFlowP</strong>
         <span>Diseño de algoritmos</span>
      </div>

      <h1>Antes de empezar</h1>
      <p class="intro">
         Tus datos se guardan <strong>solo en este aparato</strong> y se incluyen en los
         algoritmos que crees, para que tu profesor sepa que son tuyos. No se envían a
         ningún servidor ni hay que crear una cuenta.
      </p>

      <p class="otro-aparato">
         <strong>¿Ya usas RFlowP en otro aparato?</strong> Escribe el mismo número de control
         y el mismo PIN: así tus archivos se abren en los dos.
      </p>

      <label class="campo">
         <span>Número de control</span>
         <input
            bind:value={numeroControl}
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            inputmode="text"
            aria-invalid={errorDe('numeroControl') ? 'true' : undefined}
         />
         {#if errorDe('numeroControl')}
            <small class="error">{errorDe('numeroControl')}</small>
         {/if}
      </label>

      <label class="campo">
         <span>Nombre completo</span>
         <input
            bind:value={nombre}
            autocomplete="off"
            autocapitalize="words"
            spellcheck="false"
            aria-invalid={errorDe('nombre') ? 'true' : undefined}
         />
         {#if errorDe('nombre')}
            <small class="error">{errorDe('nombre')}</small>
         {/if}
      </label>

      <label class="campo">
         <span>Grupo o materia <em>(opcional)</em></span>
         <input bind:value={grupo} autocomplete="off" spellcheck="false" />
         {#if errorDe('grupo')}
            <small class="error">{errorDe('grupo')}</small>
         {/if}
      </label>

      <PinDoble bind:pin bind:confirmacion {intentado} />

      {#if fallo}
         <p class="error-general" role="alert">{fallo}</p>
      {/if}

      <button type="submit" disabled={preparando}>
         {preparando ? 'Preparando tu llave…' : 'Empezar'}
      </button>

      <p class="aviso">
         Escribe bien tu número de control: aparecerá en todo lo que entregues. Tu PIN
         <strong>no se puede recuperar</strong>: si lo olvidas, solo tu profesor podrá abrir
         tus archivos. No uses tu fecha de nacimiento.
      </p>
   </form>
</div>

<style>
   .pantalla {
      position: fixed;
      inset: 0;
      z-index: 50;
      background: var(--fondo);
      display: grid;
      place-items: center;
      padding: 20px;
      overflow: auto;
   }

   form {
      width: min(440px, 100%);
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-radius: 16px;
      padding: 26px 24px;
   }

   .marca {
      display: flex;
      align-items: baseline;
      gap: 8px;
   }
   .marca strong {
      font-size: 18px;
      letter-spacing: -0.02em;
   }
   .marca span {
      font-size: 12px;
      color: var(--texto-tenue);
   }

   h1 {
      margin: 6px 0 0;
      font-size: 22px;
      font-weight: 650;
      letter-spacing: -0.02em;
   }

   .intro {
      margin: 0;
      font-size: 13px;
      line-height: 1.55;
      color: var(--texto-tenue);
   }

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
   .campo em {
      font-style: normal;
      font-weight: 400;
      text-transform: none;
      letter-spacing: 0;
      color: var(--texto-debil);
   }

   input {
      border: 1px solid var(--borde);
      background: var(--fondo);
      color: var(--texto);
      border-radius: 10px;
      padding: 12px;
      /* 16px evita que iOS haga zoom al enfocar el campo. */
      font-size: 16px;
      font-family: inherit;
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

   button {
      margin-top: 4px;
      border: 0;
      background: var(--acento);
      color: #04140b;
      font-weight: 650;
      padding: 13px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 15px;
   }

   .aviso {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--texto-debil);
   }

   .otro-aparato {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--texto-tenue);
      background: var(--superficie-alta);
      border-radius: 10px;
      padding: 10px 12px;
   }
   .otro-aparato strong {
      color: var(--texto);
   }

   .error-general {
      margin: 0;
      color: var(--error);
      font-size: 13px;
   }

   button:disabled {
      opacity: 0.7;
      cursor: progress;
   }
</style>
