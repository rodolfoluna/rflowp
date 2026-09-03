/**
 * Lexer del dialecto PSeInt (español).
 *
 * Decisiones que importan:
 *  - Las palabras clave son insensibles a mayúsculas y a acentos, porque los
 *    alumnos escriben `segun`, `Según` y `SEGUN` indistintamente y ninguna de
 *    las tres debería ser un error.
 *  - Varias palabras clave son de DOS palabras (`Con Paso`, `Hasta Que`,
 *    `De Otro Modo`, `Sin Saltar`). Se resuelven aquí, mirando adelante, para
 *    que el parser no tenga que hacerlo.
 *  - El lexer nunca lanza: los caracteres inesperados salen como token
 *    `Desconocido` y el parser decide cómo reportarlos. Esto es lo que permite
 *    seguir dibujando el diagrama mientras el alumno escribe a medias.
 */

export type TokenType =
   | 'Proceso' | 'FinProceso'
   | 'Definir' | 'Como' | 'Dimension'
   | 'Leer' | 'Escribir' | 'SinSaltar'
   | 'Si' | 'Entonces' | 'SiNo' | 'FinSi'
   | 'Mientras' | 'Hacer' | 'FinMientras'
   | 'Repetir' | 'HastaQue'
   | 'Para' | 'Hasta' | 'ConPaso' | 'FinPara'
   | 'Segun' | 'DeOtroModo' | 'FinSegun'
   | 'TipoDato'
   | 'Identificador' | 'Numero' | 'Cadena' | 'Booleano'
   | 'Asignacion'
   | 'Operador'
   | 'ParenAbre' | 'ParenCierra'
   | 'CorcheteAbre' | 'CorcheteCierra'
   | 'Coma' | 'DosPuntos'
   | 'Comentario'
   | 'FinLinea'
   | 'Desconocido'
   | 'FinArchivo';

export interface Token {
   type: TokenType;
   /** Valor canónico. Para operadores en palabra ya viene normalizado (`Y`, `%`). */
   value: string;
   /**
    * Texto tal cual lo escribió el alumno, cuando difiere de `value`.
    * Lo necesita el parser para reinterpretar `y`/`o` como nombres de variable:
    * son a la vez operadores lógicos y nombres perfectamente razonables.
    */
   raw?: string;
   line: number;
   col: number;
}

/** Quita acentos y pasa a minúsculas, para comparar palabras clave. */
export function normalize(word: string): string {
   return word
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
}

/** Palabras clave de una sola palabra, indexadas por su forma normalizada. */
const SINGLE_KEYWORDS: Record<string, TokenType> = {
   proceso: 'Proceso',
   algoritmo: 'Proceso', // PSeInt acepta ambos
   finproceso: 'FinProceso',
   finalgoritmo: 'FinProceso',
   definir: 'Definir',
   como: 'Como',
   dimension: 'Dimension',
   dimensionar: 'Dimension',
   leer: 'Leer',
   escribir: 'Escribir',
   mostrar: 'Escribir',
   si: 'Si',
   entonces: 'Entonces',
   sino: 'SiNo',
   finsi: 'FinSi',
   mientras: 'Mientras',
   hacer: 'Hacer',
   finmientras: 'FinMientras',
   repetir: 'Repetir',
   para: 'Para',
   hasta: 'Hasta',
   finpara: 'FinPara',
   segun: 'Segun',
   finsegun: 'FinSegun',
};

/** Palabras clave compuestas, en forma normalizada, más largas primero. */
const MULTI_KEYWORDS: Array<{ words: string[]; type: TokenType }> = [
   { words: ['de', 'otro', 'modo'], type: 'DeOtroModo' },
   { words: ['con', 'paso'], type: 'ConPaso' },
   { words: ['hasta', 'que'], type: 'HastaQue' },
   { words: ['sin', 'saltar'], type: 'SinSaltar' },
   // `Si No` separado NO se reconoce a propósito: chocaría con la negación en
   // `Si NO encontrado Entonces`. `SiNo` va siempre junto, como en PSeInt.
];

const DATA_TYPE_WORDS: Record<string, string> = {
   entero: 'Entero',
   enteros: 'Entero',
   real: 'Real',
   reales: 'Real',
   caracter: 'Caracter',
   caracteres: 'Caracter',
   cadena: 'Caracter',
   texto: 'Caracter',
   logico: 'Logico',
   logicos: 'Logico',
};

const BOOLEAN_WORDS: Record<string, string> = {
   verdadero: 'Verdadero',
   falso: 'Falso',
   v: 'Verdadero',
   f: 'Falso',
};

/** Operadores lógicos escritos como palabra. */
const WORD_OPERATORS: Record<string, string> = {
   y: 'Y',
   o: 'O',
   no: 'NO',
   mod: '%',
};

/** Operadores simbólicos, más largos primero para que `<=` gane a `<`. */
const SYMBOL_OPERATORS = ['<=', '>=', '<>', '==', '!=', '<', '>', '=', '+', '-', '*', '/', '%', '^'];

const IDENT_START = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_]/;
const IDENT_PART = /[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ_]/;

export function tokenize(source: string): Token[] {
   const tokens: Token[] = [];
   let i = 0;
   let line = 1;
   let col = 1;

   const push = (type: TokenType, value: string, tLine = line, tCol = col) => {
      tokens.push({ type, value, line: tLine, col: tCol });
   };

   const advance = (n = 1) => {
      for (let k = 0; k < n; k++) {
         if (source[i] === '\n') {
            line += 1;
            col = 1;
         } else {
            col += 1;
         }
         i += 1;
      }
   };

   while (i < source.length) {
      const ch = source[i];

      // Salto de línea: significativo, PSeInt separa sentencias por línea.
      if (ch === '\n') {
         push('FinLinea', '\n');
         advance();
         continue;
      }

      // Espacios y retornos de carro.
      if (ch === ' ' || ch === '\t' || ch === '\r') {
         advance();
         continue;
      }

      // Comentarios: `//` hasta fin de línea.
      if (ch === '/' && source[i + 1] === '/') {
         const start = i;
         const startCol = col;
         while (i < source.length && source[i] !== '\n') advance();
         push('Comentario', source.slice(start, i), line, startCol);
         continue;
      }

      // Cadenas. Sin escapes: PSeInt no los tiene, y para duplicar una comilla
      // el alumno usa el otro tipo de comilla.
      if (ch === '"' || ch === "'") {
         const quote = ch;
         const startLine = line;
         const startCol = col;
         const start = i;
         advance();
         while (i < source.length && source[i] !== quote && source[i] !== '\n') advance();
         if (source[i] === quote) {
            advance();
            push('Cadena', source.slice(start, i), startLine, startCol);
         } else {
            // Cadena sin cerrar: se emite igual para que el parser dé un error
            // legible en vez de que el lexer se coma el resto del archivo.
            push('Desconocido', source.slice(start, i), startLine, startCol);
         }
         continue;
      }

      // Números.
      if (/[0-9]/.test(ch)) {
         const startCol = col;
         const start = i;
         while (i < source.length && /[0-9]/.test(source[i])) advance();
         if (source[i] === '.' && /[0-9]/.test(source[i + 1] ?? '')) {
            advance();
            while (i < source.length && /[0-9]/.test(source[i])) advance();
         }
         push('Numero', source.slice(start, i), line, startCol);
         continue;
      }

      // Asignación `<-` y su alias `:=`. Debe probarse ANTES que el operador `<`.
      if ((ch === '<' && source[i + 1] === '-') || (ch === ':' && source[i + 1] === '=')) {
         const startCol = col;
         advance(2);
         push('Asignacion', '<-', line, startCol);
         continue;
      }

      // Identificadores y palabras clave.
      if (IDENT_START.test(ch)) {
         const startLine = line;
         const startCol = col;
         const start = i;
         while (i < source.length && IDENT_PART.test(source[i])) advance();
         const raw = source.slice(start, i);
         const norm = normalize(raw);

         // ¿Es el inicio de una palabra clave compuesta? Se mira adelante sin
         // consumir, y solo se acepta si todas las palabras coinciden.
         const multi = matchMultiWord(source, i, norm);
         if (multi) {
            advance(multi.consumed);
            push(multi.type, source.slice(start, i), startLine, startCol);
            continue;
         }

         if (SINGLE_KEYWORDS[norm]) {
            push(SINGLE_KEYWORDS[norm], raw, startLine, startCol);
         } else if (DATA_TYPE_WORDS[norm]) {
            push('TipoDato', DATA_TYPE_WORDS[norm], startLine, startCol);
         } else if (BOOLEAN_WORDS[norm] && norm.length > 1) {
            // `v` y `f` de una letra se tratan como identificadores: es mucho
            // más probable que el alumno haya llamado así a una variable.
            push('Booleano', BOOLEAN_WORDS[norm], startLine, startCol);
         } else if (WORD_OPERATORS[norm]) {
            tokens.push({
               type: 'Operador',
               value: WORD_OPERATORS[norm],
               raw,
               line: startLine,
               col: startCol,
            });
         } else {
            push('Identificador', raw, startLine, startCol);
         }
         continue;
      }

      // Operadores simbólicos.
      const symbol = SYMBOL_OPERATORS.find((op) => source.startsWith(op, i));
      if (symbol) {
         const startCol = col;
         advance(symbol.length);
         // Se normalizan los alias a la forma canónica de PSeInt.
         const canonical = symbol === '==' ? '=' : symbol === '!=' ? '<>' : symbol;
         push('Operador', canonical, line, startCol);
         continue;
      }

      // Puntuación.
      const punctuation: Record<string, TokenType> = {
         '(': 'ParenAbre',
         ')': 'ParenCierra',
         '[': 'CorcheteAbre',
         ']': 'CorcheteCierra',
         ',': 'Coma',
         ':': 'DosPuntos',
      };
      if (punctuation[ch]) {
         const startCol = col;
         advance();
         push(punctuation[ch], ch, line, startCol);
         continue;
      }

      // Cualquier otra cosa.
      const startCol = col;
      advance();
      push('Desconocido', ch, line, startCol);
   }

   push('FinArchivo', '');
   return tokens;
}

/**
 * Intenta casar una palabra clave compuesta que empieza en `firstWord`.
 * `pos` es el índice justo después de la primera palabra.
 * Devuelve cuántos caracteres consumir en total (desde `pos`) o `null`.
 */
function matchMultiWord(
   source: string,
   pos: number,
   firstWord: string,
): { type: TokenType; consumed: number } | null {
   for (const { words, type } of MULTI_KEYWORDS) {
      if (words[0] !== firstWord) continue;

      let cursor = pos;
      let matched = true;
      for (let w = 1; w < words.length; w++) {
         // Saltar espacios horizontales; un salto de línea corta la frase.
         let spaces = 0;
         while (cursor + spaces < source.length && /[ \t\r]/.test(source[cursor + spaces])) spaces++;
         if (spaces === 0) {
            matched = false;
            break;
         }
         let end = cursor + spaces;
         const wordStart = end;
         while (end < source.length && IDENT_PART.test(source[end])) end++;
         if (normalize(source.slice(wordStart, end)) !== words[w]) {
            matched = false;
            break;
         }
         cursor = end;
      }

      if (matched) return { type, consumed: cursor - pos };
   }
   return null;
}
