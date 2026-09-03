/**
 * Los comentarios viven en el AST, no en el texto.
 *
 * Importa porque la edición gráfica reimprime el pseudocódigo completo en cada
 * cambio: si el ciclo no los conservara, el primer clic en el diagrama borraría
 * lo que el alumno escribió para explicarse.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser';
import { print } from '../src/core/printer';

/** Simula lo que hace la edición gráfica: parsear y volver a imprimir. */
function ciclo(fuente: string): string {
   return print(parse(fuente).program);
}

describe('los comentarios sobreviven al ciclo', () => {
   it('comentario en línea propia antes de una sentencia', () => {
      const salida = ciclo(`
Proceso p
   // suma los dos numeros
   x <- 1 + 2
FinProceso`);
      expect(salida).toContain('// suma los dos numeros');
      // Debe seguir estando ANTES de la asignación.
      const lineas = salida.split('\n');
      expect(lineas.findIndex((l) => l.includes('//'))).toBeLessThan(
         lineas.findIndex((l) => l.includes('x <-')),
      );
   });

   it('comentario al final de la línea', () => {
      const salida = ciclo(`
Proceso p
   x <- 1 // el contador
FinProceso`);
      expect(salida).toContain('x <- 1 // el contador');
   });

   it('comentario al final de la línea de un encabezado compuesto', () => {
      const salida = ciclo(`
Proceso p
   Definir n Como Entero
   Si n > 0 Entonces // solo positivos
      Escribir n
   FinSi
FinProceso`);
      expect(salida).toContain('Si n > 0 Entonces // solo positivos');
   });

   it('comentario justo antes de un FinSi se queda dentro del bloque', () => {
      const salida = ciclo(`
Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
      Escribir n
      // aqui podria ir el else
   FinSi
FinProceso`);
      const lineas = salida.split('\n');
      const iComentario = lineas.findIndex((l) => l.includes('// aqui'));
      const iEscribir = lineas.findIndex((l) => l.includes('Escribir n'));
      const iFinSi = lineas.findIndex((l) => l.includes('FinSi'));
      expect(iEscribir).toBeLessThan(iComentario);
      expect(iComentario).toBeLessThan(iFinSi);
   });

   it('varios comentarios seguidos conservan su orden', () => {
      const salida = ciclo(`
Proceso p
   // primero
   // segundo
   // tercero
   x <- 1
FinProceso`);
      const soloComentarios = salida
         .split('\n')
         .filter((l) => l.includes('//'))
         .map((l) => l.trim());
      expect(soloComentarios).toEqual(['// primero', '// segundo', '// tercero']);
   });

   it('comentarios en ramas y ciclos anidados', () => {
      const fuente = `
Proceso p
   Definir i, j Como Entero
   // ciclo principal
   Para i <- 1 Hasta 3 Hacer
      // decide la rama
      Si i % 2 = 0 Entonces
         Escribir "par" // los pares
      SiNo
         // los impares van aqui
         Escribir "impar"
      FinSi
   FinPara
FinProceso`;
      const salida = ciclo(fuente);
      for (const c of [
         '// ciclo principal',
         '// decide la rama',
         '// los pares',
         '// los impares van aqui',
      ]) {
         expect(salida, `falta ${c}`).toContain(c);
      }
   });

   it('el ciclo es idempotente con comentarios', () => {
      const fuente = `
Proceso p
   // encabezado
   Definir n Como Entero
   Leer n // dato de entrada
   Si n > 0 Entonces
      Escribir "si"
      // fin de la rama
   FinSi
FinProceso`;
      const uno = ciclo(fuente);
      const dos = ciclo(uno);
      expect(dos).toBe(uno);
   });

   it('no se pierde ninguno: el conteo se conserva', () => {
      const fuente = `
Proceso p
   // a
   Definir n Como Entero // b
   // c
   Mientras n < 3 Hacer
      // d
      n <- n + 1 // e
      // f
   FinMientras
   // g
FinProceso`;
      const salida = ciclo(fuente);
      const cuantos = salida.split('\n').filter((l) => l.includes('//')).length;
      expect(cuantos).toBe(7);
   });

   it('un comentario en un bloque vacío no se pierde', () => {
      const salida = ciclo(`
Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
      // pendiente de escribir
   FinSi
FinProceso`);
      expect(salida).toContain('// pendiente de escribir');
   });
});
