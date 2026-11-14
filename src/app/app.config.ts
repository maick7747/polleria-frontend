import {
  ApplicationConfig,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  NavigationError,
  provideRouter,
  withComponentInputBinding,
  withNavigationErrorHandler,
} from '@angular/router';
import { routes } from './app.routes';

const CLAVE_RECARGA = 'fratelli.recarga-chunk';

// Después de un deploy de Vercel los chunks viejos dejan de existir: si una
// pestaña abierta intenta cargar una ruta lazy, la navegación falla y la app
// se queda donde estaba hasta que el usuario recarga a mano. Detectamos ese
// fallo y recargamos una sola vez para que tome el index.html y los chunks
// nuevos (con un guard para no entrar en bucle si el chunk sigue caído).
function esFalloDeCarga(error: unknown): boolean {
  const nombre = (error as { name?: unknown } | null)?.name;
  const mensaje = (error as { message?: unknown } | null)?.message;
  const texto = typeof mensaje === 'string' ? mensaje : '';
  return (
    nombre === 'ChunkLoadError'
    || /Loading chunk [\w-]+ failed/i.test(texto)
    || /Failed to fetch dynamically imported module/i.test(texto)
    || /error loading dynamically imported module/i.test(texto)
    || /Importing a module script failed/i.test(texto)
  );
}

let recargaSolicitada = false;

function recargarSiFaltaElChunk(evento: NavigationError): void {
  if (recargaSolicitada || !esFalloDeCarga(evento.error) || typeof window === 'undefined') {
    return;
  }
  recargaSolicitada = true;

  try {
    const ahora = Date.now();
    const previo = Number(window.sessionStorage.getItem(CLAVE_RECARGA) || 0);
    if (ahora - previo < 30_000) {
      return;
    }
    window.sessionStorage.setItem(CLAVE_RECARGA, String(ahora));
  } catch {
    // Sin sessionStorage no hay forma de recordar el intento; recargamos igual.
  }

  window.location.reload();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withNavigationErrorHandler(recargarSiFaltaElChunk),
    ),
    provideHttpClient(),
  ],
};
