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
import type { ApiError } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esApiError, esFalloRed, mensajeError } from '../api/api.helpers';
import type {
  CobroResponseDto,
  CuentaDto,
  PedidoDto,
  TableroDto,
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
  readonly error = signal<string | null>(null);
  readonly errorDetalle = signal<ApiError | null>(null);
  readonly aviso = signal<string | null>(null);

  // En modo API arranca vacío: los mocks solo se usan en modo demo.
  readonly cuentas = signal<Cuenta[]>(
    USE_API
      ? []
      : MOCK_CUENTAS.map((cuenta) => ({
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

  async cargar(silencioso = false): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    if (!silencioso) {
      this.cargando.set(true);
      this.error.set(null);
      this.aviso.set(null);
    }
    try {
      const tablero = await firstValueFrom(
        this.api.get<TableroDto>('/venta-local/tablero'),
      );
      this.cuentas.set(tablero.cuentas.map(toCuenta));
      this.mesas.reemplazar(tablero.mesas);
      this.error.set(null);
      this.aviso.set(null);
      return true;
    } catch (error) {
      if (!silencioso || this.cuentas().length === 0) {
        this.error.set(mensajeError(error));
      }
      return false;
    } finally {
      if (!silencioso) {
        this.cargando.set(false);
      }
    }
  }

  async cargarDetalle(id: number): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    this.errorDetalle.set(null);
    try {
      const dto = await firstValueFrom(this.api.get<CuentaDto>(`/cuentas/${id}`));
      this.upsert(toCuenta(dto));
      return true;
    } catch (error) {
      this.errorDetalle.set(esApiError(error) ? error : null);
      return false;
    }
  }

  async guardarCliente(
    cuentaId: number,
    cliente: DatosCliente,
  ): Promise<Cuenta | null> {
    const cuenta = this.porId(cuentaId);
    if (!cuenta) {
      return null;
    }

    if (USE_API) {
      try {
        const dto = await firstValueFrom(
          this.api.patch<CuentaDto>(`/cuentas/${cuentaId}/cliente`, {
            cliente: this.aClientePayload(cliente),
          }),
        );
        // El PATCH devuelve un resumen: `pedidos` viene como lista de ids, no
        // como rondas completas. Conservamos las rondas locales y solo
        // actualizamos el cliente para no romper el detalle en pantalla.
        const actualizada: Cuenta = {
          ...cuenta,
          cliente: toCuenta(dto).cliente ?? cliente,
        };
        this.upsert(actualizada);
        return actualizada;
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
      }
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
        const pendiente = this.clientesPendientes.get(mesaId);
        const dto = await firstValueFrom(
          this.api.post<CuentaDto>('/cuentas', {
            mesa_id: mesaId,
            cliente: pendiente ? this.aClientePayload(pendiente) : undefined,
          }),
        );
        const cuenta = toCuenta(dto);
        this.clientesPendientes.delete(mesaId);
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
    clave?: string,
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
          idempotency_key: clave ?? null,
          enviar_cocina: true,
        };
        let dto = await firstValueFrom(
          this.api.post<PedidoDto>(`/cuentas/${cuentaId}/pedidos`, payload),
        );
        const idempotente = dto.idempotente === true;
        if (dto.estado !== 'en_cocina' && dto.estado !== 'cancelado') {
          dto = await firstValueFrom(
            this.api.post<PedidoDto>(`/pedidos/${dto.id}/enviar-cocina`),
          );
        }
        if (idempotente) {
          const actual = this.porId(cuentaId) ?? cuenta;
          const existente = actual.rondas.find((ronda) => ronda.id === dto.id);
          return existente ?? toRonda(dto, actual.rondas.length + 1);
        }
        const ronda = toRonda(dto, cuenta.rondas.length + 1);
        this.cuentas.update((lista) =>
          lista.map((actual) =>
            actual.id === cuentaId
              ? {
                  ...actual,
                  rondas: [...actual.rondas, ronda],
                  total: round2(actual.total + dto.total),
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
    this.clientesPendientes.delete(cuenta.mesaId);

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
    this.clientesPendientes.delete(cuenta.mesaId);

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

  private aClientePayload(cliente: DatosCliente): {
    nombre: string;
    tipo_documento: string;
    numero_documento: string;
    telefono?: string;
  } {
    const telefono = cliente.telefono?.trim();
    return {
      nombre: cliente.nombre,
      tipo_documento: cliente.tipoDocumento,
      numero_documento: cliente.numeroDocumento,
      ...(telefono ? { telefono } : {}),
    };
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
