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
import { ActivosService } from '../../core/data/activos.service';
import type { Activo, CategoriaActivo, EstadoActivo } from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface EstadoVista {
  label: string;
  tono: ChipVariant;
}

interface CategoriaVista {
  label: string;
  icono: IconName;
}

const ESTADOS: Record<EstadoActivo, EstadoVista> = {
  activo: { label: 'Operativo', tono: 'success' },
  en_reparacion: { label: 'En mantenimiento', tono: 'danger' },
  dado_de_baja: { label: 'Fuera de servicio', tono: 'neutral' },
};

const CATEGORIAS: Record<CategoriaActivo, CategoriaVista> = {
  cocina: { label: 'Cocina', icono: 'flame' },
  salon: { label: 'Salón', icono: 'storefront' },
  delivery: { label: 'Delivery', icono: 'motorcycle' },
  oficina: { label: 'Oficina', icono: 'monitor' },
  limpieza: { label: 'Limpieza', icono: 'leaf' },
};

const AHORA = Date.parse('2026-10-14T12:00:00-05:00');

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
  Math.round((Date.parse(`${fecha}T12:00:00-05:00`) - AHORA) / 86_400_000);

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
  const anio = Number(partes[0]);
  const mes = Number(partes[1]) - 1;
  const dia = Number(partes[2]);
  const resultado = new Date(Date.UTC(anio, mes + meses, dia));
  return resultado.toISOString().slice(0, 10);
};

@Component({
  selector: 'app-activos-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './activos.page.html',
  styleUrl: './activos.page.css',
})
export class ActivosPage {
  private readonly activos = inject(ActivosService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;

  readonly moneda = formatearMoneda;

  readonly lista = this.activos.activos;
  readonly proximos = this.activos.proximos;

  readonly seleccionadoId = signal<number | null>(null);
  readonly toast = signal<string>('');

  readonly seleccionado = computed<Activo | null>(() => {
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
    const prefijo = '2026-10';
    return round2(
      this.activos
        .mantenimientos()
        .filter((mantenimiento) => mantenimiento.fecha.startsWith(prefijo))
        .reduce((suma, mantenimiento) => suma + mantenimiento.costoReparacion, 0),
    );
  });

  readonly subtitulo = computed<string>(
    () =>
      `${this.lista().length} activos registrados · ${this.proximos().length} por vencer · costo del mes ${this.moneda(this.costoMes())}`,
  );

  readonly nombresProximos = computed<string>(() =>
    this.proximos()
      .map((activo) => activo.nombre)
      .join(' · '),
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  seleccionar(id: number): void {
    this.seleccionadoId.set(id);
  }

  estado(activo: Activo): EstadoVista {
    return ESTADOS[activo.estado];
  }

  categoria(activo: Activo): CategoriaVista {
    return CATEGORIAS[activo.categoria];
  }

  codigo(activo: Activo): string {
    return `M-${String(activo.id).padStart(3, '0')}`;
  }

  fechaDetalle(fecha: string | undefined): string {
    return fecha ? fechaCorta(fecha) : '—';
  }

  proximoTexto(activo: Activo): string {
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

  proximoVencido(activo: Activo): boolean {
    return activo.proximoMantenimiento ? diasHasta(activo.proximoMantenimiento) < 0 : false;
  }

  diasProximo(activo: Activo): number {
    return activo.proximoMantenimiento ? diasHasta(activo.proximoMantenimiento) : 0;
  }

  proximoPorVencer(activo: Activo): boolean {
    if (!activo.proximoMantenimiento) {
      return false;
    }
    const dias = diasHasta(activo.proximoMantenimiento);
    return dias >= 0 && dias <= 45;
  }

  garantiaTexto(activo: Activo): string {
    if (activo.garantiaMeses === undefined) {
      return '—';
    }
    const fin = sumarMeses(activo.fechaAdquisicion, activo.garantiaMeses);
    const vencida = diasHasta(fin) < 0;
    return `${vencida ? 'Vencida' : 'Vigente'} · ${fechaCorta(fin)}`;
  }

  garantiaVencida(activo: Activo): boolean {
    if (activo.garantiaMeses === undefined) {
      return false;
    }
    return diasHasta(sumarMeses(activo.fechaAdquisicion, activo.garantiaMeses)) < 0;
  }

  registrarMantenimiento(): void {
    const activo = this.seleccionado();
    if (!activo) {
      return;
    }
    const usuarioId = this.auth.usuario()?.id ?? 1;
    this.activos.autorizarMantenimiento(
      activo.id,
      'preventivo',
      `Mantenimiento preventivo · ${activo.nombre}`,
      usuarioId,
      'reparar',
    );
    this.avisar(`Mantenimiento programado · ${activo.nombre}`);
  }

  private avisar(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 2800);
  }
}
