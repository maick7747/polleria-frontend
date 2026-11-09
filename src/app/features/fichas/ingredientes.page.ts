import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FichasService } from '../../core/data/fichas.service';
import { InventarioService } from '../../core/data/inventario.service';
import type { CategoriaInsumo, IngredienteFicha, Plato, UnidadMedida } from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type FiltroInsumo = 'todos' | CategoriaInsumo;

interface InsumoVista {
  id: number;
  nombre: string;
  categoria: string;
  categoriaClave: CategoriaInsumo;
  unidad: UnidadMedida;
  costo: number;
  enFicha: boolean;
  aporte: number;
}

interface CategoriaVista {
  valor: FiltroInsumo;
  label: string;
  total: number;
}

const CATEGORIAS: Readonly<Record<CategoriaInsumo, string>> = {
  alimento: 'Abarrotes',
  bebida: 'Bebidas',
  limpieza: 'Limpieza',
  empaque: 'Empaques',
  insumo_general: 'Insumos',
};

const cantidadBase = (unidad: UnidadMedida): number =>
  unidad === 'und' || unidad === 'docena' ? 1 : 0.1;

@Component({
  selector: 'app-fichas-ingredientes-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ingredientes.page.html',
  styleUrl: './ingredientes.page.css',
})
export class FichasIngredientesPage {
  private readonly inventario = inject(InventarioService);
  private readonly fichas = inject(FichasService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer: number | null = null;
  private navTimer: number | null = null;

  readonly platoId = signal<number>(0);
  readonly busqueda = signal<string>('');
  readonly categoria = signal<FiltroInsumo>('todos');
  readonly seleccionados = signal<number[]>([]);
  readonly toast = signal<string>('');
  readonly guardando = this.fichas.guardando;
  readonly error = this.fichas.error;

  readonly moneda = formatearMoneda;

  readonly plato = computed<Plato | null>(() => this.fichas.porId(this.platoId()) ?? null);

  readonly insumos = computed<InsumoVista[]>(() => {
    const enFicha = new Set(
      this.plato()?.ingredientes.map((ingrediente) => ingrediente.insumoId) ?? [],
    );
    return this.inventario.insumos().map((insumo) => ({
      id: insumo.id,
      nombre: insumo.nombre,
      categoria: CATEGORIAS[insumo.categoria],
      categoriaClave: insumo.categoria,
      unidad: insumo.unidadMedida,
      costo: insumo.costoPromedio,
      enFicha: enFicha.has(insumo.id),
      aporte: round2(cantidadBase(insumo.unidadMedida) * insumo.costoPromedio),
    }));
  });

  readonly categorias = computed<readonly CategoriaVista[]>(() => {
    const insumos = this.insumos();
    const conteo = new Map<CategoriaInsumo, number>();
    for (const insumo of insumos) {
      conteo.set(insumo.categoriaClave, (conteo.get(insumo.categoriaClave) ?? 0) + 1);
    }
    const lista: CategoriaVista[] = [{ valor: 'todos', label: 'Todos', total: insumos.length }];
    for (const [valor, total] of conteo) {
      lista.push({ valor, label: CATEGORIAS[valor], total });
    }
    return lista;
  });

  readonly filtrados = computed<InsumoVista[]>(() => {
    const categoria = this.categoria();
    const termino = this.busqueda().trim().toLowerCase();
    return this.insumos().filter((insumo) => {
      const coincideCategoria =
        categoria === 'todos' || insumo.categoriaClave === categoria;
      const coincideTexto =
        !termino ||
        insumo.nombre.toLowerCase().includes(termino) ||
        insumo.categoria.toLowerCase().includes(termino);
      return coincideCategoria && coincideTexto;
    });
  });

  readonly seleccionadosVista = computed<InsumoVista[]>(() => {
    const ids = new Set(this.seleccionados());
    return this.insumos().filter((insumo) => ids.has(insumo.id) && !insumo.enFicha);
  });

  readonly fichaCosto = computed<number>(() =>
    round2(
      (this.plato()?.ingredientes ?? []).reduce(
        (suma, ingrediente) => suma + ingrediente.cantidad * ingrediente.costoUnitario,
        0,
      ),
    ),
  );

  readonly costoSeleccionado = computed<number>(() =>
    round2(this.seleccionadosVista().reduce((suma, insumo) => suma + insumo.aporte, 0)),
  );

  readonly nuevoCosto = computed<number>(() =>
    round2(this.fichaCosto() + this.costoSeleccionado()),
  );

  readonly foodCost = computed<number>(() => {
    const precio = this.plato()?.precioVenta ?? 0;
    return precio > 0 ? round2((this.nuevoCosto() / precio) * 100) : 0;
  });

  readonly alertaFoodCost = computed<boolean>(
    () => this.seleccionadosVista().length > 0 && this.foodCost() > 30,
  );

  readonly subtitulo = computed<string>(() => {
    const plato = this.plato();
    if (!plato) {
      return 'Selecciona una ficha para agregar ingredientes';
    }
    return `Ficha ${plato.nombre} · costo actual ${this.moneda(this.fichaCosto())} · ${plato.ingredientes.length} ingredientes`;
  });

  private readonly solicitado: number;

  constructor() {
    const estado = this.router.getCurrentNavigation()?.extras.state as
      | { platoId?: number }
      | undefined;
    this.solicitado = typeof estado?.platoId === 'number' ? estado.platoId : 0;
    void this.inicializar();
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
      if (this.navTimer !== null) {
        window.clearTimeout(this.navTimer);
      }
    });
  }

  private async inicializar(): Promise<void> {
    await this.fichas.cargar();
    const inicial = this.fichas.porId(this.solicitado) ?? this.fichas.platos()[0];
    if (inicial) {
      this.platoId.set(inicial.id);
    }
  }

  cantidad(valor: number): string {
    const redondeado = Math.round(valor * 100) / 100;
    return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(2);
  }

  base(unidad: UnidadMedida): number {
    return cantidadBase(unidad);
  }

  porcentaje(valor: number): string {
    const redondeado = Math.round(valor * 10) / 10;
    return Number.isInteger(redondeado) ? `${redondeado}%` : `${redondeado.toFixed(1)}%`;
  }

  cambiarCategoria(valor: FiltroInsumo): void {
    this.categoria.set(valor);
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  alternar(insumo: InsumoVista): void {
    if (insumo.enFicha) {
      return;
    }
    this.seleccionados.update((actual) =>
      actual.includes(insumo.id)
        ? actual.filter((id) => id !== insumo.id)
        : [...actual, insumo.id],
    );
  }

  estaSeleccionado(id: number): boolean {
    return this.seleccionados().includes(id);
  }

  async agregar(): Promise<void> {
    const plato = this.plato();
    if (!plato) {
      this.mostrarToast('No hay una ficha seleccionada');
      return;
    }
    if (this.guardando()) {
      return;
    }
    const ids = this.seleccionados();
    if (ids.length === 0) {
      this.mostrarToast('Selecciona al menos un ingrediente');
      return;
    }
    const nuevos: IngredienteFicha[] = [];
    for (const id of ids) {
      const insumo = this.inventario.porId(id);
      if (!insumo || plato.ingredientes.some((item) => item.insumoId === id)) {
        continue;
      }
      nuevos.push({
        insumoId: insumo.id,
        nombre: insumo.nombre,
        cantidad: cantidadBase(insumo.unidadMedida),
        unidadMedida: insumo.unidadMedida,
        costoUnitario: insumo.costoPromedio,
      });
    }
    if (nuevos.length === 0) {
      this.mostrarToast('Los insumos ya están en la ficha');
      return;
    }
    const ok = await this.fichas.guardar({
      ...plato,
      ingredientes: [...plato.ingredientes, ...nuevos],
    });
    if (!ok) {
      // Se conserva la selección y el error queda visible en el banner.
      return;
    }
    this.seleccionados.set([]);
    this.mostrarToast(
      `${nuevos.length} ingrediente${nuevos.length === 1 ? '' : 's'} agregado${nuevos.length === 1 ? '' : 's'}`,
      true,
    );
  }

  private mostrarToast(mensaje: string, navegar = false): void {
    this.toast.set(mensaje);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toast.set('');
      this.toastTimer = null;
    }, 2200);
    if (navegar) {
      if (this.navTimer !== null) {
        window.clearTimeout(this.navTimer);
      }
      this.navTimer = window.setTimeout(() => {
        void this.router.navigate(['/fichas-tecnicas']);
      }, 900);
    }
  }
}
