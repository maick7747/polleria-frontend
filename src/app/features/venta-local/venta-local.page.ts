import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CuentasService } from '../../core/data/cuentas.service';
import { MesasService } from '../../core/data/mesas.service';
import type { Cuenta, Mesa, Ronda } from '../../core/models';
import {
  abreviarNombre,
  fechaLarga,
  formatearMoneda,
  hora as formatearHora,
  minutosEntre,
  round2,
  turnoActual,
} from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type FiltroMesas = 'todas' | 'libres' | 'ocupadas';

interface MesaVista {
  mesa: Mesa;
  cuenta: Cuenta | null;
  minutos: number;
}

interface MesaDetalle extends MesaVista {
  rondas: Ronda[];
  totalRondas: number;
  mozo: string;
  horaIngreso: string;
  subtotal: number;
  igv: number;
}

const TAMANO_FILA = 5;

@Component({
  selector: 'app-venta-local-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './venta-local.page.html',
  styleUrl: './venta-local.page.css',
})
export class VentaLocalPage {
  private readonly mesas = inject(MesasService);
  private readonly cuentas = inject(CuentasService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly ahora = signal(Date.now());

  readonly fecha = computed(() => `Fratelli's · ${fechaLarga()} · ${turnoActual()}`);
  readonly filtro = signal<FiltroMesas>('todas');
  readonly seleccionadaId = signal<number | null>(null);

  readonly totalMesas = computed(() => this.mesas.mesas().length);
  readonly libres = this.mesas.libres;
  readonly ocupadas = this.mesas.ocupadas;
  readonly cuentasAbiertas = this.cuentas.abiertas;
  readonly totalAbierto = this.cuentas.totalAbierto;
  readonly moneda = formatearMoneda;
  readonly hora = formatearHora;

  readonly tarjetas = computed<MesaVista[]>(() => {
    const ahora = this.ahora();
    return this.mesas.mesas().map((mesa) => {
      const cuenta = mesa.cuentaAbierta ?? this.cuentas.cuentaDeMesa(mesa.id) ?? null;
      return {
        mesa,
        cuenta,
        minutos: cuenta ? minutosEntre(cuenta.fechaApertura, ahora) : 0,
      };
    });
  });

  readonly filas = computed<MesaVista[][]>(() => {
    const filtro = this.filtro();
    const visibles = this.tarjetas().filter((item) => {
      if (filtro === 'libres') {
        return item.mesa.estado === 'libre';
      }
      if (filtro === 'ocupadas') {
        return item.mesa.estado === 'ocupada';
      }
      return true;
    });
    const filas: MesaVista[][] = [];
    for (let indice = 0; indice < visibles.length; indice += TAMANO_FILA) {
      filas.push(visibles.slice(indice, indice + TAMANO_FILA));
    }
    return filas;
  });

  readonly seleccionada = computed<MesaDetalle | null>(() => {
    const id = this.seleccionadaId();
    if (id === null) {
      return null;
    }
    const tarjeta = this.tarjetas().find((item) => item.mesa.id === id);
    if (!tarjeta) {
      return null;
    }
    const cuenta = tarjeta.cuenta;
    const total = cuenta?.total ?? 0;
    const subtotal = round2(total / 1.18);
    const usuario = this.auth.usuario();
    const esPropia = Boolean(cuenta && usuario && cuenta.usuarioAperturaId === usuario.id);
    return {
      ...tarjeta,
      rondas: cuenta?.rondas ?? [],
      totalRondas: cuenta?.rondas.length ?? 0,
      mozo: esPropia && usuario ? abreviarNombre(usuario.nombre) : '—',
      horaIngreso: formatearHora(cuenta?.fechaApertura),
      subtotal,
      igv: round2(total - subtotal),
    };
  });

  readonly promedioRondas = computed(() => {
    const abiertas = this.cuentas.abiertas();
    if (abiertas.length === 0) {
      return 0;
    }
    const total = abiertas.reduce((suma, cuenta) => suma + cuenta.rondas.length, 0);
    return Math.round(total / abiertas.length);
  });

  readonly dineroTotalAbierto = computed(() => formatearMoneda(this.totalAbierto()));
  readonly subtotalSeleccionado = computed(() =>
    formatearMoneda(this.seleccionada()?.subtotal ?? 0),
  );
  readonly igvSeleccionado = computed(() => formatearMoneda(this.seleccionada()?.igv ?? 0));

  constructor() {
    const intervalo = setInterval(() => this.ahora.set(Date.now()), 30000);
    this.destroyRef.onDestroy(() => clearInterval(intervalo));
    void this.cargar();
  }

  @HostListener('document:keydown.escape')
  limpiarConEscape(): void {
    this.limpiarSeleccion();
  }

  private async cargar(): Promise<void> {
    await Promise.all([this.mesas.cargar(), this.cuentas.cargar()]);
    const actual = this.seleccionadaId();
    if (actual !== null && !this.mesas.porId(actual)) {
      this.seleccionadaId.set(null);
    }
  }

  // Click simple: selecciona o deselecciona (toggle). No navega.
  async seleccionar(mesa: Mesa): Promise<void> {
    if (this.seleccionadaId() === mesa.id) {
      this.limpiarSeleccion();
      return;
    }
    this.seleccionadaId.set(mesa.id);
    if (mesa.estado === 'ocupada' || this.cuentas.cuentaDeMesa(mesa.id)) {
      await this.mesas.cargarDetalle(mesa.id);
    }
  }

  // Doble click (o botón "Tomar pedido"): abre cuenta si hace falta y navega.
  async abrirPedido(mesa: Mesa): Promise<void> {
    this.seleccionadaId.set(mesa.id);
    try {
      if (!this.cuentas.cuentaDeMesa(mesa.id)) {
        await this.cuentas.abrirCuenta(mesa.id, this.auth.usuario()?.id ?? 3);
      }
      await this.router.navigate(['/venta-local/pedido', mesa.id]);
    } catch {
      this.seleccionadaId.set(mesa.id);
    }
  }

  async irAPedido(): Promise<void> {
    const id = this.seleccionadaId();
    const mesa = id === null ? null : this.mesas.porId(id);
    if (mesa) {
      await this.abrirPedido(mesa);
    }
  }

  limpiarSeleccion(): void {
    this.seleccionadaId.set(null);
  }

  cambiarFiltro(filtro: FiltroMesas): void {
    this.filtro.set(filtro);
  }

  esSeleccionada(id: number): boolean {
    return this.seleccionadaId() === id;
  }

  numeroMesa(numero: number): string {
    return String(numero).padStart(2, '0');
  }
}
