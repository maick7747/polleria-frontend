export type CategoriaInsumo =
  | 'alimento'
  | 'bebida'
  | 'limpieza'
  | 'empaque'
  | 'insumo_general';

export type UnidadMedida = 'kg' | 'g' | 'l' | 'ml' | 'und' | 'docena';

export type TipoMovimiento = 'entrada' | 'salida' | 'merma' | 'ajuste' | 'devolucion';

export type CategoriaPlatillo =
  | 'Pollos'
  | 'Guarniciones'
  | 'Bebidas'
  | 'Combos'
  | 'Entradas'
  | 'Postres';

export interface Insumo {
  id: number;
  codigo: string;
  nombre: string;
  categoria: CategoriaInsumo;
  unidadMedida: UnidadMedida;
  stockActual: number;
  stockMinimo: number;
  umbralMermaPct: number;
  costoPromedio: number;
  activo: boolean;
}

export interface MovimientoStock {
  id: number;
  insumoId: number;
  tipo: TipoMovimiento;
  cantidad: number;
  stockResultante: number;
  referenciaTipo: 'compra' | 'pedido' | 'merma' | 'devolucion' | 'ajuste';
  referenciaId: number;
  usuarioId: number;
  observacion: string;
  fecha: string;
}

export interface IngredienteFicha {
  insumoId: number;
  nombre: string;
  cantidad: number;
  unidadMedida: UnidadMedida;
  costoUnitario: number;
}

export interface Plato {
  id: number;
  nombre: string;
  descripcion: string;
  categoria: CategoriaPlatillo;
  precioVenta: number;
  activo: boolean;
  ingredientes: IngredienteFicha[];
}
