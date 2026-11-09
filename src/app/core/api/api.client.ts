import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, TimeoutError, throwError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { API_BASE_URL, SESSION_STORAGE_KEY, USE_API } from './api.config';

// Cold start de Render: el backend puede tardar ~60 s en despertar. Damos 45 s
// y la UI avisa a los 5 s que el servidor está arrancando.
export const REQUEST_TIMEOUT_MS = 45000;

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: unknown[];
}

export type QueryValue = string | number | boolean | null | undefined;

export interface EtagResponse<T> {
  data: T | null;
  changed: boolean;
  status: number;
}

interface EntradaEtag {
  etag: string;
  data: unknown;
}

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private redirigiendo = false;

  // Caché en memoria de respuestas condicionales (ETag + body) por URL+query.
  private readonly cacheEtag = new Map<string, EntradaEtag>();

  readonly baseUrl = API_BASE_URL;
  readonly habilitado = USE_API;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('fratelli:sesion-expirada', () =>
        this.limpiarCacheEtag(),
      );
    }
  }

  get<T>(path: string, query?: Record<string, QueryValue>): Observable<T> {
    return this.http
      .get<T>(this.url(path), { headers: this.headers(), params: this.params(query) })
      .pipe(timeout(REQUEST_TIMEOUT_MS), catchError((error: unknown) => this.fail(error)));
  }

  /**
   * GET condicional: envía `If-None-Match` con el ETag guardado para esa
   * URL+query y, si el servidor responde 304, reutiliza el body cacheado sin
   * pasar por `fail()` (no cierra sesión ni redirige).
   */
  getConEtag<T>(
    path: string,
    query?: Record<string, QueryValue>,
  ): Observable<EtagResponse<T>> {
    const url = this.url(path);
    const params = this.params(query);
    const clave = this.claveEtag(url, params);
    const cacheado = this.cacheEtag.get(clave);

    let headers = this.headers();
    if (cacheado) {
      headers = headers.set('If-None-Match', cacheado.etag);
    }

    return this.http
      .get<T>(url, { headers, params, observe: 'response' })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((respuesta: HttpResponse<T>) =>
          this.leerRespuesta(clave, respuesta, cacheado),
        ),
        catchError((error: unknown) => {
          const httpError = error as Partial<HttpErrorResponse>;
          if (httpError.status === 304) {
            return of<EtagResponse<T>>({
              data: (cacheado?.data as T | undefined) ?? null,
              changed: false,
              status: 304,
            });
          }
          return this.fail(error);
        }),
      );
  }

  // Descarta el caché condicional (logout o sesión expirada).
  limpiarCacheEtag(): void {
    this.cacheEtag.clear();
  }

  private leerRespuesta<T>(
    clave: string,
    respuesta: HttpResponse<T>,
    cacheado: EntradaEtag | undefined,
  ): EtagResponse<T> {
    // Algunos clientes entregan el 304 por el camino de éxito: mismo trato.
    if (respuesta.status === 304) {
      return {
        data: (cacheado?.data as T | undefined) ?? null,
        changed: false,
        status: 304,
      };
    }

    const etag = respuesta.headers.get('ETag') ?? respuesta.headers.get('etag');
    if (etag) {
      this.cacheEtag.set(clave, { etag, data: respuesta.body });
    } else {
      // Sin ETag no hay validación posible: no reutilizar una entrada vieja.
      this.cacheEtag.delete(clave);
    }

    return { data: respuesta.body, changed: true, status: respuesta.status };
  }

  private claveEtag(url: string, params: HttpParams): string {
    const query = params.toString();
    return query ? `${url}?${query}` : url;
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http
      .post<T>(this.url(path), body, { headers: this.headers() })
      .pipe(timeout(REQUEST_TIMEOUT_MS), catchError((error: unknown) => this.fail(error)));
  }

  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http
      .put<T>(this.url(path), body, { headers: this.headers() })
      .pipe(timeout(REQUEST_TIMEOUT_MS), catchError((error: unknown) => this.fail(error)));
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http
      .patch<T>(this.url(path), body, { headers: this.headers() })
      .pipe(timeout(REQUEST_TIMEOUT_MS), catchError((error: unknown) => this.fail(error)));
  }

  delete<T>(path: string): Observable<T> {
    return this.http
      .delete<T>(this.url(path), { headers: this.headers() })
      .pipe(timeout(REQUEST_TIMEOUT_MS), catchError((error: unknown) => this.fail(error)));
  }

  private url(path: string): string {
    const limpio = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${limpio}`;
  }

  private headers(): HttpHeaders {
    let headers = new HttpHeaders({ Accept: 'application/json' });
    const token = this.token();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private token(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const sesion = JSON.parse(raw) as { token?: unknown };
      return typeof sesion.token === 'string' ? sesion.token : null;
    } catch {
      return null;
    }
  }

  private params(query?: Record<string, QueryValue>): HttpParams {
    let params = new HttpParams();
    if (!query) {
      return params;
    }
    for (const [clave, valor] of Object.entries(query)) {
      if (valor !== null && valor !== undefined) {
        params = params.set(clave, String(valor));
      }
    }
    return params;
  }

  private fail(error: unknown): Observable<never> {
    if (error instanceof TimeoutError) {
      const porTimeout: ApiError = {
        status: 0,
        code: 'TIMEOUT',
        message: 'El servidor tardó demasiado en responder. Vuelve a intentarlo.',
        details: [],
      };
      return throwError(() => porTimeout);
    }

    const httpError = error as Partial<HttpErrorResponse>;
    const status = typeof httpError.status === 'number' ? httpError.status : 0;
    const cuerpo = httpError.error as
      | { error?: { code?: unknown; message?: unknown; details?: unknown } }
      | null
      | undefined;
    const payload = cuerpo && typeof cuerpo === 'object' ? cuerpo.error : undefined;
    const code =
      payload && typeof payload.code === 'string' ? payload.code : `HTTP_${status}`;
    const message =
      payload && typeof payload.message === 'string'
        ? payload.message
        : status === 0
          ? 'No se pudo conectar con el servidor.'
          : httpError.message || 'No se pudo completar la solicitud.';
    const details = payload && Array.isArray(payload.details) ? payload.details : [];
    const apiError: ApiError = { status, code, message, details };
    if (status === 401 && !this.esLogin(httpError.url)) {
      this.cerrarSesionExpirada();
    }
    return throwError(() => apiError);
  }

  private esLogin(url: string | null | undefined): boolean {
    return typeof url === 'string' && url.includes('/auth/login');
  }

  private cerrarSesionExpirada(): void {
    this.limpiarCacheEtag();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fratelli:sesion-expirada'));
    }
    if (this.redirigiendo || this.router.url.startsWith('/login')) {
      return;
    }
    this.redirigiendo = true;
    void this.router.navigateByUrl('/login').finally(() => {
      this.redirigiendo = false;
    });
  }
}
