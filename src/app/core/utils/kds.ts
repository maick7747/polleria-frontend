import type {
  Curso,
  EstadoLineaKds,
  Estacion,
  Pedido,
  PedidoDetalle,
} from '../models';

export const ORDEN_ESTACIONES: readonly Estacion[] = [
  'parrilla',
  'frituras',
  'frios',
  'bar',
];

export const ORDEN_CURSOS: readonly Curso[] = ['entrada', 'fondo', 'postre'];

export const ESTACION_LABEL: Record<Estacion, string> = {
  parrilla: 'Parrilla',
  frituras: 'Frituras',
  frios: 'Fríos',
  bar: 'Bar',
};

export const CURSO_LABEL: Record<Curso, string> = {
  entrada: 'Entrada',
  fondo: 'Fondo',
  postre: 'Postre',
};

const esBebida = (nombre: string): boolean =>
  /chicha|inca kola|gaseosa|limonada|cerveza|bebida|agua/.test(nombre);

const esFrio = (nombre: string): boolean =>
  /ensalada|huanca|mousse|helado|postre/.test(nombre);

const esFritura = (nombre: string): boolean =>
  /papa(s)? frit|fritura|chicharr/.test(nombre);

// Fallback para filas antiguas sin `estacion`: replica el mapeo del prototipo.
export function estacionDe(item: {
  estacion?: string | null;
  nombre?: string | null;
}): Estacion {
  const valor = (item.estacion ?? '').toLowerCase();
  if (valor === 'parrilla' || valor === 'frituras' || valor === 'frios' || valor === 'bar') {
    return valor;
  }
  const nombre = (item.nombre ?? '').toLowerCase();
  if (esBebida(nombre)) {
    return 'bar';
  }
  if (esFrio(nombre)) {
    return 'frios';
  }
  if (esFritura(nombre)) {
    return 'frituras';
  }
  return 'parrilla';
}

export function cursoDe(item: {
  curso?: string | null;
  nombre?: string | null;
}): Curso {
  const valor = (item.curso ?? '').toLowerCase();
  if (valor === 'entrada' || valor === 'fondo' || valor === 'postre') {
    return valor;
  }
  const nombre = (item.nombre ?? '').toLowerCase();
  if (/huanca|anticucho|entrada/.test(nombre)) {
    return 'entrada';
  }
  if (/mousse|postre|helado/.test(nombre)) {
    return 'postre';
  }
  return 'fondo';
}

export function estadoLinea(item: PedidoDetalle): EstadoLineaKds {
  if (item.entregadoEn) {
    return 'entregado';
  }
  return item.estadoPreparacion;
}

export function estaEntregada(item: PedidoDetalle): boolean {
  return Boolean(item.entregadoEn);
}

export function esBar(item: PedidoDetalle): boolean {
  return estacionDe(item) === 'bar';
}

function activas(pedido: Pedido): PedidoDetalle[] {
  return pedido.items.filter((item) => !estaEntregada(item));
}

// La ronda se puede entregar cuando todas sus líneas activas están listas.
export function listoParaEntregar(pedido: Pedido): boolean {
  const lineas = activas(pedido);
  return lineas.length > 0 && lineas.every((item) => estadoLinea(item) === 'listo');
}

export function pedidoCerrado(pedido: Pedido): boolean {
  if (pedido.todosEntregados) {
    return true;
  }
  return pedido.items.length > 0 && pedido.items.every(estaEntregada);
}

export interface ProgresoRonda {
  cocinaOk: number;
  cocinaTotal: number;
  barOk: number;
  barTotal: number;
}

export function progresoRonda(items: readonly PedidoDetalle[]): ProgresoRonda {
  const cocina = items.filter((item) => !esBar(item));
  const bar = items.filter(esBar);
  const hechos = (lista: readonly PedidoDetalle[]): number =>
    lista.filter((item) => {
      const estado = estadoLinea(item);
      return estado === 'listo' || estado === 'entregado';
    }).length;
  return {
    cocinaOk: hechos(cocina),
    cocinaTotal: cocina.length,
    barOk: hechos(bar),
    barTotal: bar.length,
  };
}

export interface AllDayFila {
  platilloId: number | null;
  nombre: string;
  cantidad: number;
  enFuego: number;
}

export interface AllDayGrupo {
  estacion: Estacion;
  total: number;
  filas: AllDayFila[];
}

export interface AllDayResumen {
  grupos: AllDayGrupo[];
  total: number;
}

export interface FiltroAllDay {
  estacion?: Estacion | 'todas';
  curso?: Curso | 'todos';
}

// Agrupa líneas activas por estación + platillo (id+nombre). Excluye entregadas.
export function agruparAllDay(
  items: readonly PedidoDetalle[],
  filtro: FiltroAllDay = {},
): AllDayResumen {
  const estacionFiltro = filtro.estacion ?? 'todas';
  const cursoFiltro = filtro.curso ?? 'todos';
  const mapa = new Map<string, AllDayFila & { estacion: Estacion }>();

  for (const item of items) {
    if (estaEntregada(item)) {
      continue;
    }
    const estacion = estacionDe(item);
    const curso = cursoDe(item);
    if (estacionFiltro !== 'todas' && estacion !== estacionFiltro) {
      continue;
    }
    if (cursoFiltro !== 'todos' && curso !== cursoFiltro) {
      continue;
    }
    const clave = `${estacion}|${item.platilloId}|${item.nombre}`;
    const registro = mapa.get(clave) ?? {
      estacion,
      platilloId: item.platilloId,
      nombre: item.nombre,
      cantidad: 0,
      enFuego: 0,
    };
    registro.cantidad += item.cantidad;
    if (estadoLinea(item) === 'en_preparacion') {
      registro.enFuego += item.cantidad;
    }
    mapa.set(clave, registro);
  }

  const grupos: AllDayGrupo[] = [];
  let total = 0;
  for (const estacion of ORDEN_ESTACIONES) {
    const filas = [...mapa.values()]
      .filter((fila) => fila.estacion === estacion)
      .map<AllDayFila>((fila) => ({
        platilloId: fila.platilloId,
        nombre: fila.nombre,
        cantidad: fila.cantidad,
        enFuego: fila.enFuego,
      }));
    if (filas.length === 0) {
      continue;
    }
    const subtotal = filas.reduce((suma, fila) => suma + fila.cantidad, 0);
    total += subtotal;
    grupos.push({ estacion, total: subtotal, filas });
  }
  return { grupos, total };
}

export interface AllDayItemMeta {
  platillo_id: number;
  platillo_nombre: string;
  estacion: string;
  cantidad: number;
  en_fuego: number;
}

// Convierte el `meta.all_day` del backend al mismo shape de la vista y aplica
// el filtro de estación (el meta no trae `curso`; para ese filtro se recalcula
// en cliente con `agruparAllDay`).
export function agruparAllDayMeta(
  items: readonly AllDayItemMeta[],
  filtro: FiltroAllDay = {},
): AllDayResumen {
  const estacionFiltro = filtro.estacion ?? 'todas';
  const grupos: AllDayGrupo[] = [];
  let total = 0;
  for (const estacion of ORDEN_ESTACIONES) {
    if (estacionFiltro !== 'todas' && estacion !== estacionFiltro) {
      continue;
    }
    const filas = items
      .filter((item) => estacionDe({ estacion: item.estacion, nombre: item.platillo_nombre }) === estacion)
      .map<AllDayFila>((item) => ({
        platilloId: item.platillo_id,
        nombre: item.platillo_nombre,
        cantidad: item.cantidad,
        enFuego: item.en_fuego,
      }));
    if (filas.length === 0) {
      continue;
    }
    const subtotal = filas.reduce((suma, fila) => suma + fila.cantidad, 0);
    total += subtotal;
    grupos.push({ estacion, total: subtotal, filas });
  }
  return { grupos, total };
}

export function itemsActivos(pedidos: readonly Pedido[]): PedidoDetalle[] {
  return pedidos.filter((pedido) => !pedidoCerrado(pedido)).flatMap((pedido) => pedido.items);
}
