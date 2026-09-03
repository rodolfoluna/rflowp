/**
 * Detección de trabajos repetidos.
 *
 * Hay tres señales, de más a menos concluyente:
 *
 *   1. **Misma instalación.** Dos entregas con la misma huella de firma o el
 *      mismo `deviceId` salieron del mismo dispositivo. Es lo más difícil de
 *      esquivar sin entender el formato del archivo.
 *   2. **Misma forma.** El algoritmo es estructuralmente idéntico aunque se
 *      hayan cambiado los nombres de las variables y los mensajes. Esto atrapa
 *      al que retranscribió a mano, que es lo único que el cifrado no evita.
 *   3. **Bitácora inverosímil.** Muy poco tiempo y muy pocas ediciones.
 *
 * Nada de esto acusa a nadie: ordena la atención del profesor. Dos alumnos
 * pueden llegar a la misma solución de un ejercicio sencillo, y de hecho es lo
 * normal en los primeros temas.
 */

import { childBlocks, type Expression, type Program, type Statement, type SwitchCase } from '../core/ast';

// ---------------------------------------------------------------------------
// Huella estructural
// ---------------------------------------------------------------------------

/**
 * Reduce un algoritmo a su forma, ignorando lo que es fácil de cambiar.
 *
 * Se descartan: nombres de variables (se sustituyen por el orden en que
 * aparecen), textos de los mensajes y comentarios. Se conservan: la estructura
 * de control, los operadores, los números y los tipos de dato.
 *
 * Así, renombrar `suma` a `total` y cambiar «El promedio es» por «Promedio:»
 * —que es exactamente lo que hace quien copia— no cambia la huella.
 */
export function formaDe(programa: Program): string {
   const nombres = new Map<string, string>();

   const alias = (nombre: string): string => {
      const existente = nombres.get(nombre);
      if (existente) return existente;
      const nuevo = `v${nombres.size}`;
      nombres.set(nombre, nuevo);
      return nuevo;
   };

   const expr = (e: Expression): string => {
      switch (e.kind) {
         case 'NumberLiteral':
            return `n:${e.value}`;
         case 'StringLiteral':
            // El texto se descarta, pero no que HAYA un texto: un `Escribir`
            // con mensaje y otro sin él son algoritmos distintos.
            return 'txt';
         case 'BooleanLiteral':
            return `b:${e.value}`;
         case 'Identifier':
            return alias(e.name);
         case 'IndexExpression':
            return `${alias(e.array.name)}[${e.indices.map(expr).join(',')}]`;
         case 'BinaryExpression':
            return `(${expr(e.left)}${e.operator}${expr(e.right)})`;
         case 'UnaryExpression':
            return `(${e.operator}${expr(e.argument)})`;
         case 'GroupExpression':
            // Los paréntesis explícitos no cambian el significado; quitarlos
            // evita que añadir uno de más disfrace una copia.
            return expr(e.expression);
         case 'CallExpression':
            return `${e.callee.toLowerCase()}(${e.args.map(expr).join(',')})`;
      }
   };

   const bloque = (sentencias: Statement[]): string =>
      sentencias.map(sentencia).join(';');

   const sentencia = (s: Statement | SwitchCase): string => {
      switch (s.kind) {
         case 'DefineStatement':
            return `def:${s.dataType}:${s.names.map(alias).join(',')}`;
         case 'DimensionStatement':
            return `dim:${s.arrays
               .map((a) => `${alias(a.name)}[${a.sizes.map(expr).join(',')}]`)
               .join(',')}`;
         case 'AssignStatement':
            return `asg:${expr(s.target)}=${expr(s.value)}`;
         case 'ReadStatement':
            return `leer:${s.targets.map(expr).join(',')}`;
         case 'WriteStatement':
            return `esc:${s.values.map(expr).join(',')}${s.noNewline ? ':ss' : ''}`;
         case 'IfStatement':
            return `si:${expr(s.test)}{${bloque(s.consequent)}}${
               s.alternate ? `{${bloque(s.alternate)}}` : ''
            }`;
         case 'WhileStatement':
            return `mie:${expr(s.test)}{${bloque(s.body)}}`;
         case 'RepeatStatement':
            return `rep{${bloque(s.body)}}${expr(s.test)}`;
         case 'ForStatement':
            return `para:${alias(s.variable.name)}=${expr(s.from)}..${expr(s.to)}${
               s.step ? `/${expr(s.step)}` : ''
            }{${bloque(s.body)}}`;
         case 'SwitchStatement':
            return `seg:${expr(s.discriminant)}[${s.cases.map(sentencia).join('|')}]`;
         case 'SwitchCase':
            return `caso:${s.tests.map(expr).join(',')}{${bloque(s.body)}}`;
      }
   };

   // El nombre del proceso se descarta: cambiarlo es lo primero que hace quien
   // copia, y no dice nada del algoritmo.
   return bloque(programa.body);
}

/** Cuántas sentencias tiene el algoritmo, para no comparar cosas triviales. */
export function tamano(programa: Program): number {
   let total = 0;
   const visitar = (nodo: Program | Statement | SwitchCase): void => {
      if (nodo.kind !== 'Program' && nodo.kind !== 'SwitchCase') total += 1;
      if (nodo.kind === 'SwitchStatement') {
         for (const c of nodo.cases) visitar(c);
      }
      for (const { block } of childBlocks(nodo)) {
         for (const hijo of block) visitar(hijo);
      }
   };
   visitar(programa);
   return total;
}

/**
 * Por debajo de este tamaño, dos algoritmos iguales no significan nada: pedir
 * «lee dos números y muestra su suma» produce la misma forma en todo el grupo.
 */
export const TAMANO_MINIMO_PARA_COMPARAR = 6;

// ---------------------------------------------------------------------------
// Agrupación de un lote
// ---------------------------------------------------------------------------

export interface EntregaParaAnalizar {
   id: string;
   numeroControl: string;
   nombre: string;
   deviceId: string;
   /** Huella de la llave de firma. `undefined` en archivos sin cifrar. */
   huella?: string;
   /** Forma estructural. `undefined` si no se pudo descifrar. */
   forma?: string;
   /** Número de sentencias, para descartar algoritmos triviales. */
   tamano?: number;
}

export type TipoCoincidencia = 'instalacion' | 'forma';

export interface Coincidencia {
   tipo: TipoCoincidencia;
   /** Ids de las entregas implicadas. */
   ids: string[];
   /** Nombres de los alumnos, para mostrarlo. */
   alumnos: string[];
   explicacion: string;
}

/**
 * Busca entregas relacionadas dentro de un lote.
 *
 * Solo se reporta un grupo cuando implica a **alumnos distintos**: que alguien
 * entregue dos versiones de su propio trabajo es normal y no interesa.
 */
export function buscarCoincidencias(entregas: EntregaParaAnalizar[]): Coincidencia[] {
   const salida: Coincidencia[] = [];

   const agrupar = (
      clave: (e: EntregaParaAnalizar) => string | undefined,
   ): Map<string, EntregaParaAnalizar[]> => {
      const grupos = new Map<string, EntregaParaAnalizar[]>();
      for (const e of entregas) {
         const k = clave(e);
         if (!k) continue;
         const lista = grupos.get(k) ?? [];
         lista.push(e);
         grupos.set(k, lista);
      }
      return grupos;
   };

   const alumnosDistintos = (grupo: EntregaParaAnalizar[]): string[] =>
      [...new Set(grupo.map((e) => e.numeroControl))];

   // 1. Misma instalación: la señal más fuerte.
   for (const [, grupo] of agrupar((e) => e.huella ?? (e.deviceId || undefined))) {
      const distintos = alumnosDistintos(grupo);
      if (distintos.length < 2) continue;

      salida.push({
         tipo: 'instalacion',
         ids: grupo.map((e) => e.id),
         alumnos: [...new Set(grupo.map((e) => e.nombre))],
         explicacion:
            'Estas entregas se crearon en el mismo dispositivo, con la misma llave. Aparecen a nombre de alumnos distintos.',
      });
   }

   // 2. Misma forma, ignorando nombres y mensajes.
   const yaSenalados = new Set(salida.flatMap((c) => c.ids));
   for (const [, grupo] of agrupar((e) =>
      e.forma && (e.tamano ?? 0) >= TAMANO_MINIMO_PARA_COMPARAR ? e.forma : undefined,
   )) {
      const distintos = alumnosDistintos(grupo);
      if (distintos.length < 2) continue;
      // No repetir lo que ya salió por instalación compartida.
      if (grupo.every((e) => yaSenalados.has(e.id))) continue;

      salida.push({
         tipo: 'forma',
         ids: grupo.map((e) => e.id),
         alumnos: [...new Set(grupo.map((e) => e.nombre))],
         explicacion:
            'El algoritmo es el mismo aunque cambien los nombres de las variables y los mensajes.',
      });
   }

   return salida;
}
