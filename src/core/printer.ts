/**
 * Printer: AST → pseudocódigo formateado.
 *
 * Es la proyección textual del árbol. Cuando el alumno edita el diagrama, es
 * esto lo que regenera el código que ve en la otra pestaña.
 *
 * Regla que gobierna el diseño: `parse(print(ast))` debe dar un árbol
 * equivalente a `ast`. Por eso se imprimen los paréntesis que el alumno
 * escribió (`GroupExpression`) en vez de recalcularlos por precedencia, y por
 * eso los números se imprimen con su texto original.
 */

import { type Expression, type Program, type Statement } from './ast';

export interface PrintOptions {
   /** Espacios por nivel de anidamiento. */
   indent?: number;
}

const DEFAULT_INDENT = 3;

/** Imprime un programa completo. */
export function print(program: Program, options: PrintOptions = {}): string {
   const indentSize = options.indent ?? DEFAULT_INDENT;
   const lines: string[] = [];

   lines.push(`Proceso ${program.name || 'sin_nombre'}`);
   printBlock(program.body, 1, indentSize, lines);
   // Solo aparecen cuando el programa no tiene ninguna sentencia donde colgarlos.
   for (const c of program.afterComments ?? []) {
      lines.push(`${' '.repeat(indentSize)}${c}`);
   }
   lines.push('FinProceso');

   return lines.join('\n');
}

/** Imprime una expresión suelta. Lo usa el editor gráfico en los símbolos. */
export function printExpression(expr: Expression): string {
   switch (expr.kind) {
      case 'NumberLiteral':
         // `raw` conserva `3.10`; si el nodo se creó desde el editor gráfico no
         // hay texto original y se usa el valor.
         return expr.raw ?? String(expr.value);

      case 'StringLiteral':
         return `${expr.quote}${expr.value}${expr.quote}`;

      case 'BooleanLiteral':
         return expr.value ? 'Verdadero' : 'Falso';

      case 'Identifier':
         return expr.name;

      case 'IndexExpression':
         return `${expr.array.name}[${expr.indices.map(printExpression).join(', ')}]`;

      case 'BinaryExpression': {
         // Los operadores en palabra necesitan espacios; los símbolos también,
         // por legibilidad, salvo que quede feo. Se usa espacio siempre.
         return `${printExpression(expr.left)} ${expr.operator} ${printExpression(expr.right)}`;
      }

      case 'UnaryExpression':
         return expr.operator === 'NO'
            ? `NO ${printExpression(expr.argument)}`
            : `${expr.operator}${printExpression(expr.argument)}`;

      case 'GroupExpression':
         return `(${printExpression(expr.expression)})`;

      case 'CallExpression':
         return `${expr.callee}(${expr.args.map(printExpression).join(', ')})`;
   }
}

function printBlock(
   statements: Statement[],
   depth: number,
   indentSize: number,
   out: string[],
): void {
   for (const stmt of statements) {
      printStatement(stmt, depth, indentSize, out);
   }
}

function printStatement(
   stmt: Statement,
   depth: number,
   indentSize: number,
   out: string[],
): void {
   const pad = ' '.repeat(depth * indentSize);
   const inner = depth + 1;

   // Los comentarios propios de la sentencia se emiten antes de su código.
   for (const c of stmt.leadingComments ?? []) {
      out.push(`${pad}${c}`);
   }

   // Se apunta dónde empieza el código para poder pegarle después el
   // comentario de la misma línea: en una sentencia compuesta el `Si …` queda
   // aquí y el `FinSi` mucho más abajo.
   const primeraLinea = out.length;

   switch (stmt.kind) {
      case 'DefineStatement':
         out.push(`${pad}Definir ${stmt.names.join(', ')} Como ${stmt.dataType}`);
         break;

      case 'DimensionStatement': {
         const parts = stmt.arrays.map(
            (a) => `${a.name}[${a.sizes.map(printExpression).join(', ')}]`,
         );
         out.push(`${pad}Dimension ${parts.join(', ')}`);
         break;
      }

      case 'AssignStatement':
         out.push(`${pad}${printExpression(stmt.target)} <- ${printExpression(stmt.value)}`);
         break;

      case 'ReadStatement':
         out.push(`${pad}Leer ${stmt.targets.map(printExpression).join(', ')}`);
         break;

      case 'WriteStatement': {
         const values = stmt.values.map(printExpression).join(', ');
         const suffix = stmt.noNewline ? ' Sin Saltar' : '';
         out.push(`${pad}Escribir${values ? ' ' + values : ''}${suffix}`);
         break;
      }

      case 'IfStatement':
         out.push(`${pad}Si ${printExpression(stmt.test)} Entonces`);
         printBlock(stmt.consequent, inner, indentSize, out);
         if (stmt.alternate) {
            out.push(`${pad}SiNo`);
            printBlock(stmt.alternate, inner, indentSize, out);
         }
         out.push(`${pad}FinSi`);
         break;

      case 'WhileStatement':
         out.push(`${pad}Mientras ${printExpression(stmt.test)} Hacer`);
         printBlock(stmt.body, inner, indentSize, out);
         out.push(`${pad}FinMientras`);
         break;

      case 'RepeatStatement':
         out.push(`${pad}Repetir`);
         printBlock(stmt.body, inner, indentSize, out);
         out.push(`${pad}Hasta Que ${printExpression(stmt.test)}`);
         break;

      case 'ForStatement': {
         const step = stmt.step ? ` Con Paso ${printExpression(stmt.step)}` : '';
         out.push(
            `${pad}Para ${stmt.variable.name} <- ${printExpression(stmt.from)}` +
               ` Hasta ${printExpression(stmt.to)}${step} Hacer`,
         );
         printBlock(stmt.body, inner, indentSize, out);
         out.push(`${pad}FinPara`);
         break;
      }

      case 'SwitchStatement': {
         out.push(`${pad}Segun ${printExpression(stmt.discriminant)} Hacer`);
         const casePad = ' '.repeat(inner * indentSize);
         for (const c of stmt.cases) {
            const label =
               c.tests.length > 0 ? c.tests.map(printExpression).join(', ') : 'De Otro Modo';
            out.push(`${casePad}${label}:`);
            printBlock(c.body, inner + 1, indentSize, out);
         }
         out.push(`${pad}FinSegun`);
         break;
      }
   }

   if (stmt.trailingComment && out.length > primeraLinea) {
      out[primeraLinea] = `${out[primeraLinea]} ${stmt.trailingComment}`;
   }

   for (const c of stmt.afterComments ?? []) {
      out.push(`${pad}${c}`);
   }
}
