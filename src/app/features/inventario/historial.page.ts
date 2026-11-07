import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { InventarioService } from '../../core/data/inventario.service';
import type { Insumo, MovimientoStock, TipoMovimiento } from '../../core/models';
import { round2 } from '../../core/utils/format';
import type { ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type Periodo = 'hoy' | '7d' | '30d' | 'todos';
type FiltroTipo = 'todos' | TipoMovimiento;

interface TipoMeta {
  label: string;
  tono: ChipVariant;
  icono: IconName;
}

interface MovimientoVista {
  id: number;
  tipo: TipoMovimiento;
  referenciaTipo: MovimientoStock['referenciaTipo'];
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

const TIPO_META: Readonly<Record<MovimientoStock['referenciaTipo'], TipoMeta>> = {
  compra: { label: 'Compra', tono: 'success', icono: 'package' },
  pedido: { label: 'Venta', tono: 'neutral', icono: 'receipt' },
  merma: { label: 'Merma', tono: 'danger', icono: 'trash' },
  ajuste: { label: 'Ajuste', tono: 'warning', icono: 'filter' },
  devolucion: { label: 'Devolución', tono: 'info', icono: 'arrow-left' },
};

const PERIODOS: readonly { valor: Periodo; label: string }[] = [
  { valor: 'hoy', label: 'Hoy' },
  { valor: '7d', label: '7 días' },
  { valor: '30d', label: '30 días' },
  { valor: 'todos', label: 'Todos' },
];

const TIPOS: readonly { valor: FiltroTipo; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'entrada', label: 'Entradas' },
  { valor: 'salida', label: 'Salidas' },
  { valor: 'merma', label: 'Mermas' },
  { valor: 'ajuste', label: 'Ajustes' },
  { valor: 'devolucion', label: 'Devoluciones' },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const dosDigitos = (valor: number): string => String(valor).padStart(2, '0');

const escaparCsv = (valor: string): string => `"${valor.replace(/"/g, '""')}"`;

@Component({
  selector: 'app-inventario-historial-page',
  standalone: true,
  imports: [RouterLink, AppShellComponent, DarkPanelComponent, EmptyStateComponent, IconComponent, PanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './historial.page.html',
  styleUrl: './historial.page.css',
})
export class InventarioHistorialPage {
  private readonly inventario = inject(InventarioService);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer: number | null = null;

  readonly periodo = signal<Periodo>('7d');
  readonly tipo = signal<FiltroTipo>('todos');
  readonly insumoId = signal<number>(0);
  readonly seleccionId = signal<number | null>(null);
  readonly toast = signal<string>('');

  readonly periodos = PERIODOS;
  readonly tipos = TIPOS;
  readonly listaInsumos = this.inventario.insumos;

  readonly ancla = computed<Date>(() => {
    const fechas = this.inventario
      .movimientos()
      .map((movimiento) => Date.parse(movimiento.fecha))
      .filter((valor) => Number.isFinite(valor));
    return new Date(fechas.length > 0 ? Math.max(...fechas) : Date.now());
  });

  readonly movimientos = computed<MovimientoVista[]>(() => {
    const ancla = this.ancla();
    return [...this.inventario.movimientos()]
      .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))
      .map((movimiento) => this.fila(movimiento, ancla));
  });

  readonly visibles = computed<MovimientoVista[]>(() => {
    const periodo = this.periodo();
    const tipo = this.tipo();
    const insumoId = this.insumoId();
    const ancla = this.ancla();
    return this.movimientos().filter((fila) => {
      const coincideTipo = tipo === 'todos' || fila.tipo === tipo;
      const coincideInsumo = insumoId === 0 || fila.insumoId === insumoId;
      const coincideFecha = this.enPeriodo(fila, periodo, ancla);
      return coincideTipo && coincideInsumo && coincideFecha;
    });
  });

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
      unidad: insumo?.unidadMedida ?? '',
      insumoNombre: insumo?.nombre ?? 'Todos los insumos',
      movimientosHoy: filas.filter((fila) => this.mismoDia(new Date(fila.fechaISO), this.ancla()))
        .length,
      estado: insumo ? this.estadoInsumo(insumo) : 'Todos',
      minimo: insumo ? insumo.stockMinimo : null,
    };
  });

  readonly subtitulo = computed<string>(() => {
    const nombre = this.insumoFiltrado()?.nombre ?? 'todos los insumos';
    return `${this.visibles().length} movimientos · ${nombre} · saldo calculado al instante`;
  });

  readonly periodoLabel = computed<string>(
    () => this.periodos.find((periodo) => periodo.valor === this.periodo())?.label ?? 'Todos',
  );

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

  cambiarPeriodo(periodo: Periodo): void {
    this.periodo.set(periodo);
  }

  cambiarTipo(tipo: FiltroTipo): void {
    this.tipo.set(tipo);
  }

  onInsumo(event: Event): void {
    this.insumoId.set(Number((event.target as HTMLSelectElement).value));
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

  private fila(movimiento: MovimientoStock, ancla: Date): MovimientoVista {
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
      insumo: insumo?.nombre ?? 'Insumo',
      unidad: insumo?.unidadMedida ?? '',
      detalle: movimiento.observacion,
      referencia: `${meta.label} #${movimiento.referenciaId}`,
      fechaISO: movimiento.fecha,
      fechaTexto: this.formatearFecha(movimiento.fecha, ancla),
      cantidad,
      cantidadTexto: `${cantidad < 0 ? '−' : '+'}${Math.abs(cantidad).toFixed(2)}`,
      saldo,
      saldoTexto: saldo.toFixed(2),
      esEntrada: signo > 0,
    };
  }

  private signo(movimiento: MovimientoStock): number {
    if (movimiento.tipo === 'entrada' || movimiento.tipo === 'devolucion') {
      return 1;
    }
    if (movimiento.tipo === 'ajuste') {
      return movimiento.cantidad < 0 ? -1 : 1;
    }
    return -1;
  }

  private enPeriodo(fila: MovimientoVista, periodo: Periodo, ancla: Date): boolean {
    if (periodo === 'todos') {
      return true;
    }
    const fecha = new Date(fila.fechaISO);
    if (periodo === 'hoy') {
      return this.mismoDia(fecha, ancla);
    }
    const dias = periodo === '7d' ? 7 : 30;
    const limite = new Date(ancla);
    limite.setDate(limite.getDate() - (dias - 1));
    limite.setHours(0, 0, 0, 0);
    return fecha.getTime() >= limite.getTime();
  }

  private formatearFecha(iso: string, ancla: Date): string {
    const fecha = new Date(iso);
    const hora = `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`;
    if (this.mismoDia(fecha, ancla)) {
      return `Hoy ${hora}`;
    }
    const ayer = new Date(ancla);
    ayer.setDate(ayer.getDate() - 1);
    if (this.mismoDia(fecha, ayer)) {
      return `Ayer ${hora}`;
    }
    return `${dosDigitos(fecha.getDate())} ${MESES[fecha.getMonth()]} ${hora}`;
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
