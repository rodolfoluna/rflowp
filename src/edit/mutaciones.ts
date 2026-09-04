/**
 * Operaciones de edición sobre el AST.
 *
 * Todas devuelven un **programa nuevo** y dejan el original intacto. Se clona
 * con `structuredClone`, que conserva los `id` de los nodos: eso importa porque
 * la selección del usuario y el resaltado durante la ejecución se apoyan en
 * ellos, y un id que cambia solo hace que el diagrama parpadee o pierda el foco.
 *
 * Trabajar sin mutar también hace que deshacer/rehacer sea guardar referencias
 * a los árboles anteriores, sin diffs ni parches.
 */

import {
   childBlocks,
   nextId,
   type DataType,
   type Expression,
   type NodeId,
   type Program,
   type Statement,
   type SwitchCase,
} from '../core/ast';
import type { RolSimbolo } from '../chart/layout';

/** Posición dentro del árbol donde cabe una sentencia. */
export interface Posicion {
   /** Nodo dueño del bloque (`Program`, `IfStatement`, …). */
   ownerId: NodeId;
   /** Ruta del bloque en ese nodo: `body`, `consequent`, `alternate`, `cases.0.body`. */
   blockKey: string;
   /** Índice donde se inserta. */
   index: number;
}

// ---------------------------------------------------------------------------
// Localización
// ---------------------------------------------------------------------------

/** Devuelve el array de sentencias que nombra `blockKey` dentro de `owner`. */
function bloqueDe(
   owner: Program | Statement | SwitchCase,
   blockKey: string,
): Statement[] | undefined {
   if (blockKey === 'body' && 'body' in owner) return owner.body as Statement[];
   if (blockKey === 'consequent' && owner.kind === 'IfStatement') return owner.consequent;
   if (blockKey === 'alternate' && owner.kind === 'IfStatement') return owner.alternate;

   const caso = /^cases\.(\d+)\.body$/.exec(blockKey);
   if (caso && owner.kind === 'SwitchStatement') {
      return owner.cases[Number(caso[1])]?.body;
   }

   return undefined;
}

/** Busca el nodo con ese id, incluyendo `SwitchCase` y el propio programa. */
export function buscarNodo(
   root: Program,
   id: NodeId,
): Program | Statement | SwitchCase | undefined {
   return buscar(root, id);
}

function buscar(
   root: Program,
   id: NodeId,
): Program | Statement | SwitchCase | undefined {
   if (root.id === id) return root;

   const visitar = (
      nodo: Program | Statement | SwitchCase,
   ): Program | Statement | SwitchCase | undefined => {
      if (nodo.id === id) return nodo;
      if (nodo.kind === 'SwitchStatement') {
         for (const c of nodo.cases) {
            const hit = visitar(c);
            if (hit) return hit;
         }
      }
      for (const { block } of childBlocks(nodo)) {
         for (const hijo of block) {
            const hit = visitar(hijo);
            if (hit) return hit;
         }
      }
      return undefined;
   };

   return visitar(root);
}

/** Encuentra el bloque que contiene directamente a `id`, y su índice. */
function contenedorDe(
   root: Program,
   id: NodeId,
): { block: Statement[]; index: number } | undefined {
   let hallado: { block: Statement[]; index: number } | undefined;

   const visitar = (nodo: Program | Statement | SwitchCase): void => {
      if (hallado) return;

      if (nodo.kind === 'SwitchStatement') {
         for (const c of nodo.cases) visitar(c);
      }

      for (const { block } of childBlocks(nodo)) {
         const i = block.findIndex((s) => s.id === id);
         if (i >= 0) {
            hallado = { block, index: i };
            return;
         }
         for (const hijo of block) visitar(hijo);
      }
   };

   visitar(root);
   return hallado;
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

/**
 * Inserta una sentencia en la posición indicada.
 * Devuelve el programa original sin tocar si la posición ya no existe, cosa que
 * puede pasar si el texto cambió entre que se dibujó el `+` y se pulsó.
 */
export function insertar(
   programa: Program,
   posicion: Posicion,
   sentencia: Statement,
): Program {
   const copia = structuredClone(programa);
   const owner = buscar(copia, posicion.ownerId);
   if (!owner) return programa;

   const bloque = bloqueDe(owner, posicion.blockKey);
   if (!bloque) return programa;

   const i = Math.max(0, Math.min(posicion.index, bloque.length));
   bloque.splice(i, 0, structuredClone(sentencia));
   return copia;
}

/** Elimina la sentencia con ese id, con todo lo que tenga dentro. */
export function eliminar(programa: Program, id: NodeId): Program {
   const copia = structuredClone(programa);
   const sitio = contenedorDe(copia, id);
   if (!sitio) return programa;

   // Los comentarios de la sentencia borrada se pasan a su vecina, para que
   // borrar un paso no se lleve por delante la explicación que lo acompañaba.
   const [quitada] = sitio.block.splice(sitio.index, 1);
   const heredados = [
      ...(quitada.leadingComments ?? []),
      ...(quitada.trailingComment ? [quitada.trailingComment] : []),
      ...(quitada.afterComments ?? []),
   ];

   if (heredados.length > 0) {
      const vecina = sitio.block[sitio.index] ?? sitio.block[sitio.index - 1];
      if (vecina) {
         vecina.leadingComments = [...heredados, ...(vecina.leadingComments ?? [])];
      }
   }

   return copia;
}

/** Sustituye una sentencia por otra, conservando sus comentarios. */
export function reemplazar(
   programa: Program,
   id: NodeId,
   sentencia: Statement,
): Program {
   const copia = structuredClone(programa);
   const sitio = contenedorDe(copia, id);
   if (!sitio) return programa;

   const anterior = sitio.block[sitio.index];
   const nueva = structuredClone(sentencia);
   nueva.leadingComments = anterior.leadingComments;
   nueva.trailingComment = anterior.trailingComment;
   nueva.afterComments = anterior.afterComments;

   sitio.block[sitio.index] = nueva;
   return copia;
}

/** Sube o baja una sentencia dentro de su propio bloque. */
export function mover(programa: Program, id: NodeId, delta: -1 | 1): Program {
   const copia = structuredClone(programa);
   const sitio = contenedorDe(copia, id);
   if (!sitio) return programa;

   const destino = sitio.index + delta;
   if (destino < 0 || destino >= sitio.block.length) return programa;

   const [s] = sitio.block.splice(sitio.index, 1);
   sitio.block.splice(destino, 0, s);
   return copia;
}

/** ¿Se puede mover en esa dirección? Lo usa la interfaz para atenuar botones. */
export function puedeMover(programa: Program, id: NodeId, delta: -1 | 1): boolean {
   const sitio = contenedorDe(programa, id);
   if (!sitio) return false;
   const destino = sitio.index + delta;
   return destino >= 0 && destino < sitio.block.length;
}

/** Cambia el nombre del proceso. */
export function renombrarProceso(programa: Program, nombre: string): Program {
   const copia = structuredClone(programa);
   copia.name = nombre;
   return copia;
}

/** Añade la rama `SiNo` a un `Si` que no la tenga, o la quita si está vacía. */
export function alternarSiNo(programa: Program, id: NodeId): Program {
   const copia = structuredClone(programa);
   const nodo = buscar(copia, id);
   if (!nodo || nodo.kind !== 'IfStatement') return programa;

   if (nodo.alternate === undefined) {
      nodo.alternate = [];
   } else if (nodo.alternate.length === 0) {
      nodo.alternate = undefined;
   } else {
      // Con contenido no se quita en silencio: se perdería trabajo del alumno.
      return programa;
   }

   return copia;
}

/** Agrega un caso a un `Segun`. */
export function agregarCaso(
   programa: Program,
   id: NodeId,
   test: Expression | undefined,
): Program {
   const copia = structuredClone(programa);
   const nodo = buscar(copia, id);
   if (!nodo || nodo.kind !== 'SwitchStatement') return programa;

   const nuevo: SwitchCase = {
      kind: 'SwitchCase',
      id: nextId('caso'),
      tests: test ? [structuredClone(test)] : [],
      body: [],
   };

   // `De Otro Modo` va siempre al final: es la rama por descarte.
   const iOtro = nodo.cases.findIndex((c) => c.tests.length === 0);
   if (test && iOtro >= 0) nodo.cases.splice(iOtro, 0, nuevo);
   else nodo.cases.push(nuevo);

   return copia;
}

/** Quita un caso de un `Segun`. Nunca deja el `Segun` sin casos. */
export function eliminarCaso(programa: Program, casoId: NodeId): Program {
   const copia = structuredClone(programa);

   let quitado = false;
   const visitar = (nodo: Program | Statement | SwitchCase): void => {
      if (quitado) return;
      if (nodo.kind === 'SwitchStatement') {
         const i = nodo.cases.findIndex((c) => c.id === casoId);
         if (i >= 0 && nodo.cases.length > 1) {
            nodo.cases.splice(i, 1);
            quitado = true;
            return;
         }
         for (const c of nodo.cases) visitar(c);
      }
      for (const { block } of childBlocks(nodo)) {
         for (const hijo of block) visitar(hijo);
      }
   };

   visitar(copia);
   return quitado ? copia : programa;
}

// ---------------------------------------------------------------------------
// Fábricas de sentencias nuevas
// ---------------------------------------------------------------------------

const num = (v: number): Expression => ({
   kind: 'NumberLiteral',
   id: nextId('num'),
   value: v,
   raw: String(v),
});

const texto = (v: string): Expression => ({
   kind: 'StringLiteral',
   id: nextId('str'),
   value: v,
   quote: '"',
});

const ident = (nombre: string) =>
   ({ kind: 'Identifier', id: nextId('id'), name: nombre }) as const;

const booleano = (v: boolean): Expression => ({
   kind: 'BooleanLiteral',
   id: nextId('bool'),
   value: v,
});

/** Tipos de sentencia que ofrece la paleta. */
export type TipoSentencia =
   | 'asignacion'
   | 'leer'
   | 'escribir'
   | 'definir'
   | 'dimension'
   | 'si'
   | 'mientras'
   | 'para'
   | 'repetir'
   | 'segun';

export interface OpcionPaleta {
   tipo: TipoSentencia;
   etiqueta: string;
   descripcion: string;
   /** Forma del símbolo con el que se dibuja, para el icono de la paleta. */
   simbolo: 'process' | 'io' | 'decision' | 'preparation';
   /** Función, que decide el color. Debe coincidir con la del diagrama. */
   rol: RolSimbolo;
}

export const PALETA: readonly OpcionPaleta[] = [
   {
      tipo: 'asignacion',
      etiqueta: 'Asignar',
      descripcion: 'Guarda un valor en una variable',
      simbolo: 'process',
      rol: 'asignacion',
   },
   {
      tipo: 'leer',
      etiqueta: 'Leer',
      descripcion: 'Pide un dato al usuario',
      simbolo: 'io',
      rol: 'entrada',
   },
   {
      tipo: 'escribir',
      etiqueta: 'Escribir',
      descripcion: 'Muestra un mensaje o un valor',
      simbolo: 'io',
      rol: 'salida',
   },
   {
      tipo: 'definir',
      etiqueta: 'Definir',
      descripcion: 'Declara una variable y su tipo',
      simbolo: 'process',
      rol: 'declaracion',
   },
   {
      tipo: 'dimension',
      etiqueta: 'Dimensionar',
      descripcion: 'Crea un arreglo',
      simbolo: 'process',
      rol: 'declaracion',
   },
   {
      tipo: 'si',
      etiqueta: 'Si…Entonces',
      descripcion: 'Elige entre dos caminos',
      simbolo: 'decision',
      rol: 'condicion',
   },
   {
      tipo: 'mientras',
      etiqueta: 'Mientras',
      descripcion: 'Repite mientras se cumpla una condición',
      simbolo: 'decision',
      rol: 'ciclo',
   },
   {
      tipo: 'para',
      etiqueta: 'Para',
      descripcion: 'Repite un número conocido de veces',
      simbolo: 'preparation',
      rol: 'para',
   },
   {
      tipo: 'repetir',
      etiqueta: 'Repetir',
      descripcion: 'Repite hasta que se cumpla una condición',
      simbolo: 'decision',
      rol: 'ciclo',
   },
   {
      tipo: 'segun',
      etiqueta: 'Según',
      descripcion: 'Elige entre varios casos',
      simbolo: 'decision',
      rol: 'caso',
   },
];

/**
 * Crea una sentencia con valores por defecto listos para ejecutarse.
 *
 * Los valores están escogidos para que insertar un bloque **nunca cuelgue el
 * programa**: el `Mientras` nace con condición `Falso` (no entra) y el
 * `Repetir` con `Verdadero` (sale a la primera). Un ciclo infinito recién
 * insertado sería la peor primera impresión posible.
 */
export function crearSentencia(tipo: TipoSentencia): Statement {
   switch (tipo) {
      case 'asignacion':
         return {
            kind: 'AssignStatement',
            id: nextId('asig'),
            target: ident('variable'),
            value: num(0),
         };

      case 'leer':
         return {
            kind: 'ReadStatement',
            id: nextId('leer'),
            targets: [ident('variable')],
         };

      case 'escribir':
         return {
            kind: 'WriteStatement',
            id: nextId('esc'),
            values: [texto('mensaje')],
            noNewline: false,
         };

      case 'definir':
         return {
            kind: 'DefineStatement',
            id: nextId('def'),
            names: ['variable'],
            dataType: 'Entero' as DataType,
         };

      case 'dimension':
         return {
            kind: 'DimensionStatement',
            id: nextId('dim'),
            arrays: [{ name: 'arreglo', sizes: [num(10)] }],
         };

      case 'si':
         return {
            kind: 'IfStatement',
            id: nextId('si'),
            test: booleano(true),
            consequent: [],
         };

      case 'mientras':
         return {
            kind: 'WhileStatement',
            id: nextId('mien'),
            test: booleano(false),
            body: [],
         };

      case 'para':
         return {
            kind: 'ForStatement',
            id: nextId('para'),
            variable: ident('i'),
            from: num(1),
            to: num(10),
            body: [],
         };

      case 'repetir':
         return {
            kind: 'RepeatStatement',
            id: nextId('rep'),
            body: [],
            test: booleano(true),
         };

      case 'segun':
         return {
            kind: 'SwitchStatement',
            id: nextId('seg'),
            discriminant: ident('opcion'),
            cases: [
               { kind: 'SwitchCase', id: nextId('caso'), tests: [num(1)], body: [] },
               { kind: 'SwitchCase', id: nextId('caso'), tests: [], body: [] },
            ],
         };
   }
}

// ---------------------------------------------------------------------------
// Variables visibles, para el editor de expresiones
// ---------------------------------------------------------------------------

/**
 * Nombres de variable y de arreglo declarados en el programa.
 *
 * El editor de expresiones los ofrece como fichas para tocar, que es la vía
 * principal de entrada en móvil y de paso evita la mayoría de los errores de
 * escritura.
 */
export function variablesDeclaradas(programa: Program): {
   variables: string[];
   arreglos: string[];
} {
   const variables = new Set<string>();
   const arreglos = new Set<string>();

   const visitar = (nodo: Program | Statement | SwitchCase): void => {
      switch (nodo.kind) {
         case 'DefineStatement':
            for (const n of nodo.names) variables.add(n);
            break;
         case 'DimensionStatement':
            for (const a of nodo.arrays) arreglos.add(a.name);
            break;
         case 'AssignStatement':
            if (nodo.target.kind === 'Identifier') variables.add(nodo.target.name);
            break;
         case 'ReadStatement':
            for (const t of nodo.targets) {
               if (t.kind === 'Identifier') variables.add(t.name);
            }
            break;
         case 'ForStatement':
            variables.add(nodo.variable.name);
            break;
      }

      if (nodo.kind === 'SwitchStatement') {
         for (const c of nodo.cases) visitar(c);
      }
      for (const { block } of childBlocks(nodo)) {
         for (const hijo of block) visitar(hijo);
      }
   };

   visitar(programa);

   return {
      variables: [...variables].sort((a, b) => a.localeCompare(b)),
      arreglos: [...arreglos].sort((a, b) => a.localeCompare(b)),
   };
}
