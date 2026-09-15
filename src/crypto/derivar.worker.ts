/**
 * Calcula la llave del alumno fuera del hilo de la interfaz.
 *
 * Argon2id con 64 MiB tarda uno o dos segundos en un teléfono modesto, y en el
 * hilo principal eso es la pantalla congelada justo cuando el alumno acaba de
 * pulsar «Empezar». Aquí corre aparte.
 *
 * Devuelve un `CryptoKey` no exportable: los `CryptoKey` se pueden pasar entre
 * hilos aunque no se puedan exportar, así que los bytes de la llave nunca salen
 * de este hilo.
 */

import { derivarLlave } from './identidad-llave';

interface Pedido {
   numeroControl: string;
   pin: string;
}

self.onmessage = async (evento: MessageEvent<Pedido>) => {
   try {
      const { maestra, codigo } = await derivarLlave(evento.data.numeroControl, evento.data.pin);
      self.postMessage({ ok: true, maestra, codigo });
   } catch (e) {
      self.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
   }
};
