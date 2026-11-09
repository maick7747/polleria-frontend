import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CuentasService } from '../../core/data/cuentas.service';
import type { Cuenta, EstadoCuenta } from '../../core/models';
import { formatearMoneda } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type EstadoFiltro = 'todos' | EstadoCuenta;

const LIMITES = [10, 20, 50, 100];

const ESTADOS: readonly EstadoFiltro[] = ['todos', 'abierta', 'cobrada', 'cancelada'];

const ESTADOS_TEXTO: Record<EstadoFiltro, string> = {
  todos: 'Todos',
  abierta: 'Abierta',
  cobrada: 'Cobrada',
  cancelada: 'Cancelada',
};

const ESQUELETO = [0, 1, 2, 3, 4];

@Component({
  selector: 'app-historial-cuentas-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    EmptyStateComponent,
    IconComponent,
    PaginadorComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './historial-cuentas.page.html',
  styleUrl: './historial-cuentas.page.css',
})
export class HistorialCuentasPage {
  private readonly cuentas = inject(CuentasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly moneda = formatearMoneda;
  readonly estados = ESTADOS;
  readonly esqueleto = ESQUELETO;

  readonly estado = signal<EstadoFiltro>('todos');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(10);

  readonly cargando = this.cuentas.cargando;
  readonly error = this.cuentas.error;
  readonly meta = this.cuentas.meta;

  readonly filas = computed<Cuenta[]>(() => this.cuentas.historial());

  readonly subtitulo = computed(() => {
    const meta = this.meta();
    return `${meta.total} cuentas · página ${meta.page} de ${meta.pages || 1}`;
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const estado = params.get('estado');
    const pagina = Number(params.get('page'));
    const limite = Number(params.get('limit'));

    this.estado.set(ESTADOS.includes(estado as EstadoFiltro) ? (estado as EstadoFiltro) : 'todos');
    this.pagina.set(Math.max(1, Number.isFinite(pagina) ? pagina : 1));
    this.limite.set(LIMITES.includes(limite) ? limite : 10);

    void this.cargar();
  }

  cambiarEstado(event: Event): void {
    this.estado.set((event.target as HTMLSelectElement).value as EstadoFiltro);
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

  limpiar(): void {
    this.estado.set('todos');
    this.pagina.set(1);
    void this.cargar();
  }

  reintentar(): void {
    void this.cargar();
  }

  estadoTexto(estado: EstadoCuenta): string {
    return ESTADOS_TEXTO[estado];
  }

  estadoTono(estado: EstadoCuenta): ChipVariant {
    switch (estado) {
      case 'cobrada': return 'success';
      case 'abierta': return 'info';
      case 'cancelada': return 'danger';
      default: return 'neutral';
    }
  }

  apertura(cuenta: Cuenta): string {
    const fecha = new Date(cuenta.fechaApertura);
    if (Number.isNaN(fecha.getTime())) {
      return '—';
    }
    return fecha.toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  mesa(cuenta: Cuenta): string {
    return `Mesa ${cuenta.mesaNumero ?? cuenta.mesaId}`;
  }

  comprobante(cuenta: Cuenta): string {
    if (cuenta.comprobanteNumero) {
      return `${cuenta.comprobanteTipo} ${cuenta.comprobanteNumero}`;
    }
    return cuenta.comprobanteTipo === 'ninguno' ? '—' : cuenta.comprobanteTipo;
  }

  private async cargar(): Promise<void> {
    const estado = this.estado();
    const ok = await this.cuentas.listar({
      page: this.pagina(),
      limit: this.limite(),
      estado: estado === 'todos' ? undefined : estado,
    });
    if (ok) {
      const meta = this.cuentas.meta();
      this.pagina.set(meta.page);
      this.limite.set(meta.limit);
      this.sincronizarUrl();
    }
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        estado: this.estado() === 'todos' ? null : this.estado(),
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 10 ? this.limite() : null,
      },
      replaceUrl: true,
    });
  }
}
