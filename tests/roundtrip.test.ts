/**
 * Prueba central del núcleo: `parse → print → parse` debe dar el mismo árbol.
 *
 * Si esto falla, la sincronización entre las dos vistas corrompe el trabajo del
 * alumno, así que es la red de seguridad más importante del proyecto.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser';
import { print } from '../src/core/printer';
import { walk, type Program } from '../src/core/ast';

/** Copia el árbol quitando `id` y `loc`, que legítimamente cambian al reparsear. */
function shape(node: unknown): unknown {
   if (Array.isArray(node)) return node.map(shape);
   if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
         if (k === 'id' || k === 'loc') continue;
         out[k] = shape(v);
      }
      return out;
   }
   return node;
}

const PROGRAMAS: Record<string, string> = {
   'hola mundo': `
Proceso saludo
   Escribir "Hola, mundo"
FinProceso`,

   'suma de dos numeros': `
Proceso suma
   Definir a, b, total Como Entero
   Escribir "Dame dos numeros:"
   Leer a, b
   total <- a + b
   Escribir "La suma es: ", total
FinProceso`,

   'condicional con sino': `
Proceso par_o_impar
   Definir n Como Entero
   Leer n
   Si n % 2 = 0 Entonces
      Escribir "par"
   SiNo
      Escribir "impar"
   FinSi
FinProceso`,

   'condicional sin sino': `
Proceso positivo
   Definir n Como Entero
   Leer n
   Si n > 0 Entonces
      Escribir "positivo"
   FinSi
FinProceso`,

   'mientras': `
Proceso cuenta
   Definir i Como Entero
   i <- 1
   Mientras i <= 10 Hacer
      Escribir i
      i <- i + 1
   FinMientras
FinProceso`,

   'para con paso': `
Proceso pares
   Definir i Como Entero
   Para i <- 0 Hasta 20 Con Paso 2 Hacer
      Escribir i
   FinPara
FinProceso`,

   'para sin paso': `
Proceso tabla
   Definir i Como Entero
   Para i <- 1 Hasta 10 Hacer
      Escribir 7 * i
   FinPara
FinProceso`,

   'repetir hasta que': `
Proceso validar
   Definir edad Como Entero
   Repetir
      Escribir "Edad: "
      Leer edad
   Hasta Que edad >= 0
FinProceso`,

   'segun con caso multiple y otro modo': `
Proceso menu
   Definir op Como Entero
   Leer op
   Segun op Hacer
      1:
         Escribir "alta"
      2, 3:
         Escribir "baja o cambio"
      De Otro Modo:
         Escribir "invalida"
   FinSegun
FinProceso`,

   'arreglos': `
Proceso promedio
   Definir i, suma Como Entero
   Definir prom Como Real
   Dimension notas[10]
   suma <- 0
   Para i <- 1 Hasta 10 Hacer
      Leer notas[i]
      suma <- suma + notas[i]
   FinPara
   prom <- suma / 10
   Escribir "Promedio: ", prom
FinProceso`,

   'matriz': `
Proceso matriz
   Definir f, c Como Entero
   Dimension m[3, 4]
   Para f <- 1 Hasta 3 Hacer
      Para c <- 1 Hasta 4 Hacer
         m[f, c] <- f * c
      FinPara
   FinPara
FinProceso`,

   'expresiones con precedencia y parentesis': `
Proceso calculo
   Definir x, y, z Como Real
   x <- 2 + 3 * 4
   y <- (2 + 3) * 4
   z <- 2 ^ 3 ^ 2
   Si x > y Y NO (z < 10) O y = 20 Entonces
      Escribir "si"
   FinSi
FinProceso`,

   'funciones internas': `
Proceso raices
   Definir x Como Real
   Leer x
   Escribir raiz(x), trunc(x), abs(-x)
FinProceso`,

   'escribir sin saltar y vacio': `
Proceso salida
   Escribir "sin salto" Sin Saltar
   Escribir
   Escribir "con salto"
FinProceso`,

   'logicos': `
Proceso banderas
   Definir listo Como Logico
   listo <- Verdadero
   Si listo Entonces
      Escribir "ok"
   FinSi
FinProceso`,

   'anidamiento profundo': `
Proceso anidado
   Definir i, j Como Entero
   Para i <- 1 Hasta 3 Hacer
      Mientras j < 5 Hacer
         Si i = j Entonces
            Repetir
               j <- j + 1
            Hasta Que j > 10
         SiNo
            j <- j + 2
         FinSi
      FinMientras
   FinPara
FinProceso`,
};

describe('ciclo parse -> print -> parse', () => {
   for (const [nombre, fuente] of Object.entries(PROGRAMAS)) {
      it(`${nombre}: parsea sin errores`, () => {
         const { errors } = parse(fuente);
         expect(errors).toEqual([]);
      });

      it(`${nombre}: el arbol sobrevive al ciclo`, () => {
         const primero = parse(fuente);
         const texto = print(primero.program);
         const segundo = parse(texto);

         expect(segundo.errors).toEqual([]);
         expect(shape(segundo.program)).toEqual(shape(primero.program));
      });

      it(`${nombre}: imprimir es idempotente`, () => {
         const uno = print(parse(fuente).program);
         const dos = print(parse(uno).program);
         expect(dos).toBe(uno);
      });

      it(`${nombre}: todos los ids son unicos`, () => {
         const { program } = parse(fuente);
         const vistos = new Set<string>();
         walk(program as Program, (n) => {
            expect(vistos.has(n.id)).toBe(false);
            vistos.add(n.id);
         });
      });
   }
});
