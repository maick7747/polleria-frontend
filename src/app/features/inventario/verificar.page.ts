import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/api/api.helpers';
import { AuthService } from '../../core/auth/auth.service';
import {
  InventarioService,
  type AjusteItem,
  type VerificacionItem,
  type VerificacionStock,
} from '../../core/data/inventario.service';
import type { Insumo } from '../../core/models';
import {
  abreviarNombre,
  fechaCorta,
  formatearMoneda,
  hora,
  horaActual,
  round2,
  round3,
  turnoActual,
} from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface FilaConteo {
  insumoId: number;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: number;
  conteo: number;
  costo: number;
}

interface MovimientoCreado {
  id: number;
  nombre: string;
  cantidad: number;
  stockResultante: number;
}

type ToastTipo = 'ok' | 'error';

const CATEGORIAS: Readonly<Record<Insumo['categoria'], string>> = {
  alimento: 'Abarrotes',
  bebida: 'Bebidas',
  limpieza: 'Limpieza',
  empaque: 'Descartables',
  insumo_general: 'Insumos',
};

const SIN_DIFERENCIA = 0.0005;

@Component({
  selector: 'app-inventario-verificar-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verificar.page.html',
  styleUrl: './verificar.page.css',
})
export class InventarioVerificarPage {
  private readonly inventario = inject(InventarioService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer: number | null = null;

  readonly filas = signal<FilaConteo[]>([]);
  readonly busqueda = signal<string>('');
  readonly procesando = signal<boolean>(false);
  readonly previsualizacion = signal<VerificacionStock | null>(null);
  readonly movimientosCreados = signal<MovimientoCreado[]>([]);
  readonly ultimaVerificacion = signal<string>('—');
  readonly toast = signal<string>('');
  readonly toastTipo = signal<ToastTipo>('ok');

  readonly cargando = this.inventario.cargando;
  readonly error = this.inventario.error;

  readonly moneda = formatearMoneda;
  readonly usuarioNombre = computed(() => {
    const usuario = this.auth.usuario();
    return usuario ? abreviarNombre(usuario.nombre) : '—';
  });

  readonly totalInsumos = computed(() => this.inventario.insumos().length);

  readonly filasVisibles = computed<FilaConteo[]>(() => {
    const termino = this.busqueda().trim().toLowerCase();
    if (!termino) {
      return this.filas();
    }
    return this.filas().filter(
      (fila) =>
        fila.nombre.toLowerCase().includes(termino) ||
        fila.categoria.toLowerCase().includes(termino),
    );
  });

  readonly subtitulo = computed(
    () => `Conteo físico · ${turnoActual()} · ${this.filas().length} insumos en revisión`,
  );

  readonly selloTiempo = `${horaActual()} · ${fechaCorta()}`;

  readonly resumen = computed(() => {
    const filas = this.filas();
    let faltantes = 0;
    let sobrantes = 0;
    let neto = 0;
    for (const fila of filas) {
      const diferencia = this.diferencia(fila);
      if (diferencia < 0) {
        faltantes += 1;
      } else if (diferencia > 0) {
        sobrantes += 1;
      }
      neto += diferencia * fila.costo;
    }
    const conDiferencia = faltantes + sobrantes;
    return {
      contados: filas.length,
      conDiferencia,
      sinDiferencia: filas.length - conDiferencia,
      faltantes,
      sobrantes,
      neto: round2(neto),
      valorizado: Math.abs(round2(neto)),
    };
  });

  readonly textoValorizado = computed(() => {
    const neto = this.resumen().neto;
    if (neto < 0) {
      return 'Faltantes netos · se descuenta del stock';
    }
    if (neto > 0) {
      return 'Sobrantes netos · se suma al stock';
    }
    return 'Sin diferencias valorizadas';
  });

  readonly diferenciasPreview = computed(() =>
    (this.previsualizacion()?.diferencias ?? []).filter(
      (diferencia) => diferencia.requiere_ajuste,
    ),
  );

  constructor() {
    void this.inicializar();
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  private async inicializar(): Promise<void> {
    const ok = await this.inventario.cargar({ limit: 100 });
    if (!ok && this.inventario.insumos().length === 0) {
      return;
    }
    this.filas.set(this.construirFilas());
    const ultimo = await this.inventario.ultimoAjuste();
    this.ultimaVerificacion.set(this.formatearFecha(ultimo));
  }

  async recargar(): Promise<void> {
    const ok = await this.inventario.cargar({ limit: 100 });
    if (!ok && this.inventario.insumos().length === 0) {
      return;
    }
    this.filas.set(this.construirFilas());
    const ultimo = await this.inventario.ultimoAjuste();
    this.ultimaVerificacion.set(this.formatearFecha(ultimo));
  }

  diferencia(fila: FilaConteo): number {
    return round3(fila.conteo - fila.stock);
  }

  textoDiferencia(fila: FilaConteo): string {
    const diferencia = this.diferencia(fila);
    if (diferencia === 0) {
      return 'Sin diferencia';
    }
    const signo = diferencia > 0 ? '+' : '-';
    return `${signo}${this.cantidad(Math.abs(diferencia))} ${fila.unidad}`;
  }

  claseDiferencia(fila: FilaConteo): string {
    const diferencia = this.diferencia(fila);
    if (diferencia < 0) {
      return 'danger';
    }
    if (diferencia > 0) {
      return 'warning';
    }
    return 'ok';
  }

  cantidad(valor: number): string {
    const redondeado = Math.round(valor * 10) / 10;
    return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1);
  }

  monto(valor: number): string {
    return valor.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  onConteo(insumoId: number, event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(valor) || valor < 0) {
      return;
    }
    this.filas.update((lista) =>
      lista.map((fila) =>
        fila.insumoId === insumoId ? { ...fila, conteo: round3(valor) } : fila,
      ),
    );
    this.previsualizacion.set(null);
    this.movimientosCreados.set([]);
  }

  ajustarConteo(insumoId: number, delta: number): void {
    this.filas.update((lista) =>
      lista.map((fila) =>
        fila.insumoId === insumoId
          ? { ...fila, conteo: Math.max(0, round3(fila.conteo + delta)) }
          : fila,
      ),
    );
    this.previsualizacion.set(null);
    this.movimientosCreados.set([]);
  }

  async previsualizar(): Promise<void> {
    if (this.procesando()) {
      return;
    }
    const items = this.itemsVerificacion();
    const invalidacion = this.validar(items);
    if (invalidacion) {
      this.mostrarToast(invalidacion, 'error');
      return;
    }

    this.procesando.set(true);
    try {
      const respuesta = await this.inventario.verificarStock(items);
      this.previsualizacion.set(respuesta);
      const conDiferencia = respuesta.resumen.con_diferencia;
      this.mostrarToast(
        conDiferencia > 0
          ? `Vista previa: ${conDiferencia} de ${respuesta.resumen.items} insumos con diferencia`
          : 'Vista previa: sin diferencias por ajustar',
        'ok',
      );
    } catch (error) {
      this.previsualizacion.set(null);
      this.mostrarToast(mensajeError(error), 'error');
    } finally {
      this.procesando.set(false);
    }
  }

  async aplicar(): Promise<void> {
    if (this.procesando()) {
      return;
    }
    const items = this.itemsAjuste();
    const invalidacion = this.validar(this.itemsVerificacion());
    if (invalidacion) {
      this.mostrarToast(invalidacion, 'error');
      return;
    }
    if (items.length === 0) {
      this.mostrarToast('No hay diferencias por ajustar', 'ok');
      return;
    }

    this.procesando.set(true);
    try {
      const respuesta = await this.inventario.aplicarAjustes(items);
      const nombres = new Map<number, string>(
        this.filas().map((fila) => [fila.insumoId, fila.nombre] as const),
      );
      this.movimientosCreados.set(
        respuesta.movimientos.map((movimiento) => ({
          id: movimiento.id,
          nombre: nombres.get(movimiento.insumoId) ?? `Insumo ${movimiento.insumoId}`,
          cantidad: movimiento.cantidad,
          stockResultante: movimiento.stockResultante,
        })),
      );
      this.previsualizacion.set(null);
      await this.recargar();
      this.mostrarToast(
        respuesta.total > 0
          ? `${respuesta.total} movimiento${respuesta.total === 1 ? '' : 's'} de ajuste creado${respuesta.total === 1 ? '' : 's'}`
          : 'El servidor no registró movimientos (sin diferencias reales)',
        'ok',
      );
    } catch (error) {
      this.mostrarToast(mensajeError(error), 'error');
    } finally {
      this.procesando.set(false);
    }
  }

  descartar(): void {
    void this.router.navigate(['/inventario']);
  }

  private itemsVerificacion(): VerificacionItem[] {
    return this.filas().map((fila) => ({
      insumo_id: fila.insumoId,
      conteo_fisico: round3(fila.conteo),
    }));
  }

  private itemsAjuste(): AjusteItem[] {
    return this.filas()
      .filter((fila) => Math.abs(this.diferencia(fila)) > SIN_DIFERENCIA)
      .map((fila) => ({
        insumo_id: fila.insumoId,
        cantidad: round3(fila.conteo),
        observacion: 'Verificación física de stock',
      }));
  }

  private validar(items: VerificacionItem[]): string | null {
    if (this.filas().length === 0) {
      return 'El catálogo de insumos no cargó. Reintenta antes de continuar.';
    }
    if (items.length === 0) {
      return 'No hay insumos para verificar.';
    }
    const ids = new Set<number>();
    for (const item of items) {
      if (ids.has(item.insumo_id)) {
        return 'Hay insumos duplicados en el conteo.';
      }
      ids.add(item.insumo_id);
      if (!Number.isFinite(item.conteo_fisico) || item.conteo_fisico < 0) {
        return 'Todos los conteos deben ser números mayores o iguales a 0.';
      }
    }
    return null;
  }

  private construirFilas(): FilaConteo[] {
    const vistos = new Set<number>();
    const filas: FilaConteo[] = [];
    for (const insumo of this.inventario.insumos()) {
      if (insumo.activo === false || vistos.has(insumo.id)) {
        continue;
      }
      vistos.add(insumo.id);
      filas.push({
        insumoId: insumo.id,
        nombre: insumo.nombre,
        categoria: CATEGORIAS[insumo.categoria] ?? 'Insumos',
        unidad: insumo.unidadMedida,
        stock: insumo.stockActual,
        conteo: insumo.stockActual,
        costo: insumo.costoPromedio,
      });
    }
    return filas;
  }

  private formatearFecha(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) {
      return '—';
    }
    return `${fechaCorta(fecha)} · ${hora(iso)}`;
  }

  private mostrarToast(mensaje: string, tipo: ToastTipo): void {
    this.toast.set(mensaje);
    this.toastTipo.set(tipo);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toast.set('');
      this.toastTimer = null;
    }, 3200);
  }
}
