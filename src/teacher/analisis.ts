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

   // Se ordena antes de recorrer: así el alias de cada variable se asigna sobre
   // el orden canónico y dos programas que solo difieren en el orden de dos
   // líneas independientes producen exactamente la misma cadena.
   return escritorDeForma(alias).bloque(canonizar(programa).body);
}

/** La maquinaria de `formaDe`, parametrizada por cómo se nombran las variables. */
function escritorDeForma(alias: (nombre: string) => string) {
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
   return { expr, sentencia, bloque };
}

// ---------------------------------------------------------------------------
// Orden canónico
// ---------------------------------------------------------------------------

/**
 * Reordena las líneas independientes a un orden fijo.
 *
 * Sin esto, mover `suma <- 0` una línea más abajo bastaba para que dos trabajos
 * dejaran de coincidir, que es la edición más barata que puede hacer quien
 * copia. Con esto, los dos se reducen a la misma forma.
 *
 * Es una normalización **exacta**, no un parecido: solo se intercambian
 * sentencias entre las que no hay ninguna dependencia, de modo que dos
 * programas que acaban igual son de verdad el mismo algoritmo. No se toca el
 * umbral de sospecha ni se compara «parecido con parecido»: señalar a quien sí
 * trabajó sigue siendo peor que dejar pasar una copia.
 *
 * Qué NO se mueve, y por qué:
 *  - Nada cruza un `Si`, un `Mientras`, un `Para`, un `Repetir` ni un `Segun`.
 *    Mover una línea dentro o fuera de un bloque cambia el algoritmo.
 *  - `Leer` y `Escribir` quedan en su orden entre sí: intercambiar dos `Leer`
 *    cambia qué dato va a qué variable, y dos `Escribir`, lo que sale en
 *    pantalla. Eso no es una reescritura cosmética.
 */
export function canonizar(programa: Program): Program {
   const copia = structuredClone(programa);

   const visitar = (nodo: Program | Statement | SwitchCase): void => {
      for (const { block } of childBlocks(nodo)) {
         for (const hijo of block) visitar(hijo);
         const ordenado = ordenarBloque(block);
         block.length = 0;
         block.push(...ordenado);
      }
   };

   visitar(copia);
   return copia;
}

/** Nombres que una sentencia toca, y si su posición importa por hacer E/S. */
function usos(s: Statement): { lee: Set<string>; escribe: Set<string>; io: boolean } {
   const lee = new Set<string>();
   const escribe = new Set<string>();

   const enExpresion = (e: Expression): void => {
      switch (e.kind) {
         case 'Identifier':
            lee.add(e.name);
            break;
         case 'IndexExpression':
            lee.add(e.array.name);
            e.indices.forEach(enExpresion);
            break;
         case 'BinaryExpression':
            enExpresion(e.left);
            enExpresion(e.right);
            break;
         case 'UnaryExpression':
            enExpresion(e.argument);
            break;
         case 'GroupExpression':
            enExpresion(e.expression);
            break;
         case 'CallExpression':
            e.args.forEach(enExpresion);
            break;
      }
   };

   switch (s.kind) {
      case 'DefineStatement':
         // Declarar cuenta como escribir: nada que use la variable puede
         // adelantarse a su declaración.
         for (const n of s.names) escribe.add(n);
         break;
      case 'DimensionStatement':
         for (const a of s.arrays) {
            escribe.add(a.name);
            a.sizes.forEach(enExpresion);
         }
         break;
      case 'AssignStatement':
         if (s.target.kind === 'Identifier') {
            escribe.add(s.target.name);
         } else {
            // `a[i] <- ...` escribe el arreglo y lee los índices.
            escribe.add(s.target.array.name);
            s.target.indices.forEach(enExpresion);
         }
         enExpresion(s.value);
         break;
      case 'ReadStatement':
         for (const t of s.targets) {
            if (t.kind === 'Identifier') {
               escribe.add(t.name);
            } else {
               escribe.add(t.array.name);
               t.indices.forEach(enExpresion);
            }
         }
         return { lee, escribe, io: true };
      case 'WriteStatement':
         s.values.forEach(enExpresion);
         return { lee, escribe, io: true };
      default:
         break;
   }

   return { lee, escribe, io: false };
}

/** ¿Es una sentencia simple, de las que se pueden reordenar entre sí? */
function esSimple(s: Statement): boolean {
   return (
      s.kind === 'DefineStatement' ||
      s.kind === 'DimensionStatement' ||
      s.kind === 'AssignStatement' ||
      s.kind === 'ReadStatement' ||
      s.kind === 'WriteStatement'
   );
}

const seCruzan = (a: Set<string>, b: Set<string>): boolean => {
   for (const x of a) if (b.has(x)) return true;
   return false;
};

/** Ordena cada tramo de sentencias simples, respetando sus dependencias. */
function ordenarBloque(sentencias: Statement[]): Statement[] {
   const salida: Statement[] = [];
   let tramo: Statement[] = [];

   const cerrar = () => {
      salida.push(...ordenarTramo(tramo));
      tramo = [];
   };

   for (const s of sentencias) {
      if (esSimple(s)) {
         tramo.push(s);
      } else {
         // Las estructuras de control son barreras: nada las cruza.
         cerrar();
         salida.push(s);
      }
   }
   cerrar();

   return salida;
}

/**
 * Orden topológico determinista de un tramo de sentencias simples.
 *
 * Entre las disponibles se toma siempre la de forma más pequeña, para que dos
 * programas equivalentes lleguen al mismo orden aunque partieran de otro. El
 * desempate usa una forma **sin identidad de variables**, que no depende del
 * orden y por tanto no se muerde la cola con el alias de `formaDe`.
 */
function ordenarTramo(tramo: Statement[]): Statement[] {
   if (tramo.length < 2) return [...tramo];

   const escritor = escritorDeForma(() => 'v');
   const info = tramo.map((s) => ({ s, ...usos(s), clave: escritor.sentencia(s) }));

   /** `antes[j]` = índices que tienen que salir antes que `j`. */
   const antes = info.map(() => new Set<number>());
   for (let i = 0; i < info.length; i++) {
      for (let j = i + 1; j < info.length; j++) {
         const a = info[i];
         const b = info[j];
         const dependen =
            (a.io && b.io) ||
            seCruzan(a.escribe, b.lee) ||
            seCruzan(a.escribe, b.escribe) ||
            seCruzan(a.lee, b.escribe);
         if (dependen) antes[j].add(i);
      }
   }

   const salida: Statement[] = [];
   const puestos = new Set<number>();

   while (puestos.size < info.length) {
      let elegido = -1;
      for (let i = 0; i < info.length; i++) {
         if (puestos.has(i)) continue;
         let libre = true;
         for (const p of antes[i]) {
            if (!puestos.has(p)) {
               libre = false;
               break;
            }
         }
         if (!libre) continue;
         if (elegido === -1 || info[i].clave < info[elegido].clave) elegido = i;
      }

      // No puede haber ciclos —las aristas van siempre de menor a mayor
      // índice—, pero si algo saliera mal es preferible devolver el orden
      // original que quedarse dando vueltas.
      if (elegido === -1) return [...tramo];

      puestos.add(elegido);
      salida.push(info[elegido].s);
   }

   return salida;
}

/** Cuántas sentencias tiene el algoritmo, para no comparar cosas triviales. */
export function tamano(programa: Program): number {
   let total = 0;
   const visitar = (nodo: Program | Statement | SwitchCase): void => {
      if (nodo.kind !== 'Program' && nodo.kind !== 'SwitchCase') total += 1;
      // Sin recorrer aparte los casos de un `Segun`: `childBlocks` ya devuelve
      // sus cuerpos, y hacer las dos cosas contaba dos veces todo lo que va
      // dentro de un `Segun`.
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

/**
 * Un ejercicio de una entrega, listo para comparar.
 *
 * La unidad de comparación es el EJERCICIO y no la entrega: con cuadernos de
 * ocho, comparar archivos enteros solo detectaría al que copió los ocho.
 */
export interface EjercicioParaAnalizar {
   /** Archivo del que salió. */
   entregaId: string;
   ejercicioId: string;
   numeroControl: string;
   /** Nombre del alumno. */
   nombre: string;
   nombreEjercicio: string;
   deviceId: string;
   /** Huella de la llave de firma, del archivo entero. */
   huella?: string;
   /** Id en la plantilla, si el cuaderno salió de una. */
   origenId?: string;
   /** Forma estructural. `undefined` si no se pudo descifrar. */
   forma?: string;
   /** Número de sentencias, para descartar algoritmos triviales. */
   tamano?: number;
}

export type TipoCoincidencia = 'instalacion' | 'forma';

export interface Coincidencia {
   tipo: TipoCoincidencia;
   /** Entregas implicadas. */
   entregas: string[];
   /** Quién y en qué ejercicio: «Ana · Promedio». */
   implicados: Array<{ alumno: string; ejercicio: string }>;
   explicacion: string;
}

/**
 * Busca entregas relacionadas dentro de un lote.
 *
 * Solo se reporta un grupo cuando implica a **alumnos distintos**: que alguien
 * entregue dos versiones de su propio trabajo es normal y no interesa.
 */
export function buscarCoincidencias(
   ejercicios: EjercicioParaAnalizar[],
): Coincidencia[] {
   const salida: Coincidencia[] = [];

   const agrupar = (
      clave: (e: EjercicioParaAnalizar) => string | undefined,
   ): Map<string, EjercicioParaAnalizar[]> => {
      const grupos = new Map<string, EjercicioParaAnalizar[]>();
      for (const e of ejercicios) {
         const k = clave(e);
         if (!k) continue;
         const lista = grupos.get(k) ?? [];
         lista.push(e);
         grupos.set(k, lista);
      }
      return grupos;
   };

   const alumnosDistintos = (grupo: EjercicioParaAnalizar[]): string[] =>
      [...new Set(grupo.map((e) => e.numeroControl))];

   /** Quién y en qué ejercicio, sin repetir al mismo alumno dos veces. */
   const implicadosDe = (grupo: EjercicioParaAnalizar[]) => {
      const vistos = new Set<string>();
      const salida: Array<{ alumno: string; ejercicio: string }> = [];
      for (const e of grupo) {
         const clave = `${e.numeroControl}|${e.ejercicioId}`;
         if (vistos.has(clave)) continue;
         vistos.add(clave);
         salida.push({ alumno: e.nombre, ejercicio: e.nombreEjercicio });
      }
      return salida;
   };

   // 1. Misma instalación. Es del ARCHIVO entero, no del ejercicio: la firma es
   //    una por entrega. Se reporta una vez por grupo, no una por ejercicio.
   for (const [, grupo] of agrupar((e) => e.huella ?? (e.deviceId || undefined))) {
      const distintos = alumnosDistintos(grupo);
      if (distintos.length < 2) continue;

      const entregas = [...new Set(grupo.map((e) => e.entregaId))];
      const alumnos = [...new Set(grupo.map((e) => e.nombre))];

      salida.push({
         tipo: 'instalacion',
         entregas,
         implicados: alumnos.map((alumno) => ({ alumno, ejercicio: 'todo el cuaderno' })),
         explicacion:
            'Estas entregas se crearon en el mismo dispositivo, con la misma llave. Aparecen a nombre de alumnos distintos.',
      });
   }

   // 2. Misma forma, ignorando nombres y mensajes.
   const entregasSenaladas = new Set(salida.flatMap((c) => c.entregas));
   for (const [, grupo] of agrupar((e) =>
      e.forma && (e.tamano ?? 0) >= TAMANO_MINIMO_PARA_COMPARAR ? e.forma : undefined,
   )) {
      const distintos = alumnosDistintos(grupo);
      if (distintos.length < 2) continue;
      // No repetir lo que ya salió por instalación compartida.
      if (grupo.every((e) => entregasSenaladas.has(e.entregaId))) continue;

      // Si todos vienen del mismo ejercicio de la plantilla, se puede decir.
      const origenes = new Set(grupo.map((e) => e.origenId).filter(Boolean));
      const mismoEjercicio = origenes.size === 1;

      salida.push({
         tipo: 'forma',
         entregas: [...new Set(grupo.map((e) => e.entregaId))],
         implicados: implicadosDe(grupo),
         explicacion: mismoEjercicio
            ? 'Es el mismo ejercicio de la tarea y el algoritmo coincide, aunque cambien los nombres de las variables y los mensajes.'
            : 'El algoritmo es el mismo aunque cambien los nombres de las variables y los mensajes.',
      });
   }

   return salida;
}
