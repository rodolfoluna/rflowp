# RFlowP

App educativa para diseñar algoritmos en **pseudocódigo** o en **diagrama de
flujo ANSI**, ejecutarlos y guardarlos. Instalable como PWA en Android, iOS y PC.

**▶ [rodolfoluna.github.io/rflowp](https://rodolfoluna.github.io/rflowp/)**

Cada cambio en `main` se publica solo, y no se publica si fallan las pruebas.

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

Queda todo en `dist/`: archivos estáticos, sin servidor de aplicaciones ni base
de datos. Si la app va a vivir en una **subcarpeta** (GitHub Pages en un
repositorio normal), hay que decirlo al construir, o el manifiesto apuntará a la
raíz y el navegador se negará a instalar la PWA:

```bash
RFLOWP_BASE=/rflowp/ npm run build
```

El manual completo —dónde alojarla, cómo la instala cada sistema, y por qué las
tiendas de aplicaciones casi nunca compensan— está en
[`docs/manual-de-distribucion.html`](docs/manual-de-distribucion.html).

### Servidor para un aula sin internet

```bash
npm run servidor
```

Sirve `dist/` por HTTPS a toda la red local. Necesita certificados en `certs/`;
el script explica al arrancar cómo generarlos, con las IP de la máquina ya
puestas en el comando.

**El detalle que decide si sirve de algo:** con un certificado autofirmado
(`npm run certificados`) la app **se ve pero no se puede instalar**, porque el
service worker no se registra en una página con error de certificado. Para que
los alumnos la instalen de verdad hace falta [mkcert](https://github.com/FiloSottile/mkcert)
y añadir su autoridad a cada aparato.

Casi siempre sale más barato que instalen la app una vez desde la dirección
pública y después el laboratorio esté sin internet todo el semestre.

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
| `src/edit/` | `mutaciones.ts`, `documento.svelte.ts`, `cuaderno.svelte.ts`, paleta e inspectores |
| `src/identity/` | Identidad del alumno, bienvenida y borrado de datos |
| `src/crypto/` | Sobre cifrado, llaves y panel del profesor |
| `src/guard/` | Guardas del portapapeles y bitácora de edición |
| `src/teacher/` | Detección de copias y panel de revisión de lote |
| `src/file/` | Formatos `.algx` y `.algxp`, almacenes, biblioteca y transferencia |
| `src/ui/` | Ejemplos, menú, tema y piezas de interfaz |
| `docs/` | Instructivos de una página y manual de distribución |
| `tests/` | Ciclo de ida y vuelta, intérprete, layout, mutaciones, documento, cuaderno, plantillas, comentarios |

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
  aunque no compile — y un árbol no puede representar código a medias. El
  borrador guarda **todos** los ejercicios del cuaderno y cuál estaba activo.
- **El `Cuaderno` reutiliza un `Documento` por ejercicio.** `Documento` ya
  resuelve lo difícil —sincronización texto↔árbol, deshacer, conservar el último
  árbol válido— y está probado; rehacerlo habría tirado esa cobertura. Como
  efecto, **deshacer es por ejercicio**, que es lo que el alumno espera.
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
| `sobre` | el cuaderno y sus bitácoras, cifrados | Solo lo abren el autor y el profesor |

**Un archivo es un cuaderno, no un algoritmo suelto** (`algx/2`). Dentro van
varios `Ejercicio`, cada uno con su programa y su propia bitácora. Una tarea de
ocho ejercicios se entrega una vez y el profesor recibe una entrega por alumno
en lugar de ocho.

`algx/2` no lee los `algx/1`. No se escribió migrador porque no llegó a haber
entregas con el formato anterior, y una ruta de migración para archivos que no
existen es código difícil de probar y fácil de romper: `deserializar` los rechaza
con un mensaje claro.

### Plantillas: el formato `.algxp`

La tarea que el profesor reparte al grupo. **Va sin cifrar y sin firma**: la lee
todo el grupo, y el enunciado de una tarea es público por naturaleza. Lo que se
protege es la solución, que viaja en el `.algx` de cada alumno.

Su razón de ser es el enlace: al importarla, cada ejercicio del cuaderno queda
con un `origenId` que apunta al de la plantilla. Es lo que permite comparar el
ejercicio 3 de Ana con el 3 de Luis **aunque los dos lo renombren**, que era el
problema al revisar un lote.

El cuaderno guarda además la `huella` de los enunciados originales. El panel la
recalcula sobre lo entregado y marca «otro enunciado» si no coincide, sin
necesitar el archivo de la plantilla a mano. Un alumno decidido podría
recalcularla —todo está dentro de su propio sobre—, pero alterar el enunciado no
le sirve para copiar: la señal distingue al despistado, no al tramposo.

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

### La llave incluida con la app

La app trae una llave pública compilada dentro
(`src/crypto/llave-del-curso.ts`), para que **funcione desde el primer
arranque**: sin ella, un alumno que guarda antes de recibir la llave de su
profesor produce archivos que nadie más podrá abrir.

Es una llave **pública**: sirve para cifrar hacia el profesor, no para
descifrar. Estar en el repositorio no la debilita.

> ⚠️ **Cada despliegue necesita su propia llave.**
>
> ```bash
> node scripts/generar-llave-del-curso.mjs "Nombre del curso"
> ```
>
> Conservar la llave incluida hace que los alumnos cifren hacia el titular de
> *su* parte privada. Si no es quien recibe las entregas, no podrá abrirlas.

El script escribe la pública en `src/crypto/` y la privada en
`llaves-profesor/`, que está en `.gitignore` y **nunca se sube**. La llave que
el profesor importe a mano sustituye a la incluida.

### Cómo se reparte la llave del curso

1. El profesor entra en **Llave del curso → Generar el par**, lo que reemplaza
   la llave incluida por la suya. Se descargan dos
   archivos: la **pública**, que reparte, y la **privada**, que guarda él.
2. Los alumnos importan la pública una vez, al principio del curso.
3. Ambos ven la misma **huella** (`MMTJ-DKNN-SJCD`), fácil de dictar en voz alta
   para confirmar que todos tienen la llave correcta.

Gracias a la llave incluida, un alumno que empieza antes de importar la de su
curso no produce archivos huérfanos: quedan cifrados hacia la llave que trae la
app. Aun así, hasta que importe la del curso, su profesor no podrá abrirlos.

## Revisar entregas

Con la llave privada cargada aparece **Revisar entregas** en el menú. Importa un
lote entero de `.algx` de una vez y muestra:

- Los **grupos para revisar**, primero, con el motivo de cada señal y a qué
  ejercicio de quién corresponde: «Ana · Promedio ↔ Luis · ejercicio 2».
- Una fila **por entrega**, con el resumen del cuaderno: cuántos ejercicios
  tienen contenido, tiempo total, sesiones y si la firma cuadra. Se despliega a
  una fila por ejercicio con su propia evidencia.

Agrupado y no plano porque un grupo de 30 alumnos con 8 ejercicios son 240
algoritmos: escanear 30 filas y desplegar la que interese es manejable; 240
filas seguidas no dejan ver cómo le fue a un alumno concreto.

La unidad de comparación es el **ejercicio**, no la entrega: comparar cuadernos
enteros solo detectaría a quien copió los ocho.

Sobre el tono: la interfaz dice «revisar», nunca «copia». Los umbrales de la
bitácora son **deliberadamente laxos** — es preferible dejar pasar una copia que
señalar a quien sí trabajó — y los algoritmos de menos de 6 sentencias no se
comparan nunca, porque «lee dos números y súmalos» sale igual en todo el grupo.

El tiempo se cuenta solo con la app **visible y con el foco**: si contara con la
pestaña en segundo plano, dejar la app abierta toda la tarde inflaría la cifra y
la volvería inútil como evidencia.

## Pruebas

306 pruebas, sin dependencias del navegador:

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
- **Llave incluida**: es una pública válida, sirve para cifrar, **no contiene
  la parte privada** (una prueba lo comprueba explícitamente, para que nadie
  pegue ahí una privada por descuido), y la que el profesor importe la sustituye.
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
   Reparte también [`docs/instructivo-alumnos.html`](docs/instructivo-alumnos.html);
   está pensado para imprimirse en una hoja.
4. **Decir en clase que no hay recuperación por la vía del alumno**: si pierde
   el teléfono, el profesor es quien puede devolverle su trabajo.
5. Sustituir los iconos PNG de relleno de `public/`.

Las dos hojas de [`docs/`](docs/) están hechas para imprimirse: la del alumno en
verde y la del profesor en violeta, para que no se repartan cambiadas. El
[manual de distribución](docs/manual-de-distribucion.html) va en azul y **no se
reparte**: es para quien publica la app.

Dos avisos del manual que conviene no descubrir tarde:

- **Sin HTTPS la app no funciona.** El cifrado, el almacenamiento de archivos y
  el modo sin conexión lo exigen. Una IP de la red local por `http://` no sirve.
- **La dirección es la identidad.** Los datos del alumno viven atados al origen
  exacto. Cambiar de dominio después de repartirlo deja a todo el grupo sin
  acceso a lo que guardó.

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
- La comparación de algoritmos es exacta sobre la forma: detecta renombrados y
  cambios de mensaje, pero no una reescritura parcial. Un alumno que cambie el
  orden de dos sentencias independientes ya no coincide.

---

## Licencia

**© 2026 Rodolfo Luna. Todos los derechos reservados.** Ver [`LICENSE`](LICENSE).

El código está a la vista para consulta y auditoría, no para reutilización. Que
el repositorio sea público no lo hace de uso libre: sin licencia expresa, los
derechos quedan reservados. Para usarlo en otra institución hay que pedir
permiso, y la respuesta puede perfectamente ser que sí.

Esa reserva cubre solo el código propio. Los componentes de terceros conservan
sus licencias íntegras y **no** quedan restringidos por ella:

| Componente | Licencia | Dónde |
|---|---|---|
| Svelte | MIT | Incluido en la app |
| Workbox | MIT | Incluido en el service worker |
| PseudoFlow | BSD 3-Clause | Paleta y símbolos ANSI adaptados |

Las tres exigen que su aviso de copyright acompañe a la distribución, así que
[`public/AVISOS.txt`](public/AVISOS.txt) viaja con la app compilada y es
alcanzable desde la pantalla **Acerca de**. Tenerlo solo en el repositorio no
cumpliría: lo que se distribuye es la aplicación.

Las herramientas de compilación (Vite, TypeScript, lightningcss…) no llegan al
aparato del usuario y por eso no generan obligaciones de distribución.

**Sobre PSeInt:** RFlowP implementa un dialecto compatible con el suyo para que
la experiencia previa de los alumnos siga sirviendo, pero **no contiene código
de PSeInt ni deriva de él**. PSeInt es C++ bajo GPLv2; nada de ese proyecto se
ha copiado, portado ni enlazado. La compatibilidad se limita a las palabras
clave del lenguaje, escritas de cero en el analizador.
