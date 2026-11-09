import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FichasService } from '../../core/data/fichas.service';
import type { CategoriaPlatillo, Plato } from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type FiltroCategoria = 'Todas' | CategoriaPlatillo;

interface FilaFicha {
  id: number;
  nombre: string;
  descripcion: string;
  categoria: CategoriaPlatillo;
  precio: number;
  costo: number;
  margen: number;
  foodCost: number;
  ingredientes: number;
}

interface IngredienteVista {
  nombre: string;
  cantidad: number;
  unidad: string;
  costoUnitario: number;
  subtotal: number;
}

interface ResumenRentabilidad {
  total: number;
  margenPromedio: number;
  foodCostPromedio: number;
  mejor: { nombre: string; margen: number } | null;
  menor: { nombre: string; margen: number } | null;
  sobre30: number;
}

const LIMITES = [10, 20, 50, 100];

@Component({
  selector: 'app-fichas-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PaginadorComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fichas.page.html',
  styleUrl: './fichas.page.css',
})
export class FichasPage {
  private readonly fichas = inject(FichasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer: number | null = null;
  private buscarTimer: number | null = null;

  readonly categoria = signal<FiltroCategoria>('Todas');
  readonly busqueda = signal<string>('');
  readonly platoId = signal<number>(0);
  readonly editando = signal<boolean>(false);
  readonly formNombre = signal<string>('');
  readonly formPrecio = signal<number>(0);
  readonly toast = signal<string>('');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);
  readonly meta = this.fichas.meta;
  readonly cargando = this.fichas.cargando;
  readonly guardando = this.fichas.guardando;
  readonly error = this.fichas.error;

  readonly moneda = formatearMoneda;

  readonly filas = computed<FilaFicha[]>(() =>
    this.fichas.platos().map((plato) => this.fila(plato)),
  );

  readonly categorias = computed<readonly { nombre: FiltroCategoria; total: number }[]>(() => {
    const meta = this.meta();
    if (meta) {
      return [
        { nombre: 'Todas', total: meta.totalActivos },
        ...meta.categorias.map((item) => ({
          nombre: item.nombre as FiltroCategoria,
          total: item.total,
        })),
      ];
    }
    const filas = this.filas();
    const conteo = new Map<CategoriaPlatillo, number>();
    for (const fila of filas) {
      conteo.set(fila.categoria, (conteo.get(fila.categoria) ?? 0) + 1);
    }
    const lista: { nombre: FiltroCategoria; total: number }[] = [
      { nombre: 'Todas', total: filas.length },
    ];
    for (const [nombre, total] of conteo) {
      lista.push({ nombre, total });
    }
    return lista;
  });

  readonly visibles = computed<FilaFicha[]>(() => this.filas());

  readonly seleccionado = computed<FilaFicha | null>(
    () => this.filas().find((fila) => fila.id === this.platoId()) ?? null,
  );

  readonly ingredientes = computed<IngredienteVista[]>(() => {
    const plato = this.fichas.porId(this.platoId());
    if (!plato) {
      return [];
    }
    return plato.ingredientes.map((ingrediente) => ({
      nombre: ingrediente.nombre,
      cantidad: ingrediente.cantidad,
      unidad: ingrediente.unidadMedida,
      costoUnitario: ingrediente.costoUnitario,
      subtotal: round2(ingrediente.cantidad * ingrediente.costoUnitario),
    }));
  });

  readonly costoTotal = computed<number>(() =>
    round2(this.ingredientes().reduce((suma, item) => suma + item.subtotal, 0)),
  );

  readonly promedioCosto = computed<number>(() => {
    const meta = this.meta();
    if (meta) {
      return meta.costoPromedio;
    }
    const filas = this.filas();
    if (filas.length === 0) {
      return 0;
    }
    return round2(filas.reduce((suma, fila) => suma + fila.costo, 0) / filas.length);
  });

  readonly resumen = computed<ResumenRentabilidad>(() => {
    const meta = this.meta();
    if (meta) {
      return {
        total: meta.totalActivos,
        margenPromedio: meta.margenPromedio,
        foodCostPromedio: meta.foodCostPromedio,
        mejor: meta.mejor,
        menor: meta.menor,
        sobre30: meta.sobre30,
      };
    }
    const filas = this.filas();
    if (filas.length === 0) {
      return {
        total: 0,
        margenPromedio: 0,
        foodCostPromedio: 0,
        mejor: null,
        menor: null,
        sobre30: 0,
      };
    }
    let margenPromedio = 0;
    let foodCostPromedio = 0;
    let mejor = filas[0];
    let menor = filas[0];
    for (const fila of filas) {
      margenPromedio += fila.margen;
      foodCostPromedio += fila.foodCost;
      if (fila.margen > mejor.margen) {
        mejor = fila;
      }
      if (fila.margen < menor.margen) {
        menor = fila;
      }
    }
    return {
      total: filas.length,
      margenPromedio: round2(margenPromedio / filas.length),
      foodCostPromedio: Math.round((foodCostPromedio / filas.length) * 10) / 10,
      mejor,
      menor,
      sobre30: filas.filter((fila) => fila.foodCost > 30).length,
    };
  });

  readonly precioVista = computed<number>(() =>
    this.editando() ? round2(this.formPrecio()) : (this.seleccionado()?.precio ?? 0),
  );

  readonly margenVista = computed<number>(() => {
    const fila = this.seleccionado();
    if (!fila) {
      return 0;
    }
    return this.editando() ? round2(this.precioVista() - fila.costo) : fila.margen;
  });

  readonly foodCostVista = computed<number>(() => {
    const fila = this.seleccionado();
    if (!fila || this.precioVista() <= 0) {
      return 0;
    }
    return round2((fila.costo / this.precioVista()) * 100);
  });

  readonly subtitulo = computed<string>(() => {
    const categoria = this.categoria();
    const meta = this.meta();
    const total = meta?.total ?? this.filas().length;
    return `${total} platos · página ${meta?.page ?? 1} de ${meta?.pages || 1} · ${
      categoria === 'Todas' ? 'todas las categorías' : categoria
    }`;
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const categoria = params.get('categoria');
    this.categoria.set(
      categoria && categoria !== 'Todas' ? (categoria as FiltroCategoria) : 'Todas',
    );
    this.busqueda.set(params.get('q') ?? '');
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);

    void this.cargar();

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
      if (this.buscarTimer !== null) {
        window.clearTimeout(this.buscarTimer);
      }
    });
  }

  reintentar(): void {
    void this.cargar();
  }

  cantidad(valor: number): string {
    const redondeado = Math.round(valor * 100) / 100;
    return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(2);
  }

  porcentaje(valor: number): string {
    const redondeado = Math.round(valor * 10) / 10;
    return Number.isInteger(redondeado) ? `${redondeado}%` : `${redondeado.toFixed(1)}%`;
  }

  monto(valor: number): string {
    return valor.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  cambiarCategoria(categoria: FiltroCategoria): void {
    if (this.categoria() === categoria) {
      return;
    }
    this.categoria.set(categoria);
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

  seleccionar(id: number): void {
    this.platoId.set(id);
    this.editando.set(false);
  }

  verTodas(): void {
    this.categoria.set('Todas');
    this.busqueda.set('');
    this.pagina.set(1);
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    const ok = await this.fichas.cargar({
      page: this.pagina(),
      limit: this.limite(),
      q: this.busqueda(),
      categoria: this.categoria() === 'Todas' ? undefined : this.categoria(),
    });
    if (ok) {
      const meta = this.fichas.meta();
      this.pagina.set(meta?.page ?? 1);
      this.limite.set(meta?.limit ?? 20);
      this.asegurarSeleccion();
      this.sincronizarUrl();
    }
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        categoria: this.categoria() === 'Todas' ? null : this.categoria(),
        q: this.busqueda().trim() || null,
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
      },
      replaceUrl: true,
    });
  }

  private asegurarSeleccion(): void {
    const visibles = this.visibles();
    if (visibles.length > 0 && !visibles.some((fila) => fila.id === this.platoId())) {
      this.platoId.set(visibles[0].id);
      this.editando.set(false);
    }
  }

  editar(): void {
    const fila = this.seleccionado();
    if (!fila) {
      return;
    }
    this.formNombre.set(fila.nombre);
    this.formPrecio.set(fila.precio);
    this.editando.set(true);
  }

  cancelarEdicion(): void {
    this.editando.set(false);
  }

  onFormNombre(event: Event): void {
    this.formNombre.set((event.target as HTMLInputElement).value);
  }

  onFormPrecio(event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    this.formPrecio.set(Number.isFinite(valor) && valor >= 0 ? round2(valor) : 0);
  }

  async guardarEdicion(): Promise<void> {
    const plato = this.fichas.porId(this.platoId());
    if (!plato || this.guardando()) {
      return;
    }
    const nombre = this.formNombre().trim();
    const precio = round2(this.formPrecio());
    if (!nombre || precio <= 0) {
      this.mostrarToast('Ingresa un nombre y un precio mayor a 0');
      return;
    }
    const ok = await this.fichas.guardar({ ...plato, nombre, precioVenta: precio });
    if (!ok) {
      // El modal de edición queda abierto; el error se muestra en el banner.
      return;
    }
    this.editando.set(false);
    this.asegurarSeleccion();
    this.mostrarToast(`Ficha "${nombre}" actualizada`);
  }

  private fila(plato: Plato): FilaFicha {
    const costo = round2(
      plato.ingredientes.reduce(
        (suma, ingrediente) => suma + ingrediente.cantidad * ingrediente.costoUnitario,
        0,
      ),
    );
    const margen = round2(plato.precioVenta - costo);
    return {
      id: plato.id,
      nombre: plato.nombre,
      descripcion: plato.descripcion,
      categoria: plato.categoria,
      precio: plato.precioVenta,
      costo,
      margen,
      foodCost: plato.precioVenta > 0 ? round2((costo / plato.precioVenta) * 100) : 0,
      ingredientes: plato.ingredientes.length,
    };
  }

  private mostrarToast(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toast.set('');
      this.toastTimer = null;
    }, 2200);
  }
}
