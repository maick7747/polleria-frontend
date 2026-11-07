import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ActivosService } from '../../core/data/activos.service';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type Severidad = 'critica' | 'alta' | 'media';
type TipoAlerta = 'preventiva' | 'dano' | 'garantia';
type Filtro = 'todas' | Severidad;

interface AlertaBase {
  id: number;
  titulo: string;
  detalle: string;
  activoId: number;
  tipo: TipoAlerta;
  severidad: Severidad;
  fecha: string;
  costo: number;
}

interface AlertaVista extends AlertaBase {
  activo: string;
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
  alta: { label: 'Alta', tono: 'warning', icono: 'flame' },
  media: { label: 'Media', tono: 'info', icono: 'clock' },
};

const TIPO_ICONO: Record<TipoAlerta, IconName> = {
  preventiva: 'clock',
  dano: 'warning-circle',
  garantia: 'check-circle',
};

const ALERTAS_BASE: readonly AlertaBase[] = [
  {
    id: 1,
    titulo: 'Compresor con ruido y vibración',
    detalle: 'Reportada por el cocinero · enfría por debajo de 2 °C',
    activoId: 2,
    tipo: 'dano',
    severidad: 'critica',
    fecha: 'Hoy · 08:15',
    costo: 380,
  },
  {
    id: 2,
    titulo: 'Fuga de gas refrigerante',
    detalle: 'Detectada en la revisión de rutina · temperatura inestable',
    activoId: 2,
    tipo: 'dano',
    severidad: 'critica',
    fecha: '13 oct · 18:40',
    costo: 480,
  },
  {
    id: 3,
    titulo: 'Extractor de grasa sin limpieza profunda',
    detalle: '60 días desde el último servicio · riesgo de incendio',
    activoId: 1,
    tipo: 'preventiva',
    severidad: 'alta',
    fecha: '12 oct · 10:05',
    costo: 180,
  },
  {
    id: 4,
    titulo: 'Garantía por vencer en 9 días',
    detalle: 'Conviene revisar el equipo antes del vencimiento',
    activoId: 4,
    tipo: 'garantia',
    severidad: 'alta',
    fecha: '23 oct · 9 días',
    costo: 0,
  },
  {
    id: 5,
    titulo: 'Cambio de aceite de freidora',
    detalle: 'Mantenimiento preventivo · cada 120 horas de uso',
    activoId: 4,
    tipo: 'preventiva',
    severidad: 'media',
    fecha: '20 oct · 6 días',
    costo: 120,
  },
  {
    id: 6,
    titulo: 'Calibración anual pendiente',
    detalle: 'Certificado de calibración vence el 30 nov 2026',
    activoId: 5,
    tipo: 'preventiva',
    severidad: 'media',
    fecha: '30 nov · 47 días',
    costo: 90,
  },
];

const HOY_ISO = '2026-10-14';

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

  readonly moneda = formatearMoneda;

  readonly filtro = signal<Filtro>('todas');
  readonly busqueda = signal<string>('');
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly alertas = signal<AlertaVista[]>(
    ALERTAS_BASE.map((base) => ({
      ...base,
      activo:
        this.activos.activos().find((activo) => activo.id === base.activoId)?.nombre ??
        'Activo sin registrar',
      programada: false,
    })),
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
        id: 'alta',
        label: 'Altas',
        total: lista.filter((alerta) => alerta.severidad === 'alta').length,
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
        alerta.titulo.toLowerCase().includes(termino) ||
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
    () => this.alertas().filter((alerta) => alerta.tipo === 'preventiva').length,
  );

  readonly garantias = computed<number>(
    () => this.alertas().filter((alerta) => alerta.tipo === 'garantia').length,
  );

  readonly costoEstimado = computed<number>(() =>
    round2(
      this.alertas()
        .filter((alerta) => !alerta.programada)
        .reduce((suma, alerta) => suma + alerta.costo, 0),
    ),
  );

  readonly detenidos = computed<number>(() => this.activos.enReparacion().length);

  readonly totalActivos = computed<number>(() => this.activos.activos().length);

  readonly subtitulo = computed<string>(
    () =>
      `${this.alertas().length} alertas activas · ${this.criticas()} críticas · ${
        this.garantias()
      } garantía por vencer · ${this.activos.activos().length} activos registrados`,
  );

  readonly notaCritica = computed<string>(() => {
    const primera = this.alertas().find(
      (alerta) => alerta.severidad === 'critica' && !alerta.programada,
    );
    return primera ? `${primera.activo} · falla recurrente del mismo equipo` : 'Sin críticas pendientes';
  });

  constructor() {
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

  filtrar(filtro: Filtro): void {
    this.filtro.set(filtro);
  }

  onBusqueda(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  programar(alerta: AlertaVista): void {
    if (alerta.programada) {
      return;
    }
    const fecha = sumarDias(HOY_ISO, 7);
    const usuarioId = this.auth.usuario()?.id ?? 1;
    this.activos.programarPreventivo(
      alerta.activoId,
      fecha,
      `${alerta.titulo} · ${alerta.activo}`,
      usuarioId,
      alerta.tipo === 'dano' ? 'correctivo' : 'preventivo',
    );
    this.alertas.update((lista) =>
      lista.map((actual) => (actual.id === alerta.id ? { ...actual, programada: true } : actual)),
    );
    this.avisar(`Mantenimiento programado · ${alerta.activo} · ${fechaLarga(fecha)}`);
  }

  programarPrioritaria(): void {
    const pendiente = this.alertas()
      .filter((alerta) => !alerta.programada)
      .sort((a, b) => this.peso(a.severidad) - this.peso(b.severidad))[0];

    if (!pendiente) {
      this.avisar('Todas las alertas ya están programadas', true);
      return;
    }
    this.programar(pendiente);
  }

  private peso(severidad: Severidad): number {
    switch (severidad) {
      case 'critica':
        return 0;
      case 'alta':
        return 1;
      default:
        return 2;
    }
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
