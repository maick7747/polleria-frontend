import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ComprobanteTipo,
  Cuenta,
  DatosCliente,
  MetodoPago,
  PedidoDetalle,
  Ronda,
} from '../models';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esApiError, esFalloRed } from '../api/api.helpers';
import type {
  ApiList,
  CobroResponseDto,
  CuentaDto,
  PedidoDto,
} from '../api/api.types';
import { toCuenta, toPago, toRonda } from '../api/api.mappers';
import { MesasService } from './mesas.service';
import { MOCK_CUENTAS } from './mock-data';
import { PagosService } from './pagos.service';

@Injectable({ providedIn: 'root' })
export class CuentasService {
  private readonly api = inject(ApiClient);
  private readonly mesas = inject(MesasService);
  private readonly pagos = inject(PagosService);

  private secuencia = 100;
  private secuenciaRonda = 100;

  // Cliente capturado antes de que exista la cuenta (cuenta perezosa).
  private readonly clientesPendientes = new Map<number, DatosCliente>();

  readonly cargando = signal<boolean>(false);

  readonly cuentas = signal<Cuenta[]>(
    MOCK_CUENTAS.map((cuenta) => ({
      ...cuenta,
      rondas: cuenta.rondas.map((ronda) => ({
        ...ronda,
        items: ronda.items.map((item) => ({ ...item })),
      })),
    })),
  );

  readonly abiertas = computed<Cuenta[]>(() =>
    this.cuentas().filter((cuenta) => cuenta.estado === 'abierta'),
  );

  readonly totalAbierto = computed<number>(() =>
    round2(this.abiertas().reduce((suma, cuenta) => suma + cuenta.total, 0)),
  );

  porId(id: number): Cuenta | undefined {
    return this.cuentas().find((cuenta) => cuenta.id === id);
  }

  cuentaDeMesa(mesaId: number): Cuenta | undefined {
    return this.abiertas().find((cuenta) => cuenta.mesaId === mesaId);
  }

  async cargar(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    this.cargando.set(true);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<CuentaDto>>('/cuentas', { estado: 'abierta', limit: 100 }),
      );
      const detalles = await Promise.all(
        lista.data.map((cuenta) =>
          firstValueFrom(this.api.get<CuentaDto>(`/cuentas/${cuenta.id}`)),
        ),
      );
      const normalizadas = detalles.map(toCuenta);
      this.cuentas.set(normalizadas);
      for (const cuenta of normalizadas) {
        this.mesas.cambiarEstado(cuenta.mesaId, 'ocupada');
      }
      return true;
    } catch {
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarDetalle(id: number): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    try {
      const dto = await firstValueFrom(this.api.get<CuentaDto>(`/cuentas/${id}`));
      this.upsert(toCuenta(dto));
      return true;
    } catch {
      return false;
    }
  }

  guardarCliente(cuentaId: number, cliente: DatosCliente): Cuenta | null {
    const cuenta = this.porId(cuentaId);
    if (!cuenta) {
      return null;
    }
    const actualizada: Cuenta = { ...cuenta, cliente };
    this.cuentas.update((lista) =>
      lista.map((actual) => (actual.id === cuentaId ? actualizada : actual)),
    );
    return actualizada;
  }

  clientePendiente(mesaId: number): DatosCliente | undefined {
    return this.clientesPendientes.get(mesaId);
  }

  guardarClientePendiente(mesaId: number, cliente: DatosCliente): void {
    this.clientesPendientes.set(mesaId, cliente);
  }

  async abrirCuenta(mesaId: number, usuarioId: number): Promise<Cuenta | null> {
    const existente = this.cuentaDeMesa(mesaId);
    if (existente) {
      return existente;
    }

    if (USE_API) {
      try {
        const dto = await firstValueFrom(
          this.api.post<CuentaDto>('/cuentas', { mesa_id: mesaId }),
        );
        const cuenta = toCuenta(dto);
        const pendiente = this.clientesPendientes.get(mesaId);
        if (pendiente) {
          cuenta.cliente = pendiente;
          this.clientesPendientes.delete(mesaId);
        }
        this.upsert(cuenta);
        this.mesas.cambiarEstado(mesaId, 'ocupada');
        return cuenta;
      } catch (error) {
        if (!esFalloRed(error)) {
          if (esApiError(error) && error.code === 'CUENTA_ABIERTA') {
            await this.cargar();
            return this.cuentaDeMesa(mesaId) ?? null;
          }
          throw error;
        }
      }
    }

    return this.abrirCuentaLocal(mesaId, usuarioId);
  }

  async agregarRonda(
    cuentaId: number,
    items: PedidoDetalle[],
  ): Promise<Ronda | null> {
    const cuenta = this.porId(cuentaId);
    if (!cuenta || cuenta.estado !== 'abierta') {
      return null;
    }

    if (USE_API) {
      try {
        const payload = {
          items: items.map((item) => ({
            platillo_id: item.platilloId,
            cantidad: item.cantidad,
            notas: item.notas ?? null,
          })),
        };
        const dto = await firstValueFrom(
          this.api.post<PedidoDto>(`/cuentas/${cuentaId}/pedidos`, payload),
        );
        let enviado = dto;
        try {
          enviado = await firstValueFrom(
            this.api.post<PedidoDto>(`/pedidos/${dto.id}/enviar-cocina`),
          );
        } catch (error) {
          await firstValueFrom(
            this.api.post<PedidoDto>(`/pedidos/${dto.id}/cancelar`, {
              motivo: 'No se pudo enviar a cocina',
            }),
          ).catch(() => undefined);
          throw error;
        }
        const ronda = toRonda(enviado, cuenta.rondas.length + 1);
        this.cuentas.update((lista) =>
          lista.map((actual) =>
            actual.id === cuentaId
              ? {
                  ...actual,
                  rondas: [...actual.rondas, ronda],
                  total: round2(actual.total + enviado.total),
                }
              : actual,
          ),
        );
        return ronda;
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
      }
    }

    return this.agregarRondaLocal(cuentaId, items);
  }

  async cerrar(
    cuentaId: number,
    usuarioId: number,
    comprobanteTipo: ComprobanteTipo,
    comprobanteNumero: string,
    metodo: MetodoPago = 'efectivo',
  ): Promise<Cuenta | null> {
    const cuenta = this.porId(cuentaId);
    if (!cuenta || cuenta.estado !== 'abierta') {
      return null;
    }

    if (USE_API) {
      try {
        const respuesta = await firstValueFrom(
          this.api.post<CobroResponseDto>(`/cuentas/${cuentaId}/cobrar`, {
            metodo,
            monto: cuenta.total,
          }),
        );
        const cerrada = toCuenta(respuesta.cuenta);
        this.upsert(cerrada);
        this.mesas.cambiarEstado(cerrada.mesaId, 'libre');
        this.pagos.registrarPago(toPago(respuesta.pago));
        return cerrada;
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
      }
    }

    return this.cerrarLocal(
      cuentaId,
      usuarioId,
      comprobanteTipo,
      comprobanteNumero,
      metodo,
    );
  }

  // Libera una cuenta creada por error. Solo se permite si no tiene rondas.
  async cancelarCuenta(cuentaId: number): Promise<boolean> {
    const cuenta = this.porId(cuentaId);
    if (!cuenta || cuenta.estado !== 'abierta' || cuenta.rondas.length > 0) {
      return false;
    }

    if (USE_API) {
      try {
        await firstValueFrom(
          this.api.post(`/cuentas/${cuentaId}/cancelar`, {
            motivo: 'Cuenta vacía sin pedidos',
          }),
        );
        this.cuentas.update((lista) => lista.filter((actual) => actual.id !== cuentaId));
        this.mesas.cambiarEstado(cuenta.mesaId, 'libre');
        return true;
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
      }
    }

    this.cuentas.update((lista) => lista.filter((actual) => actual.id !== cuentaId));
    this.mesas.cambiarEstado(cuenta.mesaId, 'libre');
    return true;
  }

  private upsert(cuenta: Cuenta): void {
    this.cuentas.update((lista) => {
      const existe = lista.some((actual) => actual.id === cuenta.id);
      if (existe) {
        return lista.map((actual) => (actual.id === cuenta.id ? cuenta : actual));
      }
      return [cuenta, ...lista];
    });
  }

  private abrirCuentaLocal(mesaId: number, usuarioId: number): Cuenta {
    const existente = this.cuentaDeMesa(mesaId);
    if (existente) {
      return existente;
    }
    const cuenta: Cuenta = {
      id: ++this.secuencia,
      mesaId,
      estado: 'abierta',
      total: 0,
      fechaApertura: new Date().toISOString(),
      usuarioAperturaId: usuarioId,
      comprobanteTipo: 'boleta',
      rondas: [],
      cliente: this.clientesPendientes.get(mesaId),
    };
    this.clientesPendientes.delete(mesaId);
    this.cuentas.update((lista) => [cuenta, ...lista]);
    this.mesas.cambiarEstado(mesaId, 'ocupada');
    return cuenta;
  }

  private agregarRondaLocal(
    cuentaId: number,
    items: PedidoDetalle[],
  ): Ronda | null {
    const cuenta = this.porId(cuentaId);
    if (!cuenta || cuenta.estado !== 'abierta') {
      return null;
    }
    const ronda: Ronda = {
      id: ++this.secuenciaRonda,
      numero: cuenta.rondas.length + 1,
      creadaEn: new Date().toISOString(),
      estado: 'en_cocina',
      items,
      total: round2(items.reduce((suma, item) => suma + item.subtotal, 0)),
    };
    this.cuentas.update((lista) =>
      lista.map((actual) =>
        actual.id === cuentaId
          ? { ...actual, rondas: [...actual.rondas, ronda], total: round2(actual.total + ronda.total) }
          : actual,
      ),
    );
    return ronda;
  }

  private cerrarLocal(
    cuentaId: number,
    usuarioId: number,
    comprobanteTipo: ComprobanteTipo,
    comprobanteNumero: string,
    metodo: MetodoPago,
  ): Cuenta | null {
    const cuenta = this.porId(cuentaId);
    if (!cuenta || cuenta.estado !== 'abierta') {
      return null;
    }
    const cerrada: Cuenta = {
      ...cuenta,
      estado: 'cobrada',
      fechaCierre: new Date().toISOString(),
      usuarioCierreId: usuarioId,
      comprobanteTipo,
      comprobanteNumero,
    };
    this.cuentas.update((lista) =>
      lista.map((actual) => (actual.id === cuentaId ? cerrada : actual)),
    );
    this.mesas.cambiarEstado(cuenta.mesaId, 'libre');
    this.pagos.registrar({
      pedidoId: null,
      cuentaId,
      metodo,
      monto: cuenta.total,
      esContraentrega: false,
      fecha: new Date().toISOString(),
      usuarioId,
    });
    return cerrada;
  }
}
