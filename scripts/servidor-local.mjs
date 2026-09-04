/**
 * Servidor HTTPS para la red local del aula.
 *
 * Sirve la carpeta `dist/` por HTTPS a todos los aparatos de la red, para poder
 * instalar la app sin internet. Sin dependencias: solo Node.
 *
 * ── Por qué HTTPS y no HTTP ─────────────────────────────────────────────────
 *
 * No es una manía. El cifrado (`crypto.subtle`), el guardado de archivos (OPFS)
 * y el service worker exigen «contexto seguro», y por HTTP plano sencillamente
 * no existen. La app cargaría a medias y fallaría al guardar. La única dirección
 * que el navegador acepta sin cifrar es `http://localhost`, que solo sirve en
 * esta misma computadora.
 *
 * ── Por qué hace falta un certificado que los teléfonos crean ────────────────
 *
 * Un certificado autofirmado hace que el navegador muestre la pantalla roja de
 * advertencia. En una computadora puedes darle a «continuar» y ver la app, pero
 * **el service worker no se registra en una página con error de certificado**, y
 * sin service worker no hay instalación ni funcionamiento sin conexión. Es
 * decir: con autofirmado se ve la app, pero no se puede instalar, que es justo
 * lo que se quería.
 *
 * Por eso el camino recomendado es `mkcert`, que crea una autoridad local y
 * emite certificados que los aparatos sí aceptan — después de instalar esa
 * autoridad en cada uno.
 *
 * Uso:
 *    node scripts/servidor-local.mjs
 *    node scripts/servidor-local.mjs --puerto 8443
 */

import { createServer } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CARPETA_PUBLICA = join(RAIZ, 'dist');
const CARPETA_CERTS = join(RAIZ, 'certs');

const PUERTO = Number(leerArgumento('--puerto') ?? 8443);

const TIPOS = {
   '.html': 'text/html; charset=utf-8',
   '.js': 'text/javascript; charset=utf-8',
   '.mjs': 'text/javascript; charset=utf-8',
   '.css': 'text/css; charset=utf-8',
   '.json': 'application/json; charset=utf-8',
   '.webmanifest': 'application/manifest+json; charset=utf-8',
   '.svg': 'image/svg+xml',
   '.png': 'image/png',
   '.jpg': 'image/jpeg',
   '.webp': 'image/webp',
   '.woff2': 'font/woff2',
   '.ico': 'image/x-icon',
};

function leerArgumento(nombre) {
   const i = process.argv.indexOf(nombre);
   return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Direcciones IPv4 de esta computadora en la red local. */
function direccionesLocales() {
   const salida = [];
   for (const interfaces of Object.values(networkInterfaces())) {
      for (const dir of interfaces ?? []) {
         if (dir.family === 'IPv4' && !dir.internal) salida.push(dir.address);
      }
   }
   return salida;
}

function abortar(mensaje) {
   console.error(`\n  ${mensaje}\n`);
   process.exit(1);
}

// ---------------------------------------------------------------------------
// Comprobaciones antes de arrancar
// ---------------------------------------------------------------------------

if (!existsSync(CARPETA_PUBLICA)) {
   abortar(
      'No existe la carpeta dist/. Construye la app primero:\n\n' +
         '     npm run build\n\n' +
         '  Y recuerda que la dirección desde la que sirvas la app queda\n' +
         '  atada a los datos de tus alumnos: si mañana la sirves desde otra,\n' +
         '  aparecerán como nuevos y perderán lo que guardaron.',
   );
}

const rutaCert = join(CARPETA_CERTS, 'cert.pem');
const rutaLlave = join(CARPETA_CERTS, 'key.pem');

if (!existsSync(rutaCert) || !existsSync(rutaLlave)) {
   const ips = direccionesLocales();
   const ip = ips[0] ?? '192.168.1.100';

   abortar(
      'Faltan los certificados en certs/.\n\n' +
         '  RECOMENDADO — con mkcert, para que los teléfonos puedan INSTALAR la app:\n\n' +
         '     1. Instala mkcert:  https://github.com/FiloSottile/mkcert\n' +
         '     2. mkcert -install\n' +
         `     3. mkcert -cert-file certs/cert.pem -key-file certs/key.pem ${ips.join(' ') || ip} localhost\n` +
         '     4. Instala la autoridad de mkcert en cada aparato (mkcert -CAROOT\n' +
         '        te dice dónde está el archivo rootCA.pem que hay que copiarles).\n\n' +
         '  RÁPIDO — autofirmado con openssl, solo para ver la app, NO para instalarla:\n\n' +
         '     npm run certificados\n\n' +
         '  La diferencia importa: con autofirmado el navegador marca la página como\n' +
         '  insegura y el service worker no se registra, así que la app se ve pero no\n' +
         '  se puede instalar ni funciona sin conexión.',
   );
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

const credenciales = {
   cert: await readFile(rutaCert),
   key: await readFile(rutaLlave),
};

/** Resuelve una URL a un archivo dentro de dist/, sin dejar escapar de ahí. */
async function resolverArchivo(url) {
   const sinConsulta = decodeURIComponent(url.split('?')[0]);
   // `normalize` colapsa los `..`; comprobar el prefijo después impide que una
   // petición como /../../etc/passwd salga de la carpeta publicada.
   const relativa = normalize(sinConsulta).replace(/^([/\\])+/, '');
   const destino = join(CARPETA_PUBLICA, relativa);

   if (!destino.startsWith(CARPETA_PUBLICA)) return null;

   try {
      const info = await stat(destino);
      if (info.isDirectory()) return join(destino, 'index.html');
      return destino;
   } catch {
      return null;
   }
}

const servidor = createServer(credenciales, async (peticion, respuesta) => {
   const url = peticion.url ?? '/';
   let archivo = await resolverArchivo(url);

   // La app es de una sola página: cualquier ruta desconocida cae en el shell.
   if (!archivo) archivo = join(CARPETA_PUBLICA, 'index.html');

   try {
      const contenido = await readFile(archivo);
      const tipo = TIPOS[extname(archivo)] ?? 'application/octet-stream';

      const cabeceras = { 'Content-Type': tipo };

      // El service worker nunca debe quedarse cacheado: si el navegador se
      // queda con uno viejo, los alumnos no reciben las actualizaciones.
      if (archivo.endsWith('sw.js') || archivo.endsWith('index.html')) {
         cabeceras['Cache-Control'] = 'no-cache';
      }

      respuesta.writeHead(200, cabeceras);
      respuesta.end(contenido);
   } catch {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      respuesta.end('No encontrado');
   }
});

servidor.on('error', (e) => {
   if (e.code === 'EADDRINUSE') {
      abortar(
         `El puerto ${PUERTO} ya está ocupado.\n\n` +
            `     node scripts/servidor-local.mjs --puerto 8444`,
      );
   }
   abortar(`No se pudo arrancar: ${e.message}`);
});

servidor.listen(PUERTO, '0.0.0.0', () => {
   const ips = direccionesLocales();

   console.log('\n  RFlowP — servidor del aula\n');
   console.log(`  En esta computadora:   https://localhost:${PUERTO}`);

   if (ips.length === 0) {
      console.log('\n  Sin red local detectada: solo se puede abrir desde aquí.');
   } else {
      console.log('\n  Desde los aparatos de la red:');
      for (const ip of ips) console.log(`     https://${ip}:${PUERTO}`);
   }

   console.log('\n  Todos deben estar en la MISMA red wifi que esta computadora.');
   console.log('  Para detenerlo:  Ctrl+C\n');
});
