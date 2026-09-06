/**
 * Guardas del portapapeles y el apoyo de accesibilidad.
 *
 * Lo que se protege aquí son dos cosas que tiran en direcciones opuestas: que
 * pegar código de fuera no sea el camino cómodo, y que quien necesita el
 * portapapeles para escribir —dictado, teclado alternativo, lector de
 * pantalla— pueda usar la app.
 *
 * El acuerdo es que el apoyo deja pegar pero **cuenta cada pegado aparte**. Si
 * esa cuenta se perdiera o se mezclara con los intentos bloqueados, una
 * adaptación se leería como una sospecha, y eso es peor que no tenerla.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Guardas, type DestinoDeEventos } from '../src/guard/guardas.svelte';

/** Registro de oyentes que hace de `document` sin necesitar navegador. */
class DestinoFalso implements DestinoDeEventos {
   #oyentes = new Map<string, Array<(e: Event) => void>>();

   addEventListener(tipo: string, oyente: (e: Event) => void): void {
      this.#oyentes.set(tipo, [...(this.#oyentes.get(tipo) ?? []), oyente]);
   }

   removeEventListener(tipo: string, oyente: (e: Event) => void): void {
      this.#oyentes.set(
         tipo,
         (this.#oyentes.get(tipo) ?? []).filter((o) => o !== oyente),
      );
   }

   /** Lanza el evento y responde si alguien lo canceló. */
   lanzar(tipo: string): { cancelado: boolean } {
      let cancelado = false;
      const evento = {
         type: tipo,
         preventDefault: () => (cancelado = true),
         stopPropagation: () => {},
      } as unknown as Event;

      for (const oyente of this.#oyentes.get(tipo) ?? []) oyente(evento);
      return { cancelado };
   }

   get tipos(): string[] {
      return [...this.#oyentes]
         .filter(([, lista]) => lista.length > 0)
         .map(([tipo]) => tipo);
   }
}

/** `localStorage` de mentira: en Node no existe. */
function fingirAlmacen(inicial: Record<string, string> = {}) {
   const datos = new Map(Object.entries(inicial));
   (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
      removeItem: (k: string) => void datos.delete(k),
   };
   return datos;
}

afterEach(() => {
   delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('sin el apoyo puesto', () => {
   let destino: DestinoFalso;
   let guardas: Guardas;

   beforeEach(() => {
      destino = new DestinoFalso();
      guardas = new Guardas();
      guardas.activar(destino);
   });

   it('bloquea pegar y lo cuenta', () => {
      expect(destino.lanzar('paste').cancelado).toBe(true);
      expect(destino.lanzar('paste').cancelado).toBe(true);

      expect(guardas.pegadosBloqueados).toBe(2);
      expect(guardas.pegadosPermitidos).toBe(0);
   });

   it('bloquea copiar, cortar, el menú y arrastrar', () => {
      for (const tipo of ['copy', 'cut', 'contextmenu', 'dragstart', 'drop']) {
         expect(destino.lanzar(tipo).cancelado, tipo).toBe(true);
      }
      expect(guardas.copiadosBloqueados).toBe(2);
   });

   it('avisa al alumno de por qué no pudo pegar', () => {
      destino.lanzar('paste');
      expect(guardas.aviso).toMatch(/no se puede pegar/i);
   });
});

describe('con el apoyo puesto', () => {
   let destino: DestinoFalso;
   let guardas: Guardas;

   beforeEach(() => {
      destino = new DestinoFalso();
      guardas = new Guardas();
      guardas.apoyar(true);
      guardas.activar(destino);
   });

   it('deja pegar', () => {
      expect(destino.lanzar('paste').cancelado).toBe(false);
   });

   it('cuenta lo pegado aparte de lo bloqueado', () => {
      destino.lanzar('paste');
      destino.lanzar('paste');
      destino.lanzar('paste');

      expect(guardas.pegadosPermitidos).toBe(3);
      // No es un intento frenado: mezclarlos convertiría la adaptación en
      // una sospecha.
      expect(guardas.pegadosBloqueados).toBe(0);
   });

   it('no molesta con el aviso de que no se puede pegar', () => {
      destino.lanzar('paste');
      expect(guardas.aviso).toBe(null);
   });

   it('abre el menú contextual, que suele ser la única vía a «Pegar»', () => {
      expect(destino.lanzar('contextmenu').cancelado).toBe(false);
   });

   it('deja meter texto arrastrado, y lo cuenta como pegado', () => {
      expect(destino.lanzar('drop').cancelado).toBe(false);
      expect(guardas.pegadosPermitidos).toBe(1);
   });

   it('sigue sin dejar copiar ni sacar texto arrastrando', () => {
      // La necesidad que cubre el apoyo es METER texto, no sacarlo.
      expect(destino.lanzar('copy').cancelado).toBe(true);
      expect(destino.lanzar('cut').cancelado).toBe(true);
      expect(destino.lanzar('dragstart').cancelado).toBe(true);
   });
});

describe('los contadores pertenecen al ejercicio', () => {
   it('se fijan desde el archivo, no se acumulan entre ejercicios', () => {
      const guardas = new Guardas();

      guardas.fijarDesdeArchivo(3, 7);
      expect(guardas.pegadosBloqueados).toBe(3);
      expect(guardas.pegadosPermitidos).toBe(7);

      // Cambiar de ejercicio: lo de antes no puede seguir contando aquí.
      guardas.fijarDesdeArchivo(0, 0);
      expect(guardas.pegadosBloqueados).toBe(0);
      expect(guardas.pegadosPermitidos).toBe(0);
   });

   it('reiniciar los deja a cero', () => {
      const guardas = new Guardas();
      guardas.fijarDesdeArchivo(4, 5);
      guardas.reiniciar();

      expect(guardas.pegadosBloqueados).toBe(0);
      expect(guardas.pegadosPermitidos).toBe(0);
   });

   it('reiniciar NO quita el apoyo', () => {
      // Es una adaptación de quien usa el aparato, no parte del trabajo:
      // quitárselo al empezar un algoritmo nuevo lo dejaría sin poder escribir.
      fingirAlmacen();
      const guardas = new Guardas();
      guardas.apoyar(true);

      guardas.reiniciar();

      expect(guardas.apoyo).toBe(true);
   });
});

describe('el apoyo se recuerda en el aparato', () => {
   it('sobrevive a cerrar la app', () => {
      const datos = fingirAlmacen();

      new Guardas().apoyar(true);
      expect(datos.get('rflowp:apoyo-portapapeles')).toBe('si');

      // La app se vuelve a abrir.
      expect(new Guardas().apoyo).toBe(true);
   });

   it('se puede quitar', () => {
      fingirAlmacen({ 'rflowp:apoyo-portapapeles': 'si' });

      const guardas = new Guardas();
      expect(guardas.apoyo).toBe(true);

      guardas.apoyar(false);
      expect(new Guardas().apoyo).toBe(false);
   });

   it('sin almacenamiento la app sigue funcionando', () => {
      // Modo privado, o el navegador con el almacenamiento bloqueado.
      const guardas = new Guardas();
      expect(guardas.apoyo).toBe(false);

      expect(() => guardas.apoyar(true)).not.toThrow();
      // Vale para esta sesión, que es mejor que dejarlo sin poder escribir.
      expect(guardas.apoyo).toBe(true);
   });
});

describe('quitar las guardas', () => {
   it('desregistra todo lo que registró', () => {
      const destino = new DestinoFalso();
      const quitar = new Guardas().activar(destino);

      expect(destino.tipos.sort()).toEqual(
         ['contextmenu', 'copy', 'cut', 'dragstart', 'drop', 'paste'].sort(),
      );

      quitar();
      expect(destino.tipos).toEqual([]);
   });
});
