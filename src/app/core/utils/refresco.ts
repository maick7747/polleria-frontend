import type { DestroyRef } from '@angular/core';

export interface OpcionesRefresco {
  intervaloMs: number;
  tarea: () => Promise<void> | void;
  destroyRef: DestroyRef;
  alVolverVisible?: boolean;
}

/**
 * Refresco periódico silencioso para pantallas operativas.
 *
 * - Solo ejecuta la tarea con la pestaña visible (`visibilityState`).
 * - Evita solapar ejecuciones (`enCurso`).
 * - Al volver a la pestaña (o recuperar el foco) refresca de inmediato.
 * - Limpia intervalo y listeners con `DestroyRef.onDestroy`.
 *
 * Devuelve `detener()`, idempotente, por si la página quiere cortarlo antes.
 */
export function iniciarRefresco(opciones: OpcionesRefresco): () => void {
  const { intervaloMs, tarea, destroyRef, alVolverVisible = true } = opciones;
  const hayDocumento = typeof document !== 'undefined';
  let detenido = false;
  let enCurso = false;
  let intervalo: ReturnType<typeof setInterval> | null = null;

  const ejecutar = async (): Promise<void> => {
    if (detenido || enCurso) {
      return;
    }
    if (hayDocumento && document.visibilityState !== 'visible') {
      return;
    }
    enCurso = true;
    try {
      await tarea();
    } catch {
      // Refresco silencioso: un fallo no debe romper la pantalla ni el ciclo.
    } finally {
      enCurso = false;
    }
  };

  const alCambiarVisibilidad = (): void => {
    if (hayDocumento && document.visibilityState === 'visible') {
      void ejecutar();
    }
  };

  intervalo = setInterval(() => {
    void ejecutar();
  }, intervaloMs);

  if (alVolverVisible && hayDocumento) {
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('focus', alCambiarVisibilidad);
  }

  const detener = (): void => {
    if (detenido) {
      return;
    }
    detenido = true;
    if (intervalo !== null) {
      clearInterval(intervalo);
      intervalo = null;
    }
    if (alVolverVisible && hayDocumento) {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('focus', alCambiarVisibilidad);
    }
  };

  destroyRef.onDestroy(detener);
  return detener;
}
