import { computed, Injectable, signal } from '@angular/core';
import { round2 } from '../utils/format';

export type EstadoSugerencia = 'critico' | 'bajo' | 'ok';

export type EstadoOrden = 'borrador' | 'enviada' | 'recibida';

export interface SugerenciaCompra {
  id: number;
  insumoId: number;
  nombre: string;
  proveedor: string;
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
  fecha: string;
  entrega: string;
  condicion: string;
  estado: EstadoOrden;
  items: number;
  total: number;
}

export interface EntradaCompra {
  id: number;
  codigo: string;
  proveedor: string;
  fecha: string;
  items: number;
  total: number;
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

@Injectable({ providedIn: 'root' })
export class ComprasService {
  private secuenciaOrden = 148;

  readonly sugerencias = signal<SugerenciaCompra[]>(
    MOCK_SUGERENCIAS.map((sugerencia) => ({ ...sugerencia })),
  );

  readonly ordenes = signal<OrdenCompra[]>(MOCK_ORDENES.map((orden) => ({ ...orden })));

  readonly entradas = signal<EntradaCompra[]>(MOCK_ENTRADAS.map((entrada) => ({ ...entrada })));

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
    sugerencias: this.sugerencias().length,
    seleccionadas: this.seleccionadas().length,
    ordenes: this.ordenes().length,
    entradas: this.entradas().length,
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

  crearOrden(): OrdenCompra | null {
    const seleccionadas = this.seleccionadas();
    if (seleccionadas.length === 0) {
      return null;
    }
    const proveedores = new Set(seleccionadas.map((sugerencia) => sugerencia.proveedor));
    const codigo = `OC-${String(++this.secuenciaOrden).padStart(4, '0')}`;
    const orden: OrdenCompra = {
      id: this.secuenciaOrden,
      codigo,
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
    return orden;
  }
}
