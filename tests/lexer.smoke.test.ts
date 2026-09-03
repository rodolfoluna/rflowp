import { describe, it, expect } from 'vitest';
import { tokenize, normalize } from '../src/core/lexer';

describe('normalize', () => {
   it('quita acentos y mayusculas', () => {
      expect(normalize('Según')).toBe('segun');
      expect(normalize('FINMIENTRAS')).toBe('finmientras');
   });
});

describe('tokenize', () => {
   it('reconoce palabras clave compuestas', () => {
      const t = tokenize('Para i <- 1 Hasta 10 Con Paso 2 Hacer');
      const types = t.map((x) => x.type);
      expect(types).toContain('ConPaso');
      expect(types).toContain('Hasta');
      expect(types.filter((x) => x === 'Hasta').length).toBe(1);
   });

   it('Hasta Que no se confunde con Hasta', () => {
      expect(tokenize('Hasta Que x > 3').map((t) => t.type)).toContain('HastaQue');
      expect(tokenize('Hasta 10').map((t) => t.type)).toContain('Hasta');
   });

   it('NO se lexa como operador, no como SiNo', () => {
      const types = tokenize('Si NO encontrado Entonces').map((t) => t.type);
      expect(types).toEqual(['Si', 'Operador', 'Identificador', 'Entonces', 'FinArchivo']);
   });

   it('asignacion gana al operador menor-que', () => {
      const t = tokenize('x <- 5');
      expect(t[1].type).toBe('Asignacion');
   });

   it('distingue cadenas, numeros y decimales', () => {
      const t = tokenize('Escribir "hola", 3.14');
      expect(t.map((x) => x.type)).toEqual(['Escribir', 'Cadena', 'Coma', 'Numero', 'FinArchivo']);
      expect(t[3].value).toBe('3.14');
   });

   it('v y f de una letra son identificadores', () => {
      expect(tokenize('v').map((t) => t.type)).toEqual(['Identificador', 'FinArchivo']);
      expect(tokenize('Verdadero').map((t) => t.type)).toEqual(['Booleano', 'FinArchivo']);
   });

   it('rastrea lineas y columnas', () => {
      const t = tokenize('Proceso p\n  x <- 1');
      const x = t.find((tk) => tk.value === 'x');
      expect(x?.line).toBe(2);
      expect(x?.col).toBe(3);
   });
});
