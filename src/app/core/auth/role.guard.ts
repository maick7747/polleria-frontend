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
    return router.createUrlTree(['/dashboard']);
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

  return auth.hasAnyRole(requeridos) ? true : router.createUrlTree(['/dashboard']);
};
