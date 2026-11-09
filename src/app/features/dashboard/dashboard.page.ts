import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../core/data/dashboard.service';
import { formatearNumero } from '../../core/utils/format';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';
import { ButtonComponent } from '../../shared/components/button/button';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { StatComponent } from '../../shared/components/stat/stat';

interface PuntoGrafico {
  x: number;
  y: number;
}

const REFRESCO_MS = 30000;

interface TrazosGrafico {
  linea: string;
  area: string;
  puntos: PuntoGrafico[];
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ButtonComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
    SectionHeaderComponent,
    StatComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.css',
})
export class DashboardPage {
  private readonly dashboard = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);
  private temporizador: number | null = null;

  readonly kpis = this.dashboard.kpis;
  readonly fecha = this.dashboard.fecha;
  readonly turno = this.dashboard.turno;
  readonly actualizado = this.dashboard.actualizado;
  readonly comandas = this.dashboard.comandas;
  readonly error = this.dashboard.error;

  readonly pedidosActivos = this.dashboard.pedidosActivos;
  readonly desglose = this.dashboard.desglose;
  readonly stockBajo = computed(() => this.dashboard.stockBajo().length);
  readonly nombresStockBajo = computed(() =>
    this.dashboard
      .stockBajo()
      .map((insumo) => insumo.nombre.replace(' entero', '').toLowerCase())
      .map((nombre, indice) =>
        indice === 0 ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : nombre,
      )
      .join(', '),
  );
  readonly mermasHoy = this.dashboard.mermasHoy;
  readonly registrosMerma = this.dashboard.registrosMerma;
  readonly porcentajeMeta = this.dashboard.porcentajeMeta;

  constructor() {
    void this.dashboard.cargarDatos();

    // Auto-refresco cada 30 s, solo con la pestaña visible. Al volver el foco
    // o la visibilidad se refresca de inmediato (ETag: un 304 no repinta).
    this.temporizador = window.setInterval(() => this.refrescarSiVisible(), REFRESCO_MS);
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
    window.addEventListener('focus', this.alRecuperarFoco);

    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearInterval(this.temporizador);
      }
      document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
      window.removeEventListener('focus', this.alRecuperarFoco);
    });
  }

  private readonly alCambiarVisibilidad = (): void => {
    if (document.visibilityState === 'visible') {
      void this.dashboard.refrescarSilencioso();
    }
  };

  private readonly alRecuperarFoco = (): void => {
    if (document.visibilityState === 'visible') {
      void this.dashboard.refrescarSilencioso();
    }
  };

  private refrescarSiVisible(): void {
    if (document.visibilityState !== 'visible') {
      return;
    }
    void this.dashboard.refrescarSilencioso();
  }

  reintentar(): void {
    void this.dashboard.cargarDatos();
  }

  readonly ventas = computed(() => formatearNumero(this.kpis().ventasHoy));
  readonly meta = computed(() => formatearNumero(this.kpis().metaVentas ?? 0));
  readonly faltante = computed(() => formatearNumero(this.dashboard.faltanteMeta()));
  readonly mermasMonto = computed(() => formatearNumero(this.mermasHoy()));
  readonly tieneMeta = this.dashboard.tieneMeta;

  readonly deltaPct = computed<number | null>(() => this.kpis().deltaPct);
  readonly deltaTexto = computed<string>(() => {
    const delta = this.deltaPct();
    if (delta === null) {
      return '';
    }
    return `${delta >= 0 ? '+' : ''}${delta}%`;
  });
  readonly deltaTono = computed<ChipVariant>(() => {
    const delta = this.deltaPct();
    return delta !== null && delta < 0 ? 'danger' : 'success';
  });

  readonly indiceHoy = computed(() => Math.max(0, this.kpis().serieSemana.length - 1));

  readonly guias: readonly number[] = [24, 84, 144];

  readonly circunferencia = 2 * Math.PI * 75;

  readonly donutOffset = computed(
    () => this.circunferencia * (1 - this.porcentajeMeta() / 100),
  );

  readonly trazos = computed<TrazosGrafico>(() => {
    const valores = this.kpis().serieSemana.map((punto) => punto.monto);
    const ancho = 1000;
    const alto = 190;
    const techo = 16;
    const base = 174;
    // Sin una serie real (0 o 1 punto) no hay línea que dibujar ni forma de
    // dividir por cero: se devuelve vacío y el SVG queda limpio.
    if (valores.length < 2) {
      return { linea: '', area: '', puntos: [] };
    }
    const maximo = Math.max(...valores);
    const minimo = Math.min(...valores);
    const rango = maximo - minimo || 1;
    const puntos: PuntoGrafico[] = valores.map((valor, indice) => ({
      x: (indice * ancho) / (valores.length - 1),
      y: base - ((valor - minimo) / rango) * (base - techo),
    }));
    const linea = puntos
      .map((punto, indice) => `${indice === 0 ? 'M' : 'L'} ${punto.x.toFixed(1)} ${punto.y.toFixed(1)}`)
      .join(' ');
    const area = `${linea} L ${ancho} ${alto} L 0 ${alto} Z`;
    return { linea, area, puntos };
  });
}
