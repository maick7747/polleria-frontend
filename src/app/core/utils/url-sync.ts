import type { DestroyRef } from '@angular/core';
import type { Router } from '@angular/router';

const normalizarRuta = (url: string): string => {
  const sinParams = url.split('?')[0].split('#')[0];
  if (sinParams.length > 1 && sinParams.endsWith('/')) {
    return sinParams.slice(0, -1);
  }
  return sinParams || '/';
};

/**
 * Guardia para sincronizar filtros/paginación con la URL sin "navegaciones zombi".
 *
 * Las pantallas con paginación llaman a `sincronizarUrl()` después de un
 * `await` (carga inicial, refresco o cambio de filtro). Si el usuario cambia
 * de módulo mientras esa petición sigue en vuelo, el `await` resuelve tarde y
 * `router.navigate([], { relativeTo })` lo devolvía a la pantalla anterior.
 *
 * Devuelve una función que solo permite navegar si el componente sigue vivo y
 * el router está (o está yendo) a `ruta`. Se mira `getCurrentNavigation()`
 * porque `router.url` todavía apunta a la pantalla anterior mientras la
 * navegación está en curso.
 */
export function crearGuardiaUrl(
  router: Pick<Router, 'url' | 'getCurrentNavigation'>,
  destroyRef: DestroyRef,
  ruta: string,
): () => boolean {
  let viva = true;
  destroyRef.onDestroy(() => {
    viva = false;
  });

  const esperada = normalizarRuta(ruta);

  const destino = (): string => {
    const enCurso = router.getCurrentNavigation();
    const url = enCurso?.finalUrl ?? enCurso?.extractedUrl;
    return url ? url.toString() : router.url;
  };

  return (): boolean => viva && normalizarRuta(destino()) === esperada;
}
