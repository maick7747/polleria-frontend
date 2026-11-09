import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { mensajeError } from '../../core/api/api.helpers';
import { AuthService } from '../../core/auth/auth.service';
import { ActivosService, type AlertaActivo } from '../../core/data/activos.service';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

// El backend solo emite severidades `alta` y `media`. `alta` es el nivel más
// grave disponible, por eso se muestra con el tono crítico de la vista.
type Severidad = 'critica' | 'media';
type TipoAlerta = 'dano' | 'vida_util' | 'mantenimiento_preventivo';
type Filtro = 'todas' | Severidad;

interface AlertaVista {
  key: string;
  id: number;
  activoId: number;
  activo: string;
  tipo: TipoAlerta;
  severidad: Severidad;
  mensaje: string;
  mantenimientoId?: number;
  fecha: string | null;
  programada: boolean;
}

interface FiltroVista {
  id: Filtro;
  label: string;
  total: number;
}

interface SeveridadVista {
  label: string;
  tono: 'danger' | 'warning' | 'info';
  icono: IconName;
}

const SEVERIDADES: Record<Severidad, SeveridadVista> = {
  critica: { label: 'Crítica', tono: 'danger', icono: 'warning-circle' },
  media: { label: 'Media', tono: 'warning', icono: 'clock' },
};

const TIPO_ICONO: Record<TipoAlerta, IconName> = {
  dano: 'warning-circle',
  vida_util: 'arrow-clockwise',
  mantenimiento_preventivo: 'clock',
};

const TIPO_LABEL: Record<TipoAlerta, string> = {
  dano: 'Daño reportado',
  vida_util: 'Vida útil superada',
  mantenimiento_preventivo: 'Mantenimiento preventivo',
};

const normalizarTipo = (tipo: string): TipoAlerta =>
  tipo === 'dano' || tipo === 'vida_util' || tipo === 'mantenimiento_preventivo'
    ? tipo
    : 'mantenimiento_preventivo';

const normalizarSeveridad = (severidad: string): Severidad =>
  severidad === 'alta' || severidad === 'critica' ? 'critica' : 'media';

const claveAlerta = (alerta: AlertaActivo): string =>
  `${alerta.activoId}:${alerta.tipo}:${alerta.mantenimientoId ?? 0}`;

const hoyLima = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const sumarDias = (fecha: string, dias: number): string => {
  const partes = fecha.split('-');
  if (partes.length !== 3) {
    return fecha;
  }
  const base = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2])));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
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

const fechaLarga = (fecha: string): string => {
  const partes = fecha.split('-');
  if (partes.length !== 3) {
    return fecha;
  }
  return `${Number(partes[2])} ${MESES[Number(partes[1]) - 1] ?? ''} ${partes[0]}`;
};

@Component({
  selector: 'app-activos-alertas-page',
  standalone: true,
  imports: [
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alertas.page.html',
  styleUrl: './alertas.page.css',
})
export class ActivosAlertasPage {
  private readonly activos = inject(ActivosService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;

  readonly filtro = signal<Filtro>('todas');
  readonly busqueda = signal<string>('');
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly programando = signal<boolean>(false);

  private readonly programadas = signal<ReadonlySet<string>>(new Set());

  readonly alertas = computed<AlertaVista[]>(() => {
    const programadas = this.programadas();
    return this.activos
      .alertas()
      .map((alerta) => {
        const key = claveAlerta(alerta);
        return {
          key,
          id: alerta.id,
          activoId: alerta.activoId,
          activo: alerta.activo,
          tipo: normalizarTipo(alerta.tipo),
          severidad: normalizarSeveridad(alerta.severidad),
          mensaje: alerta.mensaje,
          mantenimientoId: alerta.mantenimientoId,
          fecha: null,
          programada: programadas.has(key),
        };
      })
      .sort(
        (a, b) =>
          this.peso(a.severidad) - this.peso(b.severidad) ||
          a.activo.localeCompare(b.activo),
      );
  });

  readonly mostrarFecha = computed<boolean>(() =>
    this.alertas().some((alerta) => Boolean(alerta.fecha)),
  );

  readonly filtros = computed<FiltroVista[]>(() => {
    const lista = this.alertas();
    return [
      { id: 'todas', label: 'Todas', total: lista.length },
      {
        id: 'critica',
        label: 'Críticas',
        total: lista.filter((alerta) => alerta.severidad === 'critica').length,
      },
      {
        id: 'media',
        label: 'Medias',
        total: lista.filter((alerta) => alerta.severidad === 'media').length,
      },
    ];
  });

  readonly visibles = computed<AlertaVista[]>(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const activo = this.filtro();
    return this.alertas().filter((alerta) => {
      const coincideFiltro = activo === 'todas' || alerta.severidad === activo;
      const coincideBusqueda =
        termino.length === 0 ||
        alerta.mensaje.toLowerCase().includes(termino) ||
        alerta.activo.toLowerCase().includes(termino);
      return coincideFiltro && coincideBusqueda;
    });
  });

  readonly criticas = computed<number>(
    () => this.alertas().filter((alerta) => alerta.severidad === 'critica').length,
  );

  readonly criticasPendientes = computed<number>(
    () =>
      this.alertas().filter((alerta) => alerta.severidad === 'critica' && !alerta.programada)
        .length,
  );

  readonly preventivas = computed<number>(
    () => this.alertas().filter((alerta) => alerta.tipo === 'mantenimiento_preventivo').length,
  );

  readonly vidaUtil = computed<number>(
    () => this.alertas().filter((alerta) => alerta.tipo === 'vida_util').length,
  );

  readonly detenidos = computed<number>(() => this.activos.enReparacion().length);

  readonly totalActivos = computed<number>(() => this.activos.activos().length);

  readonly subtitulo = computed<string>(
    () =>
      `${this.alertas().length} alertas activas · ${this.criticas()} críticas · ${
        this.vidaUtil()
      } por vida útil · ${this.activos.activos().length} activos registrados`,
  );

  readonly notaCritica = computed<string>(() => {
    const primera = this.alertas().find(
      (alerta) => alerta.severidad === 'critica' && !alerta.programada,
    );
    return primera ? `${primera.activo} · ${primera.mensaje}` : 'Sin alertas críticas pendientes';
  });

  constructor() {
    void this.activos.cargar({ limit: 100 });
    void this.cargarAlertas();

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  severidad(alerta: AlertaVista): SeveridadVista {
    return SEVERIDADES[alerta.severidad];
  }

  icono(alerta: AlertaVista): IconName {
    return TIPO_ICONO[alerta.tipo];
  }

  tipoEtiqueta(alerta: AlertaVista): string {
    return TIPO_LABEL[alerta.tipo];
  }

  filtrar(filtro: Filtro): void {
    this.filtro.set(filtro);
  }

  onBusqueda(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  async cargarAlertas(): Promise<boolean> {
    this.cargando.set(true);
    this.error.set(null);
    const ok = await this.activos.cargarAlertas();
    if (!ok) {
      this.error.set(this.activos.error() ?? 'No se pudieron cargar las alertas.');
    }
    this.cargando.set(false);
    return ok;
  }

  reintentar(): void {
    void this.cargarAlertas();
  }

  async programar(alerta: AlertaVista): Promise<void> {
    if (alerta.programada || this.programando()) {
      return;
    }
    this.programando.set(true);
    try {
      const fecha = sumarDias(hoyLima(), 7);
      const usuarioId = this.auth.usuario()?.id ?? 1;
      // Las alertas se atienden con un mantenimiento preventivo programado:
      // es un tipo válido y evita el 422 de un correctivo sin `decision`.
      const ok = await this.activos.programarPreventivo(
        alerta.activoId,
        fecha,
        `${alerta.mensaje} · ${alerta.activo}`,
        usuarioId,
        'preventivo',
      );
      if (!ok) {
        this.avisar(
          this.activos.error() ?? 'No se pudo programar el mantenimiento.',
          true,
        );
        return;
      }
      this.programadas.update((set) => new Set(set).add(alerta.key));
      await this.cargarAlertas();
      this.avisar(`Mantenimiento programado · ${alerta.activo} · ${fechaLarga(fecha)}`);
    } catch (error) {
      this.avisar(mensajeError(error), true);
    } finally {
      this.programando.set(false);
    }
  }

  async programarPrioritaria(): Promise<void> {
    const pendiente = this.alertas()
      .filter((alerta) => !alerta.programada)
      .sort((a, b) => this.peso(a.severidad) - this.peso(b.severidad))[0];

    if (!pendiente) {
      this.avisar('Todas las alertas ya están programadas', true);
      return;
    }
    await this.programar(pendiente);
  }

  private peso(severidad: Severidad): number {
    return severidad === 'critica' ? 0 : 1;
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 2800);
  }
}
