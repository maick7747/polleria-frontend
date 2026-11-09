import type { DestroyRef } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarRefresco } from './refresco';

let visibilidad: DocumentVisibilityState = 'visible';

const fijarVisibilidad = (valor: DocumentVisibilityState): void => {
  visibilidad = valor;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibilidad,
  });
};

const crearDestroyRef = (): DestroyRef => {
  const callbacks: (() => void)[] = [];
  return {
    onDestroy: (fn: () => void) => {
      callbacks.push(fn);
      return () => undefined;
    },
  } as unknown as DestroyRef;
};

describe('iniciarRefresco', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fijarVisibilidad('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no ejecuta el tick con la pestaña oculta y sí al volverse visible', async () => {
    fijarVisibilidad('hidden');
    const tarea = vi.fn();
    const detener = iniciarRefresco({
      intervaloMs: 1000,
      tarea,
      destroyRef: crearDestroyRef(),
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(tarea).not.toHaveBeenCalled();

    fijarVisibilidad('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(tarea).toHaveBeenCalledTimes(1);

    detener();
  });

  it('refresca por intervalo, evita solapar y detener es idempotente', async () => {
    let resolver: () => void = () => undefined;
    const tarea = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        }),
    );
    const detener = iniciarRefresco({
      intervaloMs: 1000,
      tarea,
      destroyRef: crearDestroyRef(),
    });

    await vi.advanceTimersByTimeAsync(3000);
    expect(tarea).toHaveBeenCalledTimes(1);

    resolver();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tarea).toHaveBeenCalledTimes(2);

    detener();
    detener();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tarea).toHaveBeenCalledTimes(2);
  });
});
