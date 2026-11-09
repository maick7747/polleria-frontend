import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { esApiError, mensajeError } from '../../core/api/api.helpers';
import { CuadreService } from '../../core/data/cuadre.service';
import { abreviarNombre, fechaCorta, formatearMoneda, round2, turnoActual } from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface Denominacion {
  valor: number;
  cantidad: number;
}

const DENOMINACIONES_INICIALES: readonly Denominacion[] = [
  { valor: 100, cantidad: 1 },
  { valor: 50, cantidad: 1 },
  { valor: 20, cantidad: 1 },
  { valor: 10, cantidad: 2 },
  { valor: 5, cantidad: 2 },
];

@Component({
  selector: 'app-apertura-caja-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apertura.page.html',
  styleUrl: './apertura.page.css',
})
export class AperturaCajaPage {
  private readonly cuadre = inject(CuadreService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;

  readonly moneda = formatearMoneda;
  readonly fecha = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date());
  readonly turno = turnoActual();
  readonly fechaLarga = fechaCorta();
  readonly subtitulo = `Cuadre de caja · ${this.fechaLarga} · ${this.turno}`;

  readonly abierta = this.cuadre.abierta;

  readonly fondoInicial = signal<number>(200);
  readonly observaciones = signal(
    'Sencillo: cambio de S/ 50 en monedas y billetes de S/ 10 para vuelto.',
  );
  readonly denominaciones = signal<Denominacion[]>(
    DENOMINACIONES_INICIALES.map((denominacion) => ({ ...denominacion })),
  );
  readonly toast = signal('');
  readonly error = signal('');
  readonly cajaAnteriorAbierta = signal(false);

  readonly responsable = computed<string>(() => {
    const usuario = this.auth.usuario();
    return usuario ? abreviarNombre(usuario.nombre) : 'Sin usuario';
  });

  readonly rolesResponsable = computed<string>(() => {
    const roles = this.auth.roles();
    return roles.length > 0 ? roles.join(' + ') : 'Sin rol';
  });

  readonly totalContado = computed<number>(() =>
    round2(
      this.denominaciones().reduce(
        (suma, denominacion) => suma + denominacion.valor * denominacion.cantidad,
        0,
      ),
    ),
  );

  readonly coincide = computed<boolean>(
    () => Math.abs(this.totalContado() - this.fondoInicial()) < 0.005,
  );

  readonly puedeAbrir = computed<boolean>(
    () => !this.abierta() && this.coincide() && this.toast() === '',
  );

  constructor() {
    void this.cuadre.cargar();
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  onFondo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const texto = input.value.replace(',', '.').trim();
    const valor = Number(texto);
    this.fondoInicial.set(
      texto !== '' && Number.isFinite(valor) ? round2(Math.max(0, valor)) : 0,
    );
    input.value = this.fondoInicial().toFixed(2);
  }

  onObservacion(event: Event): void {
    this.observaciones.set((event.target as HTMLTextAreaElement).value);
  }

  onCantidad(indice: number, event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    const cantidad = Number.isFinite(valor) ? Math.max(0, Math.floor(valor)) : 0;
    this.denominaciones.update((lista) =>
      lista.map((denominacion, posicion) =>
        posicion === indice ? { ...denominacion, cantidad } : denominacion,
      ),
    );
  }

  subtotal(denominacion: Denominacion): number {
    return round2(denominacion.valor * denominacion.cantidad);
  }

  async abrir(): Promise<void> {
    if (!this.puedeAbrir()) {
      return;
    }
    const fondo = this.fondoInicial();
    this.error.set('');
    this.cajaAnteriorAbierta.set(false);
    try {
      await this.cuadre.abrir(fondo);
      this.toast.set(`Caja abierta · fondo ${this.moneda(fondo)}`);
      this.temporizador = window.setTimeout(() => {
        void this.router.navigate(['/dashboard']);
      }, 950);
    } catch (error) {
      // Error persistente: el usuario debe verlo y decidir (no hay navegación).
      this.error.set(mensajeError(error));
      if (esApiError(error) && error.code === 'CAJA_ANTERIOR_ABIERTA') {
        this.cajaAnteriorAbierta.set(true);
      }
    }
  }
}
