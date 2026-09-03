/**
 * Parser de descenso recursivo para el dialecto PSeInt.
 *
 * Dos propiedades no negociables, porque de ellas depende la experiencia de uso:
 *
 * 1. **Tolerancia a errores.** El alumno tiene el código a medias el 90% del
 *    tiempo. El parser nunca lanza hacia afuera: acumula errores, se recupera
 *    saltando a la siguiente línea y sigue. Así el diagrama se puede seguir
 *    dibujando con la parte que sí es válida.
 *
 * 2. **Fidelidad para reimprimir.** Se conservan los paréntesis explícitos
 *    (`GroupExpression`), el texto original de los números (`raw`) y el tipo de
 *    comilla, para que `parse → print → parse` devuelva el mismo árbol y el
 *    alumno no vea su código reescrito solo.
 */

import {
   childBlocks,
   nextId,
   type AssignStatement,
   type DataType,
   type DefineStatement,
   type DimensionStatement,
   type Expression,
   type ForStatement,
   type Identifier,
   type IfStatement,
   type IndexExpression,
   type Loc,
   type Program,
   type ReadStatement,
   type RepeatStatement,
   type Statement,
   type SwitchCase,
   type SwitchStatement,
   type WhileStatement,
   type WriteStatement,
   type BinaryOperator,
} from './ast';
import { tokenize, type Token, type TokenType } from './lexer';

export interface ParseError {
   message: string;
   line: number;
   col: number;
}

export interface ParseResult {
   program: Program;
   errors: ParseError[];
   /** Comentarios sueltos, indexados por la línea en la que aparecen. */
   comments: Map<number, string>;
}

/** Tokens que cierran un bloque; el parser de bloque se detiene al verlos. */
const BLOCK_ENDERS: ReadonlySet<TokenType> = new Set<TokenType>([
   'FinProceso', 'FinSi', 'SiNo', 'FinMientras', 'FinPara', 'FinSegun',
   'HastaQue', 'DeOtroModo', 'FinArchivo',
]);

/**
 * Cómo nombrar un token en un mensaje de error.
 *
 * Sin esto los mensajes dicen cosas como «no se esperaba "FinArchivo"», que es
 * el nombre interno del token y no significa nada para quien está aprendiendo.
 */
function describirToken(token: Token): string {
   if (token.value) return `"${token.value}"`;

   switch (token.type) {
      case 'FinArchivo':
         return 'el final del algoritmo';
      case 'FinLinea':
         return 'el final de la línea';
      default:
         return 'eso';
   }
}

class Parser {
   private tokens: Token[];
   private pos = 0;
   readonly errors: ParseError[] = [];
   readonly comments = new Map<number, string>();

   /**
    * Línea en la que termina cada bloque, indexada por el propio array de
    * sentencias. Se registra al parsear porque es el único momento en que se
    * sabe: al ver el `FinSi` / `FinMientras` / `FinSegun` que lo cierra.
    * Después sirve para saber a qué bloque pertenece cada comentario suelto.
    */
   private readonly blockEnds = new WeakMap<Statement[], number>();

   constructor(source: string) {
      const all = tokenize(source);
      // Los comentarios se apartan aquí: el resto del parser no quiere verlos,
      // pero el printer los necesita para no borrarlos al reimprimir.
      this.tokens = [];
      for (const t of all) {
         if (t.type === 'Comentario') {
            this.comments.set(t.line, t.value);
         } else {
            this.tokens.push(t);
         }
      }
   }

   // -- Manejo del flujo de tokens -----------------------------------------

   private peek(offset = 0): Token {
      const i = Math.max(0, Math.min(this.pos + offset, this.tokens.length - 1));
      return this.tokens[i];
   }

   private get current(): Token {
      return this.peek();
   }

   private advance(): Token {
      const t = this.current;
      if (this.pos < this.tokens.length - 1) this.pos += 1;
      return t;
   }

   private check(type: TokenType): boolean {
      return this.current.type === type;
   }

   private match(...types: TokenType[]): Token | null {
      if (types.includes(this.current.type)) return this.advance();
      return null;
   }

   /**
    * Consume un identificador, aceptando también los operadores escritos como
    * palabra (`y`, `o`, `no`, `mod`).
    *
    * `Definir x, y, z Como Real` es de lo más común en clase, y `y` choca con
    * el operador lógico. Se desambigua por posición: donde solo cabe un nombre
    * de variable, la palabra es un nombre; donde cabe un operador binario,
    * es un operador. Devuelve el token con `value` ya puesto al texto original.
    */
   private matchIdentifier(): Token | null {
      if (this.check('Identificador')) return this.advance();

      if (this.isIdentifierLike()) {
         const t = this.advance();
         return { ...t, type: 'Identificador', value: t.raw! };
      }

      return null;
   }

   /** ¿El token actual puede leerse como nombre de variable? */
   private isIdentifierLike(): boolean {
      return this.check('Identificador') || (this.check('Operador') && !!this.current.raw);
   }

   private error(message: string, token: Token = this.current): void {
      // Se evita apilar varios errores en la misma posición: confunde más de lo
      // que ayuda cuando la recuperación pasa dos veces por el mismo punto.
      const last = this.errors[this.errors.length - 1];
      if (last && last.line === token.line && last.col === token.col) return;
      this.errors.push({ message, line: token.line, col: token.col });
   }

   private expect(type: TokenType, message: string): Token | null {
      if (this.check(type)) return this.advance();
      this.error(message);
      return null;
   }

   /** Consume saltos de línea consecutivos. */
   private skipNewlines(): void {
      while (this.check('FinLinea')) this.advance();
   }

   /** Avanza hasta el inicio de la siguiente línea. Recuperación de errores. */
   private recover(): void {
      while (!this.check('FinLinea') && !this.check('FinArchivo')) {
         if (BLOCK_ENDERS.has(this.current.type)) return;
         this.advance();
      }
      this.skipNewlines();
   }

   private loc(start: Token, endLine = this.peek(-1).line): Loc {
      return { line: start.line, col: start.col, endLine };
   }

   // -- Comentarios ---------------------------------------------------------

   /**
    * Reparte los comentarios recolectados entre los nodos del árbol.
    *
    * Se hace en una pasada posterior y no durante el parseo porque para decidir
    * dónde va un comentario suelto hace falta saber dónde termina su bloque, y
    * eso solo se sabe cuando el bloque ya se cerró.
    *
    * Cada comentario acaba en uno de tres lugares:
    *   - `leadingComments`  en línea propia, antes de una sentencia;
    *   - `trailingComment`  al final de la línea de una sentencia;
    *   - `afterComments`    al final de un bloque, colgando de su última
    *                        sentencia, que es donde caen los que preceden a un
    *                        `FinSi` o un `FinMientras`.
    */
   attachComments(program: Program): void {
      if (this.comments.size === 0) return;

      const pendientes = [...this.comments.keys()].sort((a, b) => a - b);
      let cursor = 0;

      /** Consume y devuelve los comentarios en líneas anteriores a `line`. */
      const tomarAntesDe = (line: number): string[] => {
         const out: string[] = [];
         while (cursor < pendientes.length && pendientes[cursor] < line) {
            out.push(this.comments.get(pendientes[cursor])!);
            cursor += 1;
         }
         return out;
      };

      /** Consume el comentario que esté exactamente en `line`, si lo hay. */
      const tomarEn = (line: number): string | undefined => {
         if (cursor < pendientes.length && pendientes[cursor] === line) {
            const texto = this.comments.get(pendientes[cursor])!;
            cursor += 1;
            return texto;
         }
         return undefined;
      };

      const procesarBloque = (block: Statement[]): void => {
         for (const stmt of block) {
            const line = stmt.loc?.line ?? 0;

            const leading = tomarAntesDe(line);
            if (leading.length > 0) stmt.leadingComments = leading;

            // Para una sentencia compuesta, `loc.line` es la línea del
            // encabezado (`Si …  Entonces`), que es donde el alumno escribiría
            // el comentario de la misma línea.
            const trailing = tomarEn(line);
            if (trailing !== undefined) stmt.trailingComment = trailing;

            for (const { block: hijo } of childBlocks(stmt)) {
               procesarBloque(hijo);
            }
         }

         // Lo que quede antes del cierre del bloque cuelga de la última
         // sentencia. Si el bloque está vacío no se consume nada: el comentario
         // sube solo al bloque de afuera en la siguiente llamada.
         const fin = this.blockEnds.get(block);
         const ultima = block[block.length - 1];
         if (fin !== undefined && ultima) {
            const resto = tomarAntesDe(fin);
            if (resto.length > 0) ultima.afterComments = resto;
         }
      };

      procesarBloque(program.body);

      // Cualquier comentario posterior a la última sentencia queda al final del
      // programa, antes de `FinProceso`.
      const sobrantes = pendientes.slice(cursor).map((l) => this.comments.get(l)!);
      if (sobrantes.length > 0) {
         const ultima = program.body[program.body.length - 1];
         if (ultima) {
            ultima.afterComments = [...(ultima.afterComments ?? []), ...sobrantes];
         } else {
            program.afterComments = sobrantes;
         }
      }
   }

   // -- Programa ------------------------------------------------------------

   parseProgram(): Program {
      const start = this.current;
      this.skipNewlines();

      let name = '';
      if (this.match('Proceso')) {
         const ident = this.match('Identificador');
         if (ident) {
            name = ident.value;
         } else {
            this.error('Falta el nombre del proceso después de "Proceso".');
         }
      } else {
         this.error('El algoritmo debe empezar con "Proceso <nombre>".');
      }

      const body = this.parseBlock();

      if (!this.match('FinProceso')) {
         this.error('Falta "FinProceso" al final del algoritmo.');
      }

      this.skipNewlines();
      if (!this.check('FinArchivo')) {
         this.error('Hay código después de "FinProceso".');
      }

      return { kind: 'Program', id: nextId('prog'), name, body, loc: this.loc(start) };
   }

   /** Lee sentencias hasta encontrar un cierre de bloque o el fin del archivo. */
   private parseBlock(): Statement[] {
      const statements: Statement[] = [];
      this.skipNewlines();

      while (!BLOCK_ENDERS.has(this.current.type)) {
         const before = this.pos;
         const stmt = this.parseStatement();
         if (stmt) statements.push(stmt);

         // Salvaguarda: si una rama no consumió ningún token, forzar avance
         // para que un error raro no cuelgue el editor con un bucle infinito.
         if (this.pos === before) this.advance();

         this.skipNewlines();
      }

      this.blockEnds.set(statements, this.current.line);
      return statements;
   }

   private parseStatement(): Statement | null {
      const token = this.current;

      switch (token.type) {
         case 'Definir': return this.parseDefine();
         case 'Dimension': return this.parseDimension();
         case 'Leer': return this.parseRead();
         case 'Escribir': return this.parseWrite();
         case 'Si': return this.parseIf();
         case 'Mientras': return this.parseWhile();
         case 'Repetir': return this.parseRepeat();
         case 'Para': return this.parseFor();
         case 'Segun': return this.parseSwitch();
         case 'Identificador': return this.parseAssign();
         default:
            // `y <- 3`: una variable llamada como un operador lógico abre una
            // asignación igual que cualquier otro nombre.
            if (this.isIdentifierLike()) return this.parseAssign();
            this.error(`No se esperaba ${describirToken(token)} aquí.`);
            this.recover();
            return null;
      }
   }

   // -- Sentencias ----------------------------------------------------------

   private parseDefine(): DefineStatement | null {
      const start = this.advance(); // Definir
      const names: string[] = [];

      do {
         const ident = this.matchIdentifier();
         if (!ident) {
            this.error('Se esperaba el nombre de una variable.');
            this.recover();
            return null;
         }
         names.push(ident.value);
      } while (this.match('Coma'));

      if (!this.expect('Como', 'Falta "Como" antes del tipo de dato.')) {
         this.recover();
         return null;
      }

      const type = this.match('TipoDato');
      if (!type) {
         this.error('Se esperaba un tipo: Entero, Real, Caracter o Logico.');
         this.recover();
         return null;
      }

      return {
         kind: 'DefineStatement',
         id: nextId('def'),
         names,
         dataType: type.value as DataType,
         loc: this.loc(start),
      };
   }

   private parseDimension(): DimensionStatement | null {
      const start = this.advance(); // Dimension
      const arrays: DimensionStatement['arrays'] = [];

      do {
         const ident = this.matchIdentifier();
         if (!ident) {
            this.error('Se esperaba el nombre del arreglo.');
            this.recover();
            return null;
         }
         if (!this.expect('CorcheteAbre', 'Falta "[" con el tamaño del arreglo.')) {
            this.recover();
            return null;
         }
         const sizes: Expression[] = [];
         do {
            sizes.push(this.parseExpression());
         } while (this.match('Coma'));
         this.expect('CorcheteCierra', 'Falta "]".');
         arrays.push({ name: ident.value, sizes });
      } while (this.match('Coma'));

      return {
         kind: 'DimensionStatement',
         id: nextId('dim'),
         arrays,
         loc: this.loc(start),
      };
   }

   private parseRead(): ReadStatement | null {
      const start = this.advance(); // Leer
      const targets: Array<Identifier | IndexExpression> = [];

      do {
         const target = this.parseAssignTarget();
         if (!target) {
            this.recover();
            return null;
         }
         targets.push(target);
      } while (this.match('Coma'));

      return { kind: 'ReadStatement', id: nextId('leer'), targets, loc: this.loc(start) };
   }

   private parseWrite(): WriteStatement {
      const start = this.advance(); // Escribir
      const values: Expression[] = [];

      // `Escribir` sin argumentos imprime una línea en blanco: es válido.
      if (!this.check('FinLinea') && !this.check('FinArchivo') && !this.check('SinSaltar')) {
         do {
            values.push(this.parseExpression());
         } while (this.match('Coma'));
      }

      const noNewline = this.match('SinSaltar') !== null;

      return {
         kind: 'WriteStatement',
         id: nextId('esc'),
         values,
         noNewline,
         loc: this.loc(start),
      };
   }

   private parseAssign(): AssignStatement | null {
      const start = this.current;
      const target = this.parseAssignTarget();
      if (!target) {
         this.recover();
         return null;
      }

      if (!this.expect('Asignacion', 'Falta el operador de asignación "<-".')) {
         this.recover();
         return null;
      }

      const value = this.parseExpression();

      return { kind: 'AssignStatement', id: nextId('asig'), target, value, loc: this.loc(start) };
   }

   /** Lee `nombre` o `nombre[i, j]` como destino de asignación o lectura. */
   private parseAssignTarget(): Identifier | IndexExpression | null {
      const ident = this.matchIdentifier();
      if (!ident) {
         this.error('Se esperaba el nombre de una variable.');
         return null;
      }

      const base: Identifier = {
         kind: 'Identifier',
         id: nextId('id'),
         name: ident.value,
         loc: this.loc(ident, ident.line),
      };

      if (this.match('CorcheteAbre')) {
         const indices: Expression[] = [];
         do {
            indices.push(this.parseExpression());
         } while (this.match('Coma'));
         this.expect('CorcheteCierra', 'Falta "]".');
         return {
            kind: 'IndexExpression',
            id: nextId('idx'),
            array: base,
            indices,
            loc: this.loc(ident),
         };
      }

      return base;
   }

   private parseIf(): IfStatement {
      const start = this.advance(); // Si
      const test = this.parseExpression();
      this.expect('Entonces', 'Falta "Entonces" después de la condición.');

      const consequent = this.parseBlock();
      let alternate: Statement[] | undefined;

      if (this.match('SiNo')) {
         alternate = this.parseBlock();
      }

      this.expect('FinSi', 'Falta "FinSi" para cerrar el "Si".');

      return {
         kind: 'IfStatement',
         id: nextId('si'),
         test,
         consequent,
         alternate,
         loc: this.loc(start),
      };
   }

   private parseWhile(): WhileStatement {
      const start = this.advance(); // Mientras
      const test = this.parseExpression();
      // `Hacer` es opcional en PSeInt.
      this.match('Hacer');
      const body = this.parseBlock();
      this.expect('FinMientras', 'Falta "FinMientras" para cerrar el "Mientras".');

      return { kind: 'WhileStatement', id: nextId('mien'), test, body, loc: this.loc(start) };
   }

   private parseRepeat(): RepeatStatement {
      const start = this.advance(); // Repetir
      const body = this.parseBlock();

      let test: Expression;
      if (this.match('HastaQue')) {
         test = this.parseExpression();
      } else {
         this.error('Falta "Hasta Que" con la condición de salida del "Repetir".');
         test = { kind: 'BooleanLiteral', id: nextId('bool'), value: true };
      }

      return { kind: 'RepeatStatement', id: nextId('rep'), body, test, loc: this.loc(start) };
   }

   private parseFor(): ForStatement | null {
      const start = this.advance(); // Para

      const ident = this.matchIdentifier();
      if (!ident) {
         this.error('Se esperaba la variable de control del "Para".');
         this.recover();
         return null;
      }
      const variable: Identifier = {
         kind: 'Identifier',
         id: nextId('id'),
         name: ident.value,
         loc: this.loc(ident, ident.line),
      };

      this.expect('Asignacion', 'Falta "<-" con el valor inicial del "Para".');
      const from = this.parseExpression();

      this.expect('Hasta', 'Falta "Hasta" con el valor final del "Para".');
      const to = this.parseExpression();

      const step = this.match('ConPaso') ? this.parseExpression() : undefined;

      this.match('Hacer');
      const body = this.parseBlock();
      this.expect('FinPara', 'Falta "FinPara" para cerrar el "Para".');

      return {
         kind: 'ForStatement',
         id: nextId('para'),
         variable,
         from,
         to,
         step,
         body,
         loc: this.loc(start),
      };
   }

   private parseSwitch(): SwitchStatement {
      const start = this.advance(); // Segun
      const discriminant = this.parseExpression();
      this.match('Hacer');
      this.skipNewlines();

      const cases: SwitchCase[] = [];

      while (!this.check('FinSegun') && !this.check('FinArchivo')) {
         const caseStart = this.current;

         if (this.match('DeOtroModo')) {
            this.match('DosPuntos');
            const body = this.parseCaseBody();
            cases.push({
               kind: 'SwitchCase',
               id: nextId('caso'),
               tests: [],
               body,
               loc: this.loc(caseStart),
            });
            continue;
         }

         // Un caso puede llevar varios valores separados por coma: `1, 2, 3:`.
         // Se guarda como UN caso con varios valores; el diagrama dibuja una
         // sola rama etiquetada `1, 2, 3`.
         const tests: Expression[] = [];
         do {
            tests.push(this.parseExpression());
         } while (this.match('Coma'));

         if (!this.expect('DosPuntos', 'Falta ":" después del valor del caso.')) {
            this.recover();
            continue;
         }

         cases.push({
            kind: 'SwitchCase',
            id: nextId('caso'),
            tests,
            body: this.parseCaseBody(),
            loc: this.loc(caseStart),
         });
      }

      this.expect('FinSegun', 'Falta "FinSegun" para cerrar el "Segun".');

      return {
         kind: 'SwitchStatement',
         id: nextId('seg'),
         discriminant,
         cases,
         loc: this.loc(start),
      };
   }

   /**
    * Cuerpo de un caso: va hasta el siguiente caso, `De Otro Modo` o `FinSegun`.
    * Detectar "el siguiente caso" requiere mirar adelante, porque una expresión
    * seguida de `:` al inicio de línea es un caso y no una sentencia.
    */
   private parseCaseBody(): Statement[] {
      const statements: Statement[] = [];
      this.skipNewlines();

      while (
         !this.check('FinSegun') &&
         !this.check('DeOtroModo') &&
         !this.check('FinArchivo') &&
         !this.startsNewCase()
      ) {
         const before = this.pos;
         const stmt = this.parseStatement();
         if (stmt) statements.push(stmt);
         if (this.pos === before) this.advance();
         this.skipNewlines();
      }

      this.blockEnds.set(statements, this.current.line);
      return statements;
   }

   /**
    * ¿La posición actual abre un caso nuevo? Se busca `:` antes del fin de
    * línea sin cruzar corchetes, para no confundirse con `a[i]` ni con una
    * asignación.
    */
   private startsNewCase(): boolean {
      if (!this.check('Numero') && !this.check('Cadena') && !this.check('Identificador')) {
         return false;
      }
      let depth = 0;
      for (let k = 0; ; k++) {
         const t = this.peek(k);
         if (t.type === 'FinLinea' || t.type === 'FinArchivo') return false;
         if (t.type === 'CorcheteAbre' || t.type === 'ParenAbre') depth += 1;
         else if (t.type === 'CorcheteCierra' || t.type === 'ParenCierra') depth -= 1;
         else if (t.type === 'Asignacion') return false;
         else if (t.type === 'DosPuntos' && depth === 0) return true;
      }
   }

   // -- Expresiones ---------------------------------------------------------
   //
   // Precedencia, de menor a mayor:
   //   O  <  Y  <  relacionales  <  + -  <  * / %  <  ^  <  unarios  <  primaria

   parseExpression(): Expression {
      return this.parseOr();
   }

   /** ¿Se consumieron ya todos los tokens? Lo usa `parseExpresion`. */
   enElFinal(): boolean {
      return this.check('FinArchivo') || this.check('FinLinea');
   }

   private parseBinaryLevel(
      operators: readonly string[],
      next: () => Expression,
      rightAssociative = false,
   ): Expression {
      let left = next();

      while (this.check('Operador') && operators.includes(this.current.value)) {
         const op = this.advance();
         const right = rightAssociative
            ? this.parseBinaryLevel(operators, next, true)
            : next();
         left = {
            kind: 'BinaryExpression',
            id: nextId('bin'),
            operator: op.value as BinaryOperator,
            left,
            right,
            loc: left.loc,
         };
         if (rightAssociative) break;
      }

      return left;
   }

   private parseOr(): Expression {
      return this.parseBinaryLevel(['O'], () => this.parseAnd());
   }

   private parseAnd(): Expression {
      return this.parseBinaryLevel(['Y'], () => this.parseNot());
   }

   private parseNot(): Expression {
      if (this.check('Operador') && this.current.value === 'NO') {
         const op = this.advance();
         return {
            kind: 'UnaryExpression',
            id: nextId('un'),
            operator: 'NO',
            argument: this.parseNot(),
            loc: this.loc(op, op.line),
         };
      }
      return this.parseComparison();
   }

   private parseComparison(): Expression {
      return this.parseBinaryLevel(['=', '<>', '<', '<=', '>', '>='], () => this.parseAdditive());
   }

   private parseAdditive(): Expression {
      return this.parseBinaryLevel(['+', '-'], () => this.parseMultiplicative());
   }

   private parseMultiplicative(): Expression {
      return this.parseBinaryLevel(['*', '/', '%'], () => this.parsePower());
   }

   private parsePower(): Expression {
      return this.parseBinaryLevel(['^'], () => this.parseUnary(), true);
   }

   private parseUnary(): Expression {
      if (this.check('Operador') && (this.current.value === '-' || this.current.value === '+')) {
         const op = this.advance();
         return {
            kind: 'UnaryExpression',
            id: nextId('un'),
            operator: op.value as '-' | '+',
            argument: this.parseUnary(),
            loc: this.loc(op, op.line),
         };
      }
      return this.parsePrimary();
   }

   private parsePrimary(): Expression {
      const token = this.current;

      if (this.match('Numero')) {
         return {
            kind: 'NumberLiteral',
            id: nextId('num'),
            value: Number(token.value),
            raw: token.value,
            loc: this.loc(token, token.line),
         };
      }

      if (this.match('Cadena')) {
         const quote = token.value[0] as '"' | "'";
         return {
            kind: 'StringLiteral',
            id: nextId('str'),
            value: token.value.slice(1, -1),
            quote,
            loc: this.loc(token, token.line),
         };
      }

      if (this.match('Booleano')) {
         return {
            kind: 'BooleanLiteral',
            id: nextId('bool'),
            value: token.value === 'Verdadero',
            loc: this.loc(token, token.line),
         };
      }

      if (this.match('ParenAbre')) {
         const inner = this.parseExpression();
         this.expect('ParenCierra', 'Falta ")".');
         return {
            kind: 'GroupExpression',
            id: nextId('grp'),
            expression: inner,
            loc: this.loc(token, token.line),
         };
      }

      const identToken = this.matchIdentifier();
      if (identToken) {
         // Llamada a función interna.
         if (this.check('ParenAbre')) {
            this.advance();
            const args: Expression[] = [];
            if (!this.check('ParenCierra')) {
               do {
                  args.push(this.parseExpression());
               } while (this.match('Coma'));
            }
            this.expect('ParenCierra', 'Falta ")" al cerrar la llamada.');
            return {
               kind: 'CallExpression',
               id: nextId('call'),
               callee: identToken.value,
               args,
               loc: this.loc(identToken),
            };
         }

         // Acceso a arreglo.
         if (this.check('CorcheteAbre')) {
            this.advance();
            const indices: Expression[] = [];
            do {
               indices.push(this.parseExpression());
            } while (this.match('Coma'));
            this.expect('CorcheteCierra', 'Falta "]".');
            return {
               kind: 'IndexExpression',
               id: nextId('idx'),
               array: {
                  kind: 'Identifier',
                  id: nextId('id'),
                  name: identToken.value,
                  loc: this.loc(identToken, token.line),
               },
               indices,
               loc: this.loc(identToken),
            };
         }

         return {
            kind: 'Identifier',
            id: nextId('id'),
            name: identToken.value,
            loc: this.loc(identToken, token.line),
         };
      }

      // Nada encaja. Se emite un nodo de relleno para que el árbol siga siendo
      // válido y el resto del algoritmo se pueda seguir dibujando.
      this.error(`Falta un valor o una expresión antes de ${describirToken(token)}.`);
      if (!this.check('FinLinea') && !this.check('FinArchivo') && !BLOCK_ENDERS.has(token.type)) {
         this.advance();
      }
      return { kind: 'NumberLiteral', id: nextId('num'), value: 0, raw: '0' };
   }
}

/**
 * Analiza una expresión suelta, sin programa alrededor.
 *
 * Lo usa el editor de expresiones del diagrama para validar lo que el alumno
 * arma con el teclado de fichas antes de aceptarlo, reutilizando exactamente la
 * misma gramática que el editor de texto. Sin esto habría dos nociones de
 * "expresión válida" y acabarían divergiendo.
 */
export function parseExpresion(source: string): {
   expresion: Expression | null;
   errores: ParseError[];
} {
   const texto = source.trim();
   if (texto === '') {
      return { expresion: null, errores: [{ message: 'Falta la expresión.', line: 1, col: 1 }] };
   }

   const parser = new Parser(texto);
   const expresion = parser.parseExpression();

   // Si sobran tokens, la expresión estaba mal formada aunque el prefijo
   // se haya podido leer: `2 +` o `a b` no deben pasar por válidos.
   if (!parser.enElFinal()) {
      parser.errors.push({
         message: 'Sobra texto al final de la expresión.',
         line: 1,
         col: 1,
      });
   }

   return {
      expresion: parser.errors.length === 0 ? expresion : null,
      errores: parser.errors,
   };
}

/** Analiza el pseudocódigo y devuelve el AST junto con los errores hallados. */
export function parse(source: string): ParseResult {
   const parser = new Parser(source);
   const program = parser.parseProgram();
   parser.attachComments(program);
   return { program, errors: parser.errors, comments: parser.comments };
}
