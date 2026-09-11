/**
 * Preferencias de disposición del aparato.
 *
 * Se guardan en `localStorage` por lo mismo que el tema y el apoyo de
 * portapapeles: describen **esta pantalla**, no al alumno, y tienen que
 * sobrevivir a «borrar mis datos». Quien trabaja en un teléfono de 375 px y
 * plegó la consola para que le quepa el diagrama no tiene por qué volver a
 * plegarla cada vez que abre la app.
 *
 * Ninguna de estas funciones lanza: sin almacenamiento la app funciona igual,
 * solo deja de recordar.
 */

const CLAVE_CONSOLA = 'rflowp:consola-abierta';

/** ¿Se quedó la consola abierta? Por omisión sí: es donde sale el resultado. */
export function leerConsolaAbierta(): boolean {
   try {
      return localStorage.getItem(CLAVE_CONSOLA) !== 'no';
   } catch {
      // Modo privado o almacenamiento bloqueado.
      return true;
   }
}

/** Recuerda la elección explícita del usuario, no las aperturas automáticas. */
export function recordarConsolaAbierta(abierta: boolean): void {
   try {
      localStorage.setItem(CLAVE_CONSOLA, abierta ? 'si' : 'no');
   } catch {
      // Sin poder guardarlo vale para esta sesión, que es mejor que nada.
   }
}
