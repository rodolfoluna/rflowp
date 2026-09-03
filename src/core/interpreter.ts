/**
 * Intérprete del AST, escrito como generador.
 *
 * Por qué generador y no un `run()` normal: al ceder el control en cada nodo,
 * salen gratis la ejecución paso a paso, los puntos de interrupción, el
 * inspector de variables y el resaltado sincronizado del símbolo activo en el
 * diagrama y de la línea en el editor. Un `run()` con callbacks no da eso sin
 * volverse un enredo.
 *
 * El consumidor conduce la ejecución:
 *
 *    const gen = run(program);
 *    let paso = gen.next();
 *    while (!paso.done) {
 *       if (paso.value.kind === 'input') paso = gen.next(valorLeidoDelUsuario);
 *       else paso = gen.next();
 *    }
 */

import {
   type Expression,
   type Identifier,
   type IndexExpression,
   type NodeId,
   type Program,
   type Statement,
   type DataType,
} from './ast';
import { printExpression } from './printer';

// ---------------------------------------------------------------------------
// Valores y entorno
// ---------------------------------------------------------------------------

export type Value = number | string | boolean;

export interface Variable {
   name: string;
   dataType: DataType;
   value: Value;
}

export interface ArrayVariable {
   name: string;
   dataType: DataType;
   dims: number[];
   values: Value[];
}

export interface Environment {
   vars: Map<string, Variable>;
   arrays: Map<string, ArrayVariable>;
}

/** Error de ejecución con la ubicación del nodo culpable. */
export class RuntimeError extends Error {
   constructor(
      message: string,
      readonly nodeId?: NodeId,
      readonly line?: number,
   ) {
      super(message);
      this.name = 'RuntimeError';
   }
}

// ---------------------------------------------------------------------------
// Efectos que el intérprete cede al consumidor
// ---------------------------------------------------------------------------

export type Effect =
   /** A punto de ejecutar un nodo. Se usa para resaltar en las dos vistas. */
   | { kind: 'step'; nodeId: NodeId; line?: number }
   /** Texto a mostrar en la consola. */
   | { kind: 'output'; text: string; newline: boolean }
   /** Se necesita un valor del usuario. Responder con `gen.next(texto)`. */
   | { kind: 'input'; nodeId: NodeId; variable: string; dataType: DataType };

export interface RunOptions {
   /**
    * Tope de nodos ejecutados antes de abortar. Es la red contra los bucles
    * infinitos, que en una app sin consola de escape colgarían el teléfono.
    */
   maxSteps?: number;
}

const DEFAULT_MAX_STEPS = 2_000_000;

// ---------------------------------------------------------------------------
// Valores por defecto y conversión
// ---------------------------------------------------------------------------

function defaultValue(type: DataType): Value {
   switch (type) {
      case 'Entero':
      case 'Real':
         return 0;
      case 'Caracter':
         return '';
      case 'Logico':
         return false;
   }
}

/** Ajusta un valor al tipo declarado de la variable, o falla explicando por qué. */
function coerce(value: Value, type: DataType, name: string, nodeId?: NodeId): Value {
   switch (type) {
      case 'Entero':
         if (typeof value === 'boolean') {
            throw new RuntimeError(
               `No se puede guardar un valor lógico en "${name}", que es Entero.`,
               nodeId,
            );
         }
         if (typeof value === 'string') {
            const n = Number(value);
            if (value.trim() === '' || Number.isNaN(n)) {
               throw new RuntimeError(`"${value}" no es un número entero válido.`, nodeId);
            }
            value = n;
         }
         if (!Number.isInteger(value)) {
            throw new RuntimeError(
               `"${name}" es Entero y ${value} tiene decimales.`,
               nodeId,
            );
         }
         return value;

      case 'Real':
         if (typeof value === 'boolean') {
            throw new RuntimeError(
               `No se puede guardar un valor lógico en "${name}", que es Real.`,
               nodeId,
            );
         }
         if (typeof value === 'string') {
            const n = Number(value);
            if (value.trim() === '' || Number.isNaN(n)) {
               throw new RuntimeError(`"${value}" no es un número válido.`, nodeId);
            }
            return n;
         }
         return value;

      case 'Caracter':
         return formatValue(value);

      case 'Logico':
         if (typeof value === 'boolean') return value;
         if (typeof value === 'string') {
            const v = value.trim().toLowerCase();
            if (v === 'verdadero' || v === 'v') return true;
            if (v === 'falso' || v === 'f') return false;
         }
         throw new RuntimeError(
            `"${name}" es Logico: se esperaba Verdadero o Falso.`,
            nodeId,
         );
   }
}

/** Representación en texto de un valor, como la escribe PSeInt. */
export function formatValue(value: Value): string {
   if (typeof value === 'boolean') return value ? 'VERDADERO' : 'FALSO';
   if (typeof value === 'number') {
      // Los enteros se muestran sin `.0`; los reales conservan sus decimales.
      return Number.isInteger(value) ? String(value) : String(value);
   }
   return value;
}

// ---------------------------------------------------------------------------
// Funciones internas
// ---------------------------------------------------------------------------

type Builtin = { arity: number; fn: (args: Value[]) => Value };

const BUILTINS: Record<string, Builtin> = {
   raiz: { arity: 1, fn: ([x]) => Math.sqrt(num(x, 'raiz')) },
   abs: { arity: 1, fn: ([x]) => Math.abs(num(x, 'abs')) },
   trunc: { arity: 1, fn: ([x]) => Math.trunc(num(x, 'trunc')) },
   redon: { arity: 1, fn: ([x]) => Math.round(num(x, 'redon')) },
   sen: { arity: 1, fn: ([x]) => Math.sin(num(x, 'sen')) },
   cos: { arity: 1, fn: ([x]) => Math.cos(num(x, 'cos')) },
   tan: { arity: 1, fn: ([x]) => Math.tan(num(x, 'tan')) },
   ln: { arity: 1, fn: ([x]) => Math.log(num(x, 'ln')) },
   exp: { arity: 1, fn: ([x]) => Math.exp(num(x, 'exp')) },
   azar: { arity: 1, fn: ([x]) => Math.floor(Math.random() * num(x, 'azar')) },
   longitud: { arity: 1, fn: ([x]) => formatValue(x).length },
   mayusculas: { arity: 1, fn: ([x]) => formatValue(x).toUpperCase() },
   minusculas: { arity: 1, fn: ([x]) => formatValue(x).toLowerCase() },
   concatenar: { arity: 2, fn: ([a, b]) => formatValue(a) + formatValue(b) },
   subcadena: {
      arity: 3,
      // PSeInt indexa desde 1 e incluye ambos extremos.
      fn: ([s, a, b]) =>
         formatValue(s).substring(num(a, 'subcadena') - 1, num(b, 'subcadena')),
   },
   convertiratexto: { arity: 1, fn: ([x]) => formatValue(x) },
   convertiranumero: { arity: 1, fn: ([x]) => Number(formatValue(x)) || 0 },
};

function num(v: Value, where: string): number {
   if (typeof v === 'number') return v;
   if (typeof v === 'string') {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
   }
   throw new RuntimeError(`"${where}" necesita un número.`);
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

export function* run(
   program: Program,
   options: RunOptions = {},
): Generator<Effect, Environment, string | undefined> {
   const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
   const env: Environment = { vars: new Map(), arrays: new Map() };
   let steps = 0;

   /** Cede el control marcando el nodo actual y vigila el tope de pasos. */
   function* tick(
      node: { id: NodeId; loc?: { line: number } },
      // El TNext debe coincidir con el del generador que delega en este, aunque
      // `tick` no use el valor recibido.
   ): Generator<Effect, void, string | undefined> {
      steps += 1;
      if (steps > maxSteps) {
         throw new RuntimeError(
            'El algoritmo lleva demasiados pasos. Probablemente hay un ciclo que nunca termina.',
            node.id,
            node.loc?.line,
         );
      }
      yield { kind: 'step', nodeId: node.id, line: node.loc?.line };
   }

   // -- Lectura y escritura de variables ------------------------------------

   function readVar(name: string, nodeId: NodeId): Value {
      const v = env.vars.get(name);
      if (!v) {
         throw new RuntimeError(
            `La variable "${name}" se usa antes de tener un valor. ¿Falta definirla o leerla?`,
            nodeId,
         );
      }
      return v.value;
   }

   /**
    * Define una variable si no existía. PSeInt permite asignar sin `Definir`,
    * infiriendo el tipo del primer valor; se replica ese comportamiento para no
    * frustrar a quien todavía no vio la declaración de tipos.
    */
   function writeVar(name: string, value: Value, nodeId: NodeId): void {
      const existing = env.vars.get(name);
      if (existing) {
         existing.value = coerce(value, existing.dataType, name, nodeId);
         return;
      }
      const inferred: DataType =
         typeof value === 'boolean' ? 'Logico'
         : typeof value === 'string' ? 'Caracter'
         : Number.isInteger(value) ? 'Entero'
         : 'Real';
      env.vars.set(name, { name, dataType: inferred, value });
   }

   /** Convierte índices 1-based (multi-dimensión) a una posición lineal. */
   function flatIndex(arr: ArrayVariable, indices: number[], nodeId: NodeId): number {
      if (indices.length !== arr.dims.length) {
         throw new RuntimeError(
            `"${arr.name}" tiene ${arr.dims.length} dimensión(es), pero se usaron ${indices.length}.`,
            nodeId,
         );
      }
      let offset = 0;
      for (let d = 0; d < indices.length; d++) {
         const i = indices[d];
         if (!Number.isInteger(i) || i < 1 || i > arr.dims[d]) {
            throw new RuntimeError(
               `El índice ${i} está fuera de rango: "${arr.name}" va de 1 a ${arr.dims[d]}.`,
               nodeId,
            );
         }
         offset = offset * arr.dims[d] + (i - 1);
      }
      return offset;
   }

   // -- Expresiones ---------------------------------------------------------

   function evaluate(expr: Expression): Value {
      switch (expr.kind) {
         case 'NumberLiteral':
            return expr.value;
         case 'StringLiteral':
            return expr.value;
         case 'BooleanLiteral':
            return expr.value;

         case 'Identifier':
            return readVar(expr.name, expr.id);

         case 'IndexExpression': {
            const arr = env.arrays.get(expr.array.name);
            if (!arr) {
               throw new RuntimeError(
                  `"${expr.array.name}" no es un arreglo. ¿Falta "Dimension"?`,
                  expr.id,
               );
            }
            const indices = expr.indices.map((i) => num(evaluate(i), 'índice'));
            return arr.values[flatIndex(arr, indices, expr.id)];
         }

         case 'GroupExpression':
            return evaluate(expr.expression);

         case 'UnaryExpression': {
            const v = evaluate(expr.argument);
            if (expr.operator === 'NO') {
               if (typeof v !== 'boolean') {
                  throw new RuntimeError('"NO" solo se aplica a valores lógicos.', expr.id);
               }
               return !v;
            }
            return expr.operator === '-' ? -num(v, '-') : num(v, '+');
         }

         case 'CallExpression': {
            const builtin = BUILTINS[expr.callee.toLowerCase()];
            if (!builtin) {
               throw new RuntimeError(`No existe la función "${expr.callee}".`, expr.id);
            }
            if (expr.args.length !== builtin.arity) {
               throw new RuntimeError(
                  `"${expr.callee}" espera ${builtin.arity} argumento(s), no ${expr.args.length}.`,
                  expr.id,
               );
            }
            return builtin.fn(expr.args.map(evaluate));
         }

         case 'BinaryExpression':
            return evaluateBinary(expr);
      }
   }

   function evaluateBinary(expr: Expression & { kind: 'BinaryExpression' }): Value {
      const op = expr.operator;

      // `Y` y `O` cortocircuitan, igual que en PSeInt.
      if (op === 'Y' || op === 'O') {
         const left = evaluate(expr.left);
         if (typeof left !== 'boolean') {
            throw new RuntimeError(`"${op}" necesita valores lógicos a ambos lados.`, expr.id);
         }
         if (op === 'Y' && !left) return false;
         if (op === 'O' && left) return true;
         const right = evaluate(expr.right);
         if (typeof right !== 'boolean') {
            throw new RuntimeError(`"${op}" necesita valores lógicos a ambos lados.`, expr.id);
         }
         return right;
      }

      const l = evaluate(expr.left);
      const r = evaluate(expr.right);

      switch (op) {
         case '=': return equals(l, r);
         case '<>': return !equals(l, r);
         case '<': case '<=': case '>': case '>=': {
            // Las cadenas se comparan alfabéticamente; los números, por valor.
            if (typeof l === 'string' && typeof r === 'string') {
               const c = l.localeCompare(r);
               return op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : c >= 0;
            }
            const a = num(l, op);
            const b = num(r, op);
            return op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
         }
         case '+':
            // `+` concatena si alguno de los dos es texto.
            if (typeof l === 'string' || typeof r === 'string') {
               return formatValue(l) + formatValue(r);
            }
            return num(l, '+') + num(r, '+');
         case '-': return num(l, '-') - num(r, '-');
         case '*': return num(l, '*') * num(r, '*');
         case '/': {
            const d = num(r, '/');
            if (d === 0) throw new RuntimeError('División entre cero.', expr.id);
            return num(l, '/') / d;
         }
         case '%': {
            const d = num(r, '%');
            if (d === 0) throw new RuntimeError('Módulo entre cero.', expr.id);
            return num(l, '%') % d;
         }
         case '^': return Math.pow(num(l, '^'), num(r, '^'));
         default:
            throw new RuntimeError(`Operador desconocido "${op}".`, expr.id);
      }
   }

   function equals(a: Value, b: Value): boolean {
      if (typeof a === 'number' && typeof b === 'number') {
         // Tolerancia en reales: 0.1 + 0.2 debe ser igual a 0.3 para un alumno.
         return Math.abs(a - b) < 1e-9;
      }
      return a === b;
   }

   // -- Sentencias ----------------------------------------------------------

   function* exec(stmt: Statement): Generator<Effect, void, string | undefined> {
      yield* tick(stmt);

      switch (stmt.kind) {
         case 'DefineStatement': {
            for (const name of stmt.names) {
               env.vars.set(name, {
                  name,
                  dataType: stmt.dataType,
                  value: defaultValue(stmt.dataType),
               });
            }
            return;
         }

         case 'DimensionStatement': {
            for (const { name, sizes } of stmt.arrays) {
               const dims = sizes.map((s) => {
                  const n = num(evaluate(s), 'Dimension');
                  if (!Number.isInteger(n) || n < 1) {
                     throw new RuntimeError(
                        `El tamaño de "${name}" debe ser un entero mayor que cero.`,
                        stmt.id,
                     );
                  }
                  return n;
               });
               const total = dims.reduce((a, b) => a * b, 1);
               env.arrays.set(name, {
                  name,
                  dataType: 'Real',
                  dims,
                  values: new Array<Value>(total).fill(0),
               });
            }
            return;
         }

         case 'AssignStatement': {
            const value = evaluate(stmt.value);
            yield* assignTo(stmt.target, value, stmt.id);
            return;
         }

         case 'ReadStatement': {
            for (const target of stmt.targets) {
               const name = target.kind === 'Identifier' ? target.name : target.array.name;
               const declared = env.vars.get(name)?.dataType ?? 'Caracter';

               const raw = yield {
                  kind: 'input',
                  nodeId: stmt.id,
                  variable: printExpression(target),
                  dataType: declared,
               };

               // Un valor numérico se entrega como número; si no, como texto y
               // `coerce` decide según el tipo declarado del destino.
               const text = raw ?? '';
               const asNumber = Number(text);
               const value: Value =
                  text.trim() !== '' && !Number.isNaN(asNumber) ? asNumber : text;

               yield* assignTo(target, value, stmt.id);
            }
            return;
         }

         case 'WriteStatement': {
            const text = stmt.values.map((v) => formatValue(evaluate(v))).join('');
            yield { kind: 'output', text, newline: !stmt.noNewline };
            return;
         }

         case 'IfStatement': {
            const test = evaluate(stmt.test);
            if (typeof test !== 'boolean') {
               throw new RuntimeError(
                  'La condición del "Si" debe ser verdadera o falsa.',
                  stmt.id,
               );
            }
            const branch = test ? stmt.consequent : stmt.alternate;
            if (branch) yield* execBlock(branch);
            return;
         }

         case 'WhileStatement': {
            for (;;) {
               const test = evaluate(stmt.test);
               if (typeof test !== 'boolean') {
                  throw new RuntimeError(
                     'La condición del "Mientras" debe ser verdadera o falsa.',
                     stmt.id,
                  );
               }
               if (!test) return;
               yield* execBlock(stmt.body);
               yield* tick(stmt);
            }
         }

         case 'RepeatStatement': {
            for (;;) {
               yield* execBlock(stmt.body);
               const test = evaluate(stmt.test);
               if (typeof test !== 'boolean') {
                  throw new RuntimeError(
                     'La condición de "Hasta Que" debe ser verdadera o falsa.',
                     stmt.id,
                  );
               }
               if (test) return;
               yield* tick(stmt);
            }
         }

         case 'ForStatement': {
            const from = num(evaluate(stmt.from), 'Para');
            const to = num(evaluate(stmt.to), 'Para');
            const step = stmt.step ? num(evaluate(stmt.step), 'Con Paso') : 1;

            if (step === 0) {
               throw new RuntimeError('El paso del "Para" no puede ser cero.', stmt.id);
            }

            writeVar(stmt.variable.name, from, stmt.id);
            for (;;) {
               const current = num(readVar(stmt.variable.name, stmt.id), 'Para');
               if (step > 0 ? current > to : current < to) return;
               yield* execBlock(stmt.body);
               const after = num(readVar(stmt.variable.name, stmt.id), 'Para');
               writeVar(stmt.variable.name, after + step, stmt.id);
               yield* tick(stmt);
            }
         }

         case 'SwitchStatement': {
            const value = evaluate(stmt.discriminant);
            const match =
               stmt.cases.find((c) => c.tests.some((t) => equals(evaluate(t), value))) ??
               stmt.cases.find((c) => c.tests.length === 0);
            if (match) yield* execBlock(match.body);
            return;
         }
      }
   }

   function* assignTo(
      target: Identifier | IndexExpression,
      value: Value,
      nodeId: NodeId,
   ): Generator<Effect, void, string | undefined> {
      if (target.kind === 'Identifier') {
         writeVar(target.name, value, nodeId);
         return;
      }

      const arr = env.arrays.get(target.array.name);
      if (!arr) {
         throw new RuntimeError(
            `"${target.array.name}" no es un arreglo. ¿Falta "Dimension"?`,
            nodeId,
         );
      }
      const indices = target.indices.map((i) => num(evaluate(i), 'índice'));
      arr.values[flatIndex(arr, indices, nodeId)] = value;
   }

   function* execBlock(block: Statement[]): Generator<Effect, void, string | undefined> {
      for (const stmt of block) {
         yield* exec(stmt);
      }
   }

   yield* execBlock(program.body);
   return env;
}

// ---------------------------------------------------------------------------
// Conveniencia para pruebas y para el modo profesor
// ---------------------------------------------------------------------------

export interface BatchResult {
   output: string;
   env: Environment;
   error?: RuntimeError;
   steps: number;
}

/**
 * Ejecuta de corrido con una lista de entradas ya preparada.
 * Es lo que usan las pruebas y lo que permitirá al profesor correr la entrega
 * de un alumno contra un juego de datos sin teclear nada.
 */
export function runToCompletion(
   program: Program,
   inputs: string[] = [],
   options: RunOptions = {},
): BatchResult {
   const gen = run(program, options);
   let output = '';
   let steps = 0;
   let inputIndex = 0;
   let env: Environment = { vars: new Map(), arrays: new Map() };

   try {
      let next = gen.next();
      while (!next.done) {
         const effect = next.value;
         if (effect.kind === 'output') {
            output += effect.text + (effect.newline ? '\n' : '');
            next = gen.next();
         } else if (effect.kind === 'input') {
            if (inputIndex >= inputs.length) {
               throw new RuntimeError(
                  `El algoritmo pidió más datos de los disponibles (falta el valor para "${effect.variable}").`,
                  effect.nodeId,
               );
            }
            next = gen.next(inputs[inputIndex++]);
         } else {
            steps += 1;
            next = gen.next();
         }
      }
      env = next.value;
   } catch (e) {
      if (e instanceof RuntimeError) return { output, env, error: e, steps };
      throw e;
   }

   return { output, env, steps };
}
