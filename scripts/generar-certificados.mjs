/**
 * Certificado autofirmado para el servidor del aula.
 *
 * ⚠️ Esto es la opción RÁPIDA, no la buena. Un certificado autofirmado hace que
 * el navegador marque la página como insegura, y **en una página con error de
 * certificado el service worker no se registra**. Consecuencia práctica: la app
 * se ve, pero no se puede instalar ni funciona sin conexión, que es justo lo que
 * se quería del servidor del aula.
 *
 * Sirve para:
 *   · probar rápido desde otra computadora que la app carga;
 *   · salir del paso mientras consigues mkcert.
 *
 * Para que los alumnos puedan INSTALARLA de verdad, usa mkcert y añade su
 * autoridad a cada aparato. `npm run servidor` te da las instrucciones exactas
 * con las direcciones IP de esta computadora ya puestas.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CARPETA = join(RAIZ, 'certs');

function direccionesLocales() {
   const salida = [];
   for (const interfaces of Object.values(networkInterfaces())) {
      for (const dir of interfaces ?? []) {
         if (dir.family === 'IPv4' && !dir.internal) salida.push(dir.address);
      }
   }
   return salida;
}

try {
   execFileSync('openssl', ['version'], { stdio: 'ignore' });
} catch {
   console.error(
      '\n  No se encontró openssl.\n\n' +
         '  En Windows viene con Git para Windows: usa la terminal «Git Bash».\n' +
         '  En macOS y Linux normalmente ya está instalado.\n',
   );
   process.exit(1);
}

mkdirSync(CARPETA, { recursive: true });

const ips = direccionesLocales();

/*
 * Los navegadores modernos ignoran el «Common Name» y exigen que la dirección
 * esté en subjectAltName. Si el certificado no nombra la IP concreta desde la
 * que se abre la app, falla incluso aceptando la advertencia.
 */
const alternativos = [
   'DNS:localhost',
   'IP:127.0.0.1',
   ...ips.map((ip) => `IP:${ip}`),
].join(',');

const configuracion = `[req]
distinguished_name = dn
x509_extensions = ext
prompt = no

[dn]
CN = RFlowP servidor del aula

[ext]
subjectAltName = ${alternativos}
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
`;

const rutaConfig = join(CARPETA, 'openssl.cnf');
writeFileSync(rutaConfig, configuracion);

try {
   execFileSync(
      'openssl',
      [
         'req', '-x509',
         '-newkey', 'rsa:2048',
         '-nodes',
         '-days', '365',
         '-keyout', join(CARPETA, 'key.pem'),
         '-out', join(CARPETA, 'cert.pem'),
         '-config', rutaConfig,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
   );
} catch (e) {
   console.error(`\n  openssl falló:\n${e.stderr?.toString() ?? e.message}\n`);
   process.exit(1);
} finally {
   rmSync(rutaConfig, { force: true });
}

console.log('\n  Certificado autofirmado creado en certs/');
console.log(`  Válido para: localhost, 127.0.0.1${ips.length ? ', ' + ips.join(', ') : ''}`);
console.log('\n  Recuerda: con autofirmado la app se VE pero no se puede INSTALAR.');
console.log('  Para instalarla en los teléfonos hace falta mkcert. Arranca el');
console.log('  servidor con «npm run servidor» y te dirá los pasos exactos.\n');

if (existsSync(join(CARPETA, 'cert.pem'))) {
   console.log('  Siguiente paso:  npm run servidor\n');
}
