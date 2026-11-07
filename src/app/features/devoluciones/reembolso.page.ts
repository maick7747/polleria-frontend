import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CuadreService } from '../../core/data/cuadre.service';
import { DevolucionesService } from '../../core/data/devoluciones.service';
import { PagosService } from '../../core/data/pagos.service';
import type { Devolucion, MetodoPago, ResolucionDevolucion } from '../../core/models';
import { abreviarNombre, formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface MetodoVista {
  id: MetodoPago;
  label: string;
  icon: IconName;
}

const METODOS: readonly MetodoVista[] = [
  { id: 'efectivo', label: 'Efectivo', icon: 'money' },
  { id: 'yape', label: 'Yape', icon: 'phone' },
  { id: 'plin', label: 'Plin', icon: 'phone' },
  { id: 'tarjeta', label: 'Tarjeta', icon: 'credit-card' },
];

@Component({
  selector: 'app-reembolso-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reembolso.page.html',
  styleUrl: './reembolso.page.css',
})
export class ReembolsoPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly cuadre = inject(CuadreService);
  private readonly devoluciones = inject(DevolucionesService);
  private readonly pagos = inject(PagosService);
  private readonly destroyRef = inject(DestroyRef);

  readonly metodos = METODOS;
  readonly moneda = formatearMoneda;

  readonly devolucionId = Number(
    this.route.snapshot.queryParamMap.get('devolucionId') ?? 0,
  );
  readonly montoAprobado = Number(this.route.snapshot.queryParamMap.get('monto') ?? 0);
  readonly pedidoNumero = this.route.snapshot.queryParamMap.get('pedido') ?? '—';
  readonly motivo = this.route.snapshot.queryParamMap.get('motivo') ?? 'Devolución';
  readonly tipo: ResolucionDevolucion =
    this.route.snapshot.queryParamMap.get('tipo') === 'reembolso_parcial'
      ? 'reembolso_parcial'
      : 'reembolso_total';

  readonly monto = signal<string>(this.montoAprobado.toFixed(2));
  readonly metodo = signal<MetodoPago>('efectivo');
  readonly estado = signal<string>('Por confirmar');
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly devolucion = computed<Devolucion | null>(
    () =>
      this.devoluciones
        .devoluciones()
        .find((actual) => actual.id === this.devolucionId) ?? null,
  );

  readonly montoNumero = computed<number>(() => {
    const valor = Number.parseFloat(this.monto().replace(',', '.'));
    return Number.isFinite(valor) ? round2(valor) : 0;
  });

  readonly codigo = computed<string>(() =>
    String(14 + this.secuencia(this.devolucionId)).padStart(3, '0'),
  );

  readonly referencia = computed<string>(() => `RV-2026-${this.codigo()}`);

  readonly subtitulo = computed<string>(
    () =>
      `Devolución DV-${this.codigo()} · pedido ${this.pedidoNumero} · monto aprobado ${this.moneda(this.montoAprobado)}`,
  );

  readonly saldoCaja = computed<number>(() => round2(this.cuadre.montoEsperado()));

  readonly saldoDespues = computed<number>(() =>
    round2(this.saldoCaja() - this.montoNumero()),
  );

  readonly registradoPor = computed<string>(() => {
    const usuario = this.auth.usuario();
    return usuario ? abreviarNombre(usuario.nombre) : 'Cajero';
  });

  readonly puedeConfirmar = computed<boolean>(() => this.montoNumero() > 0);

  readonly reembolsosDia = computed<Devolucion[]>(() =>
    this.devoluciones
      .devoluciones()
      .filter(
        (devolucion) =>
          devolucion.resolucion === 'reembolso_total' ||
          devolucion.resolucion === 'reembolso_parcial',
      ),
  );

  readonly totalDevuelto = computed<number>(() =>
    round2(
      this.reembolsosDia().reduce(
        (suma, devolucion) => suma + devolucion.montoReembolsado,
        0,
      ),
    ),
  );

  readonly reembolsosMeta = computed<string>(
    () =>
      `${this.reembolsosDia().length} registrados · ${this.moneda(this.totalDevuelto())} devuelto`,
  );

  readonly fechaTexto = '14/10/2026 · 17:38';

  private toastTimer: number | null = null;
  private navTimer: number | null = null;

  elegirMetodo(metodo: MetodoPago): void {
    this.metodo.set(metodo);
  }

  onMonto(event: Event): void {
    this.monto.set((event.target as HTMLInputElement).value);
  }

  confirmar(): void {
    if (this.montoNumero() <= 0) {
      this.avisar('El monto debe ser mayor a 0.', true);
      return;
    }

    const usuarioId = this.usuarioId();
    const devolucion = this.devolucion();

    if (devolucion) {
      this.devoluciones.resolver(devolucion.id, this.tipo, this.montoNumero(), usuarioId);
    }

    this.pagos.registrarReembolso({
      pedidoId: devolucion?.pedidoId ?? null,
      cuentaId: null,
      metodo: this.metodo(),
      monto: this.montoNumero(),
      esContraentrega: false,
      fecha: new Date().toISOString(),
      usuarioId,
    });

    this.cuadre.registrarEgreso(this.montoNumero());
    this.estado.set('Confirmado');
    this.avisar(`Reembolso registrado · ${this.moneda(this.montoNumero())}`);

    this.navTimer = window.setTimeout(() => {
      void this.router.navigate(['/comandas']);
    }, 1600);
    this.destroyRef.onDestroy(() => {
      if (this.navTimer !== null) {
        window.clearTimeout(this.navTimer);
      }
    });
  }

  cancelar(): void {
    void this.router.navigate(['/devoluciones']);
  }

  textoMetodo(metodo: MetodoPago): string {
    return METODOS.find((actual) => actual.id === metodo)?.label ?? metodo;
  }

  referenciaDe(devolucion: Devolucion): string {
    return `RV-2026-${String(14 + this.secuencia(devolucion.id)).padStart(3, '0')}`;
  }

  textoEstado(devolucion: Devolucion): string {
    if (devolucion.estado === 'aceptada') {
      return 'Confirmado';
    }
    if (devolucion.estado === 'rechazada') {
      return 'Rechazado';
    }
    return 'Por confirmar';
  }

  tonoEstado(devolucion: Devolucion): 'success' | 'danger' | 'warning' {
    if (devolucion.estado === 'aceptada') {
      return 'success';
    }
    if (devolucion.estado === 'rechazada') {
      return 'danger';
    }
    return 'warning';
  }

  hora(iso: string | undefined): string {
    return iso && iso.length >= 16 ? iso.slice(11, 16) : '—';
  }

  private usuarioId(): number {
    return this.auth.usuario()?.id ?? 1;
  }

  private secuencia(id: number): number {
    return id > 100 ? id - 100 : 0;
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
