# RFlowP

App educativa para diseñar algoritmos en **pseudocódigo** o en **diagrama de
flujo ANSI**, ejecutarlos y guardarlos. Instalable como PWA en Android, iOS y PC.

Deriva de [PseudoFlow](https://github.com/talamantesvictor/pseudoflow) (BSD-3);
ver [`NOTICE.md`](NOTICE.md).

---

## Advertencia sobre las medidas anti-copia

Este proyecto incluye, por diseño, cifrado de archivos y bloqueo de
copiar/pegar. **Son medidas de disuasión, no de seguridad.** Conviene que tanto
el profesor como los alumnos lo sepan:

- Un alumno con conocimientos puede abrir las herramientas de desarrollo del
  navegador y leer o alterar lo que quiera.
- Nadie puede impedir que alguien fotografíe la pantalla y retranscriba a mano.

Lo que sí es sólido es la **trazabilidad**: cada archivo va firmado con la
identidad de su autor y con una bitácora de edición, de modo que un trabajo
copiado delata a su autor original cuando el profesor lo abre. Si dos entregas
comparten la misma llave de firma o el mismo identificador de instalación,
salieron del mismo dispositivo, y el panel del profesor lo marca.

El endurecimiento adicional (ofuscación, detección de DevTools) tiene
rendimientos decrecientes y cuesta accesibilidad. La build de escritorio con
Tauri, sin DevTools, es la forma barata de subir la barrera si hace falta.

---

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Andamiaje, PWA instalable y offline, interfaz responsiva | **Hecho** |
| 1 | AST, lexer/parser PSeInt, printer, intérprete paso a paso | **Hecho** |
| 2 | Layout determinista y diagrama SVG con pan/zoom | **Hecho** |
| 3 | Edición gráfica bidireccional (puntos `+`, paleta, editor de expresiones) | **Hecho** |
| 4 | Identidad local, OPFS, guardar/cargar `.algx` | Pendiente |
| 5 | Cifrado y modo profesor | Pendiente |
| 6 | Anti-copia, bitácora, pulido | Pendiente |

Ahora mismo la app **edita en las dos direcciones**: se escribe pseudocódigo y
el diagrama se redibuja, o se arma el diagrama tocando símbolos y el
pseudocódigo se regenera. Y ejecuta, con la entrada de datos por diálogo.

Falta todo lo de guardar y entregar: identidad, archivos `.algx`, cifrado y
modo profesor (fases 4 a 6).

---

## Cómo correrlo

```bash
npm install
```

```bash
npm run dev
```

Otros comandos:

```bash
npm test
```

```bash
npm run check
```

```bash
npm run build
```

---

## Arquitectura

Ni el texto ni el diagrama son la fuente de verdad: **ambos son proyecciones de
un mismo AST**. Es lo que hace que la equivalencia entre las dos vistas sea una
consecuencia del diseño y no un problema de sincronización.

```
                 ┌──────────────────────┐
   parser  ─────▶│                      │─────▶  printer  ──────▶  Pseudocódigo
                 │   AST  (algoritmo)   │
   editor  ─────▶│                      │─────▶  layout + SVG ──▶  Diagrama ANSI
   gráfico       └──────────────────────┘
                            │
                            ▼
                  intérprete paso a paso
                  (resalta el nodo activo en AMBAS vistas)
```

| Carpeta | Qué hay |
|---|---|
| `src/core/` | `ast.ts`, `lexer.ts`, `parser.ts`, `printer.ts`, `interpreter.ts` |
| `src/chart/` | `layout.ts` (geometría determinista), `Diagram.svelte` (render SVG) |
| `src/edit/` | `mutaciones.ts`, `documento.svelte.ts`, paleta e inspectores |
| `src/ui/` | Ejemplos y piezas de interfaz |
| `tests/` | Ciclo de ida y vuelta, intérprete, layout, mutaciones, documento, comentarios |

Decisiones que conviene no deshacer sin pensarlo:

- **El parser nunca lanza.** Acumula errores y se recupera saltando de línea.
  Es lo que permite que el diagrama siga dibujándose mientras se teclea.
- **El printer conserva lo que escribió el alumno**: paréntesis explícitos,
  el texto original de los números y el tipo de comilla. Sin eso, el ciclo
  `parse → print → parse` le reescribiría el código solo.
- **El intérprete es un generador.** De ahí salen gratis el paso a paso, el
  inspector de variables y el resaltado sincronizado.
- **El layout es determinista.** Como el AST es estructurado, la posición de
  cada símbolo se calcula recursivamente y por construcción no hay solapamientos.
  No hace falta arrastrar nodos ni un motor de grafos.
- **Las mutaciones no mutan.** Cada operación devuelve un árbol nuevo con
  `structuredClone`, conservando los `id`. De ahí sale deshacer/rehacer como una
  simple lista de árboles, y el resaltado no salta al editar.
- **El árbol vive en `$state.raw`, no en `$state`.** La reactividad profunda de
  Svelte envuelve el objeto en un Proxy, y `structuredClone` no puede clonar un
  Proxy: falla con `DataCloneError`. Como el árbol siempre se reemplaza entero,
  la reactividad profunda además no aporta nada.
- **Los comentarios viven en el AST**, no en el texto. La edición gráfica
  reimprime el pseudocódigo completo en cada cambio; si no estuvieran en el
  árbol, el primer clic en el diagrama borraría lo que el alumno escribió.

### El dialecto

Compatible con PSeInt, para que sirvan los apuntes y la experiencia previa:

```
Proceso <nombre> … FinProceso
Definir <ids> Como Entero | Real | Caracter | Logico
Dimension <id>[n]  |  <id>[f, c]
<id> <- <expresión>
Leer <ids>              Escribir <exprs> [Sin Saltar]
Si <cond> Entonces … SiNo … FinSi
Mientras <cond> Hacer … FinMientras
Para <id> <- <a> Hasta <b> [Con Paso <p>] Hacer … FinPara
Repetir … Hasta Que <cond>
Segun <expr> Hacer   <valor>: …   De Otro Modo: …   FinSegun
```

Las palabras clave son insensibles a mayúsculas y a acentos (`segun`, `Según` y
`SEGUN` son la misma). `y` y `o` funcionan como nombre de variable **y** como
operador lógico: se desambigua por posición, así que `Definir x, y, z Como Real`
hace lo que uno espera.

---

## Edición gráfica

- Entre cada par de símbolos hay un **`+`**. Al tocarlo se abre la paleta:
  hoja inferior en móvil (al alcance del pulgar), recuadro centrado en PC.
- Tocar un símbolo abre el **inspector** con los campos de esa sentencia, más
  subir, bajar y eliminar.
- Las expresiones se editan con un **teclado propio**: fichas con las variables
  ya declaradas, operadores y funciones. Evita pelearse con el teclado del
  sistema en móvil, reduce los errores de escritura de nombres, y de paso quita
  la vía natural de pegar código de fuera.
- Lo que se teclea se valida con `parseExpresion`, es decir con la **misma**
  gramática del editor de texto. No hay dos nociones de expresión válida.
- Los bloques nuevos nacen con valores que **nunca cuelgan el programa**: un
  `Mientras` empieza con condición `Falso` y un `Repetir` con `Verdadero`.
- No se puede editar gráficamente mientras el pseudocódigo tiene errores:
  reimprimir el árbol borraría lo que se está escribiendo a medias.

## Pruebas

211 pruebas, sin dependencias del navegador:

- **Ida y vuelta**: sobre 16 algoritmos, `parse → print → parse` devuelve el
  mismo árbol, imprimir es idempotente y los ids no se repiten. Es la red de
  seguridad más importante: si esto se rompe, la sincronización entre vistas
  corrompe el trabajo del alumno.
- **Intérprete**: entrada/salida, control de flujo, arreglos y matrices,
  precedencia, cortocircuito, funciones internas, y los errores de ejecución
  (división entre cero, índice fuera de rango, ciclo infinito).
- **Layout**: ningún símbolo se solapa con otro, todo cae dentro del lienzo, el
  resultado es determinista y cada sentencia tiene su símbolo.
- **Mutaciones**: insertar en **cada** punto `+` de cuatro formas de programa
  produce código que reparsea; borrar no se lleva los comentarios; los ciclos
  nuevos no se cuelgan; los ids no se repiten.
- **Documento**: el texto inválido conserva el último árbol bueno, la edición
  gráfica reimprime, los ids sobreviven, y deshacer/rehacer encadena bien.
- **Comentarios**: sobreviven al ciclo en línea propia, al final de la línea y
  al final de un bloque, y el conteo se conserva.

---

## Pendiente antes de liberar

- Probar en un Android y un iPhone **reales**, instalando desde la pantalla de
  inicio, en modo avión, y comprobando que los datos sobreviven varios días.
- Sustituir los iconos PNG de relleno de `public/` por los definitivos.
- Cambiar el `<textarea>` por CodeMirror 6, necesario para bloquear el
  portapapeles dentro del editor (fase 6). Al hacerlo hay que comprobar que
  escribir el texto desde el código **no** dispara su `oninput`: de eso depende
  que las dos vías de edición no se muerdan la cola.
- El inspector edita el primer valor de un `Escribir` con varias partes; el
  resto se editan desde el pseudocódigo. Falta la edición de la lista completa.
