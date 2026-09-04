/**
 * Colores por función, y avisos de licencia que viajan con la app.
 *
 * Lo primero: la notación ANSI reutiliza la misma figura para funciones
 * distintas (el paralelogramo vale para `Leer` y para `Escribir`, el rombo para
 * un `Si` y para la condición de un ciclo). Se respeta la forma y se distingue
 * por color, así que el `rol` de cada símbolo tiene que ser el correcto.
 *
 * Lo segundo: Svelte y Workbox son MIT y PseudoFlow BSD 3-Clause, y las tres
 * exigen que su aviso acompañe a la distribución. Tenerlo en el repositorio no
 * basta; tiene que salir en la carpeta que se publica.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../src/core/parser';
import { layout, type RolSimbolo } from '../src/chart/layout';
import { PALETA } from '../src/edit/mutaciones';

function rolesDe(fuente: string): Record<string, RolSimbolo> {
   const { program, errors } = parse(fuente);
   expect(errors).toEqual([]);

   const salida: Record<string, RolSimbolo> = {};
   for (const s of layout(program).shapes) {
      // La etiqueta identifica al símbolo lo bastante para estas pruebas.
      salida[s.label.split('\n')[0]] = s.rol;
   }
   return salida;
}

describe('la misma forma, funciones distintas', () => {
   it('Leer y Escribir comparten paralelogramo pero NO color', () => {
      const { program } = parse(`Proceso p
   Definir a Como Entero
   Leer a
   Escribir a
FinProceso`);
      const formas = layout(program).shapes;

      const leer = formas.find((s) => s.label.startsWith('Leer'))!;
      const escribir = formas.find((s) => s.label.startsWith('Escribir'))!;

      // Misma figura: la notación ANSI no se toca.
      expect(leer.kind).toBe('io');
      expect(escribir.kind).toBe('io');

      // Distinta función: es lo que el color desempata.
      expect(leer.rol).toBe('entrada');
      expect(escribir.rol).toBe('salida');
      expect(leer.rol).not.toBe(escribir.rol);
   });

   it('asignar y declarar comparten rectángulo pero NO color', () => {
      const roles = rolesDe(`Proceso p
   Definir a Como Entero
   a <- 1
FinProceso`);
      expect(roles['Definir a']).toBe('declaracion');
      expect(roles['a ← 1']).toBe('asignacion');
   });

   it('un Si y la condición de un ciclo comparten rombo pero NO color', () => {
      const { program } = parse(`Proceso p
   Definir n Como Entero
   Si n > 0 Entonces
   FinSi
   Mientras n < 5 Hacer
   FinMientras
   Repetir
   Hasta Que n > 9
FinProceso`);
      const rombos = layout(program).shapes.filter((s) => s.kind === 'decision');

      expect(rombos.find((s) => s.label === 'n > 0')?.rol).toBe('condicion');
      expect(rombos.find((s) => s.label === 'n < 5')?.rol).toBe('ciclo');
      expect(rombos.find((s) => s.label === 'n > 9')?.rol).toBe('ciclo');
   });

   it('los casos de un Segun tienen su propio color', () => {
      const { program } = parse(`Proceso p
   Definir op Como Entero
   Segun op Hacer
      1:
      De Otro Modo:
   FinSegun
FinProceso`);
      const casos = layout(program).shapes.filter((s) => s.rol === 'caso');
      expect(casos.length).toBe(2);
      expect(casos.every((s) => s.kind === 'decision')).toBe(true);
   });

   it('Inicio y Fin comparten rol', () => {
      const roles = rolesDe(`Proceso p
   Escribir "hola"
FinProceso`);
      expect(roles['Inicio']).toBe('inicio-fin');
      expect(roles['Fin']).toBe('inicio-fin');
   });

   it('el Para usa el hexágono de preparación', () => {
      const { program } = parse(`Proceso p
   Definir i Como Entero
   Para i <- 1 Hasta 3 Hacer
   FinPara
FinProceso`);
      const para = layout(program).shapes.find((s) => s.kind === 'preparation')!;
      expect(para.rol).toBe('para');
   });

   it('cada símbolo del diagrama trae un rol', () => {
      const { program } = parse(`Proceso p
   Definir i, n Como Entero
   Dimension a[3]
   Leer n
   a[1] <- n
   Si n > 0 Entonces
      Escribir "sí"
   SiNo
      Escribir "no"
   FinSi
   Mientras n > 0 Hacer
      n <- n - 1
   FinMientras
   Para i <- 1 Hasta 3 Hacer
   FinPara
   Repetir
   Hasta Que n = 0
   Segun n Hacer
      1:
      De Otro Modo:
   FinSegun
FinProceso`);
      for (const s of layout(program).shapes) {
         expect(s.rol, `sin rol: ${s.label}`).toBeTruthy();
      }
   });
});

describe('la paleta coincide con el diagrama', () => {
   it('cada opción declara un rol', () => {
      for (const o of PALETA) {
         expect(o.rol, `sin rol: ${o.tipo}`).toBeTruthy();
      }
   });

   it('Leer y Escribir también se distinguen en la paleta', () => {
      const leer = PALETA.find((o) => o.tipo === 'leer')!;
      const escribir = PALETA.find((o) => o.tipo === 'escribir')!;
      expect(leer.simbolo).toBe(escribir.simbolo);
      expect(leer.rol).not.toBe(escribir.rol);
   });

   it('el rol de la paleta es el que acaba teniendo el símbolo', () => {
      // Si divergieran, el alumno elegiría un bloque de un color y aparecería
      // de otro en el diagrama.
      const esperado: Record<string, RolSimbolo> = {
         asignacion: 'asignacion',
         leer: 'entrada',
         escribir: 'salida',
         definir: 'declaracion',
         dimension: 'declaracion',
         si: 'condicion',
         mientras: 'ciclo',
         repetir: 'ciclo',
         para: 'para',
         segun: 'caso',
      };
      for (const o of PALETA) {
         expect(o.rol, o.tipo).toBe(esperado[o.tipo]);
      }
   });
});

describe('avisos de licencia', () => {
   it('AVISOS.txt se publica con la app', () => {
      // Está en public/, así que Vite lo copia a dist/ en cada build.
      expect(existsSync(join(process.cwd(), 'public', 'AVISOS.txt'))).toBe(true);
   });

   it('reproduce el copyright de todo lo que se distribuye', () => {
      const avisos = readFileSync(join(process.cwd(), 'public', 'AVISOS.txt'), 'utf-8');

      // MIT y BSD-3 exigen literalmente que el aviso acompañe a la distribución.
      expect(avisos).toContain('Svelte Contributors');
      expect(avisos).toContain('Google LLC');
      expect(avisos).toContain('Victor Talamantes');
      expect(avisos).toContain('BSD 3-Clause');

      // Y que quede claro que el dialecto no implica código de PSeInt (GPLv2).
      expect(avisos).toContain('PSeInt');
   });

   it('el proyecto declara su propia licencia', () => {
      const licencia = readFileSync(join(process.cwd(), 'LICENSE'), 'utf-8');
      expect(licencia).toContain('Todos los derechos reservados');
      // La reserva no puede tragarse las licencias de terceros.
      expect(licencia).toContain('AVISOS.txt');
   });
});
