import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { round2 } from '../utils/format';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type {
  ApiList,
  CompraDto,
  PageMeta,
  ProveedorDto,
  SugerenciaResponseDto,
} from '../api/api.types';
import { toCompra, toEntrada, toSugerencia } from '../api/api.mappers';

export type EstadoSugerencia = 'critico' | 'bajo' | 'ok';

export type EstadoOrden = 'borrador' | 'enviada' | 'recibida' | 'cancelada';

export type EstadoCompraFiltro = 'ordenada' | 'recibida' | 'cancelada';

export interface SugerenciaCompra {
  id: number;
  insumoId: number;
  nombre: string;
  proveedor: string;
  proveedorId?: number | null;
  categoria: string;
  unidad: string;
  stock: number;
  stockMinimo: number;
  sugerido: number;
  precioUnitario: number;
  estado: EstadoSugerencia;
  seleccionada: boolean;
}

export interface OrdenCompra {
  id: number;
  codigo: string;
  proveedor: string;
  proveedorId?: number | null;
  fecha: string;
  entrega: string;
  condicion: string;
  estado: EstadoOrden;
  items: number;
  total: number;
  notas?: string;
  fechaRecepcion?: string | null;
  motivoCancelacion?: string | null;
}

export interface EntradaCompra {
  id: number;
  codigo: string;
  proveedor: string;
  fecha: string;
  items: number;
  total: number;
}

export interface ComprasQuery {
  page?: number;
  limit?: number;
  estado?: EstadoCompraFiltro;
  proveedorId?: number;
  desde?: string;
  hasta?: string;
  q?: string;
  sort?: string;
}

export interface SugerenciasMeta {
  total: number;
  generadoEn: string;
  criterio: string;
}

export interface CrearOrdenOpciones {
  proveedorId?: number | null;
  fecha?: string;
  notas?: string;
}

export interface RegistrarPagoCompra {
  metodo: string;
  monto: number;
  observacion?: string;
}

const MOCK_SUGERENCIAS: readonly SugerenciaCompra[] = [
  {
    id: 1,
    insumoId: 1,
    nombre: 'Pollo entero',
    proveedor: 'Pollo Fresco SAC',
    categoria: 'aves',
    unidad: 'kg',
    stock: 4,
    stockMinimo: 15,
    sugerido: 24,
    precioUnitario: 12.5,
    estado: 'critico',
    seleccionada: true,
  },
  {
    id: 2,
    insumoId: 2,
    nombre: 'Papa amarilla',
    proveedor: 'Mercado Mayorista',
    categoria: 'abarrotes',
    unidad: 'kg',
    stock: 6,
    stockMinimo: 20,
    sugerido: 30,
    precioUnitario: 3.2,
    estado: 'bajo',
    seleccionada: true,
  },
  {
    id: 3,
    insumoId: 3,
    nombre: 'Ají amarillo',
    proveedor: 'Mercado Mayorista',
    categoria: 'abarrotes',
    unidad: 'kg',
    stock: 2,
    stockMinimo: 4,
    sugerido: 6,
    precioUnitario: 9.8,
    estado: 'bajo',
    seleccionada: true,
  },
  {
    id: 4,
    insumoId: 5,
    nombre: 'Carbón',
    proveedor: 'Distribuidora El Sol',
    categoria: 'insumos',
    unidad: 'saco',
    stock: 4,
    stockMinimo: 20,
    sugerido: 12,
    precioUnitario: 28,
    estado: 'ok',
    seleccionada: true,
  },
  {
    id: 5,
    insumoId: 6,
    nombre: 'Aceite vegetal',
    proveedor: 'Distribuidora El Sol',
    categoria: 'abarrotes',
    unidad: 'L',
    stock: 18,
    stockMinimo: 10,
    sugerido: 8,
    precioUnitario: 11.4,
    estado: 'ok',
    seleccionada: true,
  },
  {
    id: 6,
    insumoId: 7,
    nombre: 'Inca Kola 1.5 L',
    proveedor: 'Distribuidora El Sol',
    categoria: 'bebidas',
    unidad: 'und',
    stock: 12,
    stockMinimo: 24,
    sugerido: 15,
    precioUnitario: 7.5,
    estado: 'ok',
    seleccionada: true,
  },
  {
    id: 7,
    insumoId: 11,
    nombre: 'Vasos 8 oz',
    proveedor: 'Distribuidora El Sol',
    categoria: 'descartables',
    unidad: 'und',
    stock: 480,
    stockMinimo: 200,
    sugerido: 200,
    precioUnitario: 0.19,
    estado: 'ok',
    seleccionada: true,
  },
  {
    id: 8,
    insumoId: 10,
    nombre: 'Queso fresco',
    proveedor: 'Mercado Mayorista',
    categoria: 'lácteos',
    unidad: 'kg',
    stock: 2,
    stockMinimo: 1,
    sugerido: 1,
    precioUnitario: 18.35,
    estado: 'ok',
    seleccionada: true,
  },
];

const MOCK_ORDENES: readonly OrdenCompra[] = [
  {
    id: 148,
    codigo: 'OC-0148',
    proveedor: 'Distribuidora El Sol',
    fecha: '2026-10-14',
    entrega: 'Mañana 07:00',
    condicion: 'Crédito 15 días',
    estado: 'borrador',
    items: 8,
    total: 1240,
  },
  {
    id: 147,
    codigo: 'OC-0147',
    proveedor: 'Pollo Fresco SAC',
    fecha: '2026-10-12',
    entrega: 'Recibida 06:40',
    condicion: 'Contado',
    estado: 'recibida',
    items: 4,
    total: 612.4,
  },
  {
    id: 146,
    codigo: 'OC-0146',
    proveedor: 'Mercado Mayorista',
    fecha: '2026-10-10',
    entrega: 'Recibida 07:15',
    condicion: 'Contado',
    estado: 'recibida',
    items: 6,
    total: 348.9,
  },
];

const MOCK_ENTRADAS: readonly EntradaCompra[] = [
  {
    id: 32,
    codigo: 'E-0032',
    proveedor: 'Pollo Fresco SAC',
    fecha: '2026-10-13',
    items: 4,
    total: 612.4,
  },
  {
    id: 31,
    codigo: 'E-0031',
    proveedor: 'Distribuidora El Sol',
    fecha: '2026-10-11',
    items: 7,
    total: 438.2,
  },
];

export const LIMITE_ORDENES_INICIAL = 20;

function paginar<T>(
  lista: readonly T[],
  page: number,
  limit: number,
): { items: T[]; meta: PageMeta } {
  const total = lista.length;
  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  const inicio = (Math.max(1, page) - 1) * limit;
  return {
    items: lista.slice(inicio, inicio + limit),
    meta: { page: Math.max(1, page), limit, total, pages },
  };
}

@Injectable({ providedIn: 'root' })
export class ComprasService {
  private readonly api = inject(ApiClient);

  private secuenciaOrden = 148;
  private ultimaConsulta: ComprasQuery = {};

  readonly usaApi = USE_API;
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly avisos = signal<string[]>([]);

  readonly sugerencias = signal<SugerenciaCompra[]>(
    USE_API ? [] : MOCK_SUGERENCIAS.map((sugerencia) => ({ ...sugerencia })),
  );

  readonly ordenes = signal<OrdenCompra[]>(
    USE_API ? [] : MOCK_ORDENES.map((orden) => ({ ...orden })),
  );

  readonly entradas = signal<EntradaCompra[]>(
    USE_API ? [] : MOCK_ENTRADAS.map((entrada) => ({ ...entrada })),
  );

  readonly proveedoresLista = signal<ProveedorDto[]>([]);

  readonly meta = signal<PageMeta>({
    page: 1,
    limit: LIMITE_ORDENES_INICIAL,
    total: USE_API ? 0 : MOCK_ORDENES.length,
    pages: USE_API ? 0 : 1,
  });

  readonly metaSugerencias = signal<SugerenciasMeta>({
    total: USE_API ? 0 : MOCK_SUGERENCIAS.length,
    generadoEn: '',
    criterio: '',
  });

  readonly totales = signal({
    ordenes: USE_API ? 0 : MOCK_ORDENES.length,
    entradas: USE_API ? 0 : MOCK_ENTRADAS.length,
    sugerencias: USE_API ? 0 : MOCK_SUGERENCIAS.length,
  });

  readonly seleccionadas = computed<SugerenciaCompra[]>(() =>
    this.sugerencias().filter((sugerencia) => sugerencia.seleccionada),
  );

  readonly subtotal = computed<number>(() =>
    round2(
      this.seleccionadas().reduce(
        (suma, sugerencia) => suma + sugerencia.sugerido * sugerencia.precioUnitario,
        0,
      ),
    ),
  );

  readonly igv = computed<number>(() => round2(this.subtotal() * 0.18));

  readonly total = computed<number>(() => round2(this.subtotal() + this.igv()));

  readonly ordenActiva = computed<OrdenCompra | null>(
    () => this.ordenes().find((orden) => orden.estado === 'borrador') ?? this.ordenes()[0] ?? null,
  );

  readonly conteos = computed(() => ({
    sugerencias: this.totales().sugerencias,
    seleccionadas: this.seleccionadas().length,
    ordenes: this.totales().ordenes,
    entradas: this.totales().entradas,
  }));

  alternarSugerencia(id: number): void {
    this.sugerencias.update((lista) =>
      lista.map((sugerencia) =>
        sugerencia.id === id
          ? { ...sugerencia, seleccionada: !sugerencia.seleccionada }
          : sugerencia,
      ),
    );
  }

  async cargarOrdenes(opciones: ComprasQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? LIMITE_ORDENES_INICIAL;
    const q = opciones.q?.trim() || undefined;
    const desde = opciones.desde || undefined;
    const hasta = opciones.hasta || undefined;
    const estado = opciones.estado;

    this.ultimaConsulta = {
      page,
      limit,
      estado,
      desde,
      hasta,
      q,
      proveedorId: opciones.proveedorId,
      sort: opciones.sort ?? 'fecha:desc',
    };

    if (!USE_API) {
      return this.cargarOrdenesMock(this.ultimaConsulta);
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<CompraDto>>('/compras', {
          page,
          limit,
          estado,
          proveedor_id: opciones.proveedorId,
          desde,
          hasta,
          q,
          sort: this.ultimaConsulta.sort,
        }),
      );
      const meta = this.normalizarMeta(lista, page, limit);
      this.meta.set(meta);

      if (estado === 'recibida') {
        this.entradas.set(lista.data.map(toEntrada));
        this.totales.update((totales) => ({ ...totales, entradas: meta.total }));
      } else {
        this.ordenes.set(lista.data.map(toCompra));
        this.totales.update((totales) => ({ ...totales, ordenes: meta.total }));
      }
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async contarEntradas(): Promise<void> {
    if (!USE_API) {
      return;
    }
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<CompraDto>>('/compras', { page: 1, limit: 1, estado: 'recibida' }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.totales.update((totales) => ({ ...totales, entradas: total }));
    } catch {
      // Silencioso: la carga principal ya reporta el error en el banner.
    }
  }

  async cargarSugerencias(): Promise<boolean> {
    if (!USE_API) {
      this.totales.update((totales) => ({
        ...totales,
        sugerencias: this.sugerencias().length,
      }));
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const respuesta = await firstValueFrom(
        this.api.get<SugerenciaResponseDto>('/compras/sugerencia'),
      );
      const sugerencias = respuesta.data.map(toSugerencia);
      this.sugerencias.set(sugerencias);
      const total = respuesta.meta?.total ?? sugerencias.length;
      this.metaSugerencias.set({
        total,
        generadoEn: respuesta.meta?.generado_en ?? '',
        criterio: respuesta.meta?.criterio ?? '',
      });
      this.totales.update((totales) => ({ ...totales, sugerencias: total }));
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarProveedores(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<ProveedorDto>>('/compras/proveedores', { limit: 100 }),
      );
      this.proveedoresLista.set(lista.data);
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    }
  }

  async crearOrden(opciones: CrearOrdenOpciones = {}): Promise<OrdenCompra[]> {
    this.avisos.set([]);
    const seleccionadas = this.seleccionadas();
    if (seleccionadas.length === 0) {
      return [];
    }

    if (!USE_API) {
      return [this.crearOrdenDemo(seleccionadas)];
    }

    const grupos = new Map<number, SugerenciaCompra[]>();
    const omitidas: string[] = [];
    for (const sugerencia of seleccionadas) {
      const proveedorId = sugerencia.proveedorId ?? opciones.proveedorId ?? null;
      if (!proveedorId) {
        omitidas.push(sugerencia.nombre);
        continue;
      }
      const grupo = grupos.get(proveedorId) ?? [];
      grupo.push(sugerencia);
      grupos.set(proveedorId, grupo);
    }

    if (omitidas.length > 0) {
      this.avisos.set([`Sin proveedor asignado, no se enviaron: ${omitidas.join(', ')}.`]);
    }
    if (grupos.size === 0) {
      return [];
    }

    this.cargando.set(true);
    this.error.set(null);
    const creadas: OrdenCompra[] = [];
    try {
      for (const [proveedorId, items] of grupos) {
        const dto = await firstValueFrom(
          this.api.post<CompraDto>('/compras', {
            proveedor_id: proveedorId,
            fecha: opciones.fecha || undefined,
            notas: opciones.notas || undefined,
            items: items.map((item) => ({
              insumo_id: item.insumoId,
              cantidad: item.sugerido,
              precio_unitario: item.precioUnitario,
            })),
          }),
        );
        creadas.push(toCompra(dto));
      }
      await this.recargar();
      return creadas;
    } catch (error) {
      this.error.set(mensajeError(error));
      return creadas;
    } finally {
      this.cargando.set(false);
    }
  }

  async recibir(id: number, fechaRecepcion?: string): Promise<boolean> {
    if (!USE_API) {
      this.recibirDemo(id);
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.api.post<CompraDto>(`/compras/${id}/recibir`, {
          fecha_recepcion: fechaRecepcion || undefined,
        }),
      );
      await this.recargar();
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async cancelar(id: number, motivo?: string): Promise<boolean> {
    if (!USE_API) {
      this.cancelarDemo(id, motivo);
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.api.post<CompraDto>(`/compras/${id}/cancelar`, { motivo: motivo || undefined }),
      );
      await this.recargar();
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async registrarPago(id: number, pago: RegistrarPagoCompra): Promise<boolean> {
    if (!USE_API) {
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.api.post<CompraDto>(`/compras/${id}/pagos`, {
          metodo: pago.metodo,
          monto: pago.monto,
          observacion: pago.observacion || undefined,
        }),
      );
      await this.recargar();
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async recargar(): Promise<boolean> {
    return this.cargarOrdenes(this.ultimaConsulta);
  }

  private normalizarMeta(lista: ApiList<unknown>, page: number, limit: number): PageMeta {
    const total = lista.meta.total ?? lista.data.length;
    return {
      page: lista.meta.page ?? page,
      limit: lista.meta.limit ?? limit,
      total,
      pages: lista.meta.pages ?? (limit > 0 ? Math.ceil(total / limit) : 0),
    };
  }

  private cargarOrdenesMock(opciones: ComprasQuery): boolean {
    const page = opciones.page ?? 1;
    const limit = opciones.limit ?? LIMITE_ORDENES_INICIAL;
    const termino = opciones.q?.trim().toLowerCase() ?? '';
    const desde = opciones.desde;
    const hasta = opciones.hasta;
    const enRango = (fecha: string): boolean =>
      (!desde || fecha >= desde) && (!hasta || fecha <= hasta);

    if (opciones.estado === 'recibida') {
      const filtradas = MOCK_ENTRADAS.filter(
        (entrada) =>
          enRango(entrada.fecha) &&
          (!termino ||
            entrada.codigo.toLowerCase().includes(termino) ||
            entrada.proveedor.toLowerCase().includes(termino)),
      );
      const { items, meta } = paginar(filtradas, page, limit);
      this.entradas.set(items.map((entrada) => ({ ...entrada })));
      this.meta.set(meta);
      this.totales.update((totales) => ({ ...totales, entradas: meta.total }));
      return true;
    }

    const coincideEstado = (estado: OrdenCompra['estado']): boolean => {
      if (!opciones.estado) {
        return true;
      }
      if (opciones.estado === 'ordenada') {
        return estado === 'borrador' || estado === 'enviada';
      }
      return estado === 'cancelada';
    };

    const filtradas = MOCK_ORDENES.filter(
      (orden) =>
        coincideEstado(orden.estado) &&
        enRango(orden.fecha) &&
        (!termino ||
          orden.codigo.toLowerCase().includes(termino) ||
          orden.proveedor.toLowerCase().includes(termino)),
    );
    const { items, meta } = paginar(filtradas, page, limit);
    this.ordenes.set(items.map((orden) => ({ ...orden })));
    this.meta.set(meta);
    this.totales.update((totales) => ({ ...totales, ordenes: meta.total }));
    return true;
  }

  private crearOrdenDemo(seleccionadas: SugerenciaCompra[]): OrdenCompra {
    const proveedores = new Set(seleccionadas.map((sugerencia) => sugerencia.proveedor));
    this.secuenciaOrden += 1;
    const orden: OrdenCompra = {
      id: this.secuenciaOrden,
      codigo: `OC-${String(this.secuenciaOrden).padStart(4, '0')}`,
      proveedor:
        proveedores.size === 1 ? seleccionadas[0].proveedor : `${proveedores.size} proveedores`,
      fecha: '2026-10-14',
      entrega: 'Mañana 07:00',
      condicion: 'Crédito 15 días',
      estado: 'borrador',
      items: seleccionadas.length,
      total: this.total(),
    };
    this.ordenes.update((lista) => [orden, ...lista]);
    this.totales.update((totales) => ({ ...totales, ordenes: totales.ordenes + 1 }));
    return orden;
  }

  private recibirDemo(id: number): void {
    const orden = this.ordenes().find((actual) => actual.id === id);
    this.ordenes.update((lista) =>
      lista.map((actual) =>
        actual.id === id ? { ...actual, estado: 'recibida', entrega: 'Recibida' } : actual,
      ),
    );
    if (!orden) {
      return;
    }
    const entrada: EntradaCompra = {
      id: orden.id,
      codigo: `E-${String(orden.id).padStart(4, '0')}`,
      proveedor: orden.proveedor,
      fecha: orden.fecha,
      items: orden.items,
      total: orden.total,
    };
    this.entradas.update((lista) => [entrada, ...lista]);
    this.totales.update((totales) => ({ ...totales, entradas: totales.entradas + 1 }));
  }

  private cancelarDemo(id: number, motivo?: string): void {
    this.ordenes.update((lista) =>
      lista.map((actual) =>
        actual.id === id
          ? {
              ...actual,
              estado: 'cancelada',
              entrega: 'Cancelada',
              motivoCancelacion: motivo || null,
            }
          : actual,
      ),
    );
  }
}
