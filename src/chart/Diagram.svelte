<script lang="ts">
   /**
    * Renderiza el diagrama en SVG.
    *
    * Se eligió SVG sobre canvas (Konva) porque el diagrama tiene que ser
    * táctil y accesible: con SVG cada símbolo es un elemento del DOM, así que
    * el hit-testing lo hace el navegador, el zoom no pixela y un lector de
    * pantalla puede recorrerlo.
    */
   import type { Diagram, Shape, Connector, InsertPoint } from './layout';

   interface Props {
      diagram: Diagram;
      /** Nodo que se está ejecutando ahora mismo; se resalta. */
      activeNodeId?: string;
      /** Nodo seleccionado por el usuario. */
      selectedNodeId?: string;
      onSelect?: (nodeId: string) => void;
      /**
       * Muestra los puntos `+` para insertar. Se apaga durante la ejecución:
       * editar el árbol a media corrida dejaría el resaltado apuntando a nodos
       * que ya no existen.
       */
      editable?: boolean;
      onInsertar?: (punto: InsertPoint) => void;
   }

   let {
      diagram,
      activeNodeId,
      selectedNodeId,
      onSelect,
      editable = false,
      onInsertar,
   }: Props = $props();

   // -- Pan y zoom ---------------------------------------------------------

   let scale = $state(1);
   let panX = $state(0);
   let panY = $state(0);
   let svgEl: SVGSVGElement | undefined = $state();

   /** Punteros activos, para distinguir arrastre de pellizco. */
   const pointers = new Map<number, { x: number; y: number }>();
   let pinchStart = 0;
   let scaleStart = 1;

   /**
    * Cuánto se movió el puntero desde que se apoyó. Sirve para no disparar un
    * `+` cuando lo que el usuario hizo fue arrastrar el lienzo y soltar encima.
    */
   let arrastre = 0;

   function onPointerDown(e: PointerEvent) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      arrastre = 0;
      if (pointers.size === 2) {
         pinchStart = pinchDistance();
         scaleStart = scale;
      }
   }

   /** Un desplazamiento menor a esto se considera un toque, no un arrastre. */
   const TOLERANCIA_TOQUE = 6;

   function esToque(): boolean {
      return arrastre < TOLERANCIA_TOQUE;
   }

   function onPointerMove(e: PointerEvent) {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const next = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, next);

      if (pointers.size === 1) {
         const dx = next.x - prev.x;
         const dy = next.y - prev.y;
         arrastre += Math.abs(dx) + Math.abs(dy);
         panX += dx;
         panY += dy;
      } else if (pointers.size === 2 && pinchStart > 0) {
         const factor = pinchDistance() / pinchStart;
         scale = clampScale(scaleStart * factor);
      }
   }

   function onPointerUp(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
   }

   function pinchDistance(): number {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
   }

   function clampScale(v: number): number {
      return Math.min(3, Math.max(0.25, v));
   }

   function onWheel(e: WheelEvent) {
      e.preventDefault();
      scale = clampScale(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
   }

   /**
    * Encaja el diagrama **al ancho**, no a la ventana completa.
    *
    * Encajar también el alto dejaría un algoritmo de veinte pasos en un tamaño
    * ilegible, con los botones `+` demasiado pequeños para acertarles con el
    * dedo. Al ajustar solo el ancho, los símbolos conservan un tamaño usable y
    * lo que sobra se recorre arrastrando, que es lo natural en un diagrama de
    * flujo: se lee de arriba abajo.
    */
   export function fit() {
      if (!svgEl) return;
      const box = svgEl.getBoundingClientRect();
      if (!box.width || !box.height) return;

      // Nunca se amplía por encima del 100%: un algoritmo corto se vería
      // absurdamente grande.
      scale = clampScale(Math.min((box.width / diagram.width) * 0.94, 1));
      panX = (box.width - diagram.width * scale) / 2;
      panY = 16;
   }

   // Reencuadrar cuando cambia el tamaño del diagrama (no en cada tecleo).
   let lastFingerprint = '';
   $effect(() => {
      const fingerprint = `${Math.round(diagram.width)}x${Math.round(diagram.height)}`;
      if (fingerprint !== lastFingerprint) {
         lastFingerprint = fingerprint;
         queueMicrotask(fit);
      }
   });

   /**
    * Reencuadrar también cuando cambia el tamaño del lienzo.
    *
    * Hace falta porque en móvil el panel arranca en `display: none` y mide cero:
    * el `fit()` inicial no tendría con qué calcular la escala. El observador se
    * dispara al mostrarse la pestaña, al girar el teléfono y al redimensionar
    * la ventana en PC, que son exactamente los tres casos que importan.
    */
   $effect(() => {
      if (!svgEl) return;
      let previo = 0;
      const observer = new ResizeObserver(([entry]) => {
         const ancho = entry.contentRect.width;
         // Ignorar el paso a cero al ocultarse: no hay nada que encuadrar.
         if (ancho > 0 && previo === 0) fit();
         previo = ancho;
      });
      observer.observe(svgEl);
      return () => observer.disconnect();
   });

   // -- Geometría de los símbolos ------------------------------------------

   function pathFor(s: Shape): string {
      const { x, y, width: w, height: h } = s;
      switch (s.kind) {
         case 'io': {
            // Paralelogramo: el sesgo es proporcional al alto.
            const skew = h * 0.35;
            return `M ${x + skew} ${y} L ${x + w} ${y} L ${x + w - skew} ${y + h} L ${x} ${y + h} Z`;
         }
         case 'decision':
            return `M ${x + w / 2} ${y} L ${x + w} ${y + h / 2} L ${x + w / 2} ${y + h} L ${x} ${y + h / 2} Z`;
         case 'preparation': {
            const notch = w * 0.12;
            return (
               `M ${x + notch} ${y} L ${x + w - notch} ${y} L ${x + w} ${y + h / 2} ` +
               `L ${x + w - notch} ${y + h} L ${x + notch} ${y + h} L ${x} ${y + h / 2} Z`
            );
         }
         default:
            return '';
      }
   }

   function polyline(c: Connector): string {
      return c.points.map((p) => `${p.x},${p.y}`).join(' ');
   }

   /** Punto medio de la polilínea, para colocar la etiqueta de la rama. */
   function labelAnchor(c: Connector): { x: number; y: number } {
      const p = c.points;
      if (p.length < 2) return p[0] ?? { x: 0, y: 0 };
      // Se usa el primer tramo: es el que sale del rombo y donde la etiqueta
      // (`Sí` / `No`) resulta legible.
      const a = p[0];
      const b = p[1];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
   }

   /**
    * Parte la etiqueta en líneas que quepan dentro del símbolo.
    * Es una aproximación por número de caracteres: suficiente y sin medir texto.
    */
   function wrap(label: string, shape: Shape): string[] {
      const explicit = label.split('\n');
      const maxChars = Math.floor(shape.width / 8.4);
      const lines: string[] = [];

      for (const chunk of explicit) {
         if (chunk.length <= maxChars) {
            lines.push(chunk);
            continue;
         }
         let current = '';
         for (const word of chunk.split(' ')) {
            if (current && (current + ' ' + word).length > maxChars) {
               lines.push(current);
               current = word;
            } else {
               current = current ? current + ' ' + word : word;
            }
         }
         if (current) lines.push(current);
      }

      // Los símbolos no crecen: si sobra texto, se corta con puntos suspensivos.
      const maxLines = shape.kind === 'decision' ? 3 : 2;
      if (lines.length > maxLines) {
         const kept = lines.slice(0, maxLines);
         kept[maxLines - 1] = kept[maxLines - 1].slice(0, maxChars - 1) + '…';
         return kept;
      }
      return lines;
   }

   function lineHeight(): number {
      return 17;
   }
</script>

<div class="wrapper">
   <svg
      bind:this={svgEl}
      class="canvas"
      role="img"
      aria-label="Diagrama de flujo del algoritmo"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onwheel={onWheel}
   >
      <defs>
         <marker
            id="punta"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
         >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--linea)" />
         </marker>
      </defs>

      <g transform="translate({panX},{panY}) scale({scale})">
         <!-- Conectores primero: quedan por debajo de los símbolos. -->
         {#each diagram.connectors as c, i (i)}
            <polyline
               points={polyline(c)}
               class="conector"
               class:loop={c.loop}
               marker-end="url(#punta)"
            />
            {#if c.label}
               {@const anchor = labelAnchor(c)}
               <text class="etiqueta" x={anchor.x} y={anchor.y - 6}>{c.label}</text>
            {/if}
         {/each}

         {#each diagram.shapes as s (s.nodeId ?? s.label + s.y)}
            {@const lines = wrap(s.label, s)}
            {@const activo = s.nodeId !== undefined && s.nodeId === activeNodeId}
            {@const seleccionado = s.nodeId !== undefined && s.nodeId === selectedNodeId}
            <!--
               `role` y `tabindex` van siempre juntos: o ambos definidos (el
               símbolo es seleccionable) o ambos `undefined` (Inicio y Fin, que
               no representan ninguna sentencia). El analizador no puede probar
               que la condición es la misma en las dos líneas.
            -->
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <g
               class="simbolo {s.kind}"
               class:activo
               class:seleccionado
               class:clickable={s.nodeId !== undefined}
               role={s.nodeId ? 'button' : undefined}
               tabindex={s.nodeId ? 0 : undefined}
               onclick={() => s.nodeId && esToque() && onSelect?.(s.nodeId)}
               onkeydown={(e) => {
                  if (s.nodeId && (e.key === 'Enter' || e.key === ' ')) {
                     e.preventDefault();
                     onSelect?.(s.nodeId);
                  }
               }}
            >
               {#if s.kind === 'terminator'}
                  <rect
                     x={s.x}
                     y={s.y}
                     width={s.width}
                     height={s.height}
                     rx={s.height / 2}
                  />
               {:else if s.kind === 'process'}
                  <rect x={s.x} y={s.y} width={s.width} height={s.height} rx="4" />
               {:else}
                  <path d={pathFor(s)} />
               {/if}

               <text
                  class="texto"
                  x={s.x + s.width / 2}
                  y={s.y + s.height / 2 - ((lines.length - 1) * lineHeight()) / 2}
               >
                  {#each lines as l, li (li)}
                     <tspan x={s.x + s.width / 2} dy={li === 0 ? 0 : lineHeight()}>{l}</tspan>
                  {/each}
               </text>
            </g>
         {/each}

         {#if editable}
            {#each diagram.insertPoints as punto, i (`${punto.ownerId}|${punto.blockKey}|${punto.index}|${i}`)}
               <g
                  class="insertar"
                  role="button"
                  tabindex="0"
                  aria-label="Agregar un bloque aquí"
                  onclick={() => esToque() && onInsertar?.(punto)}
                  onkeydown={(e) => {
                     if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onInsertar?.(punto);
                     }
                  }}
               >
                  <!-- Área de toque generosa e invisible: el círculo visible es
                       pequeño para no tapar el diagrama, pero un objetivo de
                       14 px sería imposible de acertar con el pulgar. -->
                  <circle class="zona" cx={punto.x} cy={punto.y} r="26" />
                  <circle class="disco" cx={punto.x} cy={punto.y} r="13" />
                  <path
                     class="cruz"
                     d="M {punto.x - 6} {punto.y} H {punto.x + 6} M {punto.x} {punto.y - 6} V {punto.y + 6}"
                  />
               </g>
            {/each}
         {/if}
      </g>
   </svg>

   <div class="controles">
      <button onclick={() => (scale = clampScale(scale * 1.2))} aria-label="Acercar">+</button>
      <button onclick={() => (scale = clampScale(scale / 1.2))} aria-label="Alejar">−</button>
      <button onclick={fit} aria-label="Ajustar a la pantalla">⤢</button>
   </div>
</div>

<style>
   .wrapper {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--lienzo);
   }

   .canvas {
      width: 100%;
      height: 100%;
      display: block;
      touch-action: none; /* el pan y el zoom los maneja el componente */
      cursor: grab;
   }
   .canvas:active {
      cursor: grabbing;
   }

   .conector {
      fill: none;
      stroke: var(--linea);
      stroke-width: 2;
      stroke-linejoin: round;
   }
   .conector.loop {
      stroke-dasharray: 6 4;
   }

   .etiqueta {
      fill: var(--texto-tenue);
      font-size: 13px;
      font-weight: 600;
      text-anchor: middle;
      paint-order: stroke;
      stroke: var(--lienzo);
      stroke-width: 4px;
      stroke-linejoin: round;
   }

   .simbolo rect,
   .simbolo path {
      stroke: var(--borde-simbolo);
      stroke-width: 2;
      transition: filter 120ms ease;
   }

   .simbolo.clickable {
      cursor: pointer;
   }

   .texto {
      font-size: 14px;
      text-anchor: middle;
      dominant-baseline: middle;
      fill: var(--texto-simbolo);
      pointer-events: none;
      font-family: var(--fuente-mono);
   }

   /* Colores por tipo de símbolo. Heredan la paleta ANSI de PseudoFlow. */
   .terminator rect {
      fill: var(--c-terminador);
   }
   .process rect {
      fill: var(--c-proceso);
   }
   .io path {
      fill: var(--c-datos);
   }
   .decision path {
      fill: var(--c-decision);
   }
   .preparation path {
      fill: var(--c-preparacion);
   }

   .simbolo.seleccionado rect,
   .simbolo.seleccionado path {
      stroke: var(--acento);
      stroke-width: 3;
   }

   .simbolo.activo rect,
   .simbolo.activo path {
      stroke: var(--activo);
      stroke-width: 4;
      filter: drop-shadow(0 0 8px var(--activo));
   }

   .insertar {
      cursor: pointer;
   }
   .insertar .zona {
      fill: transparent;
   }
   .insertar .disco {
      fill: var(--lienzo);
      stroke: var(--texto-debil);
      stroke-width: 2;
      stroke-dasharray: 3 3;
      transition: fill 120ms ease, stroke 120ms ease;
   }
   .insertar .cruz {
      stroke: var(--texto-debil);
      stroke-width: 2.5;
      stroke-linecap: round;
      pointer-events: none;
      transition: stroke 120ms ease;
   }
   .insertar:hover .disco,
   .insertar:focus-visible .disco {
      fill: var(--acento);
      stroke: var(--acento);
      stroke-dasharray: none;
   }
   .insertar:hover .cruz,
   .insertar:focus-visible .cruz {
      stroke: #04140b;
   }

   .controles {
      position: absolute;
      right: 12px;
      bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
   }

   .controles button {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid var(--borde);
      background: var(--superficie);
      color: var(--texto);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
   }
   .controles button:hover {
      background: var(--superficie-alta);
   }
</style>
