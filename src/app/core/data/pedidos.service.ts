import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CanalPedido,
  EstadoPago,
  EstadoPedido,
  MetodoPago,
  Pedido,
  PedidoDetalle,
  TipoConsumo,
} from '../models';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esFalloRed, mensajeError } from '../api/api.helpers';
import {
  leerResultadoCancelacion,
  type ResultadoCancelacion,
} from '../api/cancelacion.helpers';
import type {
  ApiList,
  CobroPedidoResponseDto,
  ComprobanteDto,
  KdsEstadoLineaDto,
  KdsEstadoResponseDto,
  KdsPedidoDto,
  PageMeta,
  PagoDto,
  PedidoDto,
  PedidoSelectorDto,
} from '../api/api.types';
import { toPedido, toPedidoKds } from '../api/api.mappers';
import { MOCK_PEDIDOS } from './mock-data';

export interface PedidosQuery {
  page?: number;
  limit?: number;
  estado?: string;
  canal?: string;
  desde?: string;
  hasta?: string;
}

export interface PedidosMeta extends PageMeta {
  prioritarios?: number;
  sla_min?: number;
}

export interface CancelacionPedido {
  pedido: Pedido;
  resultado: ResultadoCancelacion;
}

/** Cabecera liviana para selectores (sin líneas del pedido). */
export interface PedidoSelector {
  id: number;
  numero: string;
  canal: CanalPedido;
  tipoConsumo: TipoConsumo;
  total: number;
  fecha: string;
  clienteNombre?: string;
  mesaNumero?: number | null;
  mozoNombre?: string;
}

export interface NuevoPedido {
  canal: CanalPedido;
  tipoConsumo: TipoConsumo;
  mesaId: number | null;
  cuentaId: number | null;
  rondaId: number | null;
  items: PedidoDetalle[];
  clienteNombre?: string;
  direccionEntrega?: string;
  referenciaEntrega?: string;
  observaciones?: string;
  costoDelivery?: number;
  comisionPlataforma?: number;
  estadoPago?: EstadoPago;
  totalFinal?: number;
}

/** Alta de un pedido de mostrador (sin mesa ni cuenta). */
export interface NuevoPedidoParaLlevar {
  items: PedidoDetalle[];
  clienteNombre?: string;
  observaciones?: string;
}

/**
 * Modo demo: `CobroPedidoResponseDto` habla en DTOs porque es la forma del
 * backend. El servicio solo lo usa para mantener las listas al día, pero el
 * objeto debe ser coherente para que la pantalla muestre comprobante y vuelto.
 */
function pedidoADto(
  pedido: Pedido,
  metodo: MetodoPago,
  comprobanteNumero: string,
): PedidoDto {
  return {
    id: pedido.id,
    numero: pedido.numero,
    fecha_pedido: pedido.fechaPedido,
    canal: pedido.canal,
    tipo_consumo: pedido.tipoConsumo,
    mesa_id: pedido.mesaId,
    cuenta_id: pedido.cuentaId,
    cliente_id: null,
    repartidor_id: pedido.repartidorId ?? null,
    usuario_cajero_id: pedido.usuarioCajeroId,
    estado: pedido.estado,
    estado_pago: pedido.estadoPago,
    metodo_pago: metodo,
    subtotal: pedido.subtotal,
    igv: pedido.igv,
    total: pedido.total,
    comision_plataforma: pedido.comisionPlataforma,
    costo_delivery: pedido.costoDelivery,
    direccion_entrega: pedido.direccionEntrega ?? null,
    referencia_entrega: pedido.referenciaEntrega ?? null,
    observaciones: pedido.observaciones ?? null,
    comprobante_tipo: pedido.comprobanteTipo,
    comprobante_numero: comprobanteNumero,
    cliente_nombre: pedido.clienteNombre ?? null,
    fecha_entrega: pedido.fechaEntrega ?? null,
    estado_entrega: pedido.estadoEntrega ?? null,
    detalles: pedido.items.map((item) => ({
      id: item.id,
      pedido_id: pedido.id,
      platillo_id: item.platilloId,
      cantidad: item.cantidad,
      precio_unitario: item.precioUnitario,
      subtotal: item.subtotal,
      notas: item.notas ?? null,
      estado_preparacion: item.estadoPreparacion,
      fecha_inicio_prep: item.fechaInicioPrep ?? null,
      fecha_listo: item.fechaListo ?? null,
      platillo_nombre: item.nombre,
      estacion: item.estacion ?? null,
      curso: item.curso ?? null,
      prep_min: item.prepMin ?? null,
      entregado_en: item.entregadoEn ?? null,
    })),
  };
}

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly api = inject(ApiClient);

  private secuencia = 1000;

  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly meta = signal<PedidosMeta | null>(null);

  readonly pedidos = signal<Pedido[]>(
    USE_API
      ? []
      : MOCK_PEDIDOS.map((pedido) => ({
          ...pedido,
          items: pedido.items.map((item) => ({ ...item })),
        })),
  );

  // Mostrador / para llevar: pedidos sin mesa ni cuenta. Lista propia porque
  // el backend los pagina y filtra por `tipo_consumo`.
  readonly paraLLevar = signal<Pedido[]>([]);
  readonly paraLLevarCargando = signal<boolean>(false);
  readonly paraLLevarError = signal<string | null>(null);

  // Si el KDS ya se aplicó (permite hidratarse con el cuerpo de un 304).
  private hidratadoKds = false;

  readonly activos = computed<Pedido[]>(() =>
    this.pedidos().filter(
      (pedido) => pedido.estado !== 'cobrado' && pedido.estado !== 'cancelado',
    ),
  );

  readonly enCocina = computed<Pedido[]>(() =>
    this.pedidos().filter((pedido) => pedido.estado === 'en_cocina'),
  );

  readonly cobrados = computed<Pedido[]>(() =>
    this.pedidos().filter((pedido) => pedido.estado === 'cobrado'),
  );

  porId(id: number): Pedido | undefined {
    return this.pedidos().find((pedido) => pedido.id === id);
  }

  /**
   * Carga un pedido puntual con sus `detalles` desde el backend.
   * Lanza el `ApiError` (404/403/red) para que la pantalla lo muestre.
   */
  async obtenerPorId(id: number): Promise<Pedido | null> {
    if (!USE_API) {
      return this.porId(id) ?? null;
    }
    const dto = await firstValueFrom(this.api.get<PedidoDto>(`/pedidos/${id}`));
    const pedido = toPedido(dto);
    this.guardarEnLista(pedido);
    return pedido;
  }

  /**
   * Busca pedidos para un selector sin traer sus líneas.
   * `GET /api/pedidos/selector?q=&limit=` devuelve solo cabecera + nombres.
   */
  async buscarSelector(q: string, limit = 10): Promise<PedidoSelector[]> {
    const termino = q.trim();

    if (!USE_API) {
      const buscado = termino.toLowerCase();
      return this.pedidos()
        .filter((pedido) => pedido.estado !== 'cancelado')
        .filter(
          (pedido) =>
            !buscado ||
            pedido.numero.toLowerCase().includes(buscado) ||
            String(pedido.clienteNombre || '').toLowerCase().includes(buscado),
        )
        .slice(0, limit)
        .map((pedido) => ({
          id: pedido.id,
          numero: pedido.numero,
          canal: pedido.canal,
          tipoConsumo: pedido.tipoConsumo,
          total: pedido.total,
          fecha: pedido.fechaPedido,
          clienteNombre: pedido.clienteNombre,
          mesaNumero: pedido.mesaNumero ?? null,
          mozoNombre: undefined,
        }));
    }

    this.error.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<PedidoSelectorDto>>('/pedidos/selector', {
          q: termino || undefined,
          limit,
        }),
      );
      return lista.data.map((dto) => ({
        id: dto.id,
        numero: dto.numero,
        canal: dto.canal as CanalPedido,
        tipoConsumo: dto.tipo_consumo as TipoConsumo,
        total: Number(dto.total),
        fecha: dto.fecha_pedido,
        clienteNombre: dto.cliente_nombre ?? undefined,
        mesaNumero: dto.mesa_numero ?? null,
        mozoNombre: dto.usuario_cajero_nombre ?? undefined,
      }));
    } catch (error) {
      this.error.set(mensajeError(error));
      return [];
    }
  }

  /**
   * `POST /api/pedidos/:id/cancelar`: cancela y revierte el stock real.
   * Devuelve el pedido actualizado y los movimientos repuestos.
   * Lanza el `ApiError` (409 si está cobrado/cancelado, 403, red).
   */
  async cancelarPedido(id: number, motivo?: string): Promise<CancelacionPedido | null> {
    if (!USE_API) {
      const pedido = this.porId(id);
      if (!pedido) {
        return null;
      }
      this.cambiarEstado(id, 'cancelado');
      return {
        pedido: { ...pedido, estado: 'cancelado' },
        resultado: leerResultadoCancelacion({ movimientos_inventario: 0 }),
      };
    }

    const respuesta = await firstValueFrom(
      this.api.post<PedidoDto & Record<string, unknown>>(`/pedidos/${id}/cancelar`, {
        motivo: motivo || undefined,
      }),
    );
    const pedido = toPedido(respuesta);
    this.guardarEnLista(pedido);
    return { pedido, resultado: leerResultadoCancelacion(respuesta) };
  }

  private guardarEnLista(pedido: Pedido): void {
    this.pedidos.update((lista) =>
      lista.some((actual) => actual.id === pedido.id)
        ? lista.map((actual) => (actual.id === pedido.id ? pedido : actual))
        : [pedido, ...lista],
    );
  }

  // -------------------------------------------------------------------------
  // Mostrador / para llevar (pedidos sin mesa ni cuenta)
  // -------------------------------------------------------------------------

  /** `GET /api/pedidos?tipo_consumo=para_llevar&limit=100`. */
  async cargarParaLlevar(silencioso = false): Promise<boolean> {
    if (!USE_API) {
      this.paraLLevar.set(
        this.pedidos().filter((pedido) => pedido.tipoConsumo === 'para_llevar'),
      );
      this.paraLLevarError.set(null);
      return true;
    }

    if (!silencioso) {
      this.paraLLevarCargando.set(true);
      this.paraLLevarError.set(null);
    }
    try {
      const respuesta = await firstValueFrom(
        this.api.get<ApiList<PedidoDto>>('/pedidos', {
          tipo_consumo: 'para_llevar',
          limit: 100,
        }),
      );
      this.paraLLevar.set(respuesta.data.map(toPedido));
      return true;
    } catch (error) {
      if (!silencioso || this.paraLLevar().length === 0) {
        this.paraLLevarError.set(mensajeError(error));
      }
      return false;
    } finally {
      if (!silencioso) {
        this.paraLLevarCargando.set(false);
      }
    }
  }

  /**
   * `POST /api/pedidos` con `tipo_consumo='para_llevar'` y `enviar_cocina`.
   * El backend descuenta stock y deja el pedido en cocina en una sola llamada.
   */
  async crearParaLlevar(entrada: NuevoPedidoParaLlevar): Promise<Pedido | null> {
    const clienteNombre = entrada.clienteNombre?.trim() || undefined;
    const observaciones = entrada.observaciones?.trim() || undefined;

    if (!USE_API) {
      const pedido = this.crear({
        canal: 'local',
        tipoConsumo: 'para_llevar',
        mesaId: null,
        cuentaId: null,
        rondaId: null,
        items: entrada.items,
        clienteNombre,
        observaciones,
        estadoPago: 'pendiente',
      });
      this.paraLLevar.update((lista) => [pedido, ...lista]);
      return pedido;
    }

    this.paraLLevarError.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<PedidoDto>('/pedidos', {
          canal: 'local',
          tipo_consumo: 'para_llevar',
          mesa_id: null,
          cuenta_id: null,
          cliente_nombre: clienteNombre,
          observaciones,
          enviar_cocina: true,
          items: entrada.items.map((item) => ({
            platillo_id: item.platilloId,
            cantidad: item.cantidad,
            notas: item.notas ?? undefined,
          })),
        }),
      );
      const pedido = toPedido(dto);
      this.actualizarParaLlevar(pedido);
      this.guardarEnLista(pedido);
      return pedido;
    } catch (error) {
      this.paraLLevarError.set(mensajeError(error));
      return null;
    }
  }

  /** `POST /api/pedidos/:id/enviar-cocina` (reintento de un borrador). */
  async enviarCocinaPedido(id: number): Promise<Pedido | null> {
    if (!USE_API) {
      this.cambiarEstado(id, 'en_cocina');
      const pedido = this.porId(id) ?? null;
      if (pedido) {
        this.actualizarParaLlevar(pedido);
      }
      return pedido;
    }

    this.paraLLevarError.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<PedidoDto>(`/pedidos/${id}/enviar-cocina`),
      );
      const pedido = toPedido(dto);
      this.actualizarParaLlevar(pedido);
      this.guardarEnLista(pedido);
      return pedido;
    } catch (error) {
      this.paraLLevarError.set(mensajeError(error));
      return null;
    }
  }

  /**
   * `POST /api/pedidos/:id/cobrar`: pago de un pedido sin cuenta.
   * Devuelve el pedido, el pago y el ticket (`T001-…`) con el vuelto.
   */
  async cobrarPedido(
    id: number,
    metodo: MetodoPago,
    monto?: number,
  ): Promise<CobroPedidoResponseDto | null> {
    if (!USE_API) {
      const actual =
        this.paraLLevar().find((pedido) => pedido.id === id) ?? this.porId(id);
      if (!actual) {
        this.paraLLevarError.set('No se encontró el pedido para cobrar.');
        return null;
      }
      const recibido =
        monto !== undefined && Number.isFinite(monto)
          ? round2(Math.max(0, monto))
          : actual.total;
      const fecha = new Date().toISOString();
      const comprobante: ComprobanteDto = {
        tipo: 'ticket',
        numero: `T001-${String(actual.id).padStart(8, '0')}`,
        total: actual.total,
        fecha,
      };
      const actualizado: Pedido = {
        ...actual,
        estado: 'cobrado',
        estadoPago: 'pagado',
        metodoPago: metodo,
      };
      this.actualizarParaLlevar(actualizado);
      this.guardarEnLista(actualizado);
      const pago: PagoDto = {
        id: actual.id,
        pedido_id: actual.id,
        cuenta_id: null,
        metodo,
        monto: recibido,
        es_contraentrega: false,
        fecha,
        usuario_id: 0,
      };
      return {
        pedido: pedidoADto(actualizado, metodo, comprobante.numero),
        pago,
        comprobante,
        vuelto: round2(Math.max(0, recibido - actual.total)),
      };
    }

    this.paraLLevarError.set(null);
    try {
      const respuesta = await firstValueFrom(
        this.api.post<CobroPedidoResponseDto>(`/pedidos/${id}/cobrar`, {
          metodo,
          monto: monto !== undefined ? round2(monto) : undefined,
        }),
      );
      const pedido = toPedido(respuesta.pedido);
      this.actualizarParaLlevar(pedido);
      this.guardarEnLista(pedido);
      return respuesta;
    } catch (error) {
      this.paraLLevarError.set(mensajeError(error));
      return null;
    }
  }

  private actualizarParaLlevar(pedido: Pedido): void {
    this.paraLLevar.update((lista) =>
      lista.some((actual) => actual.id === pedido.id)
        ? lista.map((actual) => (actual.id === pedido.id ? pedido : actual))
        : [pedido, ...lista],
    );
  }

  async cargar(opciones: PedidosQuery = {}): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    const limit = opciones.limit ?? 100;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const respuesta = await firstValueFrom(
        this.api.get<ApiList<PedidoDto>>('/pedidos', {
          page: opciones.page ?? 1,
          limit,
          estado: opciones.estado || undefined,
          canal: opciones.canal || undefined,
          desde: opciones.desde || undefined,
          hasta: opciones.hasta || undefined,
        }),
      );
      this.pedidos.set(respuesta.data.map(toPedido));
      this.meta.set({
        page: respuesta.meta.page ?? 1,
        limit: respuesta.meta.limit ?? limit,
        total: respuesta.meta.total ?? respuesta.data.length,
        pages: respuesta.meta.pages ?? 0,
      });
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarKds(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    this.cargando.set(true);
    this.error.set(null);
    try {
      const resultado = await firstValueFrom(
        this.api.getConEtag<ApiList<KdsPedidoDto>>('/kds/pedidos'),
      );
      // 304: el cuerpo llega cacheado. Se aplica si cambió o si el servicio
      // aún no tiene datos (primera carga tras abrir la pantalla).
      if (resultado.data && (resultado.changed || !this.hidratadoKds)) {
        const respuesta = resultado.data;
        this.pedidos.set(respuesta.data.map(toPedidoKds));
        this.meta.set({
          page: 1,
          limit: respuesta.data.length,
          total: respuesta.meta.total ?? respuesta.data.length,
          pages: 1,
          prioritarios: respuesta.meta.prioritarios,
          sla_min: respuesta.meta.sla_min,
        });
        this.hidratadoKds = true;
      }
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  crear(entrada: NuevoPedido): Pedido {
    const subtotalItems = round2(entrada.items.reduce((suma, item) => suma + item.subtotal, 0));
    const costoDelivery = entrada.costoDelivery ?? 0;
    const subtotal =
      entrada.totalFinal === undefined ? subtotalItems : round2(entrada.totalFinal / 1.18);
    const igv =
      entrada.totalFinal === undefined
        ? round2(subtotalItems * 0.18)
        : round2(entrada.totalFinal - subtotal);
    const totalPedido =
      entrada.totalFinal ?? round2(subtotalItems + igv + costoDelivery);
    const nuevo: Pedido = {
      id: ++this.secuencia,
      numero: `#${String(this.secuencia).padStart(4, '0')}`,
      fechaPedido: new Date().toISOString(),
      canal: entrada.canal,
      tipoConsumo: entrada.tipoConsumo,
      mesaId: entrada.mesaId,
      cuentaId: entrada.cuentaId,
      rondaId: entrada.rondaId,
      clienteNombre: entrada.clienteNombre,
      usuarioCajeroId: 3,
      estado: 'en_cocina',
      estadoPago: entrada.estadoPago ?? 'pendiente',
      subtotal,
      igv,
      total: totalPedido,
      comisionPlataforma: entrada.comisionPlataforma ?? 0,
      costoDelivery,
      direccionEntrega: entrada.direccionEntrega,
      referenciaEntrega: entrada.referenciaEntrega,
      observaciones: entrada.observaciones,
      comprobanteTipo: 'ticket',
      items: entrada.items,
    };
    this.pedidos.update((lista) => [nuevo, ...lista]);
    return nuevo;
  }

  cambiarEstado(id: number, estado: EstadoPedido): void {
    this.pedidos.update((lista) =>
      lista.map((pedido) => (pedido.id === id ? { ...pedido, estado } : pedido)),
    );
  }

  asignarRepartidor(pedidoId: number, repartidorId: number): void {
    this.pedidos.update((lista) =>
      lista.map((pedido) =>
        pedido.id === pedidoId ? { ...pedido, repartidorId } : pedido,
      ),
    );
  }

  async marcarItemListo(pedidoId: number, itemId: number): Promise<boolean> {
    if (USE_API) {
      try {
        const respuesta = await firstValueFrom(
          this.api.patch<KdsEstadoResponseDto>(
            `/kds/pedidos/${pedidoId}/platos/${itemId}/estado`,
            { estado: 'listo' },
          ),
        );
        this.aplicarLinea(pedidoId, respuesta.linea, respuesta.pedido_estado);
        return true;
      } catch (error) {
        if (!esFalloRed(error)) {
          throw error;
        }
        // En modo API no se marca "listo" solo en memoria: el mozo no se enteraría.
        if (USE_API) {
          throw error;
        }
      }
    }

    this.marcarItemListoLocal(pedidoId, itemId);
    return true;
  }

  private aplicarLinea(
    pedidoId: number,
    linea: KdsEstadoLineaDto,
    pedidoEstado: string,
  ): void {
    this.pedidos.update((lista) =>
      lista.map((pedido) => {
        if (pedido.id !== pedidoId) {
          return pedido;
        }
        const items = pedido.items.map((item) =>
          item.id === linea.id
            ? {
                ...item,
                estadoPreparacion: 'listo' as const,
                fechaListo: linea.fecha_listo ?? new Date().toISOString(),
              }
            : item,
        );
        const estado: EstadoPedido =
          pedidoEstado === 'en_cocina' ? 'en_cocina' : pedido.estado;
        return { ...pedido, items, estado };
      }),
    );
  }

  private marcarItemListoLocal(pedidoId: number, itemId: number): void {
    this.pedidos.update((lista) =>
      lista.map((pedido) =>
        pedido.id === pedidoId
          ? {
              ...pedido,
              items: pedido.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      estadoPreparacion: 'listo',
                      fechaListo: new Date().toISOString(),
                    }
                  : item,
              ),
            }
          : pedido,
      ),
    );
  }
}
