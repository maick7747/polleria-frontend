import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CanalPedido, Pedido, PedidoDetalle } from '../models';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type {
  ApiList,
  DeliveryExternoPedidoDto,
  DeliveryPropioPedidoDto,
  EntregaResponseDto,
  LiquidacionDeliveryDto,
  PageMeta,
} from '../api/api.types';
import {
  toDeliveryExterno,
  toDeliveryPropio,
  toLiquidacion,
  type DeliveryExternoVista,
  type DeliveryPropioVista,
  type LiquidacionVista,
} from '../api/api.mappers';
import { MOCK_PEDIDOS, MOCK_USUARIOS } from './mock-data';
import { PedidosService } from './pedidos.service';

export type PlataformaExterna = Extract<CanalPedido, 'rappi' | 'llamafood'>;

export const COMISION_PLATAFORMA: Record<PlataformaExterna, number> = {
  rappi: 25,
  llamafood: 20,
};

export const COSTO_DELIVERY_PROPIO = 5;

export interface NuevoDeliveryPropio {
  canal?: 'whatsapp' | 'telefono';
  clienteNombre: string;
  clienteTelefono?: string;
  direccionEntrega: string;
  referenciaEntrega?: string;
  observaciones?: string;
  costoDelivery?: number;
  items: PedidoDetalle[];
  enviarCocina?: boolean;
}

export interface NuevoDeliveryExterno {
  plataforma: PlataformaExterna;
  clienteNombre: string;
  direccionEntrega: string;
  referenciaEntrega?: string;
  observaciones?: string;
  items: PedidoDetalle[];
}

export interface DeliveryPropioQuery {
  page?: number;
  limit?: number;
  estado?: string;
  desde?: string;
  hasta?: string;
  sort?: string;
  repartidorId?: number;
}

export interface DeliveryExternoQuery {
  page?: number;
  limit?: number;
  plataforma?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  sort?: string;
}

export interface LiquidacionesQuery {
  page?: number;
  limit?: number;
  plataforma?: string;
  desde?: string;
  hasta?: string;
}

const META_INICIAL: PageMeta = { page: 1, limit: 20, total: 0, pages: 0 };

const paginar = <T>(
  lista: readonly T[],
  page: number,
  limit: number,
): { items: T[]; meta: PageMeta } => {
  const total = lista.length;
  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  const inicio = (Math.max(1, page) - 1) * limit;
  return {
    items: lista.slice(inicio, inicio + limit),
    meta: { page: Math.max(1, page), limit, total, pages },
  };
};

const textoDetalle = (items: readonly PedidoDetalle[]): string =>
  items.length === 0
    ? 'Sin ítems'
    : items.map((item) => `${item.cantidad}× ${item.nombre}`).join(' · ');

const propioDesdePedido = (pedido: Pedido): DeliveryPropioVista => ({
  id: pedido.id,
  numero: pedido.numero,
  fecha: pedido.fechaPedido,
  canal: pedido.canal,
  estado: pedido.estado,
  estadoPago: pedido.estadoPago,
  estadoEntrega: pedido.fechaEntrega ? 'entregado' : null,
  clienteId: null,
  clienteNombre: pedido.clienteNombre?.trim() || 'Sin cliente',
  repartidorId: pedido.repartidorId ?? null,
  repartidorNombre: pedido.repartidorId ? `Repartidor ${pedido.repartidorId}` : null,
  direccion: pedido.direccionEntrega?.trim() || 'Sin dirección',
  referencia: pedido.referenciaEntrega?.trim() || '',
  observaciones: pedido.observaciones?.trim() || '',
  minutos: 0,
  subtotal: pedido.subtotal,
  igv: pedido.igv,
  total: pedido.total,
  costoDelivery: pedido.costoDelivery,
  metodoPago: pedido.metodoPago ?? null,
  items: pedido.items.map((item) => ({ ...item })),
  detalleTexto: textoDetalle(pedido.items),
});

const externoDesdePedido = (pedido: Pedido): DeliveryExternoVista => {
  const plataforma = pedido.canal === 'llamafood' ? 'llamafood' : 'rappi';
  const pct = COMISION_PLATAFORMA[plataforma];
  const bruto = pedido.total;
  const comision =
    pedido.comisionPlataforma > 0 ? pedido.comisionPlataforma : round2((bruto * pct) / 100);
  return {
    id: pedido.id,
    numero: pedido.numero,
    fecha: pedido.fechaPedido,
    plataforma,
    estado: pedido.estado,
    estadoPago: pedido.estadoPago,
    clienteNombre: pedido.clienteNombre?.trim() || 'Sin cliente',
    direccion: pedido.direccionEntrega?.trim() || 'Sin dirección',
    referencia: pedido.referenciaEntrega?.trim() || '',
    observaciones: pedido.observaciones?.trim() || '',
    minutos: 0,
    comisionPct: pct,
    montoBruto: bruto,
    comision,
    montoNeto: round2(bruto - comision),
    total: bruto,
    items: pedido.items.map((item) => ({ ...item })),
    detalleTexto: textoDetalle(pedido.items),
  };
};

const LIQUIDACIONES_DEMO: readonly LiquidacionVista[] = [
  { id: 1, plataforma: 'rappi', fecha: '2026-10-14', montoBruto: 186.4, comision: 46.6, montoNeto: 139.8, pedidos: 4, referencia: 'Depósito 24 h', origen: 'demo' },
  { id: 2, plataforma: 'llamafood', fecha: '2026-10-14', montoBruto: 92.5, comision: 18.5, montoNeto: 74, pedidos: 2, referencia: 'Depósito 24 h', origen: 'demo' },
  { id: 3, plataforma: 'rappi', fecha: '2026-10-13', montoBruto: 152.8, comision: 38.2, montoNeto: 114.6, pedidos: 3, referencia: 'Depósito 24 h', origen: 'demo' },
];

@Injectable({ providedIn: 'root' })
export class DeliveryService {
  private readonly api = inject(ApiClient);
  private readonly pedidos = inject(PedidosService);

  private secuencia = 2000;

  private readonly demoPropios: DeliveryPropioVista[] = MOCK_PEDIDOS.filter(
    (pedido) => pedido.canal === 'delivery_propio' || pedido.canal === 'whatsapp',
  ).map(propioDesdePedido);
  private readonly demoExternos: DeliveryExternoVista[] = MOCK_PEDIDOS.filter(
    (pedido) => pedido.canal === 'rappi' || pedido.canal === 'llamafood',
  ).map(externoDesdePedido);

  readonly propios = signal<DeliveryPropioVista[]>(
    USE_API ? [] : this.demoPropios.map((pedido) => ({ ...pedido })),
  );
  readonly propiosMeta = signal<PageMeta>({ ...META_INICIAL });
  readonly propiosCargando = signal<boolean>(false);
  readonly propiosError = signal<string | null>(null);

  readonly externos = signal<DeliveryExternoVista[]>(
    USE_API ? [] : this.demoExternos.map((pedido) => ({ ...pedido })),
  );
  readonly externosMeta = signal<PageMeta>({ ...META_INICIAL });
  readonly externosCargando = signal<boolean>(false);
  readonly externosError = signal<string | null>(null);

  private readonly demoLiquidaciones: LiquidacionVista[] =
    LIQUIDACIONES_DEMO.map((fila) => ({ ...fila }));

  readonly liquidaciones = signal<LiquidacionVista[]>(
    USE_API ? [] : this.demoLiquidaciones.map((fila) => ({ ...fila })),
  );
  readonly liquidacionesMeta = signal<PageMeta>({ ...META_INICIAL });
  readonly liquidacionesCargando = signal<boolean>(false);
  readonly liquidacionesError = signal<string | null>(null);

  readonly repartidores = computed(() =>
    MOCK_USUARIOS.filter((usuario) => usuario.roles.includes('Repartidor')),
  );

  readonly repartidoresConocidos = computed<{ id: number; nombre: string }[]>(() => {
    const mapa = new Map<number, string>();
    for (const pedido of this.propios()) {
      if (pedido.repartidorId !== null) {
        mapa.set(pedido.repartidorId, pedido.repartidorNombre ?? `Repartidor ${pedido.repartidorId}`);
      }
    }
    return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre }));
  });

  readonly enCamino = computed<DeliveryPropioVista[]>(() =>
    this.propios().filter((pedido) => pedido.estadoEntrega === 'en_camino'),
  );

  readonly pendientes = computed<DeliveryPropioVista[]>(() =>
    this.propios().filter(
      (pedido) => pedido.estado === 'en_cocina' || pedido.estado === 'borrador',
    ),
  );

  // -------------------------------------------------------------------------
  // Listados
  // -------------------------------------------------------------------------

  async cargarPropios(opciones: DeliveryPropioQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? 20;
    const estado = opciones.estado || undefined;
    const desde = opciones.desde || undefined;
    const hasta = opciones.hasta || undefined;
    const sort = opciones.sort ?? 'fecha_pedido:desc';

    if (!USE_API) {
      const filtrados = this.demoPropios
        .filter(
          (pedido) =>
            !estado || pedido.estado === estado || pedido.estadoEntrega === estado,
        )
        .filter(
          (pedido) =>
            (!desde || pedido.fecha.slice(0, 10) >= desde) &&
            (!hasta || pedido.fecha.slice(0, 10) <= hasta),
        )
        .filter(
          (pedido) =>
            opciones.repartidorId === undefined ||
            pedido.repartidorId === opciones.repartidorId,
        )
        .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
      const { items, meta } = paginar(
        filtrados.map((pedido) => ({ ...pedido })),
        page,
        limit,
      );
      this.propios.set(items);
      this.propiosMeta.set(meta);
      this.propiosError.set(null);
      return true;
    }

    this.propiosCargando.set(true);
    this.propiosError.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<DeliveryPropioPedidoDto>>('/delivery-propio/pedidos', {
          page,
          limit,
          estado,
          desde,
          hasta,
          sort,
          repartidor_id: opciones.repartidorId,
        }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.propios.set(lista.data.map(toDeliveryPropio));
      this.propiosMeta.set({
        page: lista.meta.page ?? page,
        limit: lista.meta.limit ?? limit,
        total,
        pages: lista.meta.pages ?? (limit > 0 ? Math.ceil(total / limit) : 0),
      });
      return true;
    } catch (error) {
      this.propiosError.set(mensajeError(error));
      return false;
    } finally {
      this.propiosCargando.set(false);
    }
  }

  async cargarExternos(opciones: DeliveryExternoQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? 20;
    const plataforma = opciones.plataforma || undefined;
    const estado = opciones.estado || undefined;
    const desde = opciones.desde || undefined;
    const hasta = opciones.hasta || undefined;
    const sort = opciones.sort ?? 'fecha_pedido:desc';

    if (!USE_API) {
      const filtrados = this.demoExternos
        .filter((pedido) => !plataforma || pedido.plataforma === plataforma)
        .filter((pedido) => !estado || pedido.estado === estado)
        .filter(
          (pedido) =>
            (!desde || pedido.fecha.slice(0, 10) >= desde) &&
            (!hasta || pedido.fecha.slice(0, 10) <= hasta),
        )
        .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
      const { items, meta } = paginar(
        filtrados.map((pedido) => ({ ...pedido })),
        page,
        limit,
      );
      this.externos.set(items);
      this.externosMeta.set(meta);
      this.externosError.set(null);
      return true;
    }

    this.externosCargando.set(true);
    this.externosError.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<DeliveryExternoPedidoDto>>('/delivery-externo/pedidos', {
          page,
          limit,
          plataforma,
          estado,
          desde,
          hasta,
          sort,
        }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.externos.set(lista.data.map(toDeliveryExterno));
      this.externosMeta.set({
        page: lista.meta.page ?? page,
        limit: lista.meta.limit ?? limit,
        total,
        pages: lista.meta.pages ?? (limit > 0 ? Math.ceil(total / limit) : 0),
      });
      return true;
    } catch (error) {
      this.externosError.set(mensajeError(error));
      return false;
    } finally {
      this.externosCargando.set(false);
    }
  }

  async cargarLiquidaciones(opciones: LiquidacionesQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? 20;

    if (!USE_API) {
      const filtradas = this.demoLiquidaciones.filter(
        (fila) =>
          (!opciones.plataforma || fila.plataforma === opciones.plataforma) &&
          (!opciones.desde || fila.fecha >= opciones.desde) &&
          (!opciones.hasta || fila.fecha <= opciones.hasta),
      );
      const { items, meta } = paginar(filtradas.map((fila) => ({ ...fila })), page, limit);
      this.liquidaciones.set(items);
      this.liquidacionesMeta.set(meta);
      this.liquidacionesError.set(null);
      return true;
    }

    this.liquidacionesCargando.set(true);
    this.liquidacionesError.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<LiquidacionDeliveryDto>>('/delivery-externo/liquidaciones', {
          page,
          limit,
          plataforma: opciones.plataforma,
          desde: opciones.desde || undefined,
          hasta: opciones.hasta || undefined,
        }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.liquidaciones.set(lista.data.map(toLiquidacion));
      this.liquidacionesMeta.set({
        page: lista.meta.page ?? page,
        limit: lista.meta.limit ?? limit,
        total,
        pages: lista.meta.pages ?? (limit > 0 ? Math.ceil(total / limit) : 0),
      });
      return true;
    } catch (error) {
      this.liquidacionesError.set(mensajeError(error));
      return false;
    } finally {
      this.liquidacionesCargando.set(false);
    }
  }

  // -------------------------------------------------------------------------
  // Acciones — delivery propio
  // -------------------------------------------------------------------------

  async crearPropio(entrada: NuevoDeliveryPropio): Promise<DeliveryPropioVista | null> {
    if (!USE_API) {
      const pedido = this.pedidos.crear({
        canal: entrada.canal === 'telefono' ? 'delivery_propio' : (entrada.canal ?? 'delivery_propio'),
        tipoConsumo: 'delivery',
        mesaId: null,
        cuentaId: null,
        rondaId: null,
        items: entrada.items,
        clienteNombre: entrada.clienteNombre,
        direccionEntrega: entrada.direccionEntrega,
        referenciaEntrega: entrada.referenciaEntrega,
        observaciones: entrada.observaciones,
        costoDelivery: entrada.costoDelivery ?? COSTO_DELIVERY_PROPIO,
        estadoPago: 'contraentrega_pendiente',
      });
      const vista = propioDesdePedido(pedido);
      this.demoPropios.unshift(vista);
      this.propios.update((lista) => [vista, ...lista]);
      this.propiosMeta.update((meta) => ({ ...meta, total: meta.total + 1 }));
      return vista;
    }

    this.propiosError.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<DeliveryPropioPedidoDto>('/delivery-propio/pedidos', {
          canal: entrada.canal ?? 'whatsapp',
          cliente: {
            nombre: entrada.clienteNombre,
            telefono: entrada.clienteTelefono || undefined,
            direccion: entrada.direccionEntrega,
            referencia: entrada.referenciaEntrega || undefined,
          },
          direccion_entrega: entrada.direccionEntrega,
          referencia_entrega: entrada.referenciaEntrega || undefined,
          observaciones: entrada.observaciones || undefined,
          costo_delivery: entrada.costoDelivery ?? COSTO_DELIVERY_PROPIO,
          enviar_cocina: entrada.enviarCocina ?? entrada.items.length > 0,
          items: entrada.items.map((item) => ({
            platillo_id: item.platilloId,
            cantidad: item.cantidad,
            notas: item.notas ?? undefined,
          })),
        }),
      );
      const vista = toDeliveryPropio(dto);
      this.propios.update((lista) => [vista, ...lista]);
      this.propiosMeta.update((meta) => ({ ...meta, total: meta.total + 1 }));
      return vista;
    } catch (error) {
      this.propiosError.set(mensajeError(error));
      return null;
    }
  }

  async asignarRepartidor(
    pedidoId: number,
    repartidorId: number,
  ): Promise<boolean> {
    if (!USE_API) {
      this.pedidos.asignarRepartidor(pedidoId, repartidorId);
      const cambios = {
        repartidorId,
        repartidorNombre: `Repartidor ${repartidorId}`,
      };
      this.mutarDemoPropio(pedidoId, cambios);
      this.propios.update((lista) =>
        lista.map((pedido) => (pedido.id === pedidoId ? { ...pedido, ...cambios } : pedido)),
      );
      return true;
    }

    this.propiosError.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.patch<DeliveryPropioPedidoDto>(
          `/delivery-propio/pedidos/${pedidoId}/repartidor`,
          { repartidor_id: repartidorId },
        ),
      );
      this.reemplazarPropio(toDeliveryPropio(dto));
      return true;
    } catch (error) {
      this.propiosError.set(mensajeError(error));
      return false;
    }
  }

  async cambiarEstadoEntrega(
    pedidoId: number,
    estado: 'en_camino' | 'entregado',
  ): Promise<boolean> {
    if (!USE_API) {
      const estadoPedido = estado === 'entregado' ? 'cobrado' : 'servido';
      const cambios = { estadoEntrega: estado, estado: estadoPedido };
      this.mutarDemoPropio(pedidoId, cambios);
      this.propios.update((lista) =>
        lista.map((pedido) => (pedido.id === pedidoId ? { ...pedido, ...cambios } : pedido)),
      );
      return true;
    }

    this.propiosError.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.patch<DeliveryPropioPedidoDto>(
          `/delivery-propio/pedidos/${pedidoId}/estado`,
          { estado },
        ),
      );
      const vista = toDeliveryPropio(dto);
      this.reemplazarPropio({ ...vista, estadoEntrega: dto.estado_entrega ?? estado });
      return true;
    } catch (error) {
      this.propiosError.set(mensajeError(error));
      return false;
    }
  }

  async registrarEntrega(
    pedidoId: number,
    metodoPago: string,
    montoRecibido: number,
  ): Promise<number | null> {
    if (!USE_API) {
      const actual = this.demoPropios.find((pedido) => pedido.id === pedidoId);
      const vuelto = round2(Math.max(0, montoRecibido - (actual?.total ?? 0)));
      const cambios = {
        estado: 'cobrado',
        estadoPago: 'pagado',
        estadoEntrega: 'entregado',
        metodoPago,
      };
      this.mutarDemoPropio(pedidoId, cambios);
      this.propios.update((lista) =>
        lista.map((pedido) => (pedido.id === pedidoId ? { ...pedido, ...cambios } : pedido)),
      );
      return vuelto;
    }

    this.propiosError.set(null);
    try {
      const respuesta = await firstValueFrom(
        this.api.post<EntregaResponseDto>(
          `/delivery-propio/pedidos/${pedidoId}/entrega`,
          {
            metodo: metodoPago,
            metodo_pago: metodoPago,
            monto: montoRecibido,
            monto_recibido: montoRecibido,
          },
        ),
      );
      const vista = toDeliveryPropio(respuesta.pedido);
      this.reemplazarPropio({
        ...vista,
        estado: 'cobrado',
        estadoPago: 'pagado',
        estadoEntrega: 'entregado',
        metodoPago,
      });
      return Number(respuesta.vuelto ?? 0);
    } catch (error) {
      this.propiosError.set(mensajeError(error));
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Acciones — delivery externo
  // -------------------------------------------------------------------------

  async crearExterno(
    entrada: NuevoDeliveryExterno,
  ): Promise<DeliveryExternoVista | null> {
    if (!USE_API) {
      const pedido = this.pedidos.crear({
        canal: entrada.plataforma,
        tipoConsumo: 'delivery',
        mesaId: null,
        cuentaId: null,
        rondaId: null,
        items: entrada.items,
        clienteNombre: entrada.clienteNombre,
        direccionEntrega: entrada.direccionEntrega,
        referenciaEntrega: entrada.referenciaEntrega,
        observaciones: entrada.observaciones,
      });
      const vista = externoDesdePedido(pedido);
      this.demoExternos.unshift(vista);
      this.externos.update((lista) => [vista, ...lista]);
      this.externosMeta.update((meta) => ({ ...meta, total: meta.total + 1 }));
      return vista;
    }

    this.externosError.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<DeliveryExternoPedidoDto>('/delivery-externo/pedidos', {
          plataforma: entrada.plataforma,
          cliente: {
            nombre: entrada.clienteNombre,
            direccion: entrada.direccionEntrega,
            referencia: entrada.referenciaEntrega || undefined,
          },
          direccion_entrega: entrada.direccionEntrega,
          referencia_entrega: entrada.referenciaEntrega || undefined,
          observaciones: entrada.observaciones || undefined,
          items: entrada.items.map((item) => ({
            platillo_id: item.platilloId,
            cantidad: item.cantidad,
            notas: item.notas ?? undefined,
          })),
        }),
      );
      const vista = toDeliveryExterno(dto);
      this.externos.update((lista) => [vista, ...lista]);
      this.externosMeta.update((meta) => ({ ...meta, total: meta.total + 1 }));
      return vista;
    } catch (error) {
      this.externosError.set(mensajeError(error));
      return null;
    }
  }

  async aceptarExterno(pedidoId: number): Promise<boolean> {
    if (!USE_API) {
      this.actualizarExternoLocal(pedidoId, { estado: 'en_cocina' });
      return true;
    }

    this.externosError.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<DeliveryExternoPedidoDto>(
          `/delivery-externo/pedidos/${pedidoId}/aceptar`,
        ),
      );
      this.reemplazarExterno(toDeliveryExterno(dto));
      return true;
    } catch (error) {
      this.externosError.set(mensajeError(error));
      return false;
    }
  }

  async cancelarExterno(pedidoId: number, motivo?: string): Promise<boolean> {
    if (!USE_API) {
      this.actualizarExternoLocal(pedidoId, { estado: 'cancelado' });
      return true;
    }

    this.externosError.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.post<DeliveryExternoPedidoDto>(
          `/delivery-externo/pedidos/${pedidoId}/cancelar`,
          { motivo: motivo || undefined },
        ),
      );
      this.reemplazarExterno(toDeliveryExterno(dto));
      return true;
    } catch (error) {
      this.externosError.set(mensajeError(error));
      return false;
    }
  }

  async crearLiquidacion(
    plataforma: PlataformaExterna,
    fecha: string,
    montoBruto: number,
  ): Promise<boolean> {
    if (!USE_API) {
      const pct = COMISION_PLATAFORMA[plataforma];
      const comision = round2((montoBruto * pct) / 100);
      const nueva: LiquidacionVista = {
        id: ++this.secuencia,
        plataforma,
        fecha,
        montoBruto: round2(montoBruto),
        comision,
        montoNeto: round2(montoBruto - comision),
        pedidos: 0,
        referencia: 'Registro manual',
        origen: 'demo',
      };
      this.demoLiquidaciones.unshift(nueva);
      this.liquidaciones.update((lista) => [nueva, ...lista]);
      this.liquidacionesMeta.update((meta) => ({ ...meta, total: meta.total + 1 }));
      return true;
    }

    this.liquidacionesError.set(null);
    try {
      await firstValueFrom(
        this.api.post<LiquidacionDeliveryDto>('/delivery-externo/liquidaciones', {
          plataforma,
          fecha,
          monto_bruto: montoBruto,
        }),
      );
      return true;
    } catch (error) {
      this.liquidacionesError.set(mensajeError(error));
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private reemplazarPropio(vista: DeliveryPropioVista): void {
    this.propios.update((lista) =>
      lista.map((pedido) => (pedido.id === vista.id ? vista : pedido)),
    );
  }

  private reemplazarExterno(vista: DeliveryExternoVista): void {
    this.externos.update((lista) =>
      lista.map((pedido) => (pedido.id === vista.id ? vista : pedido)),
    );
  }

  private mutarDemoPropio(
    pedidoId: number,
    cambios: Partial<DeliveryPropioVista>,
  ): void {
    const indice = this.demoPropios.findIndex((pedido) => pedido.id === pedidoId);
    if (indice >= 0) {
      this.demoPropios[indice] = { ...this.demoPropios[indice], ...cambios };
    }
  }

  private actualizarExternoLocal(
    pedidoId: number,
    cambios: Partial<DeliveryExternoVista>,
  ): void {
    const indice = this.demoExternos.findIndex((pedido) => pedido.id === pedidoId);
    if (indice >= 0) {
      this.demoExternos[indice] = { ...this.demoExternos[indice], ...cambios };
    }
    this.externos.update((lista) =>
      lista.map((pedido) => (pedido.id === pedidoId ? { ...pedido, ...cambios } : pedido)),
    );
  }
}

export type { DeliveryExternoVista, DeliveryPropioVista, LiquidacionVista };
