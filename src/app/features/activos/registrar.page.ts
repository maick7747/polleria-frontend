import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ActivosService } from '../../core/data/activos.service';
import type { CategoriaActivo } from '../../core/models';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface CategoriaVista {
  id: CategoriaActivo;
  label: string;
}

interface ErroresFormulario {
  nombre: boolean;
  costo: boolean;
  vidaUtil: boolean;
  fecha: boolean;
}

const CATEGORIAS: readonly CategoriaVista[] = [
  { id: 'cocina', label: 'Cocina' },
  { id: 'salon', label: 'Salón' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'oficina', label: 'Oficina' },
  { id: 'limpieza', label: 'Limpieza' },
];

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

const sumarMeses = (fecha: string, meses: number): string => {
  const partes = fecha.split('-');
  if (partes.length !== 3) {
    return fecha;
  }
  const anio = Number(partes[0]);
  const mes = Number(partes[1]) - 1;
  const dia = Number(partes[2]);
  return new Date(Date.UTC(anio, mes + meses, dia)).toISOString().slice(0, 10);
};

const fechaLarga = (fecha: string): string => {
  const partes = fecha.split('-');
  if (partes.length !== 3) {
    return fecha;
  }
  return `${Number(partes[2])} ${MESES[Number(partes[1]) - 1] ?? ''} ${partes[0]}`;
};

@Component({
  selector: 'app-activos-registrar-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './registrar.page.html',
  styleUrl: './registrar.page.css',
})
export class ActivosRegistrarPage {
  private readonly activos = inject(ActivosService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;
  private toastTimer: number | null = null;

  readonly moneda = formatearMoneda;
  readonly categorias = CATEGORIAS;

  readonly nombre = signal<string>('Congeladora 500 L · doble puerta');
  readonly categoria = signal<CategoriaActivo>('cocina');
  readonly costo = signal<string>('3600.00');
  readonly proveedor = signal<string>('Frío Andino S.A.C.');
  readonly vidaUtilMeses = signal<string>('96');
  readonly fechaAdquisicion = signal<string>('2026-10-14');
  readonly garantiaMeses = signal<string>('24');
  readonly observaciones = signal<string>('Ubicada en cocina · uso intensivo en turno tarde');

  readonly mostrarErrores = signal<boolean>(false);
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  readonly costoNumero = computed<number>(() => {
    const valor = Number.parseFloat(this.costo().replace(',', '.'));
    return Number.isFinite(valor) ? round2(valor) : 0;
  });

  readonly vidaNumero = computed<number>(() => {
    const valor = Number.parseInt(this.vidaUtilMeses(), 10);
    return Number.isFinite(valor) ? Math.max(0, valor) : 0;
  });

  readonly garantiaNumero = computed<number>(() => {
    const valor = Number.parseInt(this.garantiaMeses(), 10);
    return Number.isFinite(valor) ? Math.max(0, valor) : 0;
  });

  readonly depreciacion = computed<number>(() => {
    const meses = this.vidaNumero();
    return meses > 0 ? round2(this.costoNumero() / meses) : 0;
  });

  readonly proximoMantenimiento = computed<string>(() =>
    this.fechaAdquisicion() ? sumarMeses(this.fechaAdquisicion(), 6) : '',
  );

  readonly garantiaHasta = computed<string>(() =>
    this.fechaAdquisicion() ? sumarMeses(this.fechaAdquisicion(), this.garantiaNumero()) : '',
  );

  readonly errores = computed<ErroresFormulario>(() => ({
    nombre: this.nombre().trim().length === 0,
    costo: this.costoNumero() <= 0,
    vidaUtil: this.vidaNumero() <= 0,
    fecha: this.fechaAdquisicion().length === 0,
  }));

  readonly valido = computed<boolean>(() => {
    const actuales = this.errores();
    return (
      !actuales.nombre && !actuales.costo && !actuales.vidaUtil && !actuales.fecha
    );
  });

  readonly categoriaLabel = computed<string>(
    () => CATEGORIAS.find((item) => item.id === this.categoria())?.label ?? 'Cocina',
  );

  readonly proximoTexto = computed<string>(() => {
    const valor = this.proximoMantenimiento();
    return valor ? fechaLarga(valor) : '—';
  });

  readonly garantiaTexto = computed<string>(() => {
    const valor = this.garantiaHasta();
    return valor ? fechaLarga(valor) : '—';
  });

  onNombre(event: Event): void {
    this.nombre.set((event.target as HTMLInputElement).value);
  }

  elegirCategoria(categoria: CategoriaActivo): void {
    this.categoria.set(categoria);
  }

  onCosto(event: Event): void {
    this.costo.set((event.target as HTMLInputElement).value);
  }

  onProveedor(event: Event): void {
    this.proveedor.set((event.target as HTMLInputElement).value);
  }

  onVidaUtil(event: Event): void {
    this.vidaUtilMeses.set((event.target as HTMLInputElement).value);
  }

  onFecha(event: Event): void {
    this.fechaAdquisicion.set((event.target as HTMLInputElement).value);
  }

  onGarantia(event: Event): void {
    this.garantiaMeses.set((event.target as HTMLInputElement).value);
  }

  onObservaciones(event: Event): void {
    this.observaciones.set((event.target as HTMLTextAreaElement).value);
  }

  guardar(): void {
    this.mostrarErrores.set(true);

    if (!this.valido()) {
      this.avisar('Revisa los campos obligatorios del activo', true);
      return;
    }

    const usuarioId = this.auth.usuario()?.id ?? 1;

    const activo = this.activos.registrar({
      nombre: this.nombre().trim(),
      categoria: this.categoria(),
      cantidad: 1,
      costoAdquisicion: this.costoNumero(),
      vidaUtilMeses: this.vidaNumero(),
      fechaAdquisicion: this.fechaAdquisicion(),
      estado: 'activo',
      proximoMantenimiento: this.proximoMantenimiento() || undefined,
      proveedor: this.proveedor().trim() || undefined,
      garantiaMeses: this.garantiaNumero(),
      observaciones: this.observaciones().trim() || undefined,
      usuarioId,
    });

    this.avisar(`Activo registrado · ${activo.nombre}`);

    this.temporizador = window.setTimeout(() => {
      void this.router.navigate(['/activos']);
    }, 950);
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
