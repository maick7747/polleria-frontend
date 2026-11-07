import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { API_BASE_URL, SESSION_STORAGE_KEY, USE_API } from './api.config';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: unknown[];
}

export type QueryValue = string | number | boolean | null | undefined;

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  readonly baseUrl = API_BASE_URL;
  readonly habilitado = USE_API;

  get<T>(path: string, query?: Record<string, QueryValue>): Observable<T> {
    return this.http
      .get<T>(this.url(path), { headers: this.headers(), params: this.params(query) })
      .pipe(catchError((error: HttpErrorResponse) => this.fail(error)));
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http
      .post<T>(this.url(path), body, { headers: this.headers() })
      .pipe(catchError((error: HttpErrorResponse) => this.fail(error)));
  }

  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http
      .put<T>(this.url(path), body, { headers: this.headers() })
      .pipe(catchError((error: HttpErrorResponse) => this.fail(error)));
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http
      .patch<T>(this.url(path), body, { headers: this.headers() })
      .pipe(catchError((error: HttpErrorResponse) => this.fail(error)));
  }

  delete<T>(path: string): Observable<T> {
    return this.http
      .delete<T>(this.url(path), { headers: this.headers() })
      .pipe(catchError((error: HttpErrorResponse) => this.fail(error)));
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

  private fail(error: HttpErrorResponse): Observable<never> {
    const cuerpo = error.error as
      | { error?: { code?: unknown; message?: unknown; details?: unknown } }
      | null;
    const payload = cuerpo && typeof cuerpo === 'object' ? cuerpo.error : undefined;
    const code =
      payload && typeof payload.code === 'string' ? payload.code : `HTTP_${error.status}`;
    const message =
      payload && typeof payload.message === 'string'
        ? payload.message
        : error.status === 0
          ? 'No se pudo conectar con el servidor.'
          : error.message;
    const details = payload && Array.isArray(payload.details) ? payload.details : [];
    const apiError: ApiError = { status: error.status, code, message, details };
    return throwError(() => apiError);
  }
}
