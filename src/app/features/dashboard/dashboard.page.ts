import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../core/data/dashboard.service';
import { formatearNumero } from '../../core/utils/format';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';
import { ButtonComponent } from '../../shared/components/button/button';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { StatComponent } from '../../shared/components/stat/stat';

interface PuntoGrafico {
  x: number;
  y: number;
}

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

  readonly kpis = this.dashboard.kpis;
  readonly fecha = this.dashboard.fecha;
  readonly comandas = this.dashboard.comandas;

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
  }

  readonly ventas = computed(() => formatearNumero(this.kpis().ventasHoy));
  readonly meta = computed(() => formatearNumero(this.kpis().metaVentas));
  readonly faltante = computed(() => formatearNumero(this.dashboard.faltanteMeta()));
  readonly mermasMonto = computed(() => formatearNumero(this.mermasHoy()));

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
