import { Injectable } from '@angular/core';
import type { PedidoDetalle } from '../models';

export interface BorradorPedido {
  clave: string;
  items: PedidoDetalle[];
  observacion: string;
  actualizadoEn: string;
}

const PREFIJO = 'fratellis:borrador:';
const VIGENCIA_MS = 4 * 60 * 60 * 1000;

export function nuevaClave(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `borrador-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class PedidoBorradorService {
  private readonly memorias = new Map<number, BorradorPedido>();

  obtener(mesaId: number): BorradorPedido | null {
    const enMemoria = this.memorias.get(mesaId);
    if (enMemoria) {
      if (this.vigente(enMemoria)) {
        return enMemoria;
      }
      this.limpiar(mesaId);
      return null;
    }

    const guardado = this.leer(mesaId);
    if (!guardado) {
      return null;
    }
    if (!this.vigente(guardado)) {
      this.limpiar(mesaId);
      return null;
    }
    this.memorias.set(mesaId, guardado);
    return guardado;
  }

  guardar(mesaId: number, borrador: BorradorPedido): void {
    const completo: BorradorPedido = {
      ...borrador,
      actualizadoEn: new Date().toISOString(),
    };
    this.memorias.set(mesaId, completo);
    this.escribir(mesaId, completo);
  }

  limpiar(mesaId: number): void {
    this.memorias.delete(mesaId);
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      sessionStorage.removeItem(PREFIJO + mesaId);
    } catch {
      // Storage bloqueado o lleno: el Map en memoria sigue siendo la fuente.
    }
  }

  private vigente(borrador: BorradorPedido): boolean {
    const fecha = Date.parse(borrador.actualizadoEn);
    if (Number.isNaN(fecha)) {
      return false;
    }
    return Date.now() - fecha <= VIGENCIA_MS;
  }

  private leer(mesaId: number): BorradorPedido | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    let crudo: string | null = null;
    try {
      crudo = sessionStorage.getItem(PREFIJO + mesaId);
    } catch {
      return null;
    }
    if (!crudo) {
      return null;
    }
    try {
      const parseado = JSON.parse(crudo) as Partial<BorradorPedido>;
      if (
        typeof parseado.clave !== 'string' ||
        typeof parseado.actualizadoEn !== 'string' ||
        typeof parseado.observacion !== 'string' ||
        !Array.isArray(parseado.items)
      ) {
        return null;
      }
      return parseado as BorradorPedido;
    } catch {
      return null;
    }
  }

  private escribir(mesaId: number, borrador: BorradorPedido): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      sessionStorage.setItem(PREFIJO + mesaId, JSON.stringify(borrador));
    } catch {
      // Sin storage disponible: queda solo el Map en memoria.
    }
  }
}
