import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CuadreService } from '../../core/data/cuadre.service';
import { CuentasService } from '../../core/data/cuentas.service';
import { MesasService } from '../../core/data/mesas.service';
import { NotificacionesService } from '../../core/data/notificaciones.service';
import { RealtimeService } from '../../core/data/realtime.service';
import type { Cuenta, Mesa, PedidoDetalle, Ronda } from '../../core/models';
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
  listos: number;
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
  private readonly cuadre = inject(CuadreService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;
  private ultimaRevision = 0;

  private readonly ahora = signal(Date.now());

  readonly fecha = computed(() => `Fratelli's · ${fechaLarga()} · ${turnoActual()}`);
  readonly filtro = signal<FiltroMesas>('todas');
  readonly seleccionadaId = signal<number | null>(null);
  readonly avisoLento = signal(false);
  readonly toast = signal('');
  readonly esqueletos = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  readonly cargando = computed(() => this.mesas.cargando() || this.cuentas.cargando());
  readonly error = computed(() => this.mesas.error() ?? this.cuentas.error());
  readonly aviso = this.cuentas.aviso;
  readonly errorDetalle = this.mesas.errorDetalle;

  readonly totalMesas = computed(() => this.mesas.mesas().length);
  readonly libres = this.mesas.libres;
  readonly ocupadas = this.mesas.ocupadas;
  readonly cuentasAbiertas = this.cuentas.abiertas;
  readonly totalAbierto = this.cuentas.totalAbierto;
  readonly moneda = formatearMoneda;
  readonly turno = turnoActual();
  readonly hora = formatearHora;
  readonly cajaAbierta = computed(() => this.cuadre.estado() === 'abierta');
  readonly cajaCerradaEstado = computed(() => {
    const estado = this.cuadre.estado();
    return estado === 'cerrada' || estado === 'sin_cuadre';
  });

  readonly tarjetas = computed<MesaVista[]>(() => {
    const ahora = this.ahora();
    return this.mesas.mesas().map((mesa) => {
      // Preferimos la cuenta del servicio (trae rondas y detalles completos).
      const cuenta = this.cuentas.cuentaDeMesa(mesa.id) ?? mesa.cuentaAbierta ?? null;
      const listos = cuenta
        ? cuenta.rondas.reduce(
            (total, ronda) =>
              total + ronda.items.filter(
                (item) => !item.entregadoEn && item.estadoPreparacion === 'listo',
              ).length,
            0,
          )
        : 0;
      return {
        mesa,
        cuenta,
        minutos: cuenta ? minutosEntre(cuenta.fechaApertura, ahora) : 0,
        listos,
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
    return {
      ...tarjeta,
      rondas: cuenta?.rondas ?? [],
      totalRondas: cuenta?.rondas.length ?? 0,
      mozo: abreviarNombre(cuenta?.usuarioAperturaNombre ?? ''),
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
    const reloj = setInterval(() => this.ahora.set(Date.now()), 30000);
    const refresco = setInterval(() => void this.refrescar(), 15000);
    this.realtime.iniciar();
    // Realtime (si está disponible) adelanta el mismo refresco silencioso.
    // La revisión 0 es la inicial y no debe disparar una segunda carga.
    effect(() => {
      const revision = this.realtime.revision();
      if (revision === this.ultimaRevision) {
        return;
      }
      this.ultimaRevision = revision;
      if (revision > 0) {
        void this.refrescar();
      }
    });
    this.destroyRef.onDestroy(() => {
      clearInterval(reloj);
      clearInterval(refresco);
      this.realtime.detener();
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
    void this.cargar();
    void this.cuadre.cargar();
  }

  @HostListener('document:keydown.escape')
  limpiarConEscape(): void {
    this.limpiarSeleccion();
  }

  private async cargar(): Promise<void> {
    this.avisoLento.set(false);
    const temporizador = window.setTimeout(() => this.avisoLento.set(true), 5000);
    try {
      // El tablero agregado trae mesas + cuentas en una sola petición.
      await this.cuentas.cargar();
    } finally {
      window.clearTimeout(temporizador);
      this.avisoLento.set(false);
    }
    // Primera carga: siembra los avisos existentes sin alertar.
    this.notificaciones.sincronizar(this.cuentas.abiertas(), false);
    const actual = this.seleccionadaId();
    if (actual !== null && !this.mesas.porId(actual)) {
      this.seleccionadaId.set(null);
    }
  }

  // Refresco silencioso: no muestra esqueletos y avisa si cocina marcó algo listo.
  private async refrescar(): Promise<void> {
    if (document.visibilityState !== 'visible' || this.cargando()) {
      return;
    }
    await this.cuentas.cargar(true);
    const nuevos = this.notificaciones.sincronizar(this.cuentas.abiertas());
    if (nuevos.length > 0) {
      const ultimo = nuevos[nuevos.length - 1];
      this.avisar(
        nuevos.length === 1
          ? `Mesa ${String(ultimo.mesaNumero).padStart(2, '0')} · ${ultimo.plato} listo`
          : `${nuevos.length} platos listos en cocina`,
      );
    }
  }

  reintentar(): void {
    void this.cargar();
  }

  avisar(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 4000);
  }

  rondaEntregada(ronda: Ronda): boolean {
    return ronda.items.length > 0 && ronda.items.every((item) => Boolean(item.entregadoEn));
  }

  rondaLista(ronda: Ronda): boolean {
    return (
      !this.rondaEntregada(ronda) &&
      ronda.items.length > 0 &&
      ronda.items.every(
        (item) => Boolean(item.entregadoEn) || item.estadoPreparacion === 'listo',
      )
    );
  }

  estadoLinea(item: PedidoDetalle): string {
    return item.entregadoEn ? 'entregado' : item.estadoPreparacion;
  }

  estadoPlato(estado: string): string {
    if (estado === 'entregado') {
      return 'Entregado';
    }
    if (estado === 'listo') {
      return 'Listo';
    }
    return estado === 'en_preparacion' ? 'Preparando' : 'Pendiente';
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

  // Doble click (o botón "Tomar pedido"): navega sin crear la cuenta.
  // La cuenta es perezosa y se crea al enviar la primera ronda.
  async abrirPedido(mesa: Mesa): Promise<void> {
    this.seleccionadaId.set(mesa.id);
    await this.router.navigate(['/venta-local/pedido', mesa.id]);
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
