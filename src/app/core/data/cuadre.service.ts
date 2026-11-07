import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esFalloRed } from '../api/api.helpers';
import type { CuadreDto } from '../api/api.types';

@Injectable({ providedIn: 'root' })
export class CuadreService {
  private readonly api = inject(ApiClient);

  readonly cargando = signal<boolean>(false);
  readonly cuadreId = signal<number | null>(null);

  readonly abierta = signal<boolean>(false);
  readonly fondoInicial = signal<number>(200);
  readonly totalVentas = signal<number>(2450);
  readonly totalEgresos = signal<number>(225);
  readonly efectivoContado = signal<number>(0);
  readonly pagosDigitales = signal<number>(0);
  readonly fechaApertura = signal<string>('2026-10-14T11:00:00-05:00');

  readonly montoEsperado = computed<number>(() =>
    round2(this.fondoInicial() + this.totalVentas() - this.totalEgresos()),
  );

  readonly totalReal = computed<number>(() =>
    round2(this.efectivoContado() + this.pagosDigitales()),
  );

  readonly diferencia = computed<number>(() =>
    round2(this.totalReal() - this.montoEsperado()),
  );

  async cargar(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    this.cargando.set(true);
    try {
      const dto = await firstValueFrom(this.api.get<CuadreDto | null>('/cuadre-caja'));
      if (dto) {
        this.aplicar(dto);
      } else {
        this.cuadreId.set(null);
        this.abierta.set(false);
        this.totalVentas.set(0);
        this.totalEgresos.set(0);
      }
      return true;
    } catch {
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async abrir(fondoInicial: number): Promise<boolean> {
    if (USE_API) {
      try {
        const dto = await firstValueFrom(
          this.api.post<CuadreDto>('/cuadre-caja/apertura', {
            fondo_inicial: fondoInicial,
          }),
        );
        this.aplicar(dto);
        return true;
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
      }
    }

    this.fondoInicial.set(fondoInicial);
    this.abierta.set(true);
    this.fechaApertura.set(new Date().toISOString());
    return true;
  }

  registrarVenta(monto: number): void {
    this.totalVentas.update((actual) => round2(actual + monto));
  }

  registrarEgreso(monto: number): void {
    this.totalEgresos.update((actual) => round2(actual + monto));
  }

  async cerrar(efectivoContado: number, pagosDigitales: number): Promise<boolean> {
    if (USE_API) {
      if (this.cuadreId() === null) {
        await this.cargar();
      }
      const id = this.cuadreId();
      if (id !== null) {
        const diferencia = round2(
          efectivoContado + pagosDigitales - this.montoEsperado(),
        );
        try {
          const dto = await firstValueFrom(
            this.api.post<CuadreDto>(`/cuadre-caja/${id}/cierre`, {
              efectivo_contado: efectivoContado,
              pagos_digitales: pagosDigitales,
              observaciones:
                Math.abs(diferencia) > 0.009
                  ? `Cierre desde la app · diferencia ${diferencia.toFixed(2)}`
                  : null,
            }),
          );
          this.aplicar(dto);
          return true;
        } catch (error) {
          if (!esFalloRed(error)) {
            throw error;
          }
        }
      }
    }

    this.efectivoContado.set(efectivoContado);
    this.pagosDigitales.set(pagosDigitales);
    this.abierta.set(false);
    return true;
  }

  private aplicar(dto: CuadreDto): void {
    this.cuadreId.set(dto.id);
    this.abierta.set(dto.estado === 'abierta');
    this.fondoInicial.set(dto.fondo_inicial);
    this.totalVentas.set(dto.resumen?.total_ventas ?? dto.total_ventas);
    this.totalEgresos.set(dto.resumen?.total_egresos ?? dto.total_egresos);
    this.efectivoContado.set(dto.efectivo_contado ?? 0);
    this.pagosDigitales.set(dto.pagos_digitales);
    this.fechaApertura.set(dto.fecha_apertura);
  }
}
