import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CuadreService } from '../../core/data/cuadre.service';
import { InventarioService } from '../../core/data/inventario.service';
import { MermaService } from '../../core/data/merma.service';
import { MOCK_USUARIOS } from '../../core/data/mock-data';
import type { ClasificacionMerma, EstadoMerma, Merma } from '../../core/models';
import { abreviarNombre, formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

const TIPOS: readonly string[] = [
  'Pollo',
  'Guarniciones',
  'Robo / hurto',
  'Sobreproducción',
  'Caducidad',
  'Rotura proveedor',
  'Incidente físico',
];

const FOOD_COST_BASE = 28.4;

@Component({
  selector: 'app-merma-page',
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
  templateUrl: './merma.page.html',
  styleUrl: './merma.page.css',
})
export class MermaPage {
  private readonly auth = inject(AuthService);
  private readonly inventario = inject(InventarioService);
  private readonly merma = inject(MermaService);
  private readonly cuadre = inject(CuadreService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tipos = TIPOS;
  readonly moneda = formatearMoneda;
  readonly foodCostBase = FOOD_COST_BASE;

  readonly tipo = signal<string>('Sobreproducción');
  readonly insumoId = signal<number>(1);
  readonly cantidad = signal<string>('3.5');
  readonly clasificacion = signal<ClasificacionMerma>('evitable');
  readonly causaRaiz = signal<string>('Producción por encima de la demanda del turno');
  readonly observacion = signal<string>('');

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly insumos = this.inventario.insumos;
  readonly mermas = this.merma.mermas;
  readonly pendientes = this.merma.pendientes;

  readonly insumo = computed(() => this.inventario.porId(this.insumoId()) ?? null);
  readonly unidad = computed<string>(() => this.insumo()?.unidadMedida ?? 'kg');
  readonly costoUnitario = computed<number>(() => this.insumo()?.costoPromedio ?? 0);
  readonly stockActual = computed<number>(() => this.insumo()?.stockActual ?? 0);

  readonly cantidadNumero = computed<number>(() => {
    const valor = Number.parseFloat(this.cantidad().replace(',', '.'));
    return Number.isFinite(valor) ? valor : 0;
  });

  readonly costo = computed<number>(() =>
    round2(this.cantidadNumero() * this.costoUnitario()),
  );

  readonly stockResultante = computed<number>(() =>
    Math.max(0, round2(this.stockActual() - this.cantidadNumero())),
  );

  readonly foodCost = computed<number>(() => {
    const ventas = this.cuadre.totalVentas();
    if (ventas <= 0) {
      return FOOD_COST_BASE;
    }
    return round2(FOOD_COST_BASE + (this.costo() / ventas) * 100);
  });

  readonly puedeAprobar = computed<boolean>(
    () => this.insumo() !== null && this.cantidadNumero() > 0,
  );

  readonly subtitulo = computed<string>(
    () =>
      `Fratelli's · turno tarde · ${this.merma.registrosHoy()} registros hoy · ${formatearMoneda(this.merma.costoHoy())} acumulado`,
  );

  readonly recientesMeta = computed<string>(
    () =>
      `${this.merma.registrosHoy()} registros hoy · ${formatearMoneda(this.merma.costoHoy())} de impacto`,
  );

  readonly siguienteCodigo = computed<string>(
    () => `MER-${String(14 + this.merma.mermas().length).padStart(3, '0')}`,
  );

  private toastTimer: number | null = null;

  elegirTipo(tipo: string): void {
    this.tipo.set(tipo);
  }

  elegirClasificacion(clasificacion: ClasificacionMerma): void {
    this.clasificacion.set(clasificacion);
  }

  onInsumo(event: Event): void {
    this.insumoId.set(Number((event.target as HTMLSelectElement).value));
  }

  onCantidad(event: Event): void {
    this.cantidad.set((event.target as HTMLInputElement).value);
  }

  onCausa(event: Event): void {
    this.causaRaiz.set((event.target as HTMLInputElement).value);
  }

  onObservacion(event: Event): void {
    this.observacion.set((event.target as HTMLInputElement).value);
  }

  aprobar(): void {
    const merma = this.crear();
    if (!merma) {
      return;
    }
    this.merma.aprobar(merma.id, this.usuarioId());
    this.avisar(
      `Merma aprobada · ${formatearMoneda(merma.costoEstimado)} descontado de ${merma.insumoNombre ?? 'inventario'}`,
    );
    this.limpiar();
  }

  rechazar(): void {
    const motivo = window.prompt('Motivo del rechazo:', 'Registro duplicado');
    if (motivo === null) {
      return;
    }
    const merma = this.crear();
    if (!merma) {
      return;
    }
    this.merma.rechazar(merma.id, this.usuarioId(), motivo.trim() || 'Sin detalle');
    this.avisar('Merma rechazada · no se descuenta stock');
    this.limpiar();
  }

  aprobarRegistro(merma: Merma): void {
    if (merma.estado !== 'pendiente') {
      return;
    }
    this.merma.aprobar(merma.id, this.usuarioId());
    this.avisar(
      `Merma aprobada · ${formatearMoneda(merma.costoEstimado)} descontado de ${merma.insumoNombre ?? 'inventario'}`,
    );
  }

  rechazarRegistro(merma: Merma): void {
    if (merma.estado !== 'pendiente') {
      return;
    }
    const motivo = window.prompt('Motivo del rechazo:', 'Registro duplicado');
    if (motivo === null) {
      return;
    }
    this.merma.rechazar(merma.id, this.usuarioId(), motivo.trim() || 'Sin detalle');
    this.avisar('Merma rechazada · no se descuenta stock');
  }

  unidadDe(merma: Merma): string {
    if (merma.insumoId === undefined) {
      return '';
    }
    return this.inventario.porId(merma.insumoId)?.unidadMedida ?? '';
  }

  registradoPor(merma: Merma): string {
    const usuario = MOCK_USUARIOS.find((candidato) => candidato.id === merma.usuarioRegistroId);
    return usuario ? abreviarNombre(usuario.nombre) : '—';
  }

  fechaCorta(fecha: string): string {
    return fecha.length >= 10 ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` : fecha;
  }

  textoEstado(estado: EstadoMerma): string {
    if (estado === 'aprobada') {
      return 'Aprobada';
    }
    if (estado === 'rechazada') {
      return 'Rechazada';
    }
    return 'Pendiente';
  }

  tonoEstado(estado: EstadoMerma): ChipVariant {
    if (estado === 'aprobada') {
      return 'success';
    }
    if (estado === 'rechazada') {
      return 'danger';
    }
    return 'warning';
  }

  private crear(): Merma | null {
    const insumo = this.insumo();
    if (!insumo || this.cantidadNumero() <= 0) {
      this.avisar('Selecciona un insumo e ingresa una cantidad mayor a 0.', true);
      return null;
    }
    return this.merma.registrar({
      tipo: this.tipo(),
      insumoId: insumo.id,
      insumoNombre: insumo.nombre,
      cantidad: this.cantidadNumero(),
      costoEstimado: this.costo(),
      clasificacion: this.clasificacion(),
      causaRaiz: this.causaRaiz().trim() || 'No especificada',
      motivo:
        this.observacion().trim() || `${this.tipo()} · ${insumo.nombre}`,
      usuarioRegistroId: this.usuarioId(),
    });
  }

  private limpiar(): void {
    this.cantidad.set('0');
    this.observacion.set('');
    this.causaRaiz.set('');
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
