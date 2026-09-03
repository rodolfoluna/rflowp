# Avisos de terceros

## PseudoFlow

RFlowP parte de [PseudoFlow](https://github.com/talamantesvictor/pseudoflow),
de Victor Talamantes, distribuido bajo licencia **BSD 3-Clause**. El texto
completo de esa licencia está en [`LICENSE.pseudoflow`](LICENSE.pseudoflow) y se
conserva tal cual, como exige la cláusula 1.

Qué se tomó del proyecto original:

- La **paleta y las proporciones de los símbolos ANSI** (terminador, proceso,
  datos, decisión), adaptadas de `src/lib/chart/symbols.ts`.
- El **modelo de consola** del intérprete y la separación entre analizador,
  graficador e interfaz.
- El planteamiento general de la interfaz de dos vistas y el andamiaje de
  internacionalización español/inglés.

Qué es propio de RFlowP y no viene de PseudoFlow:

- El núcleo entero (`src/core/`): AST con identidad de nodo, lexer y parser del
  dialecto **PSeInt**, printer e intérprete como generador. PseudoFlow usa su
  propia gramática (`print`, `read`, `declare`) y no expone un AST reutilizable.
- El **layout determinista** y el renderizador **SVG** (`src/chart/`), en lugar
  del graficador sobre Konva.
- La edición **bidireccional**, el empaquetado como **PWA**, la identidad local,
  el cifrado de archivos y el modo profesor.

Ni Victor Talamantes ni los colaboradores de PseudoFlow respaldan este proyecto
ni están asociados a él.
