import { crearGuardiaUrl } from '../../core/utils/url-sync';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InventarioService, type InventarioQuery } from '../../core/data/inventario.service';
import type { Insumo } from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { iniciarRefresco } from '../../core/utils/refresco';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
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

const LIMITES = [10, 20, 50, 100];

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
    PaginadorComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inventario.page.html',
  styleUrl: './inventario.page.css',
})
export class InventarioPage {
  private readonly inventario = inject(InventarioService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlActiva = crearGuardiaUrl(this.router, this.destroyRef, '/inventario');
  private buscarTimer: number | null = null;

  readonly filtro = signal<FiltroInventario>('todos');
  readonly busqueda = signal<string>('');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);

  readonly moneda = formatearMoneda;
  readonly valorInventario = this.inventario.valorInventario;
  readonly conteos = this.inventario.conteos;
  readonly meta = this.inventario.meta;
  readonly cargando = this.inventario.cargando;
  readonly error = this.inventario.error;
  readonly consumoError = this.inventario.consumoError;

  readonly filas = computed<FilaInventario[]>(() =>
    this.inventario.insumos().map((insumo) => this.fila(insumo)),
  );

  readonly alertas = computed<FilaInventario[]>(() =>
    this.inventario.alertas().map((insumo) => this.fila(insumo)),
  );

  /**
   * Cobertura mínima real: mínimo de `stock / (consumo / 7)` entre los insumos
   * con consumo > 0. `null` si no hay datos de consumo.
   */
  readonly coberturaMinima = computed<number | null>(() => {
    const consumo = this.inventario.consumo();
    if (consumo.size === 0) {
      return null;
    }
    const vistos = new Set<number>();
    let minima: number | null = null;
    for (const insumo of [...this.inventario.insumos(), ...this.inventario.alertas()]) {
      if (vistos.has(insumo.id)) {
        continue;
      }
      vistos.add(insumo.id);
      const total = consumo.get(insumo.id) ?? 0;
      if (total <= 0) {
        continue;
      }
      const dias = insumo.stockActual / (total / 7);
      if (minima === null || dias < minima) {
        minima = dias;
      }
    }
    return minima === null ? null : Math.round(minima * 10) / 10;
  });

  readonly coberturaTexto = computed<string>(() => {
    const valor = this.coberturaMinima();
    return valor === null ? '—' : `${valor} días`;
  });

  readonly visibles = computed<FilaInventario[]>(() => this.filas());

  readonly valorRiesgo = computed<number>(() =>
    round2(this.alertas().reduce((suma, fila) => suma + fila.stock * fila.costo, 0)),
  );

  readonly subtitulo = computed(() => {
    const conteos = this.conteos();
    return `${conteos.todos} insumos · ${conteos.alertas} bajo mínimo`;
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const estado = params.get('estado');
    this.filtro.set(estado === 'bajo' || estado === 'critico' ? estado : 'todos');
    this.busqueda.set(params.get('q') ?? '');
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);

    void this.cargar();

    iniciarRefresco({
      intervaloMs: 45000,
      destroyRef: this.destroyRef,
      tarea: () => this.refrescarSilencioso(),
    });

    this.destroyRef.onDestroy(() => {
      if (this.buscarTimer !== null) {
        window.clearTimeout(this.buscarTimer);
      }
    });
  }

  cambiarFiltro(filtro: FiltroInventario): void {
    if (this.filtro() === filtro) {
      return;
    }
    this.filtro.set(filtro);
    this.pagina.set(1);
    void this.cargar();
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
    if (this.buscarTimer !== null) {
      window.clearTimeout(this.buscarTimer);
    }
    this.buscarTimer = window.setTimeout(() => {
      this.pagina.set(1);
    void this.cargar();
    void this.inventario.cargarConsumo(7);
    }, 350);
  }

  cambiarPagina(page: number): void {
    this.pagina.set(page);
    void this.cargar();
  }

  cambiarLimite(limit: number): void {
    this.limite.set(limit);
    this.pagina.set(1);
    void this.cargar();
  }

  recargar(): void {
    void this.cargar();
    void this.inventario.cargarConsumo(7);
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

  private async cargar(): Promise<void> {
    const ok = await this.inventario.cargar(this.consultaLista());
    if (ok) {
      this.pagina.set(this.inventario.meta().page);
      this.limite.set(this.inventario.meta().limit);
      this.sincronizarUrl();
    }
  }

  private consultaLista(): InventarioQuery {
    return {
      page: this.pagina(),
      limit: this.limite(),
      q: this.busqueda(),
      estado: this.filtro() === 'todos' ? undefined : this.filtro(),
    };
  }

  /**
   * Refresco silencioso con la misma página, filtro y búsqueda, sin URL ni
   * spinner.
   */
  private async refrescarSilencioso(): Promise<void> {
    await this.inventario.cargar(this.consultaLista(), true);
  }

  private sincronizarUrl(): void {
    if (!this.urlActiva()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        q: this.busqueda().trim() || null,
        estado: this.filtro() === 'todos' ? null : this.filtro(),
      },
      replaceUrl: true,
    });
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
