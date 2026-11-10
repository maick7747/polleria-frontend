import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/api/api.helpers';
import { InventarioService } from '../../core/data/inventario.service';
import type { Insumo } from '../../core/models';
import { turnoActual } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type EstadoInsumo = 'ok' | 'bajo' | 'critico';
type MotivoAjuste = 'temporada' | 'proveedor' | 'merma';
type AccionAlerta = 'activa' | 'desactiva' | 'igual';

interface InsumoVista {
  id: number;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: number;
  minimo: number;
  estado: EstadoInsumo;
}

interface Impacto {
  clave: 'bajo' | 'critico';
  titulo: string;
  detalle: string;
  chip: string;
  tono: ChipVariant;
  accion: AccionAlerta;
}

const CATEGORIAS: Readonly<Record<Insumo['categoria'], string>> = {
  alimento: 'Abarrotes',
  bebida: 'Bebidas',
  limpieza: 'Limpieza',
  empaque: 'Descartables',
  insumo_general: 'Insumos',
};

const redondear1 = (valor: number): number => Math.round(valor * 10) / 10;

@Component({
  selector: 'app-inventario-ajustar-page',
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
  templateUrl: './ajustar.page.html',
  styleUrl: './ajustar.page.css',
})
export class InventarioAjustarPage {
  private readonly inventario = inject(InventarioService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer: number | null = null;
  private navTimer: number | null = null;

  readonly busqueda = signal<string>('');
  readonly insumoId = signal<number>(0);
  readonly nuevoMinimo = signal<number>(0);
  readonly motivo = signal<MotivoAjuste>('temporada');
  readonly comentario = signal<string>('');
  readonly toast = signal<string>('');

  readonly insumos = computed<InsumoVista[]>(() =>
    this.inventario.insumos().map((insumo) => this.vista(insumo)),
  );

  readonly bajoMinimo = computed<number>(
    () => this.insumos().filter((insumo) => insumo.estado !== 'ok').length,
  );

  readonly criticos = computed<number>(
    () => this.insumos().filter((insumo) => insumo.estado === 'critico').length,
  );

  readonly filtrados = computed<InsumoVista[]>(() => {
    const termino = this.busqueda().trim().toLowerCase();
    if (!termino) {
      return this.insumos();
    }
    return this.insumos().filter(
      (insumo) =>
        insumo.nombre.toLowerCase().includes(termino) ||
        insumo.categoria.toLowerCase().includes(termino),
    );
  });

  readonly seleccionado = computed<InsumoVista | null>(
    () => this.insumos().find((insumo) => insumo.id === this.insumoId()) ?? null,
  );

  readonly sugerido = computed<number>(() => {
    const insumo = this.seleccionado();
    if (!insumo) {
      return 0;
    }
    return Math.max(1, Math.ceil(insumo.stock * 1.5));
  });

  readonly consumo7 = computed<number>(() => {
    const insumo = this.seleccionado();
    if (!insumo) {
      return 0;
    }
    return redondear1(this.inventario.consumoDe(insumo.id) ?? 0);
  });

  readonly consumoSinDatos = computed<boolean>(() => {
    const insumo = this.seleccionado();
    return insumo !== null && this.consumo7() <= 0;
  });

  readonly cobertura = computed<number | null>(() => {
    const diario = this.consumo7() / 7;
    if (diario <= 0) {
      return null;
    }
    return redondear1(this.nuevoMinimo() / diario);
  });

  readonly coberturaTexto = computed<string>(() => {
    const valor = this.cobertura();
    return valor === null ? '—' : `${valor} días`;
  });

  readonly paso = computed<number>(() => {
    const insumo = this.seleccionado();
    if (!insumo) {
      return 1;
    }
    return insumo.unidad === 'und' || insumo.unidad === 'docena' ? 1 : 0.5;
  });

  readonly delta = computed<number>(() => {
    const insumo = this.seleccionado();
    if (!insumo) {
      return 0;
    }
    return redondear1(this.nuevoMinimo() - insumo.minimo);
  });

  readonly deltaTexto = computed<string>(() => {
    const delta = this.delta();
    const unidad = this.seleccionado()?.unidad ?? '';
    if (delta === 0) {
      return 'Sin cambio vs actual';
    }
    const signo = delta > 0 ? '+' : '−';
    return `${signo}${this.cantidad(Math.abs(delta))} ${unidad} vs actual`;
  });

  readonly deltaTono = computed<'up' | 'down' | 'same'>(() => {
    const delta = this.delta();
    if (delta > 0) {
      return 'up';
    }
    if (delta < 0) {
      return 'down';
    }
    return 'same';
  });

  readonly impactos = computed<Impacto[]>(() => {
    const insumo = this.seleccionado();
    if (!insumo) {
      return [];
    }
    const nuevo = this.nuevoMinimo();
    const bajoAntes = insumo.stock <= insumo.minimo;
    const bajoAhora = insumo.stock <= nuevo;
    const criticoAntes = insumo.stock <= insumo.minimo * 0.5;
    const criticoAhora = insumo.stock <= nuevo * 0.5;
    return [
      {
        clave: 'bajo',
        titulo: 'Stock bajo',
        detalle: `${this.cantidad(insumo.stock)} ${insumo.unidad} vs ${this.cantidad(nuevo)} ${insumo.unidad}`,
        chip: this.textoAccion(bajoAntes, bajoAhora),
        tono: this.tonoAccion('bajo', bajoAntes, bajoAhora),
        accion: this.accion(bajoAntes, bajoAhora),
      },
      {
        clave: 'critico',
        titulo: 'Crítico',
        detalle: `${this.cantidad(insumo.stock)} ${insumo.unidad} vs ${this.cantidad(redondear1(nuevo * 0.5))} ${insumo.unidad} (50% del mínimo)`,
        chip: this.textoAccion(criticoAntes, criticoAhora),
        tono: this.tonoAccion('critico', criticoAntes, criticoAhora),
        accion: this.accion(criticoAntes, criticoAhora),
      },
    ];
  });

  readonly activadas = computed<Impacto[]>(
    () => this.impactos().filter((impacto) => impacto.accion === 'activa'),
  );

  readonly desactivadas = computed<Impacto[]>(
    () => this.impactos().filter((impacto) => impacto.accion === 'desactiva'),
  );

  readonly subtitulo = computed<string>(
    () =>
      `${this.insumos().length} insumos · ${this.bajoMinimo()} bajo mínimo · ${turnoActual()}`,
  );

  constructor() {
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
    await Promise.all([
      this.inventario.cargar({ limit: 100 }),
      this.inventario.cargarConsumo(7),
    ]);
    const lista = this.inventario.insumos();
    const actual = lista.find((insumo) => insumo.id === this.insumoId());
    const inicial =
      actual ?? lista.find((insumo) => insumo.stockActual <= insumo.stockMinimo) ?? lista[0];
    if (inicial) {
      this.insumoId.set(inicial.id);
      this.nuevoMinimo.set(inicial.stockMinimo);
    }
  }

  cantidad(valor: number): string {
    const redondeado = redondear1(valor);
    return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1);
  }

  textoEstado(estado: EstadoInsumo): string {
    if (estado === 'critico') {
      return 'Crítico';
    }
    if (estado === 'bajo') {
      return 'Bajo';
    }
    return 'OK';
  }

  tonoEstado(estado: EstadoInsumo): ChipVariant {
    if (estado === 'critico') {
      return 'danger';
    }
    if (estado === 'bajo') {
      return 'warning';
    }
    return 'success';
  }

  seleccionar(insumo: InsumoVista): void {
    this.insumoId.set(insumo.id);
    this.nuevoMinimo.set(insumo.minimo);
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  onNuevoMinimo(event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    this.nuevoMinimo.set(Number.isFinite(valor) && valor >= 0 ? redondear1(valor) : 0);
  }

  ajustarNuevo(delta: number): void {
    this.nuevoMinimo.update((valor) => Math.max(0, redondear1(valor + delta)));
  }

  aplicarSugerido(): void {
    this.nuevoMinimo.set(this.sugerido());
  }

  cambiarMotivo(motivo: MotivoAjuste): void {
    this.motivo.set(motivo);
  }

  onComentario(event: Event): void {
    this.comentario.set((event.target as HTMLTextAreaElement).value);
  }

  async guardar(): Promise<void> {
    const insumo = this.seleccionado();
    if (!insumo) {
      return;
    }
    const valor = redondear1(this.nuevoMinimo());
    if (valor <= 0) {
      this.mostrarToast('El mínimo debe ser mayor a 0');
      return;
    }
    try {
      await this.inventario.ajustarMinimo(insumo.id, valor);
      this.mostrarToast(
        `Mínimo de ${insumo.nombre} actualizado a ${this.cantidad(valor)} ${insumo.unidad}`,
        true,
      );
    } catch (error) {
      this.mostrarToast(mensajeError(error));
    }
  }

  private vista(insumo: Insumo): InsumoVista {
    return {
      id: insumo.id,
      nombre: insumo.nombre,
      categoria: CATEGORIAS[insumo.categoria],
      unidad: insumo.unidadMedida,
      stock: insumo.stockActual,
      minimo: insumo.stockMinimo,
      estado: this.estado(insumo.stockActual, insumo.stockMinimo),
    };
  }

  private estado(stock: number, minimo: number): EstadoInsumo {
    if (minimo <= 0) {
      return 'ok';
    }
    if (stock <= minimo * 0.5) {
      return 'critico';
    }
    if (stock <= minimo) {
      return 'bajo';
    }
    return 'ok';
  }

  private accion(antes: boolean, ahora: boolean): AccionAlerta {
    if (!antes && ahora) {
      return 'activa';
    }
    if (antes && !ahora) {
      return 'desactiva';
    }
    return 'igual';
  }

  private textoAccion(antes: boolean, ahora: boolean): string {
    if (!antes && ahora) {
      return 'Se activa';
    }
    if (antes && !ahora) {
      return 'Se desactiva';
    }
    return 'Sin cambio';
  }

  private tonoAccion(clave: 'bajo' | 'critico', antes: boolean, ahora: boolean): ChipVariant {
    if (!antes && ahora) {
      return clave === 'critico' ? 'danger' : 'warning';
    }
    if (antes && !ahora) {
      return 'success';
    }
    return 'neutral';
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
        void this.router.navigate(['/inventario']);
      }, 900);
    }
  }
}
