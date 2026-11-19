import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import type { RolNombre } from '../models';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return router.createUrlTree([auth.home()]);
  }
  return true;
};

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  const requeridos = route.data['roles'] as readonly RolNombre[] | undefined;
  if (!requeridos || requeridos.length === 0) {
    return true;
  }

  // Sin permiso se vuelve a su pantalla de inicio (nunca a una que tampoco ve).
  return auth.hasAnyRole(requeridos) ? true : router.createUrlTree([auth.home()]);
};

/**
 * `/venta` sin modo (o con `mesas`) vuelve al mapa de mesas, que conserva su
 * flujo de rondas. Delivery y Apps exigen su permiso granular.
 */
export const modoVentaGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const modo = route.queryParamMap.get('modo');

  if (!modo || modo === 'mesas') {
    return router.createUrlTree(['/venta-local']);
  }
  if (modo === 'delivery' && !auth.hasPermission('delivery.propio')) {
    return router.createUrlTree(['/venta-local']);
  }
  if (modo === 'apps' && !auth.hasPermission('delivery.externo')) {
    return router.createUrlTree(['/venta-local']);
  }
  if (modo !== 'mostrador' && modo !== 'delivery' && modo !== 'apps') {
    return router.createUrlTree(['/venta-local']);
  }
  return true;
};
