import { computed, inject, Injectable, signal } from '@angular/core';
import type { Cuenta } from '../models';
import { MesasService } from './mesas.service';

export interface AvisoListo {
  clave: string;
  cuentaId: number;
  mesaId: number;
  mesaNumero: number;
  pedidoId: number;
  detalleId: number;
  plato: string;
  cantidad: number;
  fechaListo?: string;
}

// Detecta platos que pasan a "listo" (KDS) y avisa al mozo: toast en pantalla,
// timbre corto y notificación del navegador. No usa backend nuevo: se alimenta
// de las cuentas abiertas que ya traen estado_preparacion por ítem.
@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private readonly mesas = inject(MesasService);

  private readonly vistos = new Set<string>();
  readonly pendientes = signal<AvisoListo[]>([]);
  readonly noLeidos = signal<number>(0);
  readonly ultimoAviso = signal<AvisoListo | null>(null);
  readonly hayPendientes = computed(() => this.pendientes().length > 0);

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', () => void this.pedirPermiso(), { once: true });
    }
  }

  // `notificar = false` siembra los avisos existentes sin alertar (primera carga).
  sincronizar(cuentas: Cuenta[], notificar = true): AvisoListo[] {
    const actuales: AvisoListo[] = [];

    for (const cuenta of cuentas) {
      if (cuenta.estado !== 'abierta') {
        continue;
      }
      const mesaNumero = this.mesas.porId(cuenta.mesaId)?.numero ?? cuenta.mesaId;
      for (const ronda of cuenta.rondas) {
        if (ronda.estado === 'cancelado' || ronda.estado === 'cobrado') {
          continue;
        }
        for (const item of ronda.items) {
          if (item.estadoPreparacion !== 'listo') {
            continue;
          }
          actuales.push({
            clave: `${ronda.id}:${item.id}`,
            cuentaId: cuenta.id,
            mesaId: cuenta.mesaId,
            mesaNumero,
            pedidoId: ronda.id,
            detalleId: item.id,
            plato: item.nombre,
            cantidad: item.cantidad,
            fechaListo: item.fechaListo,
          });
        }
      }
    }

    const nuevos = notificar ? actuales.filter((aviso) => !this.vistos.has(aviso.clave)) : [];
    for (const aviso of actuales) {
      this.vistos.add(aviso.clave);
    }

    this.pendientes.set(actuales);
    if (nuevos.length > 0) {
      this.ultimoAviso.set(nuevos[nuevos.length - 1]);
      this.noLeidos.update((total) => total + nuevos.length);
      this.alertar(nuevos);
    }
    return nuevos;
  }

  marcarLeidos(): void {
    this.noLeidos.set(0);
  }

  limpiar(): void {
    this.vistos.clear();
    this.pendientes.set([]);
    this.noLeidos.set(0);
    this.ultimoAviso.set(null);
  }

  private alertar(nuevos: AvisoListo[]): void {
    this.timbre();
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }
    const primero = nuevos[0];
    const cuerpo =
      nuevos.length === 1
        ? `Mesa ${primero.mesaNumero} · ${primero.plato}`
        : `${nuevos.length} platos listos (Mesa ${primero.mesaNumero} y más)`;
    try {
      new Notification('Pedido listo en cocina', { body: cuerpo });
    } catch {
      // el navegador puede bloquear la notificación fuera de foco
    }
  }

  private timbre(): void {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        return;
      }
      const contexto = new Ctx();
      const oscilador = contexto.createOscillator();
      const ganancia = contexto.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.setValueAtTime(880, contexto.currentTime);
      oscilador.frequency.setValueAtTime(1180, contexto.currentTime + 0.16);
      ganancia.gain.setValueAtTime(0.0001, contexto.currentTime);
      ganancia.gain.exponentialRampToValueAtTime(0.2, contexto.currentTime + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + 0.4);
      oscilador.connect(ganancia).connect(contexto.destination);
      oscilador.start();
      oscilador.stop(contexto.currentTime + 0.45);
      oscilador.onended = () => void contexto.close();
    } catch {
      // audio bloqueado: el aviso visual sigue funcionando
    }
  }

  private async pedirPermiso(): Promise<void> {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') {
      return;
    }
    try {
      await Notification.requestPermission();
    } catch {
      // sin permiso: quedan el toast y el timbre
    }
  }
}
