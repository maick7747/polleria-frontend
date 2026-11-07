import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly http = inject(HttpClient);

  readonly url: string = environment.supabaseUrl;
  readonly key: string = environment.supabaseKey;
  readonly configured: boolean = this.url.length > 0 && this.key.length > 0;

  select<T>(tabla: string, query = 'select=*'): Observable<T[]> {
    this.verificarConfiguracion();
    return this.http.get<T[]>(`${this.url}/rest/v1/${tabla}?${query}`, {
      headers: this.cabeceras(),
    });
  }

  insert<T extends object>(tabla: string, payload: T): Observable<T> {
    this.verificarConfiguracion();
    return this.http.post<T>(`${this.url}/rest/v1/${tabla}`, payload, {
      headers: this.cabeceras(),
    });
  }

  private cabeceras(): HttpHeaders {
    return new HttpHeaders({
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    });
  }

  private verificarConfiguracion(): void {
    if (!this.configured) {
      throw new Error(
        'Supabase no está configurado. Completa supabaseUrl y supabaseKey en src/environments/environment.ts.',
      );
    }
  }
}
