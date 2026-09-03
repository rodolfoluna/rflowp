/**
 * Layout del diagrama de flujo.
 *
 * Como el AST es estructurado (secuencia, selección, iteración — sin saltos
 * arbitrarios), la posición de cada símbolo se puede calcular de forma
 * determinista con un recorrido recursivo. No hace falta arrastrar nodos ni un
 * motor de grafos: el mismo algoritmo produce el mismo dibujo siempre, y por
 * construcción no hay solapamientos.
 *
 * El modelo es el de "marco" (`Frame`): cada bloque se resuelve en una caja con
 * una *espina* vertical por la que entra el flujo arriba y sale abajo. Componer
 * bloques es apilar marcos alineando sus espinas.
 *
 * Todas las coordenadas de un `Frame` son relativas a su propia esquina
 * superior izquierda; `place()` las traslada al final a coordenadas absolutas.
 */

import {
   childBlocks,
   type Expression,
   type NodeId,
   type Program,
   type Statement,
} from '../core/ast';
import { printExpression } from '../core/printer';

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

export const METRICS = {
   /** Ancho estándar de un símbolo rectangular. */
   symbolWidth: 200,
   symbolHeight: 64,
   /** El rombo necesita más alto para que el texto quepa en el centro. */
   decisionWidth: 220,
   decisionHeight: 96,
   terminatorWidth: 140,
   terminatorHeight: 48,
   /** Separación vertical entre símbolos consecutivos. */
   gapY: 44,
   /** Separación horizontal entre las ramas de un Si o de un Segun. */
   gapX: 48,
   /** Margen a la izquierda para que quepa la flecha de retorno de un ciclo. */
   loopMargin: 52,
   /** Margen exterior del lienzo. */
   padding: 40,
} as const;

// ---------------------------------------------------------------------------
// Modelo de salida
// ---------------------------------------------------------------------------

export type ShapeKind =
   /** Óvalo de Inicio / Fin. */
   | 'terminator'
   /** Rectángulo: asignación. */
   | 'process'
   /** Paralelogramo: Leer / Escribir. */
   | 'io'
   /** Rombo: condición. */
   | 'decision'
   /** Hexágono: preparación del Para. */
   | 'preparation';

export interface Shape {
   /** Id del nodo del AST. `undefined` en los símbolos de Inicio y Fin. */
   nodeId?: NodeId;
   kind: ShapeKind;
   label: string;
   /** Esquina superior izquierda, en coordenadas absolutas del lienzo. */
   x: number;
   y: number;
   width: number;
   height: number;
}

export interface Connector {
   /** Polilínea en coordenadas absolutas. */
   points: Array<{ x: number; y: number }>;
   /** Etiqueta de la rama: `Sí`, `No`, o el valor de un caso. */
   label?: string;
   /** Las aristas de retorno de un ciclo se dibujan distinto. */
   loop?: boolean;
}

/**
 * Punto donde el editor gráfico ofrece el botón `+` para insertar una
 * sentencia nueva. Identifica de forma única una posición del AST.
 */
export interface InsertPoint {
   x: number;
   y: number;
   /** Id del nodo dueño del bloque (`Program`, `IfStatement`, …). */
   ownerId: NodeId;
   /** Ruta del bloque dentro de ese nodo: `body`, `consequent`, `cases.0.body`. */
   blockKey: string;
   /** Posición dentro del bloque donde se insertaría. */
   index: number;
}

export interface Diagram {
   shapes: Shape[];
   connectors: Connector[];
   insertPoints: InsertPoint[];
   width: number;
   height: number;
}

// ---------------------------------------------------------------------------
// Marco intermedio (coordenadas relativas)
// ---------------------------------------------------------------------------

interface Frame {
   width: number;
   height: number;
   /** X de la espina: por donde entra el flujo arriba y sale abajo. */
   spineX: number;
   shapes: Shape[];
   connectors: Connector[];
   insertPoints: InsertPoint[];
}

function translate(frame: Frame, dx: number, dy: number): void {
   for (const s of frame.shapes) {
      s.x += dx;
      s.y += dy;
   }
   for (const c of frame.connectors) {
      for (const p of c.points) {
         p.x += dx;
         p.y += dy;
      }
   }
   for (const p of frame.insertPoints) {
      p.x += dx;
      p.y += dy;
   }
}

function emptyFrame(spineX = 0): Frame {
   return { width: 0, height: 0, spineX, shapes: [], connectors: [], insertPoints: [] };
}

function merge(target: Frame, source: Frame): void {
   target.shapes.push(...source.shapes);
   target.connectors.push(...source.connectors);
   target.insertPoints.push(...source.insertPoints);
}

function line(...points: Array<{ x: number; y: number }>): Connector {
   return { points };
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

/** Texto que va dentro de cada símbolo. */
export function labelFor(stmt: Statement): string {
   switch (stmt.kind) {
      case 'DefineStatement':
         return `Definir ${stmt.names.join(', ')}\ncomo ${stmt.dataType}`;
      case 'DimensionStatement':
         return stmt.arrays
            .map((a) => `${a.name}[${a.sizes.map(printExpression).join(', ')}]`)
            .join(', ');
      case 'AssignStatement':
         return `${printExpression(stmt.target)} ← ${printExpression(stmt.value)}`;
      case 'ReadStatement':
         return `Leer ${stmt.targets.map(printExpression).join(', ')}`;
      case 'WriteStatement':
         return `Escribir ${stmt.values.map(printExpression).join(', ')}`;
      case 'IfStatement':
         return printExpression(stmt.test);
      case 'WhileStatement':
         return printExpression(stmt.test);
      case 'RepeatStatement':
         return printExpression(stmt.test);
      case 'ForStatement': {
         const step = stmt.step ? `, paso ${printExpression(stmt.step)}` : '';
         return `${stmt.variable.name} ← ${printExpression(stmt.from)} hasta ${printExpression(stmt.to)}${step}`;
      }
      case 'SwitchStatement':
         return printExpression(stmt.discriminant);
   }
}

function caseLabel(tests: Expression[]): string {
   return tests.length === 0 ? 'otro' : tests.map(printExpression).join(', ');
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Calcula el diagrama completo de un programa. */
export function layout(program: Program): Diagram {
   const { terminatorWidth, terminatorHeight, gapY, padding } = METRICS;

   const body = layoutBlock(program.body, program.id, 'body');

   // Los terminadores se centran sobre la espina del cuerpo.
   const halfTerm = terminatorWidth / 2;
   const spine = Math.max(body.spineX, halfTerm);
   const shiftBody = spine - body.spineX;
   translate(body, shiftBody, 0);

   const contentWidth = Math.max(body.width + shiftBody, spine + halfTerm);

   const result = emptyFrame(spine);
   let y = 0;

   result.shapes.push({
      kind: 'terminator',
      label: 'Inicio',
      x: spine - halfTerm,
      y,
      width: terminatorWidth,
      height: terminatorHeight,
   });
   y += terminatorHeight;

   result.connectors.push(line({ x: spine, y }, { x: spine, y: y + gapY }));
   y += gapY;

   translate(body, 0, y);
   merge(result, body);
   y += body.height;

   result.connectors.push(line({ x: spine, y }, { x: spine, y: y + gapY }));
   y += gapY;

   result.shapes.push({
      kind: 'terminator',
      label: 'Fin',
      x: spine - halfTerm,
      y,
      width: terminatorWidth,
      height: terminatorHeight,
   });
   y += terminatorHeight;

   // Trasladar todo al margen del lienzo.
   result.width = contentWidth;
   result.height = y;
   translate(result, padding, padding);

   return {
      shapes: result.shapes,
      connectors: result.connectors,
      insertPoints: result.insertPoints,
      width: contentWidth + padding * 2,
      height: y + padding * 2,
   };
}

/**
 * Apila las sentencias de un bloque sobre una espina común.
 * Entre cada par (y en los extremos) deja un punto de inserción.
 */
function layoutBlock(statements: Statement[], ownerId: NodeId, blockKey: string): Frame {
   const { gapY, symbolWidth, symbolHeight } = METRICS;

   // Un bloque vacío sigue necesitando alto para que la flecha se vea y para
   // poder ofrecer el `+` que permite empezar a llenarlo.
   if (statements.length === 0) {
      const frame = emptyFrame(symbolWidth / 2);
      frame.width = symbolWidth;
      frame.height = gapY * 2;
      frame.connectors.push(
         line({ x: frame.spineX, y: 0 }, { x: frame.spineX, y: frame.height }),
      );
      frame.insertPoints.push({ x: frame.spineX, y: gapY, ownerId, blockKey, index: 0 });
      return frame;
   }

   const frames = statements.map(layoutStatement);
   const spineX = Math.max(...frames.map((f) => f.spineX));
   const width = Math.max(...frames.map((f) => f.width - f.spineX)) + spineX;

   const result = emptyFrame(spineX);
   let y = 0;

   frames.forEach((frame, i) => {
      // Punto de inserción antes de cada sentencia.
      result.insertPoints.push({ x: spineX, y, ownerId, blockKey, index: i });

      translate(frame, spineX - frame.spineX, y);
      merge(result, frame);
      y += frame.height;

      // Flecha hacia la siguiente sentencia.
      if (i < frames.length - 1) {
         result.connectors.push(line({ x: spineX, y }, { x: spineX, y: y + gapY }));
         y += gapY;
      }
   });

   // Punto de inserción al final del bloque.
   result.insertPoints.push({
      x: spineX,
      y,
      ownerId,
      blockKey,
      index: statements.length,
   });

   result.width = width;
   result.height = y;
   void symbolHeight;
   return result;
}

function layoutStatement(stmt: Statement): Frame {
   switch (stmt.kind) {
      case 'IfStatement':
         return layoutIf(stmt);
      case 'WhileStatement':
         return layoutWhile(stmt);
      case 'RepeatStatement':
         return layoutRepeat(stmt);
      case 'ForStatement':
         return layoutFor(stmt);
      case 'SwitchStatement':
         return layoutSwitch(stmt);
      default:
         return layoutSimple(stmt);
   }
}

/** Sentencia de una sola caja: asignación, lectura, escritura, declaración. */
function layoutSimple(stmt: Statement): Frame {
   const { symbolWidth, symbolHeight } = METRICS;

   const kind: ShapeKind =
      stmt.kind === 'ReadStatement' || stmt.kind === 'WriteStatement' ? 'io' : 'process';

   const frame = emptyFrame(symbolWidth / 2);
   frame.width = symbolWidth;
   frame.height = symbolHeight;
   frame.shapes.push({
      nodeId: stmt.id,
      kind,
      label: labelFor(stmt),
      x: 0,
      y: 0,
      width: symbolWidth,
      height: symbolHeight,
   });
   return frame;
}

/**
 * Si / SiNo.
 *
 *            ◇  (condición)
 *      Sí ↙     ↘ No
 *   [rama V]   [rama F]
 *         ↘   ↙
 *            •  (reunión)
 */
function layoutIf(stmt: Statement & { kind: 'IfStatement' }): Frame {
   const { decisionWidth, decisionHeight, gapX, gapY } = METRICS;

   const yes = layoutBlock(stmt.consequent, stmt.id, 'consequent');
   const no = stmt.alternate
      ? layoutBlock(stmt.alternate, stmt.id, 'alternate')
      : emptyFrame(0);

   const hasElse = stmt.alternate !== undefined;

   // Las dos ramas se colocan lado a lado; sus espinas marcan por dónde bajan.
   const yesLeft = 0;
   const noLeft = hasElse ? yes.width + gapX : yes.width + gapX;
   const yesSpine = yesLeft + yes.spineX;
   const noSpine = hasElse ? noLeft + no.spineX : noLeft;

   const branchTop = decisionHeight + gapY;
   const branchHeight = Math.max(yes.height, hasElse ? no.height : 0);
   const mergeY = branchTop + branchHeight + gapY;

   // El rombo se centra entre las dos espinas.
   const centerX = (yesSpine + noSpine) / 2;

   const frame = emptyFrame(centerX);
   frame.height = mergeY;
   frame.width = Math.max(noSpine + (hasElse ? no.width - no.spineX : 0), centerX + decisionWidth / 2);

   frame.shapes.push({
      nodeId: stmt.id,
      kind: 'decision',
      label: labelFor(stmt),
      x: centerX - decisionWidth / 2,
      y: 0,
      width: decisionWidth,
      height: decisionHeight,
   });

   const diamondLeft = { x: centerX - decisionWidth / 2, y: decisionHeight / 2 };
   const diamondRight = { x: centerX + decisionWidth / 2, y: decisionHeight / 2 };

   // Rama verdadera: sale por la izquierda del rombo.
   frame.connectors.push({
      points: [
         diamondLeft,
         { x: yesSpine, y: diamondLeft.y },
         { x: yesSpine, y: branchTop },
      ],
      label: 'Sí',
   });
   translate(yes, yesLeft, branchTop);
   merge(frame, yes);
   frame.connectors.push(
      line(
         { x: yesSpine, y: branchTop + yes.height },
         { x: yesSpine, y: mergeY },
         { x: centerX, y: mergeY },
      ),
   );

   // Rama falsa: sale por la derecha.
   if (hasElse) {
      frame.connectors.push({
         points: [
            diamondRight,
            { x: noSpine, y: diamondRight.y },
            { x: noSpine, y: branchTop },
         ],
         label: 'No',
      });
      translate(no, noLeft, branchTop);
      merge(frame, no);
      frame.connectors.push(
         line(
            { x: noSpine, y: branchTop + no.height },
            { x: noSpine, y: mergeY },
            { x: centerX, y: mergeY },
         ),
      );
   } else {
      // Sin `SiNo`, el "No" rodea la rama verdadera y se reúne abajo.
      frame.connectors.push({
         points: [
            diamondRight,
            { x: noSpine, y: diamondRight.y },
            { x: noSpine, y: mergeY },
            { x: centerX, y: mergeY },
         ],
         label: 'No',
      });
   }

   return frame;
}

/**
 * Mientras: la condición se evalúa antes del cuerpo y el flujo regresa a ella.
 * La flecha de retorno sube por la izquierda, en el `loopMargin`.
 */
function layoutWhile(stmt: Statement & { kind: 'WhileStatement' }): Frame {
   return layoutPreTestLoop(stmt.id, labelFor(stmt), 'decision', stmt.body, 'body');
}

/** Para: mismo esquema que Mientras, pero con el símbolo de preparación. */
function layoutFor(stmt: Statement & { kind: 'ForStatement' }): Frame {
   return layoutPreTestLoop(stmt.id, labelFor(stmt), 'preparation', stmt.body, 'body');
}

function layoutPreTestLoop(
   nodeId: NodeId,
   label: string,
   kind: ShapeKind,
   body: Statement[],
   blockKey: string,
): Frame {
   const { decisionWidth, decisionHeight, gapY, gapX, loopMargin } = METRICS;

   const inner = layoutBlock(body, nodeId, blockKey);

   // El cuerpo se desplaza a la derecha para dejar sitio a la flecha de retorno.
   const bodyLeft = loopMargin;
   const spineX = bodyLeft + inner.spineX;

   const headHeight = decisionHeight;
   const bodyTop = headHeight + gapY;
   const exitY = bodyTop + inner.height + gapY;

   const frame = emptyFrame(spineX);
   frame.height = exitY;
   frame.width = Math.max(
      bodyLeft + inner.width,
      spineX + decisionWidth / 2,
      spineX + gapX,
   );

   frame.shapes.push({
      nodeId,
      kind,
      label,
      x: spineX - decisionWidth / 2,
      y: 0,
      width: decisionWidth,
      height: headHeight,
   });

   // Entrada al cuerpo, con la etiqueta de continuación.
   frame.connectors.push({
      points: [
         { x: spineX, y: headHeight },
         { x: spineX, y: bodyTop },
      ],
      label: 'Sí',
   });

   translate(inner, bodyLeft, bodyTop);
   merge(frame, inner);

   // Retorno: baja del cuerpo, va a la izquierda, sube y vuelve a entrar por
   // el costado izquierdo del rombo.
   const returnX = spineX - decisionWidth / 2 - loopMargin / 2;
   frame.connectors.push({
      loop: true,
      points: [
         { x: spineX, y: bodyTop + inner.height },
         { x: spineX, y: bodyTop + inner.height + gapY / 2 },
         { x: returnX, y: bodyTop + inner.height + gapY / 2 },
         { x: returnX, y: headHeight / 2 },
         { x: spineX - decisionWidth / 2, y: headHeight / 2 },
      ],
   });

   // Salida del ciclo: por la derecha del rombo, baja y vuelve a la espina.
   const exitX = spineX + decisionWidth / 2 + gapX / 2;
   frame.connectors.push({
      label: 'No',
      points: [
         { x: spineX + decisionWidth / 2, y: headHeight / 2 },
         { x: exitX, y: headHeight / 2 },
         { x: exitX, y: exitY },
         { x: spineX, y: exitY },
      ],
   });

   frame.width = Math.max(frame.width, exitX);
   return frame;
}

/**
 * Repetir … Hasta Que: el cuerpo va primero y la condición al final,
 * así que el retorno sube desde abajo.
 */
function layoutRepeat(stmt: Statement & { kind: 'RepeatStatement' }): Frame {
   const { decisionWidth, decisionHeight, gapY, gapX, loopMargin } = METRICS;

   const inner = layoutBlock(stmt.body, stmt.id, 'body');

   const bodyLeft = loopMargin;
   const spineX = bodyLeft + inner.spineX;

   const bodyTop = 0;
   const testTop = inner.height + gapY;
   const exitY = testTop + decisionHeight;

   const frame = emptyFrame(spineX);
   frame.height = exitY;

   translate(inner, bodyLeft, bodyTop);
   merge(frame, inner);

   frame.connectors.push(
      line({ x: spineX, y: inner.height }, { x: spineX, y: testTop }),
   );

   frame.shapes.push({
      nodeId: stmt.id,
      kind: 'decision',
      label: labelFor(stmt),
      x: spineX - decisionWidth / 2,
      y: testTop,
      width: decisionWidth,
      height: decisionHeight,
   });

   // Retorno cuando la condición es falsa: sube por la izquierda al inicio.
   const returnX = spineX - decisionWidth / 2 - loopMargin / 2;
   frame.connectors.push({
      loop: true,
      label: 'No',
      points: [
         { x: spineX - decisionWidth / 2, y: testTop + decisionHeight / 2 },
         { x: returnX, y: testTop + decisionHeight / 2 },
         { x: returnX, y: -gapY / 2 },
         { x: spineX, y: -gapY / 2 },
         { x: spineX, y: bodyTop },
      ],
   });

   frame.connectors.push({
      label: 'Sí',
      points: [
         { x: spineX, y: testTop + decisionHeight },
         { x: spineX, y: exitY },
      ],
   });

   frame.width = Math.max(bodyLeft + inner.width, spineX + decisionWidth / 2 + gapX);
   return frame;
}

/**
 * Segun: un rombo por caso, encadenados en escalera hacia la derecha, que es
 * como se dibuja una selección múltiple en notación ANSI sin inventar un
 * símbolo nuevo.
 */
function layoutSwitch(stmt: Statement & { kind: 'SwitchStatement' }): Frame {
   const { decisionWidth, decisionHeight, gapX, gapY } = METRICS;

   const frame = emptyFrame(decisionWidth / 2);
   const branches = stmt.cases.map((c, i) =>
      layoutBlock(c.body, stmt.id, `cases.${i}.body`),
   );

   let cursorX = 0;
   let cursorY = 0;
   const branchTops: number[] = [];
   /** Espina absoluta de cada rama, guardada porque `translate` no toca `spineX`. */
   const branchSpines: number[] = [];
   let maxBottom = 0;

   stmt.cases.forEach((c, i) => {
      const branch = branches[i];
      const diamondX = cursorX;
      const spine = diamondX + decisionWidth / 2;

      frame.shapes.push({
         nodeId: c.id,
         kind: 'decision',
         label: `${labelFor(stmt)} = ${caseLabel(c.tests)}`,
         x: diamondX,
         y: cursorY,
         width: decisionWidth,
         height: decisionHeight,
      });

      // La rama verdadera baja desde este rombo.
      const branchTop = cursorY + decisionHeight + gapY;
      branchTops.push(branchTop);
      branchSpines.push(spine);
      frame.connectors.push({
         label: 'Sí',
         points: [
            { x: spine, y: cursorY + decisionHeight },
            { x: spine, y: branchTop },
         ],
      });

      translate(branch, diamondX + decisionWidth / 2 - branch.spineX, branchTop);
      merge(frame, branch);
      maxBottom = Math.max(maxBottom, branchTop + branch.height);

      // El "No" encadena con el siguiente rombo, escalonado a la derecha.
      const isLast = i === stmt.cases.length - 1;
      if (!isLast) {
         const nextX = diamondX + Math.max(branch.width, decisionWidth) + gapX;
         const nextSpine = nextX + decisionWidth / 2;
         frame.connectors.push({
            label: 'No',
            points: [
               { x: diamondX + decisionWidth, y: cursorY + decisionHeight / 2 },
               { x: nextSpine, y: cursorY + decisionHeight / 2 },
               { x: nextSpine, y: cursorY + decisionHeight + gapY / 2 },
            ],
         });
         cursorX = nextX;
         cursorY = cursorY + decisionHeight + gapY / 2;
      } else {
         // El último "No" cae directo a la reunión.
         frame.connectors.push({
            label: 'No',
            points: [
               { x: diamondX + decisionWidth, y: cursorY + decisionHeight / 2 },
               { x: diamondX + decisionWidth + gapX / 2, y: cursorY + decisionHeight / 2 },
            ],
         });
         maxBottom = Math.max(maxBottom, cursorY + decisionHeight);
      }
   });

   const mergeY = maxBottom + gapY;

   // Todas las ramas confluyen en la espina del primer rombo.
   stmt.cases.forEach((_, i) => {
      const branch = branches[i];
      const spine = branchSpines[i];
      frame.connectors.push(
         line(
            { x: spine, y: branchTops[i] + branch.height },
            { x: spine, y: mergeY },
            { x: frame.spineX, y: mergeY },
         ),
      );
   });

   frame.height = mergeY;
   frame.width = Math.max(cursorX + decisionWidth + gapX, ...frame.shapes.map((s) => s.x + s.width));
   return frame;
}
