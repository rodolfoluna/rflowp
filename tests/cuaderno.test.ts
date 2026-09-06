/**
 * El cuaderno: varios ejercicios en un archivo.
 *
 * Lo que más importa aquí es que la colección no pierda trabajo: borrar no debe
 * dejar el cuaderno inservible, deshacer en un ejercicio no debe tocar a los
 * demás, y el ciclo guardar→abrir tiene que devolver los mismos programas.
 */

import { describe, it, expect } from 'vitest';
import { Cuaderno, esqueletoDe } from '../src/edit/cuaderno.svelte';
import { normalizarContenido, ErrorArchivo, FORMATO } from '../src/file/algx';
import { print } from '../src/core/printer';
import { parse } from '../src/core/parser';

/** Cuaderno con ids predecibles, para poder afirmar sobre ellos. */
function nuevo() {
   let n = 0;
   return new Cuaderno(() => `e${++n}`);
}

const SUMA = `Proceso suma
   Definir a, b Como Entero
   Leer a, b
   Escribir a + b
FinProceso`;

describe('un cuaderno recién creado', () => {
   it('tiene un ejercicio y está activo', () => {
      const c = nuevo();
      expect(c.total).toBe(1);
      expect(c.posicionActiva).toBe(1);
      expect(c.activoId).toBe('e1');
      expect(c.nombreActivo).toBe('Ejercicio 1');
   });

   it('el esqueleto inicial compila', () => {
      const c = nuevo();
      expect(c.activo.errores).toEqual([]);
   });

   it('el esqueleto convierte el nombre en un identificador válido', () => {
      // «Ejercicio 3: promedio» no es un nombre de proceso válido.
      expect(esqueletoDe('Ejercicio 3: promedio')).toContain('Proceso Ejercicio_3_promedio');
      expect(parse(esqueletoDe('Ejercicio 3: promedio')).errors).toEqual([]);
      expect(parse(esqueletoDe('Área máxima')).errors).toEqual([]);
      // Un nombre que empieza por dígito tampoco vale como identificador.
      expect(parse(esqueletoDe('3 sumas')).errors).toEqual([]);
      // Y uno que se queda sin nada utilizable tiene que dar algo válido igual.
      expect(parse(esqueletoDe('¿?')).errors).toEqual([]);
   });
});

describe('gestionar los ejercicios', () => {
   it('agregar deja el nuevo activo', () => {
      const c = nuevo();
      const id = c.agregar('Promedio');

      expect(c.total).toBe(2);
      expect(c.activoId).toBe(id);
      expect(c.nombreActivo).toBe('Promedio');
      expect(c.posicionActiva).toBe(2);
   });

   it('renombrar no cambia el contenido', () => {
      const c = nuevo();
      c.activo.escribir(SUMA);
      c.renombrar('e1', 'Suma de dos números');

      expect(c.nombreActivo).toBe('Suma de dos números');
      expect(c.activo.texto).toBe(SUMA);
   });

   it('renombrar con espacios en blanco no borra el nombre', () => {
      const c = nuevo();
      c.renombrar('e1', '   ');
      expect(c.nombreActivo).toBe('Ejercicio 1');
   });

   it('NUNCA deja el cuaderno vacío', () => {
      const c = nuevo();
      expect(c.eliminar('e1')).toBe(false);
      expect(c.total).toBe(1);
   });

   it('borrar el activo pasa al vecino', () => {
      const c = nuevo();
      c.agregar('Segundo');
      c.agregar('Tercero');

      c.activar('e2');
      c.eliminar('e2');
      // Pasa al siguiente.
      expect(c.activoId).toBe('e3');

      c.eliminar('e3');
      // Era el último: pasa al anterior.
      expect(c.activoId).toBe('e1');
   });

   it('reordenar mueve el ejercicio sin perderlo', () => {
      const c = nuevo();
      c.agregar('Segundo');
      c.agregar('Tercero');

      expect(c.mover('e3', -1)).toBe(true);
      expect(c.ejercicios.map((e) => e.nombre)).toEqual([
         'Ejercicio 1',
         'Tercero',
         'Segundo',
      ]);
   });

   it('no se puede mover fuera de los extremos', () => {
      const c = nuevo();
      c.agregar('Segundo');
      expect(c.mover('e1', -1)).toBe(false);
      expect(c.mover('e2', 1)).toBe(false);
   });

   it('las flechas no dan la vuelta', () => {
      const c = nuevo();
      c.agregar('Segundo');

      c.activar('e1');
      expect(c.puedeAvanzar).toEqual({ atras: false, adelante: true });
      c.avanzar(-1);
      expect(c.activoId).toBe('e1');

      c.avanzar(1);
      expect(c.activoId).toBe('e2');
      expect(c.puedeAvanzar).toEqual({ atras: true, adelante: false });
   });
});

describe('cada ejercicio es independiente', () => {
   it('escribir en uno no toca a los demás', () => {
      const c = nuevo();
      c.agregar('Segundo');

      c.activar('e1');
      c.activo.escribir(SUMA);
      c.activar('e2');

      expect(c.activo.texto).not.toBe(SUMA);
      c.activar('e1');
      expect(c.activo.texto).toBe(SUMA);
   });

   it('deshacer en un ejercicio NO deshace en otro', () => {
      // Es lo que el alumno espera, y sale de tener un Documento por ejercicio.
      const c = nuevo();
      c.agregar('Segundo');

      c.activar('e1');
      c.activo.escribir(SUMA);
      const antesDeMutar = c.activo.texto;
      c.activo.aplicar((p) => ({ ...p, name: 'renombrado' }));
      expect(c.activo.texto).not.toBe(antesDeMutar);

      // Deshacer estando en el segundo no puede afectar al primero.
      c.activar('e2');
      expect(c.activo.puedeDeshacer).toBe(false);
      c.activo.deshacer();

      c.activar('e1');
      expect(c.activo.puedeDeshacer).toBe(true);
      c.activo.deshacer();
      expect(c.activo.texto).toBe(antesDeMutar);
   });

   it('el estado de cada uno se ve en la lista', () => {
      const c = nuevo();
      c.agregar('Con errores');
      c.agregar('Listo');

      c.activar('e2');
      c.activo.escribir('Proceso p\n   Si a > ');
      c.activar('e3');
      c.activo.escribir(SUMA);

      const estados = Object.fromEntries(c.ejercicios.map((e) => [e.nombre, e.estado]));
      expect(estados['Ejercicio 1']).toBe('vacio');
      expect(estados['Con errores']).toBe('con-errores');
      expect(estados['Listo']).toBe('listo');
   });
});

describe('bitácora por ejercicio', () => {
   it('lo anotado va al ejercicio indicado y no se filtra', () => {
      const c = nuevo();
      c.agregar('Segundo');

      c.anotar('e1', { segundosActivos: 300, ediciones: 120 });
      c.anotar('e2', { segundosActivos: 20, ediciones: 4 });

      expect(c.bitacoraDe('e1')?.segundosActivos).toBe(300);
      expect(c.bitacoraDe('e2')?.segundosActivos).toBe(20);
   });

   it('preguntar por un ejercicio que ya no existe no lanza', () => {
      // Pasa al abrir otro archivo o recuperar el borrador: quien estaba
      // midiendo se queda con un id de otro cuaderno. Es una carrera legítima y
      // no puede tumbar la app justo al guardar.
      const c = nuevo();
      const viejo = c.activoId;
      c.desdeBorrador({
         activoId: 'otro1',
         ejercicios: [
            {
               id: 'otro1',
               nombre: 'De otro cuaderno',
               texto: SUMA,
               bitacora: { segundosActivos: 0, ediciones: 0, pegadosBloqueados: 0 },
            },
         ],
      });

      expect(c.tiene(viejo)).toBe(false);
      expect(c.bitacoraDe(viejo)).toBeUndefined();
      expect(() => c.anotar(viejo, { ediciones: 5 })).not.toThrow();
   });

   it('el total del cuaderno suma sus ejercicios', () => {
      const c = nuevo();
      c.agregar('Segundo');
      c.anotar('e1', { segundosActivos: 300, ediciones: 120, pegadosBloqueados: 1 });
      c.anotar('e2', { segundosActivos: 20, ediciones: 4, pegadosBloqueados: 2 });

      const total = c.aContenido().bitacora;
      expect(total.segundosActivos).toBe(320);
      expect(total.ediciones).toBe(124);
      expect(total.pegadosBloqueados).toBe(3);
      expect(total.sesiones).toBe(1);
   });
});

describe('ciclo guardar y abrir', () => {
   it('los tres ejercicios vuelven idénticos', () => {
      const c = nuevo();
      c.activo.escribir(SUMA);
      c.agregar('Segundo');
      c.activo.escribir(`Proceso dos
   Escribir "dos"
FinProceso`);
      c.agregar('Tercero');
      c.activo.escribir(`Proceso tres
   Escribir "tres"
FinProceso`);

      const contenido = c.aContenido();
      expect(contenido.ejercicios.length).toBe(3);

      const abierto = nuevo();
      abierto.cargar(normalizarContenido(JSON.parse(JSON.stringify(contenido))));

      expect(abierto.total).toBe(3);
      expect(abierto.ejercicios.map((e) => e.nombre)).toEqual([
         'Ejercicio 1',
         'Segundo',
         'Tercero',
      ]);

      abierto.activar(abierto.ejercicios[0].id);
      expect(abierto.activo.texto).toBe(SUMA);
      abierto.activar(abierto.ejercicios[2].id);
      expect(abierto.activo.texto).toContain('Escribir "tres"');
   });

   it('abrir suma una sesión', () => {
      const c = nuevo();
      const contenido = c.aContenido();
      expect(contenido.bitacora.sesiones).toBe(1);

      const abierto = nuevo();
      abierto.cargar(contenido);
      expect(abierto.sesiones).toBe(2);
      expect(abierto.aContenido().bitacora.sesiones).toBe(2);
   });

   it('un ejercicio con errores guarda su última versión válida', () => {
      // El alumno deja algo a medias; no puede perderse lo que ya funcionaba.
      const c = nuevo();
      c.activo.escribir(SUMA);
      c.activo.escribir('Proceso suma\n   Si a > ');

      expect(c.activo.errores.length).toBeGreaterThan(0);
      expect(print(c.aContenido().ejercicios[0].programa)).toBe(SUMA);
   });
});

describe('borrador: recuperar lo no guardado', () => {
   it('conserva el texto de TODOS los ejercicios, aunque no compilen', () => {
      const c = nuevo();
      c.activo.escribir(SUMA);
      c.agregar('A medias');
      const aMedias = 'Proceso p\n   Si a > ';
      c.activo.escribir(aMedias);

      const recuperado = nuevo();
      recuperado.desdeBorrador(JSON.parse(JSON.stringify(c.aBorrador())));

      expect(recuperado.total).toBe(2);
      recuperado.activar(recuperado.ejercicios[0].id);
      expect(recuperado.activo.texto).toBe(SUMA);
      recuperado.activar(recuperado.ejercicios[1].id);
      expect(recuperado.activo.texto).toBe(aMedias);
   });

   it('recupera el ejercicio que estaba abierto', () => {
      const c = nuevo();
      c.agregar('Segundo');
      c.agregar('Tercero');
      c.activar('e2');

      const recuperado = nuevo();
      recuperado.desdeBorrador(c.aBorrador());
      expect(recuperado.activoId).toBe('e2');
      expect(recuperado.posicionActiva).toBe(2);
   });

   it('un activoId que ya no existe cae en el primero', () => {
      const c = nuevo();
      const borrador = c.aBorrador();
      borrador.activoId = 'fantasma';

      const recuperado = nuevo();
      recuperado.desdeBorrador(borrador);
      expect(recuperado.activoId).toBe(recuperado.ejercicios[0].id);
   });
});

describe('lectura del archivo', () => {
   it('rechaza un cuaderno sin ejercicios', () => {
      expect(() => normalizarContenido({ ejercicios: [] })).toThrow(ErrorArchivo);
      expect(() => normalizarContenido({})).toThrow(/incompleto|dañado/);
   });

   it('rechaza un ejercicio sin programa', () => {
      expect(() =>
         normalizarContenido({ ejercicios: [{ id: 'a', nombre: 'x' }] }),
      ).toThrow(/incompleto|dañado/);
   });

   it('repara nombres e ids que falten en vez de fallar', () => {
      // El trabajo del alumno importa más que la pulcritud del archivo.
      const c = normalizarContenido({
         ejercicios: [{ programa: parse(SUMA).program }],
      });
      expect(c.ejercicios[0].id).toBe('ej1');
      expect(c.ejercicios[0].nombre).toBe('Ejercicio 1');
      expect(c.ejercicios[0].bitacora.segundosActivos).toBe(0);
   });

   it('el formato es algx/2', () => {
      // Los archivos de la versión anterior se rechazan a propósito: no llegó a
      // haber entregas y un migrador para archivos que no existen sería código
      // difícil de probar.
      expect(FORMATO).toBe('algx/2');
   });
});
