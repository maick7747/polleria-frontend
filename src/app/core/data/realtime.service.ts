import { Injectable, signal } from '@angular/core';
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export type RealtimeEstado = 'deshabilitado' | 'conectando' | 'conectado' | 'error';

// Agrupa ráfagas de eventos (una ronda crea 1 pedido + N detalles) para que el
// consumidor refresque una sola vez.
const DEBOUNCE_MS = 300;

// Aviso casi instantáneo KDS → mozo. Es un acelerador opcional: si Realtime no
// está disponible (RLS, red, proyecto pausado) queda en `error` o
// `deshabilitado` y el polling de 15 s sigue funcionando como respaldo.
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private cliente: SupabaseClient | null = null;
  private canal: RealtimeChannel | null = null;
  private temporizador: number | null = null;
  private referencias = 0;

  readonly revision = signal(0);
  readonly conectado = signal(false);
  readonly estado = signal<RealtimeEstado>('deshabilitado');

  disponible(): boolean {
    return this.configurado();
  }

  // Idempotente y por referencias: varias pantallas pueden llamarlo y solo se
  // crea (o se destruye) el canal cuando entra o sale la última.
  iniciar(): boolean {
    if (!this.configurado()) {
      this.estado.set('deshabilitado');
      return false;
    }
    this.referencias += 1;
    if (this.canal !== null || this.cliente !== null) {
      return true;
    }
    try {
      this.estado.set('conectando');
      this.cliente = createClient(environment.supabaseUrl, environment.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 5 } },
      });
      this.canal = this.cliente
        .channel('fratelli-pedidos')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'pedido_detalles' },
          () => this.agendar(),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'pedido_detalles' },
          () => this.agendar(),
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'pedidos' },
          () => this.agendar(),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'pedidos' },
          () => this.agendar(),
        )
        .subscribe((status) => this.estadoCanal(status));
      return true;
    } catch {
      this.referencias = Math.max(0, this.referencias - 1);
      this.estado.set('error');
      this.conectado.set(false);
      this.cerrarCliente();
      return false;
    }
  }

  detener(): void {
    if (this.referencias > 0) {
      this.referencias -= 1;
    }
    if (this.referencias > 0) {
      return;
    }
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    this.cerrarCliente();
    this.conectado.set(false);
    this.estado.set('deshabilitado');
  }

  private estadoCanal(status: string): void {
    if (status === 'SUBSCRIBED') {
      this.conectado.set(true);
      this.estado.set('conectado');
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      // No se relanza: el polling cubre la caída.
      this.conectado.set(false);
      this.estado.set('error');
    }
  }

  private agendar(): void {
    if (this.temporizador !== null) {
      return;
    }
    this.temporizador = window.setTimeout(() => {
      this.temporizador = null;
      this.revision.update((valor) => valor + 1);
    }, DEBOUNCE_MS);
  }

  private cerrarCliente(): void {
    const canal = this.canal;
    const cliente = this.cliente;
    this.canal = null;
    this.cliente = null;
    if (cliente === null) {
      return;
    }
    try {
      if (canal !== null) {
        void cliente.removeChannel(canal).catch(() => undefined);
      } else {
        void cliente.removeAllChannels().catch(() => undefined);
      }
    } catch {
      // sin Realtime disponible: nada que cerrar
    }
  }

  private configurado(): boolean {
    return (
      environment.useRealtime &&
      environment.supabaseUrl.length > 0 &&
      environment.supabaseKey.length > 0
    );
  }
}
