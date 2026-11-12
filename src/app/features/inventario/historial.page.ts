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
import { InventarioService, type MovimientoDetalle } from '../../core/data/inventario.service';
import type { Insumo, TipoMovimiento } from '../../core/models';
import { round2 } from '../../core/utils/format';
import type { ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type FiltroTipo = 'todos' | TipoMovimiento;

interface TipoMeta {
  label: string;
  tono: ChipVariant;
  icono: IconName;
}

interface MovimientoVista {
  id: number;
  tipo: TipoMovimiento;
  referenciaTipo: MovimientoDetalle['referenciaTipo'];
  tipoLabel: string;
  tono: ChipVariant;
  icono: IconName;
  insumoId: number;
  insumo: string;
  unidad: string;
  detalle: string;
  referencia: string;
  fechaISO: string;
  fechaTexto: string;
  cantidad: number;
  cantidadTexto: string;
  saldo: number;
  saldoTexto: string;
  esEntrada: boolean;
}

interface ResumenHistorial {
  entradas: number;
  salidas: number;
  saldo: number;
  unidad: string;
  insumoNombre: string;
  movimientosHoy: number;
  estado: string;
  minimo: number | null;
}

const TIPO_META: Readonly<Record<MovimientoDetalle['referenciaTipo'], TipoMeta>> = {
  compra: { label: 'Compra', tono: 'success', icono: 'package' },
  pedido: { label: 'Venta', tono: 'neutral', icono: 'receipt' },
  merma: { label: 'Merma', tono: 'danger', icono: 'trash' },
  ajuste: { label: 'Ajuste', tono: 'warning', icono: 'filter' },
  devolucion: { label: 'Devolución', tono: 'info', icono: 'arrow-left' },
};

const TIPOS: readonly { valor: FiltroTipo; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'entrada', label: 'Entradas' },
  { valor: 'salida', label: 'Salidas' },
  { valor: 'merma', label: 'Mermas' },
  { valor: 'ajuste', label: 'Ajustes' },
  { valor: 'devolucion', label: 'Devoluciones' },
];

const TIPOS_MOVIMIENTO: readonly TipoMovimiento[] = [
  'entrada',
  'salida',
  'merma',
  'ajuste',
  'devolucion',
];

const LIMITES = [10, 20, 50, 100];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const dosDigitos = (valor: number): string => String(valor).padStart(2, '0');

const escaparCsv = (valor: string): string => `"${valor.replace(/"/g, '""')}"`;

@Component({
  selector: 'app-inventario-historial-page',
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
  templateUrl: './historial.page.html',
  styleUrl: './historial.page.css',
})
export class InventarioHistorialPage {
  private readonly inventario = inject(InventarioService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlActiva = crearGuardiaUrl(this.router, this.destroyRef, '/inventario/historial');
  private toastTimer: number | null = null;

  readonly tipo = signal<FiltroTipo>('todos');
  readonly insumoId = signal<number>(0);
  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);
  readonly seleccionId = signal<number | null>(null);
  readonly toast = signal<string>('');

  readonly tipos = TIPOS;
  readonly listaInsumos = this.inventario.catalogoInsumos;
  readonly meta = this.inventario.movimientosMeta;
  readonly cargando = this.inventario.cargando;
  readonly error = this.inventario.error;

  readonly movimientos = computed<MovimientoVista[]>(() =>
    this.inventario.movimientos().map((movimiento) => this.fila(movimiento)),
  );

  readonly visibles = computed<MovimientoVista[]>(() => this.movimientos());

  readonly resumen = computed<ResumenHistorial>(() => {
    const filas = this.visibles();
    let entradas = 0;
    let salidas = 0;
    for (const fila of filas) {
      if (fila.esEntrada) {
        entradas = round2(entradas + fila.cantidad);
      } else {
        salidas = round2(salidas + Math.abs(fila.cantidad));
      }
    }
    const insumo = this.insumoFiltrado();
    const saldo = insumo ? insumo.stockActual : (filas[0]?.saldo ?? 0);
    return {
      entradas,
      salidas,
      saldo,
      unidad: insumo?.unidadMedida ?? filas[0]?.unidad ?? '',
      insumoNombre: insumo?.nombre ?? 'Todos los insumos',
      movimientosHoy: filas.filter((fila) => this.esHoy(new Date(fila.fechaISO))).length,
      estado: insumo ? this.estadoInsumo(insumo) : 'Todos',
      minimo: insumo ? insumo.stockMinimo : null,
    };
  });

  readonly subtitulo = computed<string>(() => {
    const nombre = this.insumoFiltrado()?.nombre ?? 'todos los insumos';
    return `${this.meta().total} movimientos · ${nombre} · saldo calculado al instante`;
  });

  readonly periodoLabel = computed<string>(() => {
    const desde = this.desde();
    const hasta = this.hasta();
    if (!desde && !hasta) {
      return 'Todo el historial';
    }
    return `${desde || 'inicio'} → ${hasta || 'hoy'}`;
  });

  readonly saldoLabel = computed<string>(() =>
    this.insumoFiltrado() ? 'Saldo actual' : 'Saldo del último movimiento',
  );

  readonly tonoResumen = computed<string>(() => {
    const estado = this.resumen().estado;
    if (estado === 'Crítico') {
      return 'danger';
    }
    if (estado === 'Bajo mínimo') {
      return 'warning';
    }
    return 'neutral';
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const tipo = params.get('tipo');
    this.tipo.set(
      tipo === 'todos' || TIPOS_MOVIMIENTO.includes(tipo as TipoMovimiento)
        ? (tipo as FiltroTipo)
        : 'todos',
    );
    this.insumoId.set(Math.max(0, Number(params.get('insumo')) || 0));
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
    });
  }

  cantidad(valor: number): string {
    const redondeado = round2(valor);
    return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(2);
  }

  cambiarTipo(tipo: FiltroTipo): void {
    if (this.tipo() === tipo) {
      return;
    }
    this.tipo.set(tipo);
    this.pagina.set(1);
    void this.cargar();
  }

  onInsumo(event: Event): void {
    this.insumoId.set(Number((event.target as HTMLSelectElement).value));
    this.pagina.set(1);
    void this.cargar();
  }

  onDesde(event: Event): void {
    this.desde.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargar();
  }

  onHasta(event: Event): void {
    this.hasta.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargar();
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
    void this.inicializar();
  }

  seleccionar(id: number): void {
    this.seleccionId.update((actual) => (actual === id ? null : id));
  }

  exportar(): void {
    const filas = this.visibles();
    if (filas.length === 0) {
      this.mostrarToast('No hay movimientos para exportar');
      return;
    }
    const encabezado = ['Tipo', 'Detalle', 'Insumo', 'Fecha', 'Cantidad', 'Saldo'];
    const lineas = filas.map((fila) =>
      [
        fila.tipoLabel,
        fila.detalle,
        fila.insumo,
        fila.fechaTexto,
        fila.cantidadTexto,
        fila.saldoTexto,
      ]
        .map(escaparCsv)
        .join(','),
    );
    const csv = [encabezado.join(','), ...lineas].join('\r\n');
    if (typeof document === 'undefined') {
      return;
    }
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'historial-movimientos.csv';
    enlace.click();
    URL.revokeObjectURL(url);
    this.mostrarToast(`${filas.length} movimientos exportados`);
  }

  private async inicializar(): Promise<void> {
    await Promise.all([this.cargar(), this.inventario.cargarCatalogo()]);
  }

  private async cargar(): Promise<void> {
    const ok = await this.inventario.cargarMovimientos({
      page: this.pagina(),
      limit: this.limite(),
      tipo: this.tipo() === 'todos' ? undefined : this.tipo(),
      insumoId: this.insumoId() || undefined,
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
      sort: 'fecha:desc',
    });
    if (!ok) {
      return;
    }
    this.pagina.set(this.inventario.movimientosMeta().page);
    this.limite.set(this.inventario.movimientosMeta().limit);
    this.sincronizarUrl();
  }

  private sincronizarUrl(): void {
    if (!this.urlActiva()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        tipo: this.tipo() === 'todos' ? null : this.tipo(),
        insumo: this.insumoId() || null,
        desde: this.desde() || null,
        hasta: this.hasta() || null,
      },
      replaceUrl: true,
    });
  }

  private fila(movimiento: MovimientoDetalle): MovimientoVista {
    const insumo = this.inventario.porId(movimiento.insumoId);
    const meta = TIPO_META[movimiento.referenciaTipo];
    const signo = this.signo(movimiento);
    const cantidad = round2(Math.abs(movimiento.cantidad) * signo);
    const saldo = round2(movimiento.stockResultante);
    return {
      id: movimiento.id,
      tipo: movimiento.tipo,
      referenciaTipo: movimiento.referenciaTipo,
      tipoLabel: meta.label,
      tono: meta.tono,
      icono: meta.icono,
      insumoId: movimiento.insumoId,
      insumo: movimiento.insumo ?? insumo?.nombre ?? 'Insumo',
      unidad: insumo?.unidadMedida ?? '',
      detalle: movimiento.observacion || (movimiento.usuario ?? 'Sin observación'),
      referencia: `${meta.label} #${movimiento.referenciaId}`,
      fechaISO: movimiento.fecha,
      fechaTexto: this.formatearFecha(movimiento.fecha),
      cantidad,
      cantidadTexto: `${cantidad < 0 ? '−' : '+'}${Math.abs(cantidad).toFixed(2)}`,
      saldo,
      saldoTexto: saldo.toFixed(2),
      esEntrada: signo > 0,
    };
  }

  private signo(movimiento: MovimientoDetalle): number {
    if (movimiento.tipo === 'entrada' || movimiento.tipo === 'devolucion') {
      return 1;
    }
    if (movimiento.tipo === 'ajuste') {
      return movimiento.cantidad < 0 ? -1 : 1;
    }
    return -1;
  }

  private formatearFecha(iso: string): string {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) {
      return iso;
    }
    const hora = `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`;
    if (this.esHoy(fecha)) {
      return `Hoy ${hora}`;
    }
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    if (this.mismoDia(fecha, ayer)) {
      return `Ayer ${hora}`;
    }
    return `${dosDigitos(fecha.getDate())} ${MESES[fecha.getMonth()]} ${hora}`;
  }

  private esHoy(fecha: Date): boolean {
    return this.mismoDia(fecha, new Date());
  }

  private mismoDia(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private estadoInsumo(insumo: Insumo): string {
    if (insumo.stockMinimo <= 0) {
      return 'OK';
    }
    if (insumo.stockActual <= insumo.stockMinimo * 0.5) {
      return 'Crítico';
    }
    if (insumo.stockActual <= insumo.stockMinimo) {
      return 'Bajo mínimo';
    }
    return 'OK';
  }

  private insumoFiltrado(): Insumo | null {
    const id = this.insumoId();
    return id === 0 ? null : (this.inventario.porId(id) ?? null);
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
