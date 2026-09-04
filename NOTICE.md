# Avisos de terceros

El texto completo y vigente está en **[`public/AVISOS.txt`](public/AVISOS.txt)**,
que se distribuye con la aplicación compilada y es alcanzable desde la pantalla
**Acerca de**. Este archivo solo resume; si algo discrepa, manda aquel.

Se mantiene ahí y no aquí porque las licencias MIT y BSD-3 exigen que el aviso
acompañe a la **distribución**, y lo que se distribuye es la app, no el
repositorio.

| Componente | Licencia | Se distribuye |
|---|---|---|
| [Svelte](https://svelte.dev) | MIT | Sí, en la app |
| [Workbox](https://developer.chrome.com/docs/workbox) | MIT | Sí, en el service worker |
| [PseudoFlow](https://github.com/talamantesvictor/pseudoflow) | BSD 3-Clause | Material adaptado |
| Vite, TypeScript, Vitest, Sass… | Varias permisivas | No |

## PseudoFlow

RFlowP partió de PseudoFlow, de Victor Talamantes. **No se reutilizó su código
fuente:** el analizador, el intérprete, la disposición del diagrama y el
renderizado están escritos de cero y sobre una arquitectura distinta (un AST
compartido con edición en las dos direcciones, que el original no tiene).

Lo que sí se tomó, y por lo que se conserva el aviso BSD-3 en
[`LICENSE.pseudoflow`](LICENSE.pseudoflow):

- la paleta y las proporciones de los símbolos ANSI;
- el planteamiento general de la interfaz de dos vistas sincronizadas.

La BSD 3-Clause permite expresamente el uso dentro de un producto de código
cerrado siempre que se conserve el aviso de copyright.

Ni Victor Talamantes ni los colaboradores de PseudoFlow respaldan este proyecto
ni están asociados a él.

## PSeInt

RFlowP implementa un dialecto de pseudocódigo compatible con el de PSeInt para
que la experiencia previa de los alumnos siga sirviendo, pero **no contiene
código de PSeInt ni deriva de él**. PSeInt está escrito en C++ y se distribuye
bajo GPLv2; ninguna parte de ese proyecto se ha copiado, portado ni enlazado.

La compatibilidad se limita a las palabras clave y la sintaxis del lenguaje,
escritas desde cero en `src/core/lexer.ts` y `src/core/parser.ts`.

## Licencia de RFlowP

El código propio se rige por [`LICENSE`](LICENSE): todos los derechos
reservados. Esa reserva **no** alcanza a los componentes de arriba, que
conservan sus licencias íntegras.
