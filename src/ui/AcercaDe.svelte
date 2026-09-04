<script lang="ts">
   /**
    * Pantalla «Acerca de»: versión y avisos de terceros.
    *
    * No es adorno, es una obligación de licencia. La app incorpora Svelte y
    * Workbox (MIT) y material adaptado de PseudoFlow (BSD 3-Clause), y las tres
    * licencias exigen que su aviso de copyright acompañe a la distribución.
    * Tenerlo solo en el repositorio no basta: lo que se distribuye es la
    * aplicación, así que el aviso tiene que ser alcanzable desde ella.
    */
   import { APP_VERSION } from './version';

   interface Props {
      onCerrar: () => void;
   }

   let { onCerrar }: Props = $props();

   /** Ruta del archivo de avisos, respetando la subcarpeta donde viva la app. */
   const rutaAvisos = `${import.meta.env.BASE_URL}AVISOS.txt`;

   function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
   }
</script>

<svelte:window onkeydown={alTeclear} />

<div class="fondo">
   <div class="caja" role="dialog" aria-modal="true" aria-labelledby="titulo-acerca">
      <header>
         <h2 id="titulo-acerca">Acerca de RFlowP</h2>
         <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
      </header>

      <div class="cuerpo">
         <p class="version">Versión {APP_VERSION}</p>

         <p>
            Herramienta para diseñar algoritmos en pseudocódigo o en diagrama de flujo,
            ejecutarlos y entregarlos.
         </p>

         <p class="propio">
            © 2026 Rodolfo Luna. Todos los derechos reservados.
         </p>

         <section>
            <h3>Componentes de terceros</h3>
            <ul>
               <li>
                  <strong>Svelte</strong> <span>MIT</span>
                  <small>© 2016-2025 Svelte Contributors</small>
               </li>
               <li>
                  <strong>Workbox</strong> <span>MIT</span>
                  <small>© 2018 Google LLC</small>
               </li>
               <li>
                  <strong>PseudoFlow</strong> <span>BSD 3-Clause</span>
                  <small>© 2022-2026 Victor Talamantes — paleta y símbolos ANSI adaptados</small>
               </li>
            </ul>
            <p class="nota">
               El dialecto de pseudocódigo es compatible con el de PSeInt, pero RFlowP no
               contiene código de ese proyecto.
            </p>
            <a class="avisos" href={rutaAvisos} target="_blank" rel="noopener">
               Ver las licencias completas
            </a>
         </section>
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
      width: min(440px, 100%);
      max-height: min(88dvh, 660px);
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

   .cuerpo {
      overflow: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--texto-tenue);
   }
   .cuerpo p {
      margin: 0;
   }

   .version {
      font-family: var(--fuente-mono);
      font-size: 12px;
      color: var(--texto-debil);
   }

   .propio {
      color: var(--texto);
      font-weight: 600;
   }

   section {
      border-top: 1px solid var(--borde);
      padding-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 9px;
   }
   h3 {
      margin: 0;
      font-size: 12px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--texto-debil);
   }

   ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
   }
   li {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 10px;
   }
   li strong {
      font-size: 14px;
      color: var(--texto);
   }
   li span {
      font-family: var(--fuente-mono);
      font-size: 11px;
      color: var(--texto-debil);
      align-self: center;
   }
   li small {
      grid-column: 1 / -1;
      font-size: 11.5px;
      color: var(--texto-debil);
   }

   .nota {
      font-size: 12px;
   }

   .avisos {
      display: block;
      text-align: center;
      border: 1px solid var(--borde);
      background: var(--superficie-alta);
      color: var(--texto);
      border-radius: 9px;
      padding: 10px;
      text-decoration: none;
      font-size: 13.5px;
   }
   .avisos:hover {
      border-color: var(--acento);
   }
</style>
