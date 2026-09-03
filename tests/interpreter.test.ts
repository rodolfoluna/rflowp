import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser';
import { runToCompletion, run } from '../src/core/interpreter';

/** Parsea, verifica que no haya errores de sintaxis y ejecuta. */
function ejecutar(fuente: string, entradas: string[] = []) {
   const { program, errors } = parse(fuente);
   expect(errors).toEqual([]);
   return runToCompletion(program, entradas);
}

describe('salida basica', () => {
   it('escribe texto y numeros', () => {
      const r = ejecutar(`
Proceso p
   Escribir "hola"
   Escribir 42
FinProceso`);
      expect(r.error).toBeUndefined();
      expect(r.output).toBe('hola\n42\n');
   });

   it('Sin Saltar no agrega salto de linea', () => {
      const r = ejecutar(`
Proceso p
   Escribir "a" Sin Saltar
   Escribir "b"
FinProceso`);
      expect(r.output).toBe('ab\n');
   });

   it('concatena varios valores en una sola linea', () => {
      const r = ejecutar(`
Proceso p
   Definir n Como Entero
   n <- 7
   Escribir "n vale ", n
FinProceso`);
      expect(r.output).toBe('n vale 7\n');
   });
});

describe('entrada', () => {
   it('lee y opera con lo leido', () => {
      const r = ejecutar(`
Proceso suma
   Definir a, b Como Entero
   Leer a, b
   Escribir a + b
FinProceso`, ['3', '4']);
      expect(r.output).toBe('7\n');
   });

   it('respeta el tipo declarado al leer', () => {
      const r = ejecutar(`
Proceso p
   Definir nombre Como Caracter
   Leer nombre
   Escribir "Hola ", nombre
FinProceso`, ['Ana']);
      expect(r.output).toBe('Hola Ana\n');
   });

   it('rechaza un decimal en una variable Entero', () => {
      const r = ejecutar(`
Proceso p
   Definir n Como Entero
   Leer n
FinProceso`, ['3.5']);
      expect(r.error?.message).toMatch(/decimales/);
   });
});

describe('control de flujo', () => {
   it('Si / SiNo elige la rama correcta', () => {
      const src = `
Proceso p
   Definir n Como Entero
   Leer n
   Si n % 2 = 0 Entonces
      Escribir "par"
   SiNo
      Escribir "impar"
   FinSi
FinProceso`;
      expect(ejecutar(src, ['4']).output).toBe('par\n');
      expect(ejecutar(src, ['7']).output).toBe('impar\n');
   });

   it('Mientras itera y termina', () => {
      const r = ejecutar(`
Proceso p
   Definir i Como Entero
   i <- 1
   Mientras i <= 3 Hacer
      Escribir i
      i <- i + 1
   FinMientras
FinProceso`);
      expect(r.output).toBe('1\n2\n3\n');
   });

   it('Para con paso', () => {
      const r = ejecutar(`
Proceso p
   Definir i Como Entero
   Para i <- 0 Hasta 6 Con Paso 2 Hacer
      Escribir i
   FinPara
FinProceso`);
      expect(r.output).toBe('0\n2\n4\n6\n');
   });

   it('Para con paso negativo cuenta hacia atras', () => {
      const r = ejecutar(`
Proceso p
   Definir i Como Entero
   Para i <- 3 Hasta 1 Con Paso -1 Hacer
      Escribir i
   FinPara
FinProceso`);
      expect(r.output).toBe('3\n2\n1\n');
   });

   it('Repetir ejecuta el cuerpo al menos una vez', () => {
      const r = ejecutar(`
Proceso p
   Definir n Como Entero
   n <- 100
   Repetir
      Escribir "una vez"
   Hasta Que n > 10
FinProceso`);
      expect(r.output).toBe('una vez\n');
   });

   it('Segun elige el caso y cae en De Otro Modo', () => {
      const src = `
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
FinProceso`;
      expect(ejecutar(src, ['1']).output).toBe('uno\n');
      expect(ejecutar(src, ['3']).output).toBe('dos o tres\n');
      expect(ejecutar(src, ['9']).output).toBe('otro\n');
   });
});

describe('arreglos', () => {
   it('llena y suma un arreglo', () => {
      const r = ejecutar(`
Proceso p
   Definir i, suma Como Entero
   Dimension a[5]
   suma <- 0
   Para i <- 1 Hasta 5 Hacer
      a[i] <- i * i
      suma <- suma + a[i]
   FinPara
   Escribir suma
FinProceso`);
      expect(r.output).toBe('55\n');
   });

   it('maneja matrices de dos dimensiones', () => {
      const r = ejecutar(`
Proceso p
   Definir f, c Como Entero
   Dimension m[2, 3]
   Para f <- 1 Hasta 2 Hacer
      Para c <- 1 Hasta 3 Hacer
         m[f, c] <- f * 10 + c
      FinPara
   FinPara
   Escribir m[2, 3]
FinProceso`);
      expect(r.output).toBe('23\n');
   });

   it('detecta indice fuera de rango', () => {
      const r = ejecutar(`
Proceso p
   Dimension a[3]
   a[7] <- 1
FinProceso`);
      expect(r.error?.message).toMatch(/fuera de rango/);
   });
});

describe('expresiones', () => {
   it('respeta la precedencia', () => {
      const r = ejecutar(`
Proceso p
   Escribir 2 + 3 * 4
   Escribir (2 + 3) * 4
FinProceso`);
      expect(r.output).toBe('14\n20\n');
   });

   it('la potencia asocia a la derecha', () => {
      const r = ejecutar(`
Proceso p
   Escribir 2 ^ 3 ^ 2
FinProceso`);
      expect(r.output).toBe('512\n');
   });

   it('Y corta circuito sin evaluar la division entre cero', () => {
      const r = ejecutar(`
Proceso p
   Definir n Como Entero
   n <- 0
   Si n <> 0 Y 10 / n > 1 Entonces
      Escribir "si"
   SiNo
      Escribir "no"
   FinSi
FinProceso`);
      expect(r.error).toBeUndefined();
      expect(r.output).toBe('no\n');
   });

   it('funciones internas', () => {
      const r = ejecutar(`
Proceso p
   Escribir raiz(16)
   Escribir abs(-5)
   Escribir trunc(3.9)
   Escribir longitud("hola")
   Escribir mayusculas("abc")
FinProceso`);
      expect(r.output).toBe('4\n5\n3\n4\nABC\n');
   });

   it('los booleanos se muestran como PSeInt', () => {
      const r = ejecutar(`
Proceso p
   Definir b Como Logico
   b <- Verdadero
   Escribir b
FinProceso`);
      expect(r.output).toBe('VERDADERO\n');
   });
});

describe('errores de ejecucion', () => {
   it('division entre cero', () => {
      const r = ejecutar(`
Proceso p
   Escribir 1 / 0
FinProceso`);
      expect(r.error?.message).toMatch(/entre cero/i);
   });

   it('variable usada antes de tener valor', () => {
      const r = ejecutar(`
Proceso p
   Escribir desconocida
FinProceso`);
      expect(r.error?.message).toMatch(/antes de tener un valor/);
   });

   it('corta los ciclos infinitos en vez de colgarse', () => {
      const { program } = parse(`
Proceso p
   Definir i Como Entero
   i <- 1
   Mientras i > 0 Hacer
      i <- i + 1
   FinMientras
FinProceso`);
      const r = runToCompletion(program, [], { maxSteps: 5000 });
      expect(r.error?.message).toMatch(/nunca termina/);
   });
});

describe('ejecucion paso a paso', () => {
   it('cede un efecto step por cada nodo, con su linea', () => {
      const { program } = parse(`
Proceso p
   Escribir "a"
   Escribir "b"
FinProceso`);

      const gen = run(program);
      const lineas: number[] = [];
      let next = gen.next();
      while (!next.done) {
         if (next.value.kind === 'step' && next.value.line) {
            lineas.push(next.value.line);
         }
         next = gen.next();
      }
      expect(lineas).toEqual([3, 4]);
   });

   it('el entorno final expone las variables para el inspector', () => {
      const r = ejecutar(`
Proceso p
   Definir x Como Entero
   x <- 99
FinProceso`);
      expect(r.env.vars.get('x')?.value).toBe(99);
      expect(r.env.vars.get('x')?.dataType).toBe('Entero');
   });
});
