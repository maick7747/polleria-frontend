import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ActivosService,
  type ActivoEntrada,
  type ActivoVista,
  type MantenimientoEntrada,
} from '../../core/data/activos.service';
import type {
  CategoriaActivo,
  EstadoActivo,
  Mantenimiento,
  TipoMantenimiento,
} from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type FiltroEstado = 'todos' | EstadoActivo;
type ModoPanel = 'detalle' | 'activo' | 'mantenimiento';

interface EstadoVista {
  label: string;
  tono: ChipVariant;
}

interface CategoriaVista {
  id: CategoriaActivo;
  label: string;
  icono: IconName;
}

const ESTADOS: Record<EstadoActivo, EstadoVista> = {
  activo: { label: 'Operativo', tono: 'success' },
  en_reparacion: { label: 'En mantenimiento', tono: 'danger' },
  dado_de_baja: { label: 'Fuera de servicio', tono: 'neutral' },
};

const CATEGORIAS: readonly CategoriaVista[] = [
  { id: 'cocina', label: 'Cocina', icono: 'flame' },
  { id: 'salon', label: 'Salón', icono: 'storefront' },
  { id: 'delivery', label: 'Delivery', icono: 'motorcycle' },
  { id: 'oficina', label: 'Oficina', icono: 'monitor' },
  { id: 'limpieza', label: 'Limpieza', icono: 'leaf' },
];

const FILTROS_ESTADO: readonly { id: FiltroEstado; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'activo', label: 'Operativos' },
  { id: 'en_reparacion', label: 'En mantenimiento' },
  { id: 'dado_de_baja', label: 'Fuera de servicio' },
];

const ORDENES: readonly { id: string; label: string }[] = [
  { id: 'id:desc', label: 'Más recientes' },
  { id: 'nombre:asc', label: 'Nombre A-Z' },
  { id: 'fecha_adquisicion:desc', label: 'Compra reciente' },
  { id: 'costo_adquisicion:desc', label: 'Mayor costo' },
  { id: 'estado:asc', label: 'Estado' },
];

const LIMITES = [10, 20, 50, 100];

const ORDENES_VALIDOS: readonly string[] = ORDENES.map((orden) => orden.id);

const MESES_CORTOS: readonly string[] = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const diasHasta = (fecha: string): number =>
  Math.round((Date.parse(`${fecha}T12:00:00-05:00`) - Date.now()) / 86_400_000);

const fechaCorta = (fecha: string): string => {
  const partes = fecha.split('-');
  if (partes.length !== 3) {
    return fecha;
  }
  const mes = MESES_CORTOS[Number(partes[1]) - 1] ?? '';
  return `${Number(partes[2])} ${mes} ${partes[0]}`;
};

const sumarMeses = (fecha: string, meses: number): string => {
  const partes = fecha.split('-');
  if (partes.length !== 3) {
    return fecha;
  }
  const resultado = new Date(
    Date.UTC(Number(partes[0]), Number(partes[1]) - 1 + meses, Number(partes[2])),
  );
  return resultado.toISOString().slice(0, 10);
};

const mesesDesde = (fecha: string): number => {
  const inicio = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) {
    return 0;
  }
  const hoy = new Date();
  return Math.max(
    0,
    (hoy.getFullYear() - inicio.getFullYear()) * 12 + hoy.getMonth() - inicio.getMonth(),
  );
};

const hoyIso = (): string => new Date().toISOString().slice(0, 10);

@Component({
  selector: 'app-activos-page',
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './activos.page.html',
  styleUrl: './activos.page.css',
})
export class ActivosPage {
  private readonly activos = inject(ActivosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private buscarTimer: number | null = null;
  private toastTimer: number | null = null;

  readonly moneda = formatearMoneda;
  readonly categorias = CATEGORIAS;
  readonly filtrosEstado = FILTROS_ESTADO;
  readonly ordenes = ORDENES;

  readonly filtroEstado = signal<FiltroEstado>('todos');
  readonly categoriaFiltro = signal<'todas' | CategoriaActivo>('todas');
  readonly busqueda = signal<string>('');
  readonly orden = signal<string>('id:desc');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);
  readonly seleccionadoId = signal<number | null>(null);
  readonly modo = signal<ModoPanel>('detalle');

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly lista = this.activos.activos;
  readonly proximos = this.activos.proximos;
  readonly historial = this.activos.historialMantenimientos;
  readonly meta = this.activos.meta;
  readonly cargando = this.activos.cargando;
  readonly error = this.activos.error;

  readonly fNombre = signal<string>('');
  readonly fCategoria = signal<CategoriaActivo>('cocina');
  readonly fCantidad = signal<string>('1');
  readonly fCosto = signal<string>('0.00');
  readonly fVidaUtil = signal<string>('60');
  readonly fFecha = signal<string>(hoyIso());
  readonly fProveedor = signal<string>('');
  readonly fGarantia = signal<string>('12');
  readonly fObservaciones = signal<string>('');
  readonly fEstado = signal<EstadoActivo>('activo');

  readonly mTipo = signal<TipoMantenimiento>('preventivo');
  readonly mFecha = signal<string>(hoyIso());
  readonly mDescripcion = signal<string>('');
  readonly mCosto = signal<string>('0.00');
  readonly mProgramada = signal<string>(hoyIso());

  readonly seleccionado = computed<ActivoVista | null>(() => {
    const id = this.seleccionadoId();
    if (id !== null) {
      const encontrado = this.lista().find((activo) => activo.id === id);
      if (encontrado) {
        return encontrado;
      }
    }
    return this.lista()[0] ?? null;
  });

  readonly operativos = computed<number>(
    () => this.lista().filter((activo) => activo.estado === 'activo').length,
  );

  readonly enMantenimiento = computed<number>(
    () => this.lista().filter((activo) => activo.estado === 'en_reparacion').length,
  );

  readonly deBaja = computed<number>(
    () => this.lista().filter((activo) => activo.estado === 'dado_de_baja').length,
  );

  readonly costoMes = computed<number>(() => {
    const prefijo = hoyIso().slice(0, 7);
    return round2(
      this.historial()
        .filter((mantenimiento) => mantenimiento.fecha.startsWith(prefijo))
        .reduce((suma, mantenimiento) => suma + mantenimiento.costoReparacion, 0),
    );
  });

  readonly subtitulo = computed<string>(
    () =>
      `${this.meta().total} activos registrados · ${this.proximos().length} por vencer · costo del mes ${this.moneda(this.costoMes())}`,
  );

  readonly nombresProximos = computed<string>(() =>
    this.proximos()
      .map((activo) => activo.nombre)
      .join(' · '),
  );

  readonly formularioValido = computed<boolean>(
    () =>
      this.fNombre().trim().length > 0 &&
      Number(this.fCosto()) > 0 &&
      Number(this.fVidaUtil()) > 0 &&
      this.fFecha().length === 10,
  );

  readonly mantenimientoValido = computed<boolean>(
    () => this.mDescripcion().trim().length > 0,
  );

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const estado = params.get('estado');
    this.filtroEstado.set(
      estado === 'activo' || estado === 'en_reparacion' || estado === 'dado_de_baja'
        ? estado
        : 'todos',
    );
    const categoria = params.get('categoria');
    this.categoriaFiltro.set(
      CATEGORIAS.some((item) => item.id === categoria)
        ? (categoria as CategoriaActivo)
        : 'todas',
    );
    this.busqueda.set(params.get('q') ?? '');
    const orden = params.get('sort');
    this.orden.set(ORDENES_VALIDOS.includes(orden ?? '') ? (orden as string) : 'id:desc');
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);

    void this.inicializar();

    this.destroyRef.onDestroy(() => {
      if (this.buscarTimer !== null) {
        window.clearTimeout(this.buscarTimer);
      }
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  estado(activo: ActivoVista): EstadoVista {
    return ESTADOS[activo.estado];
  }

  categoria(activo: ActivoVista): CategoriaVista {
    return CATEGORIAS.find((item) => item.id === activo.categoria) ?? CATEGORIAS[0];
  }

  codigo(activo: ActivoVista): string {
    return `M-${String(activo.id).padStart(3, '0')}`;
  }

  fechaDetalle(fecha: string | undefined): string {
    return fecha ? fechaCorta(fecha) : '—';
  }

  edadMeses(activo: ActivoVista): number {
    return activo.antiguedadMeses ?? mesesDesde(activo.fechaAdquisicion);
  }

  proximoTexto(activo: ActivoVista): string {
    if (!activo.proximoMantenimiento) {
      return 'Sin programar';
    }
    const dias = diasHasta(activo.proximoMantenimiento);
    if (dias < 0) {
      return `${fechaCorta(activo.proximoMantenimiento)} · vencido`;
    }
    if (dias === 0) {
      return `${fechaCorta(activo.proximoMantenimiento)} · hoy`;
    }
    return `${fechaCorta(activo.proximoMantenimiento)} · ${dias} días`;
  }

  proximoVencido(activo: ActivoVista): boolean {
    return activo.proximoMantenimiento ? diasHasta(activo.proximoMantenimiento) < 0 : false;
  }

  diasProximo(activo: ActivoVista): number {
    return activo.proximoMantenimiento ? diasHasta(activo.proximoMantenimiento) : 0;
  }

  proximoPorVencer(activo: ActivoVista): boolean {
    if (!activo.proximoMantenimiento) {
      return false;
    }
    const dias = diasHasta(activo.proximoMantenimiento);
    return dias >= 0 && dias <= 45;
  }

  garantiaTexto(activo: ActivoVista): string {
    if (activo.garantiaMeses === undefined) {
      return '—';
    }
    const fin = sumarMeses(activo.fechaAdquisicion, activo.garantiaMeses);
    const vencida = diasHasta(fin) < 0;
    return `${vencida ? 'Vencida' : 'Vigente'} · ${fechaCorta(fin)}`;
  }

  garantiaVencida(activo: ActivoVista): boolean {
    if (activo.garantiaMeses === undefined) {
      return false;
    }
    return diasHasta(sumarMeses(activo.fechaAdquisicion, activo.garantiaMeses)) < 0;
  }

  cambiarFiltro(estado: FiltroEstado): void {
    if (this.filtroEstado() === estado) {
      return;
    }
    this.filtroEstado.set(estado);
    this.pagina.set(1);
    void this.cargar();
  }

  onCategoriaFiltro(event: Event): void {
    this.categoriaFiltro.set(
      (event.target as HTMLSelectElement).value as 'todas' | CategoriaActivo,
    );
    this.pagina.set(1);
    void this.cargar();
  }

  onOrden(event: Event): void {
    this.orden.set((event.target as HTMLSelectElement).value);
    this.pagina.set(1);
    void this.cargar();
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
    if (this.buscarTimer !== null) {
      window.clearTimeout(this.buscarTimer);
    }
    this.buscarTimer = window.setTimeout(() => {
      this.pagina.set(1);
      void this.cargar();
    }, 350);
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

  recargar(): void {
    void this.inicializar();
  }

  seleccionar(activo: ActivoVista): void {
    this.seleccionadoId.set(activo.id);
    this.modo.set('detalle');
    void this.activos.mantenimientos(activo.id);
  }

  abrirAlta(): void {
    this.seleccionadoId.set(null);
    this.modo.set('activo');
    this.fNombre.set('');
    this.fCategoria.set('cocina');
    this.fCantidad.set('1');
    this.fCosto.set('0.00');
    this.fVidaUtil.set('60');
    this.fFecha.set(hoyIso());
    this.fProveedor.set('');
    this.fGarantia.set('12');
    this.fObservaciones.set('');
    this.fEstado.set('activo');
  }

  abrirEdicion(): void {
    const activo = this.seleccionado();
    if (!activo) {
      return;
    }
    this.modo.set('activo');
    this.fNombre.set(activo.nombre);
    this.fCategoria.set(activo.categoria);
    this.fCantidad.set(String(activo.cantidad));
    this.fCosto.set(activo.costoAdquisicion.toFixed(2));
    this.fVidaUtil.set(String(activo.vidaUtilMeses || 60));
    this.fFecha.set(activo.fechaAdquisicion);
    this.fProveedor.set(activo.proveedor ?? '');
    this.fGarantia.set(String(activo.garantiaMeses ?? 12));
    this.fObservaciones.set(activo.observaciones ?? '');
    this.fEstado.set(activo.estado);
  }

  abrirMantenimiento(): void {
    const activo = this.seleccionado();
    if (!activo) {
      return;
    }
    this.modo.set('mantenimiento');
    this.mTipo.set('preventivo');
    this.mFecha.set(hoyIso());
    this.mProgramada.set(activo.proximoMantenimiento ?? hoyIso());
    this.mDescripcion.set(`Mantenimiento preventivo · ${activo.nombre}`);
    this.mCosto.set('0.00');
  }

  cancelar(): void {
    this.modo.set('detalle');
  }

  onCampo(event: Event, campo: 'nombre' | 'cantidad' | 'costo' | 'vida' | 'fecha' | 'proveedor' | 'garantia' | 'observaciones'): void {
    const valor = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    switch (campo) {
      case 'nombre':
        this.fNombre.set(valor);
        return;
      case 'cantidad':
        this.fCantidad.set(valor);
        return;
      case 'costo':
        this.fCosto.set(valor);
        return;
      case 'vida':
        this.fVidaUtil.set(valor);
        return;
      case 'fecha':
        this.fFecha.set(valor);
        return;
      case 'proveedor':
        this.fProveedor.set(valor);
        return;
      case 'garantia':
        this.fGarantia.set(valor);
        return;
      default:
        this.fObservaciones.set(valor);
    }
  }

  elegirCategoria(categoria: CategoriaActivo): void {
    this.fCategoria.set(categoria);
  }

  elegirEstado(estado: EstadoActivo): void {
    this.fEstado.set(estado);
  }

  async guardarActivo(): Promise<void> {
    if (!this.formularioValido()) {
      this.avisar('Completa nombre, costo, vida útil y fecha del activo', true);
      return;
    }
    const entrada: ActivoEntrada = {
      nombre: this.fNombre().trim(),
      categoria: this.fCategoria(),
      cantidad: Math.max(1, Number(this.fCantidad()) || 1),
      costoAdquisicion: round2(Number(this.fCosto()) || 0),
      vidaUtilMeses: Math.max(1, Number(this.fVidaUtil()) || 1),
      fechaAdquisicion: this.fFecha(),
      estado: this.fEstado(),
      proveedor: this.fProveedor().trim() || undefined,
      garantiaMeses: Math.max(0, Number(this.fGarantia()) || 0),
      observaciones: this.fObservaciones().trim() || undefined,
    };

    const editando = this.seleccionadoId();
    const resultado =
      editando !== null && this.modo() === 'activo' && this.hayActivo(editando)
        ? await this.activos.actualizar(editando, entrada)
        : await this.activos.registrar(entrada);

    if (!resultado) {
      this.avisar(this.activos.error() ?? 'No se pudo guardar el activo', true);
      return;
    }

    this.seleccionadoId.set(resultado.id);
    this.modo.set('detalle');
    this.avisar(`Activo ${editando !== null ? 'actualizado' : 'registrado'} · ${resultado.nombre}`);
    await this.cargar();
    await this.activos.mantenimientos(resultado.id);
  }

  async guardarMantenimiento(): Promise<void> {
    const activo = this.seleccionado();
    if (!activo || !this.mantenimientoValido()) {
      this.avisar('Describe el mantenimiento antes de guardarlo', true);
      return;
    }
    const entrada: MantenimientoEntrada = {
      tipo: this.mTipo(),
      fecha: this.mFecha(),
      programadaPara: this.mProgramada() || undefined,
      descripcion: this.mDescripcion().trim(),
      costoReparacion: round2(Number(this.mCosto()) || 0),
      costoReposicion: activo.costoAdquisicion,
    };
    const creado = await this.activos.crearMantenimiento(activo.id, entrada);
    if (!creado) {
      this.avisar(this.activos.error() ?? 'No se pudo registrar el mantenimiento', true);
      return;
    }
    this.modo.set('detalle');
    await this.activos.mantenimientos(activo.id);
    await this.cargar();
    this.avisar(`Mantenimiento programado · ${activo.nombre}`);
  }

  async autorizar(mantenimiento: Mantenimiento, decision: 'reparar' | 'reemplazar'): Promise<void> {
    const ok = await this.activos.autorizarMantenimiento(mantenimiento.id, decision);
    if (!ok) {
      this.avisar(this.activos.error() ?? 'No se pudo autorizar el mantenimiento', true);
      return;
    }
    this.avisar(
      decision === 'reparar' ? 'Reparación autorizada' : 'Reemplazo autorizado',
    );
    const activo = this.seleccionado();
    if (activo) {
      await this.activos.mantenimientos(activo.id);
    }
    await this.cargar();
  }

  onMantenimientoCampo(event: Event, campo: 'fecha' | 'descripcion' | 'costo' | 'programada'): void {
    const valor = (event.target as HTMLInputElement | HTMLSelectElement).value;
    switch (campo) {
      case 'fecha':
        this.mFecha.set(valor);
        return;
      case 'descripcion':
        this.mDescripcion.set(valor);
        return;
      case 'costo':
        this.mCosto.set(valor);
        return;
      default:
        this.mProgramada.set(valor);
    }
  }

  elegirTipoMantenimiento(tipo: TipoMantenimiento): void {
    this.mTipo.set(tipo);
  }

  private async inicializar(): Promise<void> {
    await Promise.all([this.cargar(), this.activos.cargarAlertas()]);
    const activo = this.seleccionado();
    if (activo) {
      await this.activos.mantenimientos(activo.id);
    }
  }

  private async cargar(): Promise<void> {
    const ok = await this.activos.cargar({
      page: this.pagina(),
      limit: this.limite(),
      estado: this.filtroEstado() === 'todos' ? undefined : this.filtroEstado(),
      categoria: this.categoriaFiltro() === 'todas' ? undefined : this.categoriaFiltro(),
      q: this.busqueda(),
      sort: this.orden(),
    });
    if (ok) {
      this.pagina.set(this.activos.meta().page);
      this.limite.set(this.activos.meta().limit);
      this.sincronizarUrl();
    }
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        q: this.busqueda().trim() || null,
        estado: this.filtroEstado() === 'todos' ? null : this.filtroEstado(),
        categoria: this.categoriaFiltro() === 'todas' ? null : this.categoriaFiltro(),
        sort: this.orden() !== 'id:desc' ? this.orden() : null,
      },
      replaceUrl: true,
    });
  }

  private hayActivo(id: number): boolean {
    return this.lista().some((activo) => activo.id === id);
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
