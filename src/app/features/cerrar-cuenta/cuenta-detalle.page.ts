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
import { mensajeError } from '../../core/api/api.helpers';
import { CuentasService } from '../../core/data/cuentas.service';
import type { MetodoPago } from '../../core/models';
import {
  abreviarNombre,
  formatearMoneda,
  hora as formatearHora,
  minutosEntre,
  round2,
} from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

const AHORA = Date.now();

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
  selector: 'app-cuenta-detalle-page',
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
  templateUrl: './cuenta-detalle.page.html',
  styleUrl: './cuenta-detalle.page.css',
})
export class CuentaDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cuentas = inject(CuentasService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly cuentaId = Number(this.route.snapshot.paramMap.get('cuentaId'));
  readonly metodos = METODOS;
  readonly moneda = formatearMoneda;

  readonly cuenta = computed(() => this.cuentas.porId(this.cuentaId) ?? null);
  readonly metodo = signal<MetodoPago>('efectivo');
  readonly recibido = signal('100');
  readonly procesando = signal(false);
  readonly cargando = signal(true);
  readonly avisoLento = signal(false);
  readonly error = signal<string | null>(null);
  readonly toast = signal('');
  readonly toastError = signal(false);

  private toastTimer: number | null = null;
  private navTimer: number | null = null;

  constructor() {
    void this.cargar();
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
      if (this.navTimer !== null) {
        window.clearTimeout(this.navTimer);
      }
    });
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.avisoLento.set(false);
    const temporizador = window.setTimeout(() => this.avisoLento.set(true), 5000);
    try {
      const ok = await this.cuentas.cargarDetalle(this.cuentaId);
      if (!ok) {
        const detalle = this.cuentas.errorDetalle();
        this.error.set(
          detalle?.status === 404
            ? 'La cuenta no existe o ya fue cerrada.'
            : detalle?.message ?? 'No se pudo cargar la cuenta.',
        );
      }
    } finally {
      window.clearTimeout(temporizador);
      this.avisoLento.set(false);
      this.cargando.set(false);
    }
  }

  reintentar(): void {
    void this.cargar();
  }

  readonly numeroMesa = computed<string>(() =>
    String(this.cuenta()?.mesaId ?? 0).padStart(2, '0'),
  );
  readonly titulo = computed<string>(() =>
    this.abierta()
      ? `Cerrar cuenta · Mesa ${this.numeroMesa()}`
      : `Detalle de cuenta · Mesa ${this.numeroMesa()}`,
  );
  readonly subtitulo = computed<string>(() => {
    const cuenta = this.cuenta();
    if (!cuenta) {
      return 'Cuenta no encontrada';
    }
    const mozo = abreviarNombre(cuenta.usuarioAperturaNombre ?? '');
    if (cuenta.estado !== 'abierta') {
      return `${this.estadoEtiqueta()} · ${cuenta.rondas.length} rondas · Mozo ${mozo}`;
    }
    const minutos = minutosEntre(cuenta.fechaApertura, AHORA);
    return `Abierta ${minutos} min · ${cuenta.rondas.length} rondas · Mozo ${mozo}`;
  });

  readonly abierta = computed<boolean>(() => this.cuenta()?.estado === 'abierta');
  readonly estadoEtiqueta = computed<string>(() => {
    switch (this.cuenta()?.estado) {
      case 'cobrada': return 'Cuenta cobrada · solo lectura';
      case 'cancelada': return 'Cuenta cancelada · solo lectura';
      default: return 'Cuenta abierta';
    }
  });
  readonly total = computed<number>(() => this.cuenta()?.total ?? 0);
  readonly subtotal = computed<number>(() => round2(this.total() / 1.18));
  readonly igv = computed<number>(() => round2(this.total() - this.subtotal()));
  readonly rondas = computed<number>(() => this.cuenta()?.rondas.length ?? 0);
  readonly platos = computed<number>(() =>
    (this.cuenta()?.rondas ?? []).reduce((suma, ronda) => suma + ronda.items.length, 0),
  );

  readonly mozo = computed<string>(() =>
    abreviarNombre(this.cuenta()?.usuarioAperturaNombre ?? ''),
  );

  readonly cliente = computed<string>(() => this.cuenta()?.cliente?.nombre ?? 'Consumidor final');
  readonly documento = computed<string>(() => {
    const cliente = this.cuenta()?.cliente;
    return cliente ? `${cliente.tipoDocumento} ${cliente.numeroDocumento}` : '—';
  });
  readonly comprobante = computed<string>(() => {
    const tipo = this.cuenta()?.comprobanteTipo;
    if (tipo === 'boleta') {
      return 'Boleta';
    }
    if (tipo === 'ticket') {
      return 'Ticket';
    }
    return 'Sin comprobante';
  });

  readonly recibidoNumero = computed<number>(() => {
    const valor = Number.parseFloat(this.recibido().replace(',', '.'));
    return Number.isFinite(valor) ? valor : 0;
  });
  readonly vuelto = computed<number>(() =>
    Math.max(0, round2(this.recibidoNumero() - this.total())),
  );
  readonly faltante = computed<number>(() =>
    Math.max(0, round2(this.total() - this.recibidoNumero())),
  );

  readonly puedeCobrar = computed<boolean>(() => {
    if (!this.abierta() || this.procesando()) {
      return false;
    }
    if (this.metodo() === 'efectivo') {
      return this.recibidoNumero() >= this.total();
    }
    return true;
  });

  elegirMetodo(metodo: MetodoPago): void {
    if (this.procesando()) {
      return;
    }
    this.metodo.set(metodo);
  }

  onRecibido(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.recibido.set(input.value);
  }

  async registrarPago(): Promise<void> {
    const cuenta = this.cuenta();
    if (!cuenta || cuenta.estado !== 'abierta' || this.procesando()) {
      this.avisar('La cuenta ya fue cobrada.', true);
      return;
    }
    if (this.metodo() === 'efectivo' && this.recibidoNumero() < cuenta.total) {
      this.avisar('El efectivo recibido no cubre el total.', true);
      return;
    }

    this.procesando.set(true);
    const numero = this.numeroComprobante(cuenta.comprobanteTipo);
    try {
      const cerrada = await this.cuentas.cerrar(
        cuenta.id,
        this.auth.usuario()?.id ?? 3,
        cuenta.comprobanteTipo,
        numero,
        this.metodo(),
      );

      if (!cerrada) {
        this.procesando.set(false);
        this.avisar('No se pudo registrar el pago.', true);
        return;
      }

      this.avisar(`Pago registrado · ${cerrada.comprobanteNumero ?? numero}`);
      this.navTimer = window.setTimeout(() => {
        this.procesando.set(false);
        void this.router.navigate(['/cerrar-cuenta']);
      }, 1600);
    } catch (error) {
      this.procesando.set(false);
      this.avisar(mensajeError(error), true);
    }
  }

  hora(iso: string): string {
    return formatearHora(iso);
  }

  unidades(cantidad: number): string {
    return cantidad === 1 ? 'unidad' : 'unidades';
  }

  private numeroComprobante(tipo: string): string {
    const correlativo = String(1234 + this.cuentaId).padStart(6, '0');
    if (tipo === 'boleta') {
      return `B001-${correlativo}`;
    }
    if (tipo === 'ticket') {
      return `T001-${correlativo}`;
    }
    return `SIN-${correlativo}`;
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 2600);
  }
}
