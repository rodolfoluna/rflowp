import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser';
import { layout, type Shape } from '../src/chart/layout';
import { walk, type Program } from '../src/core/ast';

function diagrama(fuente: string) {
   const { program, errors } = parse(fuente);
   expect(errors).toEqual([]);
   return { diagram: layout(program), program };
}

function seSolapan(a: Shape, b: Shape): boolean {
   return (
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height
   );
}

const CASOS: Record<string, string> = {
   secuencia: `
Proceso p
   Definir a Como Entero
   Leer a
   a <- a * 2
   Escribir a
FinProceso`,

   'si con sino': `
Proceso p
   Definir n Como Entero
   Leer n
   Si n > 0 Entonces
      Escribir "positivo"
   SiNo
      Escribir "no positivo"
   FinSi
   Escribir "fin"
FinProceso`,

   'si sin sino': `
Proceso p
   Definir n Como Entero
   Leer n
   Si n > 0 Entonces
      Escribir "positivo"
   FinSi
FinProceso`,

   mientras: `
Proceso p
   Definir i Como Entero
   i <- 1
   Mientras i <= 5 Hacer
      Escribir i
      i <- i + 1
   FinMientras
   Escribir "listo"
FinProceso`,

   para: `
Proceso p
   Definir i Como Entero
   Para i <- 1 Hasta 10 Hacer
      Escribir i
   FinPara
FinProceso`,

   repetir: `
Proceso p
   Definir n Como Entero
   Repetir
      Leer n
   Hasta Que n > 0
FinProceso`,

   segun: `
Proceso p
   Definir op Como Entero
   Leer op
   Segun op Hacer
      1:
         Escribir "uno"
      2, 3:
         Escribir "dos o tres"
      De Otro Modo:
         Escribir "otro"
   FinSegun
FinProceso`,

   anidado: `
Proceso p
   Definir i, j Como Entero
   Para i <- 1 Hasta 3 Hacer
      Si i % 2 = 0 Entonces
         Mientras j < 3 Hacer
            j <- j + 1
         FinMientras
      SiNo
         Escribir i
      FinSi
   FinPara
FinProceso`,

   'bloques vacios': `
Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
   SiNo
   FinSi
FinProceso`,
};

describe('layout del diagrama', () => {
   for (const [nombre, fuente] of Object.entries(CASOS)) {
      it(`${nombre}: ningun simbolo se solapa con otro`, () => {
         const { diagram } = diagrama(fuente);
         for (let i = 0; i < diagram.shapes.length; i++) {
            for (let j = i + 1; j < diagram.shapes.length; j++) {
               const a = diagram.shapes[i];
               const b = diagram.shapes[j];
               expect(
                  seSolapan(a, b),
                  `"${a.label}" se solapa con "${b.label}"`,
               ).toBe(false);
            }
         }
      });

      it(`${nombre}: todo cae dentro del lienzo`, () => {
         const { diagram } = diagrama(fuente);
         for (const s of diagram.shapes) {
            expect(s.x).toBeGreaterThanOrEqual(0);
            expect(s.y).toBeGreaterThanOrEqual(0);
            expect(s.x + s.width).toBeLessThanOrEqual(diagram.width);
            expect(s.y + s.height).toBeLessThanOrEqual(diagram.height);
         }
      });

      it(`${nombre}: hay Inicio y Fin`, () => {
         const { diagram } = diagrama(fuente);
         const terminadores = diagram.shapes.filter((s) => s.kind === 'terminator');
         expect(terminadores.map((t) => t.label)).toEqual(['Inicio', 'Fin']);
      });

      it(`${nombre}: cada sentencia tiene su simbolo`, () => {
         const { diagram, program } = diagrama(fuente);
         const conSimbolo = new Set(diagram.shapes.map((s) => s.nodeId).filter(Boolean));

         walk(program as Program, (n) => {
            // El programa no dibuja símbolo propio (son Inicio/Fin) y el Segun
            // se dibuja como una cadena de rombos, uno por caso.
            if (n.kind === 'Program' || n.kind === 'SwitchStatement') return;
            expect(conSimbolo.has(n.id), `falta el símbolo de ${n.kind}`).toBe(true);
         });
      });

      it(`${nombre}: el layout es determinista`, () => {
         const a = layout(parse(fuente).program);
         const b = layout(parse(fuente).program);
         expect(a.shapes.map((s) => [s.kind, s.x, s.y])).toEqual(
            b.shapes.map((s) => [s.kind, s.x, s.y]),
         );
      });

      it(`${nombre}: ofrece puntos de insercion`, () => {
         const { diagram } = diagrama(fuente);
         expect(diagram.insertPoints.length).toBeGreaterThan(0);
         // Cada punto identifica sin ambigüedad una posición del AST.
         const claves = diagram.insertPoints.map(
            (p) => `${p.ownerId}|${p.blockKey}|${p.index}`,
         );
         expect(new Set(claves).size).toBe(claves.length);
      });
   }

   it('los bloques vacios siguen ofreciendo donde insertar', () => {
      const { diagram } = diagrama(CASOS['bloques vacios']);
      const enConsequent = diagram.insertPoints.filter((p) => p.blockKey === 'consequent');
      const enAlternate = diagram.insertPoints.filter((p) => p.blockKey === 'alternate');
      expect(enConsequent.length).toBe(1);
      expect(enAlternate.length).toBe(1);
   });
});
