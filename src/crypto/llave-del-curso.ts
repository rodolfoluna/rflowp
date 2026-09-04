/**
 * Llave del curso incluida con la app.
 *
 * GENERADO por `scripts/generar-llave-del-curso.mjs`. No se edita a mano.
 *
 * Es la llave PÚBLICA del profesor: sirve para cifrar hacia él, no para
 * descifrar nada. Puede estar en el repositorio sin riesgo, igual que cualquier
 * llave pública.
 *
 * Existe para que la app sea útil desde el primer momento: sin ella, un alumno
 * que guarde antes de importar la llave de su profesor produce archivos que
 * nadie más podrá abrir. Con ella, todo funciona desde el primer arranque.
 *
 * El profesor puede sustituirla en cualquier momento generando la suya desde
 * «Llave del curso», y a partir de ahí manda la importada.
 *
 * ⚠️ Cada despliegue necesita su propia llave:
 *
 *       node scripts/generar-llave-del-curso.mjs "Nombre del curso"
 *
 *    Conservar esta hace que los alumnos cifren hacia el titular de SU parte
 *    privada. Si no es quien recibe las entregas, no podrá abrirlas.
 */

import type { ArchivoLlaveProfesor } from './llaves';

export const LLAVE_INCLUIDA: ArchivoLlaveProfesor = {
   tipo: 'rflowp/llave-profesor',
   clase: 'publica',
   etiqueta: "RFlowP — curso de ejemplo",
   creada: "2026-09-04T01:59:44.964Z",
   jwk: {
         "key_ops": [],
         "ext": true,
         "kty": "EC",
         "x": "o3Rvb26J4a_iW6mT7FkFRaH1RGTPZ5cprBmtqN9xMhQ",
         "y": "qSIKHyUeIbEf87UuNAMU7pqjK7SAGkY5mLYt_AmLfLw",
         "crv": "P-256"
   },
};

/** Huella de la llave incluida, para mostrarla y compararla. */
export const HUELLA_INCLUIDA = "YXLZ-XGF2-CPBC";
