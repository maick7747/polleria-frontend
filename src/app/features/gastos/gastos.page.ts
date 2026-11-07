import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { CuadreService } from '../../core/data/cuadre.service';
import { GastosService } from '../../core/data/gastos.service';
import { MOCK_USUARIOS } from '../../core/data/mock-data';
import type { CategoriaGasto, Gasto } from '../../core/models';
import { abreviarNombre, formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
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
const HOY = '2026-10-14';

@Component({
  selector: 'app-gastos-page',
  standalone: true,
  imports: [
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
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
  private readonly destroyRef = inject(DestroyRef);

  readonly categorias = CATEGORIAS;
  readonly moneda = formatearMoneda;
  readonly saldoInicial = SALDO_INICIAL;

  readonly categoria = signal<CategoriaGasto>('servicios_basicos');
  readonly monto = signal<string>('120.00');
  readonly descripcion = signal<string>('Recibo de luz · octubre');
  readonly comprobante = signal<string>('Boleta B001-00234');
  readonly fecha = signal<string>(HOY);

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly lista = this.gastos.gastos;

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

  readonly gastosHoy = computed<number>(() =>
    this.gastos.gastos().filter((gasto) => gasto.fecha === HOY).length,
  );

  readonly subtitulo = computed<string>(
    () =>
      `Turno tarde · ${this.gastosHoy()} gastos hoy · ${formatearMoneda(this.gastos.totalHoy())} egresado de caja chica`,
  );

  readonly recientesMeta = computed<string>(
    () =>
      `${this.gastosHoy()} gastos hoy · ${formatearMoneda(this.gastos.totalHoy())} · insumos, servicios, movilidad`,
  );

  readonly puedeRegistrar = computed<boolean>(() => this.montoNumero() > 0);

  readonly siguienteCodigo = computed<string>(
    () => `GA-${String(57 + this.gastos.gastos().length).padStart(3, '0')}`,
  );

  readonly registradoPor = computed<string>(() => {
    const usuario = this.auth.usuario();
    return usuario ? abreviarNombre(usuario.nombre) : 'Cajero';
  });

  private toastTimer: number | null = null;

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

  registrar(): void {
    if (this.montoNumero() <= 0) {
      this.avisar('El monto del gasto debe ser mayor a 0.', true);
      return;
    }

    const gasto = this.gastos.registrar({
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

    this.cuadre.registrarEgreso(gasto.monto);
    this.avisar(`Gasto registrado · ${formatearMoneda(gasto.monto)}`);
    this.limpiar();
  }

  descartar(): void {
    this.limpiar();
    this.avisar('Formulario descartado');
  }

  exportar(): void {
    this.avisar('Exportación simulada · gastos del turno');
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
    const usuario = MOCK_USUARIOS.find((candidato) => candidato.id === gasto.usuarioId);
    return usuario ? abreviarNombre(usuario.nombre) : 'â€”';
  }

  fechaCorta(fecha: string): string {
    return fecha.length >= 10 ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` : fecha;
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
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 2800);
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }
}
