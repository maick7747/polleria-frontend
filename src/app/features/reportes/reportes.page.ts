import { crearGuardiaUrl } from '../../core/utils/url-sync';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { mensajeError } from '../../core/api/api.helpers';
import {
  ReportesService,
  type FormatoDescarga,
} from '../../core/data/reportes.service';
import type { ReporteTipoId, ReporteVista } from '../../core/api/api.mappers';
import { descargarBlob } from '../../core/utils/descarga';
import { horaActual } from '../../core/utils/format';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface TipoReporte {
  id: ReporteTipoId;
  nombre: string;
  detalle: string;
  icono: IconName;
}

const fechaLima = (fecha: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);

const HOY = fechaLima(new Date());
const HACE_SIETE = fechaLima(new Date(Date.now() - 6 * 86400000));

const TIPOS: readonly TipoReporte[] = [
  {
    id: 'ventas',
    nombre: 'Ventas del período',
    detalle: 'Ingresos, IGV y ticket promedio',
    icono: 'chart-bar',
  },
  {
    id: 'costos',
    nombre: 'Costos operativos',
    detalle: 'Compras, gastos y merma',
    icono: 'money',
  },
  {
    id: 'merma',
    nombre: 'Merma y pérdidas',
    detalle: 'Costo por tipo y food cost',
    icono: 'trash',
  },
  {
    id: 'devoluciones',
    nombre: 'Devoluciones',
    detalle: 'Motivos, resoluciones y reembolsos',
    icono: 'receipt',
  },
  {
    id: 'inventario',
    nombre: 'Inventario y consumo',
    detalle: 'Movimientos, saldos y ajustes',
    icono: 'package',
  },
  {
    id: 'activos',
    nombre: 'Activos y mantenimiento',
    detalle: 'Costos, garantías y depreciación',
    icono: 'wrench',
  },
  {
    id: 'personal',
    nombre: 'Personal y roles',
    detalle: 'Usuarios, roles y permisos',
    icono: 'users',
  },
];

const VISTAS: Record<ReporteTipoId, ReporteVista> = {
  ventas: {
    kpiLabel: 'Ventas netas',
    kpiValor: '28,450',
    prefijo: 'S/',
    variacion: '+12%',
    secundarioUno: { label: 'Pedidos', valor: '629' },
    secundarioDos: { label: 'Ticket promedio', valor: 'S/ 45.20' },
    seccion: 'Ventas por canal',
    seccionMeta: 'subtotal sin IGV',
    filas: [
      { label: 'Local', monto: 'S/ 15,200', pct: 100, tono: 'brand' },
      { label: 'Delivery propio', monto: 'S/ 6,300', pct: 41, tono: 'brand' },
      { label: 'Rappi', monto: 'S/ 4,250', pct: 28, tono: 'soft' },
      { label: 'LlamaFood', monto: 'S/ 1,850', pct: 12, tono: 'soft' },
      { label: 'Para llevar', monto: 'S/ 850', pct: 6, tono: 'neutral' },
    ],
    pieIzquierda: 'Subtotal S/ 28,450.00 · IGV 18% S/ 5,121.00',
    pieDerecha: 'Total S/ 33,571.00',
    resumen: '629 pedidos · 5 canales · IGV desglosado',
  },
  costos: {
    kpiLabel: 'Costo operativo',
    kpiValor: '8,640.00',
    prefijo: 'S/',
    variacion: '-3%',
    secundarioUno: { label: 'Compras', valor: 'S/ 5,120' },
    secundarioDos: { label: 'Gastos', valor: 'S/ 1,780' },
    seccion: 'Costos por rubro',
    seccionMeta: 'monto del período',
    filas: [
      { label: 'Compras de insumos', monto: 'S/ 5,120', pct: 100, tono: 'brand' },
      { label: 'Planilla y personal', monto: 'S/ 1,400', pct: 27, tono: 'brand' },
      { label: 'Gastos operativos', monto: 'S/ 1,780', pct: 35, tono: 'soft' },
      { label: 'Merma aprobada', monto: 'S/ 340', pct: 7, tono: 'neutral' },
    ],
    pieIzquierda: 'Compras + gastos + merma · sin IGV',
    pieDerecha: 'Food cost 38% del período',
    resumen: '4 rubros · S/ 8,640 · variación -3%',
  },
  merma: {
    kpiLabel: 'Costo de merma',
    kpiValor: '340.00',
    prefijo: 'S/',
    variacion: '-4%',
    secundarioUno: { label: 'Registros', valor: '23' },
    secundarioDos: { label: 'Merma evitable', valor: '78%' },
    seccion: 'Merma por tipo',
    seccionMeta: 'costo estimado',
    filas: [
      { label: 'Pollo quemado', monto: 'S/ 145', pct: 100, tono: 'brand' },
      { label: 'Sobreproducción', monto: 'S/ 120', pct: 83, tono: 'brand' },
      { label: 'Caducidad', monto: 'S/ 45', pct: 31, tono: 'soft' },
      { label: 'Rotura de proveedor', monto: 'S/ 30', pct: 21, tono: 'neutral' },
    ],
    pieIzquierda: 'Merma evitable 78% · inevitable 22%',
    pieDerecha: 'Umbral S/ 0.00 · alerta al dueño',
    resumen: '23 registros · 4 tipos · food cost 38%',
  },
  devoluciones: {
    kpiLabel: 'Monto reembolsado',
    kpiValor: '186.00',
    prefijo: 'S/',
    variacion: '-12%',
    secundarioUno: { label: 'Registros', valor: '9' },
    secundarioDos: { label: 'Resueltas', valor: '6' },
    seccion: 'Devoluciones por motivo',
    seccionMeta: 'casos del período',
    filas: [
      { label: 'Plato frío', monto: '4 casos', pct: 100, tono: 'brand' },
      { label: 'Falta acompañamiento', monto: '3 casos', pct: 75, tono: 'brand' },
      { label: 'Pedido incompleto', monto: '2 casos', pct: 50, tono: 'soft' },
    ],
    pieIzquierda: '4 resoluciones · re-preparar, corregir, reembolso',
    pieDerecha: 'Merma pendiente al aprobar · RN-ME-009',
    resumen: '9 registros · 6 resueltas · S/ 186 reembolsado',
  },
  inventario: {
    kpiLabel: 'Insumos bajo stock',
    kpiValor: '3',
    prefijo: '',
    variacion: 'alerta',
    secundarioUno: { label: 'Movimientos', valor: '128' },
    secundarioDos: { label: 'Ajustes', valor: '4' },
    seccion: 'Insumos críticos',
    seccionMeta: 'stock actual / mínimo',
    filas: [
      { label: 'Pollo entero', monto: '18.5 / 25 kg', pct: 74, tono: 'brand' },
      { label: 'Papa', monto: '12 / 20 kg', pct: 60, tono: 'brand' },
      { label: 'Ají amarillo', monto: '2.1 / 3 kg', pct: 70, tono: 'brand' },
      { label: 'Limón', monto: '9 / 6 kg', pct: 100, tono: 'soft' },
      { label: 'Aceite', monto: '8 / 5 l', pct: 100, tono: 'soft' },
    ],
    pieIzquierda: '12 insumos activos · 3 alertas de stock',
    pieDerecha: 'Actualizado 17:45',
    resumen: '12 insumos · 128 movimientos · 3 alertas',
  },
  personal: {
    kpiLabel: 'Usuarios activos',
    kpiValor: '6',
    prefijo: '',
    variacion: 'multi-rol',
    secundarioUno: { label: 'Roles', valor: '6' },
    secundarioDos: { label: 'Permisos', valor: '15' },
    seccion: 'Usuarios por rol',
    seccionMeta: 'asignaciones activas',
    filas: [
      { label: 'Mozo', monto: '2 usuarios', pct: 100, tono: 'brand' },
      { label: 'Cajero', monto: '1 usuario', pct: 50, tono: 'brand' },
      { label: 'Cocinero', monto: '1 usuario', pct: 50, tono: 'soft' },
      { label: 'Repartidor', monto: '1 usuario', pct: 50, tono: 'soft' },
      { label: 'Dueño/Admin', monto: '1 usuario', pct: 50, tono: 'neutral' },
      { label: 'Admin', monto: '1 usuario', pct: 50, tono: 'neutral' },
    ],
    pieIzquierda: 'Un usuario puede tener 1..N roles · RBAC multi-rol',
    pieDerecha: 'Permisos granulares por rol',
    resumen: '6 usuarios · 6 roles · 15 permisos',
  },
  activos: {
    kpiLabel: 'Activos registrados',
    kpiValor: '14',
    prefijo: '',
    variacion: '2 por vencer',
    secundarioUno: { label: 'Operativos', valor: '12' },
    secundarioDos: { label: 'Costo del mes', valor: 'S/ 340' },
    seccion: 'Activos por categoría',
    seccionMeta: 'unidades registradas',
    filas: [
      { label: 'Cocina', monto: '6 activos', pct: 100, tono: 'brand' },
      { label: 'Refrigeración', monto: '2 activos', pct: 34, tono: 'brand' },
      { label: 'Delivery', monto: '1 activo', pct: 17, tono: 'soft' },
      { label: 'Oficina', monto: '2 activos', pct: 34, tono: 'soft' },
      { label: 'Limpieza', monto: '1 activo', pct: 17, tono: 'neutral' },
    ],
    pieIzquierda: '12 operativos · 1 en mantenimiento · 1 de baja',
    pieDerecha: '2 mantenimientos por vencer',
    resumen: '14 activos · 2 por vencer · costo S/ 340',
  },
};

const VISTA_VACIA: ReporteVista = {
  kpiLabel: 'Sin datos',
  kpiValor: '—',
  prefijo: '',
  variacion: '—',
  secundarioUno: { label: '—', valor: '—' },
  secundarioDos: { label: '—', valor: '—' },
  seccion: 'Sin información',
  seccionMeta: '',
  filas: [],
  pieIzquierda: 'No se pudo consultar el reporte.',
  pieDerecha: 'Reintenta con el botón de arriba.',
  resumen: 'Sin datos',
};

const MESES: readonly string[] = [
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

@Component({
  selector: 'app-reportes-page',
  standalone: true,
  imports: [
    AppShellComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reportes.page.html',
  styleUrl: './reportes.page.css',
})
export class ReportesPage {
  private readonly reportes = inject(ReportesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly urlActiva = crearGuardiaUrl(this.router, this.destroyRef, '/reportes');

  private toastTimer: number | null = null;
  private ultimoFormato: FormatoDescarga = 'xlsx';

  readonly usaApi = this.reportes.usaApi;

  readonly seleccion = signal<ReporteTipoId>('ventas');
  readonly fechaDesde = signal<string>(HACE_SIETE);
  readonly fechaHasta = signal<string>(HOY);
  readonly descargando = signal<FormatoDescarga | null>(null);
  readonly errorDescarga = signal<string>('');
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);
  readonly actualizado = signal<string>('--:--');

  readonly cargando = this.reportes.cargando;
  readonly error = this.reportes.error;
  readonly limitacion = this.reportes.limitacion;

  readonly tipos = computed<readonly TipoReporte[]>(() => {
    const cargados = this.reportes.tipos();
    if (cargados.length === 0) {
      return TIPOS;
    }
    return cargados.map(
      (id) =>
        TIPOS.find((tipo) => tipo.id === id) ?? {
          id,
          nombre: id,
          detalle: 'Reporte del servidor',
          icono: 'chart-bar',
        },
    );
  });

  readonly tipoActual = computed<TipoReporte>(
    () => TIPOS.find((tipo) => tipo.id === this.seleccion()) ?? TIPOS[0],
  );

  readonly vista = computed<ReporteVista>(() => {
    if (this.usaApi) {
      return this.reportes.vista() ?? VISTA_VACIA;
    }
    return VISTAS[this.seleccion()];
  });

  readonly generados = computed<number>(() => this.reportes.reportes().length);

  readonly notaVariacion = computed<string>(() =>
    this.usaApi ? 'calculado por el servidor' : 'vs período anterior',
  );

  readonly rangoCorto = computed<string>(() => {
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();
    const partesDesde = desde.split('-');
    const partesHasta = hasta.split('-');

    if (partesDesde.length !== 3 || partesHasta.length !== 3) {
      return 'Rango personalizado';
    }

    const diaDesde = partesDesde[2];
    const diaHasta = partesHasta[2];
    const mesHasta = MESES[Number(partesHasta[1]) - 1] ?? '';
    const anioHasta = partesHasta[0];

    if (partesDesde[1] === partesHasta[1] && partesDesde[0] === partesHasta[0]) {
      return `${diaDesde} – ${diaHasta} ${mesHasta} ${anioHasta}`;
    }

    const mesDesde = MESES[Number(partesDesde[1]) - 1] ?? '';
    return `${diaDesde} ${mesDesde} – ${diaHasta} ${mesHasta} ${anioHasta}`;
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const tipo = params.get('tipo');
    const tipoValido = TIPOS.find((item) => item.id === tipo)?.id;
    if (tipoValido) {
      this.seleccion.set(tipoValido);
    }
    this.fechaDesde.set(params.get('desde') ?? HACE_SIETE);
    this.fechaHasta.set(params.get('hasta') ?? HOY);

    if (this.usaApi) {
      void this.inicializar();
    }

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  seleccionar(id: ReporteTipoId): void {
    if (this.seleccion() === id) {
      return;
    }
    this.seleccion.set(id);
    void this.consultar();
  }

  onDesde(event: Event): void {
    this.fechaDesde.set((event.target as HTMLInputElement).value);
    if (this.usaApi) {
      void this.consultar();
    }
  }

  onHasta(event: Event): void {
    this.fechaHasta.set((event.target as HTMLInputElement).value);
    if (this.usaApi) {
      void this.consultar();
    }
  }

  actualizar(): void {
    if (!this.usaApi) {
      this.avisar('Datos actualizados · datos demo');
      return;
    }
    void this.consultar();
  }

  reintentar(): void {
    void this.consultar();
  }

  async descargar(formato: FormatoDescarga): Promise<void> {
    if (!this.usaApi) {
      this.errorDescarga.set('Exportación disponible con el servidor.');
      return;
    }
    if (this.descargando() !== null) {
      return;
    }

    this.descargando.set(formato);
    this.errorDescarga.set('');
    this.ultimoFormato = formato;
    try {
      const blob = await this.reportes.descargar(
        this.seleccion(),
        this.filtros(),
        formato,
      );
      descargarBlob(blob, this.nombreArchivo(formato));
      this.avisar(`Descarga ${formato === 'pdf' ? 'PDF' : 'Excel'} lista`);
    } catch (error) {
      this.errorDescarga.set(mensajeError(error));
    } finally {
      this.descargando.set(null);
    }
  }

  reintentarDescarga(): void {
    const formato = this.descargando() ?? this.ultimoFormato;
    void this.descargar(formato);
  }

  private nombreArchivo(formato: FormatoDescarga): string {
    const desde = this.fechaDesde() || 'inicio';
    const hasta = this.fechaHasta() || 'hoy';
    return `reporte-${this.seleccion()}-${desde}-${hasta}.${formato}`;
  }

  private async inicializar(): Promise<void> {
    await this.reportes.cargarTipos();
    await this.consultar();
  }

  private async consultar(): Promise<void> {
    this.errorDescarga.set('');
    const ok = await this.reportes.consultar(this.seleccion(), this.filtros());
    if (ok) {
      this.actualizado.set(horaActual());
      this.sincronizarUrl();
    }
  }

  private filtros(): { desde?: string; hasta?: string } {
    return {
      desde: this.fechaDesde() || undefined,
      hasta: this.fechaHasta() || undefined,
    };
  }

  private sincronizarUrl(): void {
    if (!this.urlActiva()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tipo: this.seleccion(),
        desde: this.fechaDesde() || null,
        hasta: this.fechaHasta() || null,
      },
      replaceUrl: true,
    });
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
    }, 3200);
  }
}
