/**
 * Genera la llave que viene incluida con la app.
 *
 * Escribe dos cosas:
 *
 *   src/crypto/llave-del-curso.ts        la PÚBLICA, que se compila dentro de
 *                                        la app y sí se sube al repositorio.
 *   llaves-profesor/…-PRIVADA-….json     la PRIVADA, que NO se sube nunca y que
 *                                        hay que respaldar a mano.
 *
 * ── Por qué la pública puede ir en el repositorio ───────────────────────────
 *
 * Porque es pública: sirve para *cifrar hacia* el profesor, no para descifrar.
 * Cualquiera puede tenerla sin que eso le permita leer nada. Es el mismo modelo
 * de cualquier sistema de llave pública.
 *
 * ── El riesgo real, que sí hay que entender ─────────────────────────────────
 *
 * Como el repositorio es público, quien lo clone y lo compile obtendrá esta
 * misma llave incluida, y sus alumnos estarían cifrando hacia el dueño de la
 * privada — no hacia él. Cualquiera que reutilice el proyecto para su propio
 * curso debe correr este script y generar la suya.
 *
 * Uso:
 *    node scripts/generar-llave-del-curso.mjs "Algoritmos 2026"
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto } from 'node:crypto';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CARPETA_PRIVADA = join(RAIZ, 'llaves-profesor');
const MODULO_PUBLICO = join(RAIZ, 'src', 'crypto', 'llave-del-curso.ts');

const etiqueta = (process.argv[2] ?? 'Llave incluida con la app').trim();

/** Misma huella corta que muestra la app, para poder compararlas de un vistazo. */
async function huella(jwk) {
   const material = new TextEncoder().encode(`${jwk.x ?? ''}.${jwk.y ?? ''}`);
   const hash = await crypto.subtle.digest('SHA-256', material);
   const b64 = Buffer.from(hash).toString('base64');
   const texto = b64.replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase();
   return texto.match(/.{1,4}/g).join('-');
}

const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
   'deriveBits',
   'deriveKey',
]);

const publicaJwk = await crypto.subtle.exportKey('jwk', par.publicKey);
const privadaJwk = await crypto.subtle.exportKey('jwk', par.privateKey);
const marca = await huella(publicaJwk);
const creada = new Date().toISOString();

// -- La privada, fuera del repositorio ---------------------------------------

mkdirSync(CARPETA_PRIVADA, { recursive: true });

const nombreArchivo = `rflowp-llave-PRIVADA-${etiqueta.replace(/\W+/g, '_')}.json`;
const rutaPrivada = join(CARPETA_PRIVADA, nombreArchivo);

if (existsSync(rutaPrivada)) {
   console.error(
      `\n  Ya existe ${nombreArchivo}.\n\n` +
         '  Sobrescribirla dejaría ilegibles todas las entregas hechas con la\n' +
         '  llave anterior. Muévela o renómbrala si de verdad quieres una nueva.\n',
   );
   process.exit(1);
}

writeFileSync(
   rutaPrivada,
   JSON.stringify(
      { tipo: 'rflowp/llave-profesor', clase: 'privada', etiqueta, creada, jwk: privadaJwk },
      null,
      2,
   ),
);

// También la pública como archivo, por si se quiere repartir a mano.
writeFileSync(
   join(CARPETA_PRIVADA, `rflowp-llave-publica-${etiqueta.replace(/\W+/g, '_')}.json`),
   JSON.stringify(
      { tipo: 'rflowp/llave-profesor', clase: 'publica', etiqueta, creada, jwk: publicaJwk },
      null,
      2,
   ),
);

// -- La pública, dentro de la app --------------------------------------------

const modulo = `/**
 * Llave del curso incluida con la app.
 *
 * GENERADO por \`scripts/generar-llave-del-curso.mjs\`. No se edita a mano.
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
 * ⚠️ Si reutilizas este proyecto para TU curso, genera la tuya:
 *
 *       node scripts/generar-llave-del-curso.mjs "Nombre de tu curso"
 *
 *    Si no lo haces, tus alumnos estarían cifrando hacia el dueño de la llave
 *    privada de este repositorio, no hacia ti.
 */

import type { ArchivoLlaveProfesor } from './llaves';

export const LLAVE_INCLUIDA: ArchivoLlaveProfesor = {
   tipo: 'rflowp/llave-profesor',
   clase: 'publica',
   etiqueta: ${JSON.stringify(etiqueta)},
   creada: ${JSON.stringify(creada)},
   jwk: ${JSON.stringify(publicaJwk, null, 6).replace(/\n/g, '\n   ')},
};

/** Huella de la llave incluida, para mostrarla y compararla. */
export const HUELLA_INCLUIDA = ${JSON.stringify(marca)};
`;

writeFileSync(MODULO_PUBLICO, modulo);

// -- Informe -----------------------------------------------------------------

console.log(`\n  Llave del curso generada: «${etiqueta}»`);
console.log(`  Huella: ${marca}\n`);
console.log('  PÚBLICA  → src/crypto/llave-del-curso.ts   (se compila en la app)');
console.log(`  PRIVADA  → llaves-profesor/${nombreArchivo}`);
console.log('\n  ⚠️  La carpeta llaves-profesor/ está en .gitignore y NO se sube.');
console.log('     Cópiala HOY a dos lugares seguros: si la pierdes, ninguna');
console.log('     entrega cifrada con esta llave se podrá volver a abrir.\n');
