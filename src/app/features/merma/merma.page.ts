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
import { InventarioService } from '../../core/data/inventario.service';
import { MermaService, type MermaQuery, type TipoMerma } from '../../core/data/merma.service';
import { MOCK_USUARIOS } from '../../core/data/mock-data';
import type { ClasificacionMerma, EstadoMerma, Merma } from '../../core/models';
import { abreviarNombre, formatearMoneda, round2, turnoActual } from '../../core/utils/format';
import { iniciarRefresco } from '../../core/utils/refresco';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type EstadoFiltro = 'todos' | EstadoMerma;

const FOOD_COST_BASE = 28.4;
const LIMITES = [10, 20, 50, 100];

const ESTADOS: readonly { id: EstadoFiltro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'aprobada', label: 'Aprobadas' },
  { id: 'rechazada', label: 'Rechazadas' },
];

function esEstadoFiltro(valor: string | null): valor is Exclude<EstadoFiltro, 'todos'> {
  return valor === 'pendiente' || valor === 'aprobada' || valor === 'rechazada';
}

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
    PaginadorComponent,
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly estados = ESTADOS;
  readonly moneda = formatearMoneda;
  readonly foodCostBase = FOOD_COST_BASE;
  readonly usaApi = this.merma.usaApi;

  readonly estadoFiltro = signal<EstadoFiltro>('todos');
  readonly tipoFiltro = signal<number>(0);
  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);

  readonly tipoId = signal<number>(0);
  readonly insumoId = signal<number>(1);
  readonly cantidad = signal<string>('3.5');
  readonly clasificacion = signal<ClasificacionMerma>('evitable');
  readonly causaRaiz = signal<string>('Producción por encima de la demanda del turno');
  readonly observacion = signal<string>('');

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);
  readonly enviando = signal<boolean>(false);

  readonly insumos = this.inventario.insumos;
  readonly mermas = this.merma.mermas;
  readonly pendientes = this.merma.pendientes;
  readonly tipos = this.merma.tipos;
  readonly meta = this.merma.meta;
  readonly cargando = this.merma.cargando;
  readonly error = this.merma.error;

  readonly insumo = computed(() => this.inventario.porId(this.insumoId()) ?? null);
  readonly unidad = computed<string>(() => this.insumo()?.unidadMedida ?? 'kg');
  readonly costoUnitario = computed<number>(() => this.insumo()?.costoPromedio ?? 0);
  readonly stockActual = computed<number>(() => this.insumo()?.stockActual ?? 0);

  readonly tipoSeleccionado = computed<TipoMerma | null>(
    () => this.tipos().find((tipo) => tipo.id === this.tipoId()) ?? null,
  );

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

  readonly puedeAprobar = computed<boolean>(() => {
    if (this.enviando()) {
      return false;
    }
    if (this.usaApi && this.tipoId() <= 0) {
      return false;
    }
    return this.insumo() !== null && this.cantidadNumero() > 0;
  });

  readonly subtitulo = computed<string>(
    () =>
      `Fratelli's · ${turnoActual()} · ${this.merma.registrosHoy()} registros hoy · ${formatearMoneda(this.merma.costoHoy())} acumulado`,
  );

  readonly recientesMeta = computed<string>(
    () =>
      `${this.meta().total} registros · ${formatearMoneda(this.merma.costoHoy())} de impacto`,
  );

  readonly siguienteCodigo = computed<string>(
    () => `MER-${String(14 + this.meta().total).padStart(3, '0')}`,
  );

  private toastTimer: number | null = null;

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const estado = params.get('estado');
    this.estadoFiltro.set(esEstadoFiltro(estado) ? estado : 'todos');
    const tipo = Number(params.get('tipo'));
    this.tipoFiltro.set(Number.isFinite(tipo) && tipo > 0 ? tipo : 0);
    this.desde.set(params.get('desde') ?? '');
    this.hasta.set(params.get('hasta') ?? '');
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);

    void this.inicializar();

    iniciarRefresco({
      intervaloMs: 30000,
      destroyRef: this.destroyRef,
      tarea: () => this.refrescarSilencioso(),
    });

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  elegirTipo(tipoId: number): void {
    this.tipoId.set(tipoId);
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

  onEstado(event: Event): void {
    const valor = (event.target as HTMLSelectElement).value;
    this.estadoFiltro.set(esEstadoFiltro(valor) ? valor : 'todos');
    this.pagina.set(1);
    void this.cargarLista();
  }

  onTipoFiltro(event: Event): void {
    this.tipoFiltro.set(Number((event.target as HTMLSelectElement).value) || 0);
    this.pagina.set(1);
    void this.cargarLista();
  }

  onDesde(event: Event): void {
    this.desde.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargarLista();
  }

  onHasta(event: Event): void {
    this.hasta.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargarLista();
  }

  cambiarPagina(page: number): void {
    this.pagina.set(page);
    void this.cargarLista();
  }

  cambiarLimite(limit: number): void {
    this.limite.set(limit);
    this.pagina.set(1);
    void this.cargarLista();
  }

  recargar(): void {
    void this.inicializar();
  }

  async aprobar(): Promise<void> {
    const merma = await this.crear();
    if (!merma) {
      return;
    }
    this.enviando.set(true);
    const ok = await this.merma.aprobar(merma.id, this.observacion());
    this.enviando.set(false);
    if (!ok) {
      this.avisar(this.merma.error() ?? 'No se pudo aprobar la merma.', true);
      return;
    }
    this.avisar(
      `Merma aprobada · ${formatearMoneda(merma.costoEstimado)} descontado de ${merma.insumoNombre ?? 'inventario'}`,
    );
    this.limpiar();
    this.pagina.set(1);
    await this.cargarLista();
  }

  async rechazar(): Promise<void> {
    const motivo = window.prompt('Motivo del rechazo:', 'Registro duplicado');
    if (motivo === null) {
      return;
    }
    const merma = await this.crear();
    if (!merma) {
      return;
    }
    this.enviando.set(true);
    const ok = await this.merma.rechazar(merma.id, motivo.trim() || 'Sin detalle');
    this.enviando.set(false);
    if (!ok) {
      this.avisar(this.merma.error() ?? 'No se pudo rechazar la merma.', true);
      return;
    }
    this.avisar('Merma rechazada · no se descuenta stock');
    this.limpiar();
    this.pagina.set(1);
    await this.cargarLista();
  }

  async aprobarRegistro(merma: Merma): Promise<void> {
    if (merma.estado !== 'pendiente' || this.enviando()) {
      return;
    }
    this.enviando.set(true);
    const ok = await this.merma.aprobar(merma.id);
    this.enviando.set(false);
    if (!ok) {
      this.avisar(this.merma.error() ?? 'No se pudo aprobar la merma.', true);
      return;
    }
    this.sincronizarMeta();
    this.avisar(
      `Merma aprobada · ${formatearMoneda(merma.costoEstimado)} descontado de ${merma.insumoNombre ?? 'inventario'}`,
    );
  }

  async rechazarRegistro(merma: Merma): Promise<void> {
    if (merma.estado !== 'pendiente' || this.enviando()) {
      return;
    }
    const motivo = window.prompt('Motivo del rechazo:', 'Registro duplicado');
    if (motivo === null) {
      return;
    }
    this.enviando.set(true);
    const ok = await this.merma.rechazar(merma.id, motivo.trim() || 'Sin detalle');
    this.enviando.set(false);
    if (!ok) {
      this.avisar(this.merma.error() ?? 'No se pudo rechazar la merma.', true);
      return;
    }
    this.sincronizarMeta();
    this.avisar('Merma rechazada · no se descuenta stock');
  }

  unidadDe(merma: Merma): string {
    if (merma.insumoId === undefined) {
      return '';
    }
    return this.inventario.porId(merma.insumoId)?.unidadMedida ?? '';
  }

  registradoPor(merma: Merma): string {
    const nombre = this.merma.registradosPor()[merma.id];
    if (nombre) {
      return abreviarNombre(nombre);
    }
    const usuario = MOCK_USUARIOS.find(
      (candidato) => candidato.id === merma.usuarioRegistroId,
    );
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

  private async inicializar(): Promise<void> {
    if (this.inventario.insumos().length === 0) {
      await this.inventario.cargar({ limit: 100 });
    }
    if (!this.inventario.porId(this.insumoId())) {
      const primero = this.inventario.insumos()[0];
      if (primero) {
        this.insumoId.set(primero.id);
      }
    }
    await this.cargarLista();
    await this.cargarTipos();
  }

  private async cargarTipos(): Promise<void> {
    const ok = await this.merma.cargarTipos();
    if (!ok) {
      return;
    }
    const tipos = this.tipos();
    if (tipos.length === 0) {
      return;
    }
    if (this.tipoId() <= 0 || !tipos.some((tipo) => tipo.id === this.tipoId())) {
      this.tipoId.set(tipos[0].id);
    }
    if (this.tipoFiltro() > 0 && !tipos.some((tipo) => tipo.id === this.tipoFiltro())) {
      this.tipoFiltro.set(0);
    }
  }

  private async cargarLista(): Promise<void> {
    const ok = await this.merma.cargar(this.consultaLista());
    if (ok) {
      this.sincronizarMeta();
    }
  }

  private consultaLista(): MermaQuery {
    return {
      page: this.pagina(),
      limit: this.limite(),
      estado: this.estadoFiltro() === 'todos' ? undefined : this.estadoFiltro(),
      tipo_merma_id: this.tipoFiltro() || undefined,
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
      sort: 'fecha:desc',
    };
  }

  /**
   * Refresco silencioso de la lista con la misma página y filtros, sin
   * sincronizar URL ni tocar el formulario de registro.
   */
  private async refrescarSilencioso(): Promise<void> {
    await this.merma.cargar(this.consultaLista(), true);
  }

  private sincronizarMeta(): void {
    const meta = this.meta();
    this.pagina.set(meta.page);
    this.limite.set(meta.limit);
    this.sincronizarUrl();
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        estado: this.estadoFiltro() === 'todos' ? null : this.estadoFiltro(),
        tipo: this.tipoFiltro() > 0 ? this.tipoFiltro() : null,
        desde: this.desde() || null,
        hasta: this.hasta() || null,
      },
      replaceUrl: true,
    });
  }

  private async crear(): Promise<Merma | null> {
    const insumo = this.insumo();
    if (!insumo || this.cantidadNumero() <= 0) {
      this.avisar('Selecciona un insumo e ingresa una cantidad mayor a 0.', true);
      return null;
    }
    const tipo = this.tipoSeleccionado();
    if (this.usaApi && !tipo) {
      this.avisar('Selecciona un tipo de merma válido.', true);
      return null;
    }
    return this.merma.registrar({
      tipoMermaId: tipo?.id,
      tipo: tipo?.nombre ?? 'Registro manual',
      insumoId: insumo.id,
      insumoNombre: insumo.nombre,
      cantidad: this.cantidadNumero(),
      costoEstimado: this.costo(),
      clasificacion: this.clasificacion(),
      causaRaiz: this.causaRaiz().trim() || 'No especificada',
      motivo:
        this.observacion().trim() || `${tipo?.nombre ?? 'Merma'} · ${insumo.nombre}`,
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
    this.toastTimer = window.setTimeout(() => {
      this.toast.set('');
      this.toastTimer = null;
    }, 2800);
  }
}
