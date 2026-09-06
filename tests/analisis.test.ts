/**
 * Detección de copias y bitácora.
 *
 * Lo que se prueba aquí decide a quién señala la app ante el profesor, así que
 * importan tanto los aciertos como los falsos positivos: marcar a un alumno que
 * sí trabajó es peor que dejar pasar una copia.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser';
import {
   buscarCoincidencias,
   formaDe,
   tamano,
   type EjercicioParaAnalizar,
} from '../src/teacher/analisis';
import { Cronista, duracion, verosimilitud } from '../src/guard/bitacora.svelte';
import { Guardas } from '../src/guard/guardas.svelte';
import type { Bitacora } from '../src/file/algx';

const forma = (fuente: string) => {
   const { program, errors } = parse(fuente);
   expect(errors).toEqual([]);
   return formaDe(program);
};

// ---------------------------------------------------------------------------

describe('huella estructural', () => {
   const ORIGINAL = `Proceso promedio
   Definir i, n Como Entero
   Definir suma Como Real
   suma <- 0
   Leer n
   Para i <- 1 Hasta n Hacer
      Escribir "Dame un dato"
      Leer suma
   FinPara
   Escribir "El promedio es ", suma / n
FinProceso`;

   it('renombrar variables no cambia la forma', () => {
      const renombrado = `Proceso promedio
   Definir contador, cantidad Como Entero
   Definir total Como Real
   total <- 0
   Leer cantidad
   Para contador <- 1 Hasta cantidad Hacer
      Escribir "Dame un dato"
      Leer total
   FinPara
   Escribir "El promedio es ", total / cantidad
FinProceso`;
      expect(forma(renombrado)).toBe(forma(ORIGINAL));
   });

   it('cambiar los mensajes no cambia la forma', () => {
      const otrosTextos = ORIGINAL.replace('Dame un dato', 'Ingrese calificacion').replace(
         'El promedio es ',
         'Promedio: ',
      );
      expect(forma(otrosTextos)).toBe(forma(ORIGINAL));
   });

   it('cambiar el nombre del proceso no cambia la forma', () => {
      expect(forma(ORIGINAL.replace('Proceso promedio', 'Proceso mi_tarea'))).toBe(
         forma(ORIGINAL),
      );
   });

   it('añadir paréntesis de más no disfraza la copia', () => {
      const conParentesis = ORIGINAL.replace('suma / n', '(suma / n)');
      expect(forma(conParentesis)).toBe(forma(ORIGINAL));
   });

   it('los comentarios no cuentan', () => {
      const comentado = ORIGINAL.replace(
         '   suma <- 0',
         '   // inicializo el acumulador\n   suma <- 0',
      );
      expect(forma(comentado)).toBe(forma(ORIGINAL));
   });

   it('cambiar un operador SÍ cambia la forma', () => {
      expect(forma(ORIGINAL.replace('suma / n', 'suma * n'))).not.toBe(forma(ORIGINAL));
   });

   it('cambiar la estructura de control SÍ cambia la forma', () => {
      const conMientras = `Proceso promedio
   Definir i, n Como Entero
   Definir suma Como Real
   suma <- 0
   Leer n
   i <- 1
   Mientras i <= n Hacer
      Escribir "Dame un dato"
      Leer suma
      i <- i + 1
   FinMientras
   Escribir "El promedio es ", suma / n
FinProceso`;
      expect(forma(conMientras)).not.toBe(forma(ORIGINAL));
   });

   it('agregar una sentencia SÍ cambia la forma', () => {
      expect(forma(ORIGINAL.replace('   Leer n', '   Leer n\n   Escribir n'))).not.toBe(
         forma(ORIGINAL),
      );
   });

   it('distingue usar la misma variable de usar dos distintas', () => {
      const unaVariable = `Proceso p
   Definir a Como Entero
   a <- 1
   Escribir a
FinProceso`;
      const dosVariables = `Proceso p
   Definir a, b Como Entero
   a <- 1
   Escribir b
FinProceso`;
      expect(forma(unaVariable)).not.toBe(forma(dosVariables));
   });

   it('el tamaño cuenta las sentencias anidadas', () => {
      const { program } = parse(ORIGINAL);
      // 3 definiciones/asignaciones + leer + para + 2 dentro + escribir final.
      expect(tamano(program)).toBe(8);
   });
});

// ---------------------------------------------------------------------------

describe('coincidencias en un lote', () => {
   /**
    * La unidad de comparación es el EJERCICIO: con cuadernos de ocho, comparar
    * archivos enteros solo detectaría a quien copió los ocho.
    */
   const base = (extra: Partial<EjercicioParaAnalizar>): EjercicioParaAnalizar => ({
      entregaId: 'x',
      ejercicioId: 'ej1',
      numeroControl: '1',
      nombre: 'Alumno',
      nombreEjercicio: 'Ejercicio 1',
      deviceId: 'd1',
      tamano: 10,
      ...extra,
   });

   it('detecta dos alumnos con la misma llave de firma', () => {
      const c = buscarCoincidencias([
         base({ entregaId: 'a', numeroControl: '111', nombre: 'Ana', huella: 'HUELLA1' }),
         base({ entregaId: 'b', numeroControl: '222', nombre: 'Luis', huella: 'HUELLA1' }),
      ]);

      expect(c.length).toBe(1);
      expect(c[0].tipo).toBe('instalacion');
      expect(c[0].implicados.map((i) => i.alumno).sort()).toEqual(['Ana', 'Luis']);
      expect(c[0].entregas.sort()).toEqual(['a', 'b']);
   });

   it('NO señala dos entregas del mismo alumno', () => {
      // Entregar dos versiones del propio trabajo es normal.
      const c = buscarCoincidencias([
         base({ entregaId: 'a', numeroControl: '111', nombre: 'Ana', huella: 'H' }),
         base({ entregaId: 'b', numeroControl: '111', nombre: 'Ana', huella: 'H' }),
      ]);
      expect(c).toEqual([]);
   });

   it('detecta el mismo algoritmo con variables renombradas', () => {
      const c = buscarCoincidencias([
         base({ entregaId: 'a', numeroControl: '111', nombre: 'Ana', huella: 'H1', forma: 'FORMA-X' }),
         base({ entregaId: 'b', numeroControl: '222', nombre: 'Luis', huella: 'H2', forma: 'FORMA-X' }),
      ]);

      expect(c.length).toBe(1);
      expect(c[0].tipo).toBe('forma');
   });

   it('NO señala algoritmos triviales aunque coincidan', () => {
      // «Lee dos números y súmalos» sale igual en todo el grupo.
      const c = buscarCoincidencias([
         base({ entregaId: 'a', numeroControl: '111', nombre: 'Ana', huella: 'H1', forma: 'F', tamano: 3 }),
         base({ entregaId: 'b', numeroControl: '222', nombre: 'Luis', huella: 'H2', forma: 'F', tamano: 3 }),
      ]);
      expect(c).toEqual([]);
   });

   it('no repite el mismo grupo por dos motivos', () => {
      // Misma instalación Y misma forma: se reporta una vez, por lo más fuerte.
      const c = buscarCoincidencias([
         base({ entregaId: 'a', numeroControl: '111', nombre: 'Ana', huella: 'H', forma: 'F' }),
         base({ entregaId: 'b', numeroControl: '222', nombre: 'Luis', huella: 'H', forma: 'F' }),
      ]);
      expect(c.length).toBe(1);
      expect(c[0].tipo).toBe('instalacion');
   });

   it('un lote limpio no produce señales', () => {
      const c = buscarCoincidencias([
         base({ entregaId: 'a', numeroControl: '111', nombre: 'Ana', huella: 'H1', forma: 'F1', deviceId: 'd1' }),
         base({ entregaId: 'b', numeroControl: '222', nombre: 'Luis', huella: 'H2', forma: 'F2', deviceId: 'd2' }),
      ]);
      expect(c).toEqual([]);
   });

   it('detecta por deviceId cuando el archivo no está cifrado', () => {
      const c = buscarCoincidencias([
         base({ entregaId: 'a', numeroControl: '111', nombre: 'Ana', deviceId: 'mismo' }),
         base({ entregaId: 'b', numeroControl: '222', nombre: 'Luis', deviceId: 'mismo' }),
      ]);
      expect(c[0]?.tipo).toBe('instalacion');
   });
});

// ---------------------------------------------------------------------------

describe('verosimilitud de la bitácora', () => {
   const bit = (b: Partial<Bitacora>): Bitacora => ({
      sesiones: 1,
      segundosActivos: 0,
      ediciones: 0,
      pegadosBloqueados: 0,
      ...b,
   });

   it('marca lo transcrito en un rato: poco tiempo y pocas ediciones', () => {
      expect(verosimilitud(bit({ segundosActivos: 90, ediciones: 12 }))).toBe('muy-dudosa');
   });

   it('no marca a quien trabajó de verdad', () => {
      expect(
         verosimilitud(bit({ segundosActivos: 1800, ediciones: 400, sesiones: 3 })),
      ).toBe('normal');
   });

   it('no marca a quien escribió rápido pero mucho', () => {
      // Un alumno bueno puede resolverlo en cuatro minutos; si tecleó
      // cientos de veces, escribió.
      expect(verosimilitud(bit({ segundosActivos: 240, ediciones: 300 }))).toBe('normal');
   });

   it('no marca a quien volvió en varias sesiones', () => {
      expect(
         verosimilitud(bit({ segundosActivos: 280, ediciones: 50, sesiones: 4 })),
      ).toBe('normal');
   });

   it('marca como dudoso el caso intermedio de una sola sesión corta', () => {
      expect(verosimilitud(bit({ segundosActivos: 200, ediciones: 40 }))).toBe('dudosa');
   });
});

describe('cronómetro de trabajo', () => {
   /** Deja pasar el tiempo real necesario para que corran unos cuantos tics. */
   const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

   it('cuenta el tiempo mientras el alumno está trabajando', async () => {
      const cronista = new Cronista(() => true);
      const parar = cronista.arrancar();
      await esperar(2300);
      parar();

      // Dos o tres tics de un segundo.
      expect(cronista.segundosActivos).toBeGreaterThanOrEqual(1);
      expect(cronista.segundosActivos).toBeLessThanOrEqual(4);
   });

   it('NO cuenta con la app en segundo plano', async () => {
      // Si contara, dejar la pestaña abierta toda la tarde inflaría la cifra y
      // la volvería inútil como evidencia.
      const cronista = new Cronista(() => false);
      const parar = cronista.arrancar();
      await esperar(2300);
      parar();

      expect(cronista.segundosActivos).toBe(0);
   });

   it('parar el cronómetro detiene el conteo', async () => {
      const cronista = new Cronista(() => true);
      cronista.arrancar()();
      await esperar(1500);
      expect(cronista.segundosActivos).toBe(0);
   });

   it('anota las ediciones', () => {
      const cronista = new Cronista(() => true);
      cronista.anotarEdicion();
      cronista.anotarEdicion();
      expect(cronista.ediciones).toBe(2);
   });

   it('continuar un archivo suma una sesión y conserva lo acumulado', () => {
      const cronista = new Cronista(() => true);
      cronista.continuar({
         sesiones: 2,
         segundosActivos: 900,
         ediciones: 250,
         pegadosBloqueados: 1,
      });

      expect(cronista.sesiones).toBe(3);
      expect(cronista.segundosActivos).toBe(900);
      expect(cronista.ediciones).toBe(250);
   });

   it('reiniciar deja la bitácora a cero', () => {
      const cronista = new Cronista(() => true);
      cronista.continuar({ sesiones: 5, segundosActivos: 100, ediciones: 9, pegadosBloqueados: 0 });
      cronista.reiniciar();

      expect(cronista.sesiones).toBe(1);
      expect(cronista.segundosActivos).toBe(0);
      expect(cronista.ediciones).toBe(0);
   });
});

describe('contador de pegados', () => {
   it('pertenece al documento, no a la sesión', () => {
      // Un intento de pegar mientras se trabajaba en un algoritmo no debe
      // aparecer luego en la bitácora de otro: sería evidencia falsa.
      const guardas = new Guardas();
      guardas.fijarDesdeArchivo(3);
      expect(guardas.pegadosBloqueados).toBe(3);

      guardas.fijarDesdeArchivo(0);
      expect(guardas.pegadosBloqueados).toBe(0);

      guardas.reiniciar();
      expect(guardas.pegadosBloqueados).toBe(0);
   });
});

describe('duración legible', () => {
   it('se lee bien en cada escala', () => {
      expect(duracion(45)).toBe('45 s');
      expect(duracion(180)).toBe('3 min');
      expect(duracion(3600)).toBe('1 h');
      expect(duracion(5100)).toBe('1 h 25 min');
   });
});
