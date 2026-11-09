/**
 * Utilidades para leer la respuesta de los endpoints de cancelación de pedidos
 * (`POST /api/pedidos/:id/cancelar` y
 * `POST /api/delivery-externo/pedidos/:id/cancelar`).
 *
 * El backend devuelve `movimientos_inventario`: hoy es el **conteo** de
 * movimientos repuestos, pero el contrato también admite un arreglo con el
 * detalle. Aquí se normalizan ambos casos para que la UI no dependa del shape
 * exacto (ver limitación documentada en el entregable).
 */

export interface MovimientoRepuesto {
  insumo: string;
  insumoId: number | null;
  unidad: string | null;
  cantidad: number;
}

export interface ResultadoCancelacion {
  movimientos: MovimientoRepuesto[];
  cantidadMovimientos: number;
  stockRevertido: boolean;
}

interface MovimientoCrudo {
  insumo?: unknown;
  insumo_nombre?: unknown;
  nombre?: unknown;
  insumo_id?: unknown;
  cantidad?: unknown;
  unidad?: unknown;
  unidad_medida?: unknown;
}

const textoDe = (...valores: unknown[]): string | null => {
  for (const valor of valores) {
    if (typeof valor === 'string' && valor.trim().length > 0) {
      return valor.trim();
    }
  }
  return null;
};

const numeroDe = (valor: unknown): number | null => {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
};

function movimientoDesde(crudo: unknown, indice: number): MovimientoRepuesto {
  const fila = (crudo ?? {}) as MovimientoCrudo;
  const insumoId = numeroDe(fila.insumo_id);
  const nombre =
    textoDe(fila.insumo, fila.insumo_nombre, fila.nombre) ??
    (insumoId !== null ? `Insumo ${insumoId}` : `Insumo ${indice + 1}`);
  return {
    insumo: nombre,
    insumoId,
    unidad: textoDe(fila.unidad, fila.unidad_medida),
    cantidad: numeroDe(fila.cantidad) ?? 0,
  };
}

export function leerResultadoCancelacion(payload: unknown): ResultadoCancelacion {
  const cuerpo = (payload ?? {}) as Record<string, unknown>;
  const valor = cuerpo['movimientos_inventario'];
  const bandera = cuerpo['stock_revertido'];

  if (Array.isArray(valor)) {
    const movimientos = valor.map((item, indice) => movimientoDesde(item, indice));
    return {
      movimientos,
      cantidadMovimientos: movimientos.length,
      stockRevertido:
        typeof bandera === 'boolean' ? bandera : movimientos.length > 0,
    };
  }

  const conteo = numeroDe(valor);
  const cantidad = conteo === null ? 0 : Math.max(0, Math.trunc(conteo));
  return {
    movimientos: [],
    cantidadMovimientos: cantidad,
    stockRevertido: typeof bandera === 'boolean' ? bandera : cantidad > 0,
  };
}

/** Texto compacto: "Pollo entero · 0.9 kg, Papa · 0.4 kg". */
export function describirRepuestos(resultado: ResultadoCancelacion): string {
  return resultado.movimientos
    .map((movimiento) => {
      const cantidad = movimiento.cantidad.toLocaleString('es-PE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });
      return movimiento.unidad
        ? `${movimiento.insumo} · ${cantidad} ${movimiento.unidad}`
        : `${movimiento.insumo} · ${cantidad}`;
    })
    .join(', ');
}
