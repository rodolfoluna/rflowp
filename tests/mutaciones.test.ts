/**
 * Las mutaciones son el puente entre el diagrama y el texto: cada toque del
 * usuario en un símbolo pasa por aquí y el pseudocódigo se reimprime del árbol
 * resultante. Si una mutación corrompe el AST, corrompe el trabajo del alumno.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser';
import { print } from '../src/core/printer';
import { layout } from '../src/chart/layout';
import { walk, type Program, type Statement } from '../src/core/ast';
import {
   agregarCaso,
   alternarSiNo,
   crearSentencia,
   eliminar,
   eliminarCaso,
   insertar,
   mover,
   puedeMover,
   reemplazar,
   variablesDeclaradas,
   PALETA,
   type TipoSentencia,
} from '../src/edit/mutaciones';

function prog(fuente: string): Program {
   const { program, errors } = parse(fuente);
   expect(errors).toEqual([]);
   return program;
}

const BASE = `Proceso p
   Definir a, b Como Entero
   Leer a
   Escribir a
FinProceso`;

/** El texto que produciría la app tras la edición. */
function textoDe(p: Program): string {
   return print(p);
}

/** Reparsear lo impreso debe dar un programa válido: el ciclo no se rompe. */
function validaCiclo(p: Program): void {
   const salida = print(p);
   const vuelta = parse(salida);
   expect(vuelta.errors, `no reparsea:\n${salida}`).toEqual([]);
}

describe('insertar', () => {
   it('agrega al final del cuerpo del programa', () => {
      const p = prog(BASE);
      const diagrama = layout(p);
      const ultimo = diagrama.insertPoints
         .filter((i) => i.blockKey === 'body' && i.ownerId === p.id)
         .at(-1)!;

      const nuevo = insertar(p, ultimo, crearSentencia('asignacion'));
      expect(nuevo.body.length).toBe(p.body.length + 1);
      expect(textoDe(nuevo)).toContain('variable <- 0');
      validaCiclo(nuevo);
   });

   it('agrega en medio, respetando el índice', () => {
      const p = prog(BASE);
      const nuevo = insertar(
         p,
         { ownerId: p.id, blockKey: 'body', index: 1 },
         crearSentencia('escribir'),
      );
      expect(nuevo.body[1].kind).toBe('WriteStatement');
      expect(nuevo.body[2].kind).toBe('ReadStatement');
   });

   it('no toca el programa original', () => {
      const p = prog(BASE);
      const antes = textoDe(p);
      insertar(p, { ownerId: p.id, blockKey: 'body', index: 0 }, crearSentencia('leer'));
      expect(textoDe(p)).toBe(antes);
   });

   it('inserta dentro de la rama verdadera de un Si', () => {
      const p = prog(`Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
   FinSi
FinProceso`);
      const si = p.body.find((s) => s.kind === 'IfStatement')!;
      const nuevo = insertar(
         p,
         { ownerId: si.id, blockKey: 'consequent', index: 0 },
         crearSentencia('escribir'),
      );
      const siNuevo = nuevo.body.find((s) => s.kind === 'IfStatement')!;
      expect(siNuevo.kind === 'IfStatement' && siNuevo.consequent.length).toBe(1);
      validaCiclo(nuevo);
   });

   it('inserta dentro de un caso de Segun', () => {
      const p = prog(`Proceso p
   Definir op Como Entero
   Segun op Hacer
      1:
      De Otro Modo:
   FinSegun
FinProceso`);
      const seg = p.body.find((s) => s.kind === 'SwitchStatement')!;
      const nuevo = insertar(
         p,
         { ownerId: seg.id, blockKey: 'cases.0.body', index: 0 },
         crearSentencia('escribir'),
      );
      const segNuevo = nuevo.body.find((s) => s.kind === 'SwitchStatement')!;
      expect(segNuevo.kind === 'SwitchStatement' && segNuevo.cases[0].body.length).toBe(1);
      validaCiclo(nuevo);
   });

   it('devuelve el original si la posición ya no existe', () => {
      const p = prog(BASE);
      const igual = insertar(
         p,
         { ownerId: 'inexistente', blockKey: 'body', index: 0 },
         crearSentencia('leer'),
      );
      expect(igual).toBe(p);
   });
});

describe('eliminar', () => {
   it('quita la sentencia indicada', () => {
      const p = prog(BASE);
      const leer = p.body.find((s) => s.kind === 'ReadStatement')!;
      const nuevo = eliminar(p, leer.id);
      expect(nuevo.body.length).toBe(p.body.length - 1);
      expect(textoDe(nuevo)).not.toContain('Leer a');
      validaCiclo(nuevo);
   });

   it('quita también lo que la sentencia contenga', () => {
      const p = prog(`Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
      Escribir "dentro"
   FinSi
FinProceso`);
      const si = p.body.find((s) => s.kind === 'IfStatement')!;
      const nuevo = eliminar(p, si.id);
      expect(textoDe(nuevo)).not.toContain('dentro');
   });

   it('conserva los comentarios pasándolos a la vecina', () => {
      const p = prog(`Proceso p
   // explica el siguiente paso
   Definir n Como Entero
   Leer n
FinProceso`);
      const definir = p.body[0];
      expect(definir.leadingComments).toEqual(['// explica el siguiente paso']);

      const nuevo = eliminar(p, definir.id);
      expect(textoDe(nuevo)).toContain('// explica el siguiente paso');
   });
});

describe('reemplazar', () => {
   it('cambia la sentencia conservando sus comentarios', () => {
      const p = prog(`Proceso p
   // importante
   Leer a // al final
FinProceso`);
      const leer = p.body[0];
      const nuevo = reemplazar(p, leer.id, crearSentencia('escribir'));
      const salida = textoDe(nuevo);

      expect(salida).toContain('// importante');
      expect(salida).toContain('// al final');
      expect(salida).toContain('Escribir "mensaje"');
      expect(salida).not.toContain('Leer a');
   });
});

describe('mover', () => {
   it('sube y baja dentro del mismo bloque', () => {
      const p = prog(BASE);
      const leer = p.body[1];

      const subido = mover(p, leer.id, -1);
      expect(subido.body[0].kind).toBe('ReadStatement');

      const bajado = mover(p, leer.id, 1);
      expect(bajado.body[2].kind).toBe('ReadStatement');
   });

   it('no se sale de los límites del bloque', () => {
      const p = prog(BASE);
      expect(puedeMover(p, p.body[0].id, -1)).toBe(false);
      expect(puedeMover(p, p.body.at(-1)!.id, 1)).toBe(false);
      expect(mover(p, p.body[0].id, -1)).toBe(p);
   });
});

describe('ramas de Si', () => {
   it('agrega y quita la rama SiNo vacía', () => {
      const p = prog(`Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
      Escribir "si"
   FinSi
FinProceso`);
      const si = p.body.find((s) => s.kind === 'IfStatement')!;

      const con = alternarSiNo(p, si.id);
      expect(textoDe(con)).toContain('SiNo');
      validaCiclo(con);

      const siCon = con.body.find((s) => s.kind === 'IfStatement')!;
      const sin = alternarSiNo(con, siCon.id);
      expect(textoDe(sin)).not.toContain('SiNo');
   });

   it('no borra una rama SiNo con contenido', () => {
      const p = prog(`Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
   SiNo
      Escribir "trabajo del alumno"
   FinSi
FinProceso`);
      const si = p.body.find((s) => s.kind === 'IfStatement')!;
      expect(alternarSiNo(p, si.id)).toBe(p);
   });
});

describe('casos de Segun', () => {
   const FUENTE = `Proceso p
   Definir op Como Entero
   Segun op Hacer
      1:
         Escribir "uno"
      De Otro Modo:
         Escribir "otro"
   FinSegun
FinProceso`;

   it('agrega un caso antes de De Otro Modo', () => {
      const p = prog(FUENTE);
      const seg = p.body.find((s) => s.kind === 'SwitchStatement')!;
      const nuevo = agregarCaso(p, seg.id, {
         kind: 'NumberLiteral',
         id: 'x',
         value: 2,
         raw: '2',
      });

      const segNuevo = nuevo.body.find((s) => s.kind === 'SwitchStatement')!;
      expect(segNuevo.kind === 'SwitchStatement' && segNuevo.cases.length).toBe(3);
      // El caso por descarte debe seguir siendo el último.
      expect(
         segNuevo.kind === 'SwitchStatement' && segNuevo.cases.at(-1)!.tests.length,
      ).toBe(0);
      validaCiclo(nuevo);
   });

   it('elimina un caso pero nunca deja el Segun sin ninguno', () => {
      const p = prog(FUENTE);
      const seg = p.body.find((s) => s.kind === 'SwitchStatement')!;
      if (seg.kind !== 'SwitchStatement') throw new Error('tipo inesperado');

      const uno = eliminarCaso(p, seg.cases[0].id);
      const segUno = uno.body.find((s) => s.kind === 'SwitchStatement')!;
      expect(segUno.kind === 'SwitchStatement' && segUno.cases.length).toBe(1);

      // Con un solo caso, ya no se puede quitar.
      const restante =
         segUno.kind === 'SwitchStatement' ? segUno.cases[0].id : '';
      expect(eliminarCaso(uno, restante)).toBe(uno);
   });
});

describe('la paleta produce sentencias sanas', () => {
   for (const opcion of PALETA) {
      it(`${opcion.tipo}: se inserta, se imprime y se reparsea`, () => {
         const p = prog(BASE);
         const nuevo = insertar(
            p,
            { ownerId: p.id, blockKey: 'body', index: p.body.length },
            crearSentencia(opcion.tipo as TipoSentencia),
         );
         validaCiclo(nuevo);
         // Y el diagrama se puede dibujar sin solaparse.
         expect(() => layout(nuevo)).not.toThrow();
      });
   }

   it('los ciclos nuevos no se cuelgan: Mientras nace en Falso', () => {
      const mientras = crearSentencia('mientras');
      expect(mientras.kind === 'WhileStatement' && mientras.test).toMatchObject({
         kind: 'BooleanLiteral',
         value: false,
      });
   });

   it('Repetir nace saliendo a la primera vuelta', () => {
      const repetir = crearSentencia('repetir');
      expect(repetir.kind === 'RepeatStatement' && repetir.test).toMatchObject({
         kind: 'BooleanLiteral',
         value: true,
      });
   });

   it('cada sentencia nueva trae ids únicos', () => {
      const p = prog(BASE);
      let acumulado: Program = p;
      for (const opcion of PALETA) {
         acumulado = insertar(
            acumulado,
            { ownerId: acumulado.id, blockKey: 'body', index: acumulado.body.length },
            crearSentencia(opcion.tipo as TipoSentencia),
         );
      }
      const vistos = new Set<string>();
      walk(acumulado, (n) => {
         expect(vistos.has(n.id), `id repetido: ${n.id}`).toBe(false);
         vistos.add(n.id);
      });
   });
});

describe('variablesDeclaradas', () => {
   it('reúne variables de Definir, Leer, asignaciones y Para', () => {
      const p = prog(`Proceso p
   Definir a, b Como Entero
   Dimension notas[5]
   Leer c
   d <- 1
   Para i <- 1 Hasta 3 Hacer
   FinPara
FinProceso`);
      const { variables, arreglos } = variablesDeclaradas(p);
      expect(variables).toEqual(['a', 'b', 'c', 'd', 'i']);
      expect(arreglos).toEqual(['notas']);
   });

   it('ve las variables dentro de bloques anidados', () => {
      const p = prog(`Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
      Definir dentro Como Real
   FinSi
FinProceso`);
      expect(variablesDeclaradas(p).variables).toContain('dentro');
   });
});

describe('todo punto de inserción del diagrama es utilizable', () => {
   const FUENTES = [
      BASE,
      `Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
      Escribir "a"
   SiNo
      Escribir "b"
   FinSi
FinProceso`,
      `Proceso p
   Definir i Como Entero
   Para i <- 1 Hasta 3 Hacer
      Escribir i
   FinPara
FinProceso`,
      `Proceso p
   Definir op Como Entero
   Segun op Hacer
      1:
         Escribir "uno"
      De Otro Modo:
   FinSegun
FinProceso`,
   ];

   for (const [i, fuente] of FUENTES.entries()) {
      it(`programa ${i + 1}: insertar en cada "+" produce código válido`, () => {
         const p = prog(fuente);
         for (const punto of layout(p).insertPoints) {
            const nuevo = insertar(p, punto, crearSentencia('escribir'));
            expect(
               nuevo,
               `el punto ${punto.ownerId}/${punto.blockKey}/${punto.index} no resolvió`,
            ).not.toBe(p);
            validaCiclo(nuevo);
         }
      });
   }
});
