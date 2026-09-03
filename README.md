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
| 3 | Edición gráfica bidireccional (puntos `+`, paleta, editor de expresiones) | Pendiente |
| 4 | Identidad local, OPFS, guardar/cargar `.algx` | Pendiente |
| 5 | Cifrado y modo profesor | Pendiente |
| 6 | Anti-copia, bitácora, pulido | Pendiente |

Ahora mismo la app **escribe pseudocódigo, dibuja el diagrama equivalente y
ejecuta**. El diagrama todavía es de solo lectura: la edición gráfica es la
fase 3.

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
| `src/ui/` | Ejemplos y piezas de interfaz |
| `tests/` | Ciclo de ida y vuelta, intérprete, layout |

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

## Pruebas

152 pruebas, sin dependencias del navegador:

- **Ida y vuelta**: sobre 16 algoritmos, `parse → print → parse` devuelve el
  mismo árbol, imprimir es idempotente y los ids no se repiten. Es la red de
  seguridad más importante: si esto se rompe, la sincronización entre vistas
  corrompe el trabajo del alumno.
- **Intérprete**: entrada/salida, control de flujo, arreglos y matrices,
  precedencia, cortocircuito, funciones internas, y los errores de ejecución
  (división entre cero, índice fuera de rango, ciclo infinito).
- **Layout**: ningún símbolo se solapa con otro, todo cae dentro del lienzo, el
  resultado es determinista y cada sentencia tiene su símbolo.

---

## Pendiente antes de liberar

- Probar en un Android y un iPhone **reales**, instalando desde la pantalla de
  inicio, en modo avión, y comprobando que los datos sobreviven varios días.
- Sustituir los iconos PNG de relleno de `public/` por los definitivos.
- Cambiar el `<textarea>` por CodeMirror 6, necesario para bloquear el
  portapapeles dentro del editor (fase 6).
