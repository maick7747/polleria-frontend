import type { ApiError } from './api.client';

export function esApiError(error: unknown): error is ApiError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidato = error as Partial<ApiError>;
  return (
    typeof candidato.status === 'number' &&
    typeof candidato.code === 'string' &&
    typeof candidato.message === 'string'
  );
}

export function esFalloRed(error: unknown): boolean {
  return esApiError(error) && error.status === 0;
}

export function mensajeError(error: unknown): string {
  if (esApiError(error)) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'No se pudo completar la operación.';
}

export function esConflicto(error: unknown): boolean {
  return esApiError(error) && (error.status === 409 || error.status === 422);
}
