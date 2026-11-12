import type { DestroyRef } from '@angular/core';
import type { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { crearGuardiaUrl } from './url-sync';

type RouterUrl = Pick<Router, 'url' | 'getCurrentNavigation'>;

interface RouterFalso {
  url: string;
  getCurrentNavigation: () => unknown;
}

const crearDestroyRef = (): { destroyRef: DestroyRef; destruir: () => void } => {
  const callbacks: (() => void)[] = [];
  const destroyRef = {
    onDestroy: (fn: () => void) => {
      callbacks.push(fn);
      return () => undefined;
    },
  } as unknown as DestroyRef;
  return { destroyRef, destruir: () => callbacks.forEach((fn) => fn()) };
};

const crearRouter = (url: string): RouterFalso => ({ url, getCurrentNavigation: () => null });
const comoRouter = (router: RouterFalso): RouterUrl => router as unknown as RouterUrl;

const navegandoA = (url: string): unknown => ({
  finalUrl: { toString: () => url },
  extractedUrl: { toString: () => url },
});

describe('crearGuardiaUrl', () => {
  it('permite sincronizar solo cuando el router está en la ruta de la pantalla', () => {
    const { destroyRef } = crearDestroyRef();
    const router = crearRouter('/historial-pedidos?page=2');
    const activa = crearGuardiaUrl(comoRouter(router), destroyRef, '/historial-pedidos');

    expect(activa()).toBe(true);

    router.url = '/gastos?page=1';
    expect(activa()).toBe(false);
  });

  it('bloquea la sincronización si ya hay una navegación en curso a otro módulo', () => {
    const { destroyRef } = crearDestroyRef();
    const router = crearRouter('/historial-pedidos');
    router.getCurrentNavigation = () => navegandoA('/gastos');
    const activa = crearGuardiaUrl(comoRouter(router), destroyRef, '/historial-pedidos');

    expect(activa()).toBe(false);
  });

  it('sigue permitiendo el cambio de página mientras el router va a la misma ruta', () => {
    const { destroyRef } = crearDestroyRef();
    const router = crearRouter('/historial-pedidos');
    router.getCurrentNavigation = () => navegandoA('/historial-pedidos?page=2');
    const activa = crearGuardiaUrl(comoRouter(router), destroyRef, '/historial-pedidos');

    expect(activa()).toBe(true);
  });

  it('ignora query params, hash y barra final', () => {
    const { destroyRef } = crearDestroyRef();
    const router = crearRouter('/delivery-propio/?desde=2026-11-01&pedido=5#detalle');
    const activa = crearGuardiaUrl(comoRouter(router), destroyRef, '/delivery-propio');

    expect(activa()).toBe(true);
  });

  it('no distingue rutas hijas: /inventario no autoriza a /inventario/historial', () => {
    const { destroyRef } = crearDestroyRef();
    const router = crearRouter('/inventario/historial');
    const activa = crearGuardiaUrl(comoRouter(router), destroyRef, '/inventario');

    expect(activa()).toBe(false);
  });

  it('deja de permitir sincronizar cuando la pantalla se destruye', () => {
    const { destroyRef, destruir } = crearDestroyRef();
    const router = crearRouter('/merma');
    const activa = crearGuardiaUrl(comoRouter(router), destroyRef, '/merma');

    expect(activa()).toBe(true);
    destruir();
    expect(activa()).toBe(false);
  });

  it('no navega si el usuario ya cambió de módulo', () => {
    const { destroyRef } = crearDestroyRef();
    const router = crearRouter('/compras?page=3');
    const guardia = crearGuardiaUrl(comoRouter(router), destroyRef, '/historial-pedidos');
    const navegar = vi.fn();

    const sincronizar = (): void => {
      if (!guardia()) {
        return;
      }
      navegar();
    };

    sincronizar();
    expect(navegar).not.toHaveBeenCalled();
  });
});
