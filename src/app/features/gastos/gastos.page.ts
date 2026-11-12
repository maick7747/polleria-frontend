import { crearGuardiaUrl } from '../../core/utils/url-sync';
﻿import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CuadreService } from '../../core/data/cuadre.service';
import { GastosService, type GastosQuery } from '../../core/data/gastos.service';
import type { CategoriaGasto, Gasto } from '../../core/models';
import { descargarBlob } from '../../core/utils/descarga';
import { abreviarNombre, formatearMoneda, round2, turnoActual } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface CategoriaVista {
  id: CategoriaGasto;
  label: string;
}

const CATEGORIAS: readonly CategoriaVista[] = [
  { id: 'servicios_basicos', label: 'Servicios' },
  { id: 'alquiler', label: 'Alquiler' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'personal', label: 'Personal' },
  { id: 'transporte', label: 'Movilidad' },
  { id: 'limpieza', label: 'Limpieza' },
  { id: 'impuestos', label: 'Impuestos' },
  { id: 'otros', label: 'Otros' },
];

const SALDO_INICIAL = 850;
const LIMITES = [10, 20, 50, 100];

type CategoriaFiltro = 'todas' | CategoriaGasto;

const fechaLima = (fecha: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);

const HOY = fechaLima(new Date());

@Component({
  selector: 'app-gastos-page',
  standalone: true,
  imports: [
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PaginadorComponent,
    PanelComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gastos.page.html',
  styleUrl: './gastos.page.css',
})
export class GastosPage {
  private readonly auth = inject(AuthService);
  private readonly gastos = inject(GastosService);
  private readonly cuadre = inject(CuadreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlActiva = crearGuardiaUrl(this.router, this.destroyRef, '/gastos');

  readonly categorias = CATEGORIAS;
  readonly moneda = formatearMoneda;
  readonly saldoInicial = SALDO_INICIAL;
  readonly turno = turnoActual();

  readonly categoria = signal<CategoriaGasto>('servicios_basicos');
  readonly monto = signal<string>('120.00');
  readonly descripcion = signal<string>('Recibo de luz · octubre');
  readonly comprobante = signal<string>('Boleta B001-00234');
  readonly fecha = signal<string>(HOY);

  readonly categoriaFiltro = signal<CategoriaFiltro>('todas');
  readonly busqueda = signal<string>('');
  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);
  readonly guardando = signal<boolean>(false);

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly meta = this.gastos.meta;
  readonly cargando = this.gastos.cargando;
  readonly error = this.gastos.error;
  readonly lista = this.gastos.gastos;
  readonly resumen = this.gastos.resumen;

  readonly montoNumero = computed<number>(() => {
    const valor = Number.parseFloat(this.monto().replace(',', '.'));
    return Number.isFinite(valor) ? round2(valor) : 0;
  });

  readonly egresosTurno = computed<number>(() => this.cuadre.totalEgresos());

  readonly saldoActual = computed<number>(() =>
    round2(SALDO_INICIAL - this.egresosTurno()),
  );

  readonly saldoDespues = computed<number>(() =>
    round2(this.saldoActual() - this.montoNumero()),
  );

  readonly gastosHoy = computed<number>(() => {
    const data = this.resumen();
    if (data) {
      return data.registros;
    }
    return this.gastos.gastos().filter((gasto) => gasto.fecha === HOY).length;
  });

  readonly subtitulo = computed<string>(
    () =>
      `${this.turno} · ${this.gastosHoy()} gastos hoy · ${formatearMoneda(
        this.gastos.totalHoy(),
      )} egresado de caja chica`,
  );

  readonly recientesMeta = computed<string>(
    () => `${this.meta().total} gastos · ${formatearMoneda(this.gastos.totalHoy())}`,
  );

  readonly puedeRegistrar = computed<boolean>(
    () => this.montoNumero() > 0 && !this.guardando(),
  );

  readonly siguienteCodigo = computed<string>(
    () => `GA-${String(57 + this.meta().total).padStart(3, '0')}`,
  );

  readonly registradoPor = computed<string>(() => {
    const usuario = this.auth.usuario();
    return usuario ? abreviarNombre(usuario.nombre) : 'Cajero';
  });

  private toastTimer: number | null = null;
  private buscarTimer: number | null = null;

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const categoria = params.get('categoria');
    this.categoriaFiltro.set(
      CATEGORIAS.some((actual) => actual.id === categoria)
        ? (categoria as CategoriaGasto)
        : 'todas',
    );
    this.busqueda.set(params.get('q') ?? '');
    this.desde.set(params.get('desde') ?? '');
    this.hasta.set(params.get('hasta') ?? '');
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);

    void this.inicializar();

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
      if (this.buscarTimer !== null) {
        window.clearTimeout(this.buscarTimer);
      }
    });
  }

  elegirCategoria(categoria: CategoriaGasto): void {
    this.categoria.set(categoria);
  }

  onMonto(event: Event): void {
    this.monto.set((event.target as HTMLInputElement).value);
  }

  onDescripcion(event: Event): void {
    this.descripcion.set((event.target as HTMLInputElement).value);
  }

  onComprobante(event: Event): void {
    this.comprobante.set((event.target as HTMLInputElement).value);
  }

  onFecha(event: Event): void {
    this.fecha.set((event.target as HTMLInputElement).value);
  }

  onCategoriaFiltro(event: Event): void {
    this.categoriaFiltro.set((event.target as HTMLSelectElement).value as CategoriaFiltro);
    this.pagina.set(1);
    void this.cargarLista();
  }

  onDesde(event: Event): void {
    this.desde.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargarLista();
  }

  onHasta(event: Event): void {
    this.hasta.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargarLista();
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
    if (this.buscarTimer !== null) {
      window.clearTimeout(this.buscarTimer);
    }
    this.buscarTimer = window.setTimeout(() => {
      this.pagina.set(1);
      void this.cargarLista();
    }, 350);
  }

  cambiarPagina(page: number): void {
    this.pagina.set(page);
    void this.cargarLista();
  }

  cambiarLimite(limit: number): void {
    this.limite.set(limit);
    this.pagina.set(1);
    void this.cargarLista();
  }

  recargar(): void {
    void this.inicializar();
  }

  async registrar(): Promise<void> {
    if (this.montoNumero() <= 0) {
      this.avisar('El monto del gasto debe ser mayor a 0.', true);
      return;
    }
    if (this.guardando()) {
      return;
    }

    this.guardando.set(true);
    const gasto = await this.gastos.registrar({
      fecha: this.fecha() || HOY,
      categoria: this.categoria(),
      descripcion:
        this.descripcion().trim() ||
        `${this.etiquetaCategoria(this.categoria())} · sin descripción`,
      monto: this.montoNumero(),
      metodoPago: 'efectivo',
      descuentaCajaChica: true,
      comprobanteUrl: this.comprobante().trim() || undefined,
      usuarioId: this.usuarioId(),
    });
    this.guardando.set(false);

    if (!gasto) {
      this.avisar(this.gastos.error() ?? 'No se pudo registrar el gasto.', true);
      return;
    }

    this.cuadre.registrarEgreso(gasto.monto);
    this.avisar(`Gasto registrado · ${formatearMoneda(gasto.monto)}`);
    this.limpiar();
    this.pagina.set(1);
    await this.cargarLista();
  }

  descartar(): void {
    this.limpiar();
    this.avisar('Formulario descartado');
  }

  exportar(): void {
    const filas = this.lista();
    if (filas.length === 0) {
      this.avisar('No hay gastos cargados para exportar.', true);
      return;
    }

    const encabezado = ['Fecha', 'Categoría', 'Descripción', 'Método', 'Monto', 'Usuario'];
    const lineas = [
      encabezado,
      ...filas.map((gasto) => [
        gasto.fecha.slice(0, 10),
        this.etiquetaCategoria(gasto.categoria),
        gasto.descripcion,
        this.etiquetaMetodo(gasto.metodoPago),
        gasto.monto.toFixed(2),
        this.registradoPorGasto(gasto),
      ]),
    ];
    const csv =
      '\uFEFF' +
      lineas
        .map((fila) => fila.map((celda) => this.csvCelda(celda)).join(','))
        .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    descargarBlob(blob, `gastos-${HOY}.csv`);
    this.avisar(`Exportados ${filas.length} gastos a CSV`);
  }

  private etiquetaMetodo(metodo: Gasto['metodoPago']): string {
    const etiquetas: Record<Gasto['metodoPago'], string> = {
      efectivo: 'Efectivo',
      tarjeta: 'Tarjeta',
      yape: 'Yape',
      plin: 'Plin',
      transferencia: 'Transferencia',
    };
    return etiquetas[metodo];
  }

  private csvCelda(valor: string): string {
    return `"${valor.replace(/"/g, '""')}"`;
  }

  etiquetaCategoria(categoria: CategoriaGasto): string {
    return CATEGORIAS.find((actual) => actual.id === categoria)?.label ?? 'Otros';
  }

  tonoCategoria(categoria: CategoriaGasto): ChipVariant {
    if (categoria === 'servicios_basicos') {
      return 'warning';
    }
    if (categoria === 'limpieza') {
      return 'info';
    }
    if (categoria === 'mantenimiento' || categoria === 'personal') {
      return 'brand';
    }
    return 'neutral';
  }

  registradoPorGasto(gasto: Gasto): string {
    return gasto.registradoPor?.trim() || '—';
  }

  fechaCorta(fecha: string): string {
    return fecha.length >= 10 ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` : fecha;
  }

  private async inicializar(): Promise<void> {
    await Promise.all([
      this.cargarLista(),
      this.gastos.cargarResumen({ desde: HOY, hasta: HOY }),
    ]);
  }

  private async cargarLista(): Promise<void> {
    const query: GastosQuery = {
      page: this.pagina(),
      limit: this.limite(),
      categoria: this.categoriaFiltro() === 'todas' ? undefined : this.categoriaFiltro(),
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
      q: this.busqueda(),
      sort: 'fecha:desc',
    };
    const ok = await this.gastos.cargar(query);
    if (ok) {
      this.pagina.set(this.gastos.meta().page);
      this.limite.set(this.gastos.meta().limit);
      this.sincronizarUrl();
    }
  }

  private sincronizarUrl(): void {
    if (!this.urlActiva()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        q: this.busqueda().trim() || null,
        categoria: this.categoriaFiltro() === 'todas' ? null : this.categoriaFiltro(),
        desde: this.desde() || null,
        hasta: this.hasta() || null,
      },
      replaceUrl: true,
    });
  }

  private limpiar(): void {
    this.monto.set('0.00');
    this.descripcion.set('');
    this.comprobante.set('');
  }

  private usuarioId(): number {
    return this.auth.usuario()?.id ?? 1;
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toast.set('');
      this.toastTimer = null;
    }, 2800);
  }
}
