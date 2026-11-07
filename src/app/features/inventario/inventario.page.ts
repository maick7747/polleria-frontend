import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InventarioService } from '../../core/data/inventario.service';
import type { Insumo } from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type FiltroInventario = 'todos' | 'bajo' | 'critico';
type EstadoInventario = 'ok' | 'bajo' | 'critico';

interface FilaInventario {
  insumoId: number;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: number;
  minimo: number;
  costo: number;
  ratio: number;
  porcentaje: number;
  barra: number;
  estado: EstadoInventario;
}

const CATEGORIAS: Readonly<Record<Insumo['categoria'], string>> = {
  alimento: 'Abarrotes',
  bebida: 'Bebidas',
  limpieza: 'Limpieza',
  empaque: 'Descartables',
  insumo_general: 'Insumos',
};

@Component({
  selector: 'app-inventario-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inventario.page.html',
  styleUrl: './inventario.page.css',
})
export class InventarioPage {
  private readonly inventario = inject(InventarioService);

  readonly filtro = signal<FiltroInventario>('todos');
  readonly busqueda = signal<string>('');

  readonly moneda = formatearMoneda;
  readonly valorInventario = this.inventario.valorInventario;

  readonly filas = computed<FilaInventario[]>(() =>
    this.inventario.insumos().map((insumo) => this.fila(insumo)),
  );

  readonly conteos = computed(() => {
    const filas = this.filas();
    return {
      todos: filas.length,
      bajo: filas.filter((fila) => fila.estado !== 'ok').length,
      critico: filas.filter((fila) => fila.estado === 'critico').length,
      ok: filas.filter((fila) => fila.estado === 'ok').length,
    };
  });

  readonly alertas = computed<FilaInventario[]>(() =>
    this.filas().filter((fila) => fila.estado !== 'ok'),
  );

  readonly visibles = computed<FilaInventario[]>(() => {
    const filtro = this.filtro();
    const termino = this.busqueda().trim().toLowerCase();
    return this.filas().filter((fila) => {
      const coincideFiltro =
        filtro === 'todos' ||
        (filtro === 'bajo' && fila.estado !== 'ok') ||
        (filtro === 'critico' && fila.estado === 'critico');
      const coincideTexto =
        !termino ||
        fila.nombre.toLowerCase().includes(termino) ||
        fila.categoria.toLowerCase().includes(termino);
      return coincideFiltro && coincideTexto;
    });
  });

  readonly valorRiesgo = computed<number>(() =>
    round2(this.alertas().reduce((suma, fila) => suma + fila.stock * fila.costo, 0)),
  );

  readonly subtitulo = computed(
    () =>
      `${this.conteos().todos} insumos · ${this.alertas().length} bajo mínimo · actualizado 17:40`,
  );

  constructor() {
    void this.inventario.cargar();
  }

  cambiarFiltro(filtro: FiltroInventario): void {
    this.filtro.set(filtro);
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  cantidad(valor: number, unidad: string): string {
    const redondeado = Math.round(valor * 10) / 10;
    const texto = Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1);
    return `${texto} ${unidad}`;
  }

  textoEstado(estado: EstadoInventario): string {
    if (estado === 'critico') {
      return 'Crítico';
    }
    if (estado === 'bajo') {
      return 'Bajo';
    }
    return 'OK';
  }

  tonoEstado(estado: EstadoInventario): ChipVariant {
    if (estado === 'critico') {
      return 'danger';
    }
    if (estado === 'bajo') {
      return 'warning';
    }
    return 'neutral';
  }

  private fila(insumo: Insumo): FilaInventario {
    const ratio = insumo.stockMinimo > 0 ? insumo.stockActual / insumo.stockMinimo : 1;
    const estado: EstadoInventario = ratio <= 0.6 ? 'critico' : ratio <= 1 ? 'bajo' : 'ok';
    return {
      insumoId: insumo.id,
      nombre: insumo.nombre,
      categoria: CATEGORIAS[insumo.categoria],
      unidad: insumo.unidadMedida,
      stock: insumo.stockActual,
      minimo: insumo.stockMinimo,
      costo: insumo.costoPromedio,
      ratio,
      porcentaje: Math.round(ratio * 100),
      barra: Math.min(100, Math.round(ratio * 100)),
      estado,
    };
  }
}
