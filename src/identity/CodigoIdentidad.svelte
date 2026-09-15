<script lang="ts">
   /**
    * El código de identidad, grande y con la explicación de para qué sirve.
    *
    * En un aparato nuevo no hay contra qué comprobar el PIN: uno mal tecleado
    * da otra llave sin ningún error. Comparar este código con el del otro
    * aparato es la única forma de saber que el PIN está bien antes de ponerse a
    * trabajar.
    */
   interface Props {
      codigo: string;
   }

   let { codigo }: Props = $props();
</script>

<div class="codigo">
   <span class="rotulo">Tu código de identidad</span>
   <strong>{codigo}</strong>
   <p>
      Si ya usas RFlowP en otro aparato, abre el menú ⋮ allí: tiene que decir
      <strong>el mismo código</strong>. Si es otro, aquí escribiste un PIN distinto y tus
      archivos no se abrirán entre los dos aparatos.
   </p>
</div>

<style>
   .codigo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;
      background: var(--superficie-alta);
      border: 1px solid var(--borde);
      border-radius: 12px;
      padding: 16px 14px;
   }
   .rotulo {
      font-size: 11.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--texto-tenue);
   }
   .codigo > strong {
      font-family: var(--fuente-mono);
      font-size: 26px;
      letter-spacing: 0.08em;
      color: var(--texto);
   }
   p {
      margin: 4px 0 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--texto-tenue);
   }
   p strong {
      color: var(--texto);
   }
</style>
