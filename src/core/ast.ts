/**
 * AST de RFlowP — fuente única de verdad.
 *
 * Ni el pseudocódigo ni el diagrama son la fuente: ambos son proyecciones de
 * este árbol. Por eso cada nodo lleva:
 *   - `id`  estable, para resaltar el mismo nodo en las dos vistas durante la
 *           ejecución y para que el editor gráfico pueda apuntar a un nodo.
 *   - `loc` posición en el texto, cuando el AST vino del parser (opcional:
 *           los nodos creados desde el editor gráfico no tienen origen textual).
 */

// ---------------------------------------------------------------------------
// Identidad y posición
// ---------------------------------------------------------------------------

export type NodeId = string;

export interface Loc {
   /** Línea 1-indexada donde inicia el nodo. */
   line: number;
   /** Columna 1-indexada donde inicia el nodo. */
   col: number;
   /** Línea 1-indexada donde termina el nodo (inclusive). */
   endLine: number;
}

let idCounter = 0;

/** Genera un identificador de nodo único dentro de la sesión. */
export function nextId(prefix = 'n'): NodeId {
   idCounter += 1;
   return `${prefix}${idCounter}`;
}

/** Reinicia el contador. Solo para pruebas deterministas. */
export function resetIds(): void {
   idCounter = 0;
}

interface Base {
   id: NodeId;
   loc?: Loc;
}

// ---------------------------------------------------------------------------
// Tipos de dato (los de PSeInt)
// ---------------------------------------------------------------------------

export type DataType = 'Entero' | 'Real' | 'Caracter' | 'Logico';

export const DATA_TYPES: readonly DataType[] = ['Entero', 'Real', 'Caracter', 'Logico'] as const;

// ---------------------------------------------------------------------------
// Expresiones
// ---------------------------------------------------------------------------

export type BinaryOperator =
   // aritméticos
   | '+' | '-' | '*' | '/' | '%' | '^'
   // relacionales
   | '=' | '<>' | '<' | '<=' | '>' | '>='
   // lógicos
   | 'Y' | 'O';

export type UnaryOperator = '-' | '+' | 'NO';

export interface NumberLiteral extends Base {
   kind: 'NumberLiteral';
   value: number;
   /** Se conserva el texto original para reimprimir `3.10` y no `3.1`. */
   raw: string;
}

export interface StringLiteral extends Base {
   kind: 'StringLiteral';
   value: string;
   /** Comilla usada en el original, para reimprimir igual. */
   quote: '"' | "'";
}

export interface BooleanLiteral extends Base {
   kind: 'BooleanLiteral';
   value: boolean;
}

/** Referencia a una variable simple: `edad`. */
export interface Identifier extends Base {
   kind: 'Identifier';
   name: string;
}

/** Acceso a arreglo: `notas[i]` o `matriz[f, c]`. */
export interface IndexExpression extends Base {
   kind: 'IndexExpression';
   array: Identifier;
   indices: Expression[];
}

export interface BinaryExpression extends Base {
   kind: 'BinaryExpression';
   operator: BinaryOperator;
   left: Expression;
   right: Expression;
}

export interface UnaryExpression extends Base {
   kind: 'UnaryExpression';
   operator: UnaryOperator;
   argument: Expression;
}

/** Paréntesis explícitos. Se conservan para reimprimir tal cual los escribió el alumno. */
export interface GroupExpression extends Base {
   kind: 'GroupExpression';
   expression: Expression;
}

/** Llamada a función interna: `raiz(x)`, `trunc(x)`, `longitud(s)`. */
export interface CallExpression extends Base {
   kind: 'CallExpression';
   callee: string;
   args: Expression[];
}

export type Expression =
   | NumberLiteral
   | StringLiteral
   | BooleanLiteral
   | Identifier
   | IndexExpression
   | BinaryExpression
   | UnaryExpression
   | GroupExpression
   | CallExpression;

// ---------------------------------------------------------------------------
// Sentencias
// ---------------------------------------------------------------------------

/** `Definir a, b Como Entero` */
export interface DefineStatement extends Base {
   kind: 'DefineStatement';
   names: string[];
   dataType: DataType;
}

/** `Dimension notas[10]` o `Dimension m[3, 4]` */
export interface DimensionStatement extends Base {
   kind: 'DimensionStatement';
   arrays: Array<{ name: string; sizes: Expression[] }>;
}

/** `x <- expr` */
export interface AssignStatement extends Base {
   kind: 'AssignStatement';
   target: Identifier | IndexExpression;
   value: Expression;
}

/** `Leer a, b` */
export interface ReadStatement extends Base {
   kind: 'ReadStatement';
   targets: Array<Identifier | IndexExpression>;
}

/** `Escribir "hola", x Sin Saltar` */
export interface WriteStatement extends Base {
   kind: 'WriteStatement';
   values: Expression[];
   /** `Sin Saltar` suprime el salto de línea final. */
   noNewline: boolean;
}

/** `Si cond Entonces ... SiNo ... FinSi` */
export interface IfStatement extends Base {
   kind: 'IfStatement';
   test: Expression;
   consequent: Statement[];
   /** `undefined` si no se escribió la rama `SiNo`. */
   alternate?: Statement[];
}

/** `Mientras cond Hacer ... FinMientras` */
export interface WhileStatement extends Base {
   kind: 'WhileStatement';
   test: Expression;
   body: Statement[];
}

/** `Repetir ... Hasta Que cond` */
export interface RepeatStatement extends Base {
   kind: 'RepeatStatement';
   body: Statement[];
   /** La condición de SALIDA: se repite mientras sea falsa. */
   test: Expression;
}

/** `Para i <- 1 Hasta 10 Con Paso 2 Hacer ... FinPara` */
export interface ForStatement extends Base {
   kind: 'ForStatement';
   variable: Identifier;
   from: Expression;
   to: Expression;
   /** `undefined` equivale a paso 1. */
   step?: Expression;
   body: Statement[];
}

export interface SwitchCase extends Base {
   kind: 'SwitchCase';
   /**
    * Valores que disparan este caso: `2, 3:` es UN caso con dos valores, no
    * dos casos. Mantenerlo así evita que dos ramas compartan el mismo array de
    * sentencias, que produciría nodos con el mismo id en dos lugares del árbol.
    * Vacío en el caso `De Otro Modo`.
    */
   tests: Expression[];
   body: Statement[];
}

/** `Segun expr Hacer  1: ...  De Otro Modo: ...  FinSegun` */
export interface SwitchStatement extends Base {
   kind: 'SwitchStatement';
   discriminant: Expression;
   cases: SwitchCase[];
}

export type Statement =
   | DefineStatement
   | DimensionStatement
   | AssignStatement
   | ReadStatement
   | WriteStatement
   | IfStatement
   | WhileStatement
   | RepeatStatement
   | ForStatement
   | SwitchStatement;

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

export interface Program extends Base {
   kind: 'Program';
   /** Nombre tras `Proceso`. */
   name: string;
   body: Statement[];
}

// ---------------------------------------------------------------------------
// Utilidades de recorrido
// ---------------------------------------------------------------------------

/**
 * Devuelve los bloques de sentencias que cuelgan de un nodo, cada uno con la
 * ruta por la que se llega a él. El editor gráfico la usa para saber dónde
 * insertar, y el layout para saber qué columnas dibujar.
 */
export function childBlocks(
   node: Statement | Program | SwitchCase,
): Array<{ key: string; block: Statement[] }> {
   switch (node.kind) {
      case 'Program':
         return [{ key: 'body', block: node.body }];
      case 'IfStatement':
         return node.alternate
            ? [
                 { key: 'consequent', block: node.consequent },
                 { key: 'alternate', block: node.alternate },
              ]
            : [{ key: 'consequent', block: node.consequent }];
      case 'WhileStatement':
      case 'RepeatStatement':
      case 'ForStatement':
      case 'SwitchCase':
         return [{ key: 'body', block: node.body }];
      case 'SwitchStatement':
         return node.cases.map((c, i) => ({ key: `cases.${i}.body`, block: c.body }));
      default:
         return [];
   }
}

/** Recorre el árbol en preorden, incluyendo los `SwitchCase`. */
export function walk(
   node: Program | Statement | SwitchCase,
   visit: (node: Program | Statement | SwitchCase) => void,
): void {
   visit(node);
   if (node.kind === 'SwitchStatement') {
      for (const c of node.cases) walk(c, visit);
      return;
   }
   for (const { block } of childBlocks(node)) {
      for (const child of block) walk(child, visit);
   }
}

/** Busca un nodo por su id. Devuelve `undefined` si no existe. */
export function findById(
   root: Program,
   id: NodeId,
): Program | Statement | SwitchCase | undefined {
   let found: Program | Statement | SwitchCase | undefined;
   walk(root, (n) => {
      if (!found && n.id === id) found = n;
   });
   return found;
}
