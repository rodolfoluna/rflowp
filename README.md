# RFlowP

App educativa para diseñar algoritmos en **pseudocódigo** o en **diagrama de
flujo ANSI**, ejecutarlos y guardarlos. Instalable como PWA en Android, iOS y PC.

Deriva de [PseudoFlow](https://github.com/talamantesvictor/pseudoflow) (BSD-3);
ver [`NOTICE.md`](NOTICE.md).

---

## Qué protege esto de verdad, y qué no

Conviene que el profesor lo entienda con precisión antes de apoyarse en ello.

**Lo que sí es sólido**, porque es criptografía estándar:

- Un alumno **no puede abrir el archivo de otro**. Cada archivo se cifra con una
  llave nueva, envuelta con la llave maestra del autor —que es *no exportable*:
  ni desde las herramientas del navegador se puede copiar a otro dispositivo—.
- El **profesor abre cualquier entrega** de su curso, con su llave privada.
- **Borrar los datos deja los archivos ilegibles para el alumno**, y de forma
  irreversible: volver a escribir el mismo nombre y número de control no
  recupera nada, porque la llave se destruyó.
- **Alterar un archivo se detecta**: tocar el texto cifrado impide abrirlo, y
  tocar el encabezado (nombre, número de control, fechas) invalida la firma.

**Lo que NO protege**, y hay que decirlo:

- Nadie puede impedir **fotografiar la pantalla y retranscribir a mano**.
- La firma **no es una identidad verificada**: la llave pública viaja dentro del
  propio archivo y no hay ninguna autoridad que ate un número de control a una
  llave. Quien entienda el formato puede fabricar un archivo con el nombre que
  quiera. Es tamper-evidence y trazabilidad, no autenticación.
- El bloqueo de copiar/pegar es **fricción, no una barrera**: quien sepa abrir
  las herramientas del navegador lo desactiva en un minuto.

**Dónde está el valor real contra la copia:** en la *trazabilidad*, y son dos
señales distintas.

1. **Misma instalación.** Cada archivo lleva la huella de la llave de firma del
   dispositivo que lo creó. Dos entregas con la misma huella y distinto nombre
   salieron del mismo teléfono. Es difícil de esquivar sin entender el formato.
2. **Mismo algoritmo.** Se compara la *forma* del código ignorando los nombres
   de las variables, los mensajes, el nombre del proceso, los paréntesis de más
   y los comentarios — es decir, ignorando todo lo que cambia quien transcribe
   a mano. Esto atrapa justo lo que el cifrado no puede evitar.

Y una tercera señal, más débil: la **bitácora**. Un trabajo escrito de verdad
acumula minutos y cientos de ediciones en varias sesiones; uno transcrito de un
tirón, no.

**Si necesitas subir la barrera**, la build de escritorio con Tauri y las
herramientas de desarrollo deshabilitadas es la opción barata. La ofuscación del
bundle tiene rendimientos decrecientes y cuesta accesibilidad.

---

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Andamiaje, PWA instalable y offline, interfaz responsiva | **Hecho** |
| 1 | AST, lexer/parser PSeInt, printer, intérprete paso a paso | **Hecho** |
| 2 | Layout determinista y diagrama SVG con pan/zoom | **Hecho** |
| 3 | Edición gráfica bidireccional (puntos `+`, paleta, editor de expresiones) | **Hecho** |
| 4 | Identidad local, OPFS, guardar/cargar `.algx` | **Hecho** |
| 5 | Cifrado y modo profesor | **Hecho** |
| 6 | Anti-copia, bitácora y revisión de entregas | **Hecho** |

Ahora mismo la app **edita en las dos direcciones**: se escribe pseudocódigo y
el diagrama se redibuja, o se arma el diagrama tocando símbolos y el
pseudocódigo se regenera. Ejecuta, guarda en el dispositivo, y **cifra** lo que
exporta de modo que solo el alumno y su profesor puedan abrirlo.

Las seis fases del plan están hechas. Lo que falta antes de usarla en un curso
es probarla **en teléfonos reales** (ver el final de este documento).

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
| `src/identity/` | Identidad del alumno, bienvenida y borrado de datos |
| `src/crypto/` | Sobre cifrado, llaves y panel del profesor |
| `src/guard/` | Guardas del portapapeles y bitácora de edición |
| `src/teacher/` | Detección de copias y panel de revisión de lote |
| `src/file/` | Formato `.algx`, almacenes, biblioteca y transferencia |
| `src/ui/` | Ejemplos, menú y piezas de interfaz |
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
- **El almacenamiento se define como interfaz, no como llamada directa.**
  IndexedDB y OPFS no existen en Node; sin `AlmacenIdentidad` y
  `AlmacenArchivos` con implementaciones en memoria, toda la lógica de guardado
  quedaría sin pruebas, que es justo donde un error le cuesta al alumno su trabajo.
- **El borrador se guarda como texto, no como árbol.** Lo que hay que recuperar
  tras un cierre accidental es exactamente lo que el alumno tenía escrito,
  aunque no compile — y un árbol no puede representar código a medias.
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

## Identidad y archivos

- En el primer arranque se piden **número de control y nombre**. No hay cuenta
  ni servidor: quedan en el dispositivo y viajan dentro de cada `.algx`.
- El número de control se acepta con el formato de cualquier escuela (letras y
  dígitos, 4 a 20 caracteres); casarse con un formato dejaría la app inservible
  para otra institución.
- El `deviceId` es aleatorio y **no se deriva** del número de control: si se
  derivara, conocer el número de un compañero bastaría para rehacer su identidad.
  Es además lo que delata dos entregas salidas del mismo dispositivo.
- Los algoritmos se guardan en **OPFS**, con nombre de archivo aleatorio y el
  título dentro: así renombrar no mueve archivos ni pisa otro que se llame igual.
- **Borrador automático**: el trabajo en curso se guarda cada 1,2 s y se
  recupera al volver a abrir, aunque tenga errores de sintaxis.
- **Borrar mis datos** exige escribir `BORRAR`, dice exactamente qué se pierde y
  —hoy— advierte con honestidad que los `.algx` ya exportados **no** están
  protegidos. Ese texto cambia cuando exista el cifrado.
- Exportar no obliga a guardar antes: construye el archivo al vuelo, porque es
  el paso que el alumno olvidaría justo al entregar.

### El formato `.algx`

Contenedor JSON con dos partes:

| Parte | Contenido | Por qué |
|---|---|---|
| encabezado | autor, `deviceId`, título, fechas, versión | Siempre en claro: el profesor ordena un lote y detecta duplicados sin descifrar nada. Va **cubierto por la firma**, así que alterarlo se nota |
| `sobre` | el AST y la bitácora, cifrados | Solo lo abren el autor y el profesor |

Se siguen leyendo los archivos `alg: "ninguno"` de versiones anteriores, para
que nadie pierda a mitad de curso lo que ya tenía hecho.

## Cifrado

```
        CEK aleatoria (AES-GCM 256, nueva en cada guardado)
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
 cifra el AST      se envuelve DOS veces
                     │              │
        AES-KW(llave del alumno)   ECIES(pública del profesor)
                     │              │
              abre el autor    abre el profesor
```

Envolver la llave dos veces, en vez de cifrar el contenido dos veces, mantiene
el archivo pequeño y haría trivial añadir más destinatarios (un segundo profesor,
por ejemplo) sin tocar el formato.

| Llave | Dónde vive | Exportable | Por qué |
|---|---|---|---|
| Maestra del alumno (AES-KW) | IndexedDB | **No** | Impide copiar la identidad a otro dispositivo o prestársela a un compañero |
| Firma del alumno (ECDSA P-256) | IndexedDB | **No** | Su pública va en cada archivo y es la huella que enlaza entregas |
| Del profesor (ECDH P-256) | Archivo + IndexedDB | **Sí** | Tiene que poder respaldarla; sin respaldo, perder el equipo es perder el curso |

**No hay frase de respaldo para el alumno, a propósito**: una frase que se puede
guardar es una frase que se puede prestar, y con ella se prestaría la identidad
entera. La autoridad de recuperación es el profesor, que puede abrir cualquier
entrega y devolvérsela al alumno.

### Cómo se reparte la llave del curso

1. El profesor entra en **Llave del curso → Generar el par**. Se descargan dos
   archivos: la **pública**, que reparte, y la **privada**, que guarda él.
2. Los alumnos importan la pública una vez, al principio del curso.
3. Ambos ven la misma **huella** (`MMTJ-DKNN-SJCD`), fácil de dictar en voz alta
   para confirmar que todos tienen la llave correcta.

Si un alumno guarda **antes** de importar la llave, ese archivo solo lo podrá
abrir él: el profesor no. La app lo avisa en el menú y al exportar.

## Revisar entregas

Con la llave privada cargada aparece **Revisar entregas** en el menú. Importa un
lote entero de `.algx` de una vez y muestra:

- Los **grupos para revisar**, primero, con el motivo de cada señal.
- Una tabla con la evidencia de cada trabajo: tiempo activo, sesiones,
  ediciones, intentos de pegar bloqueados, y si la firma cuadra.

Sobre el tono: la interfaz dice «revisar», nunca «copia». Los umbrales de la
bitácora son **deliberadamente laxos** — es preferible dejar pasar una copia que
señalar a quien sí trabajó — y los algoritmos de menos de 6 sentencias no se
comparan nunca, porque «lee dos números y súmalos» sale igual en todo el grupo.

El tiempo se cuenta solo con la app **visible y con el foco**: si contara con la
pestaña en segundo plano, dejar la app abierta toda la tarde inflaría la cifra y
la volvería inútil como evidencia.

## Pruebas

302 pruebas, sin dependencias del navegador:

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
- **Identidad**: se aceptan formatos de varias escuelas, se normaliza el número
  de control, y dos identidades con el mismo número tienen `deviceId` distinto.
- **Formato y biblioteca**: el ciclo guardar/leer conserva todo, sobrescribir no
  reinicia la fecha de creación, un archivo dañado no oculta a los demás, y el
  borrador conserva texto que no compila.
- **Criptografía** (`tests/cripto.test.ts`), que es donde se sostiene la promesa
  del proyecto: el alumno abre lo suyo; otro alumno **no** puede aunque tenga el
  archivo; el profesor abre todo; la llave de otro profesor no sirve; borrar los
  datos deja al alumno fuera y al profesor dentro; alterar el ciphertext impide
  abrir y alterar el encabezado invalida la firma; dos entregas de la misma
  instalación comparten huella; y el algoritmo no aparece en claro en el archivo.
- **Detección de copias**: renombrar variables, cambiar los mensajes, cambiar el
  nombre del proceso, añadir paréntesis o comentarios **no** disfraza el
  algoritmo; cambiar un operador o la estructura de control **sí** lo distingue.
  Y los falsos positivos que importan: no se señala a un alumno que entrega dos
  versiones de su propio trabajo, ni a dos que coinciden en un ejercicio trivial.
- **Bitácora**: el cronómetro cuenta con la app activa y no cuenta en segundo
  plano; el contador de pegados pertenece al documento y no a la sesión.

---

## Antes de usarla en un curso

Estos pasos no los sustituye ninguna prueba automática:

1. **Probar en un Android y un iPhone reales**, instalando desde la pantalla de
   inicio, en modo avión, y comprobando que los datos siguen ahí varios días
   después. OPFS e IndexedDB se comportan distinto en Safari, y el desalojo de
   datos de iOS solo se ve con el tiempo real pasando.
2. **Generar la llave del curso y respaldarla en dos lugares.** Si se pierde,
   ninguna entrega de ese curso se vuelve a abrir.
3. **Repartir la llave pública el primer día**, antes de que nadie trabaje. Un
   algoritmo guardado antes de importarla solo lo abre su autor.
4. **Decir en clase que no hay recuperación por la vía del alumno**: si pierde
   el teléfono, el profesor es quien puede devolverle su trabajo.
5. Sustituir los iconos PNG de relleno de `public/`.

## Pendiente antes de liberar

- El bloqueo del portapapeles también estorba a quien lo usa por necesidad
  (lectores de pantalla, teclados alternativos, dificultades motrices). Si algún
  alumno lo necesita, hay que poder desactivarlo para él; hoy no hay forma.
- Migrar el `<textarea>` a CodeMirror 6 si se quiere resaltado de sintaxis y
  marcas de error en el margen. **No hace falta para bloquear el portapapeles**,
  como se dijo antes por error: el evento `paste` de un `<textarea>` es
  cancelable y eso es todo lo que se necesita. Si se migra, hay que comprobar
  que escribir el texto desde el código **no** dispara su `oninput`: de eso
  depende que las dos vías de edición no se muerdan la cola.
- El inspector edita el primer valor de un `Escribir` con varias partes; el
  resto se editan desde el pseudocódigo. Falta la edición de la lista completa.
- El panel de lote del profesor todavía no marca los duplicados
  automáticamente: la huella ya se calcula y se guarda, pero hay que compararla
  a ojo. Es lo primero de la fase 6.
