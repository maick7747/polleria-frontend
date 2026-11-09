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
import { InventarioService } from '../../core/data/inventario.service';
import {
  abreviarNombre,
  fechaCorta,
  formatearMoneda,
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

const REVISION: readonly number[] = [2, 1, 3, 5, 6, 8];

const CONTEO_INICIAL: Readonly<Record<number, number>> = {
  1: 11.2,
  2: 6.5,
  3: 2.1,
  5: 41,
  6: 8,
  8: 19.6,
};

const CATEGORIAS: Readonly<Record<string, string>> = {
  alimento: 'Abarrotes',
  bebida: 'Bebidas',
  limpieza: 'Limpieza',
  empaque: 'Descartables',
  insumo_general: 'Insumos',
};

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
  private temporizador: number | null = null;

  readonly filas = signal<FilaConteo[]>([]);
  readonly toast = signal<string>('');

  readonly moneda = formatearMoneda;
  readonly usuarioNombre = computed(() => {
    const usuario = this.auth.usuario();
    return usuario ? abreviarNombre(usuario.nombre) : '—';
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

  constructor() {
    this.filas.set(this.construirFilas());
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
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

  onConteo(insumoId: number, event: Event): void {
    const valor = Number((event.target as HTMLInputElement).value);
    this.filas.update((lista) =>
      lista.map((fila) =>
        fila.insumoId === insumoId
          ? { ...fila, conteo: Number.isFinite(valor) && valor >= 0 ? round3(valor) : 0 }
          : fila,
      ),
    );
  }

  ajustarConteo(insumoId: number, delta: number): void {
    this.filas.update((lista) =>
      lista.map((fila) =>
        fila.insumoId === insumoId
          ? { ...fila, conteo: Math.max(0, round3(fila.conteo + delta)) }
          : fila,
      ),
    );
  }

  async guardar(): Promise<void> {
    const usuarioId = this.auth.usuario()?.id ?? 1;
    let ajustes = 0;
    try {
      for (const fila of this.filas()) {
        if (this.diferencia(fila) === 0) {
          continue;
        }
        const movimiento = await this.inventario.ajustarStock(
          fila.insumoId,
          fila.conteo,
          usuarioId,
          'Verificación física de stock',
        );
        if (movimiento) {
          ajustes += 1;
        }
      }
    } catch {
      this.toast.set('No se pudo registrar el ajuste de inventario.');
      return;
    }
    this.toast.set(
      ajustes > 0
        ? `${ajustes} ajuste${ajustes === 1 ? '' : 's'} registrado${ajustes === 1 ? '' : 's'}`
        : 'Sin diferencias por ajustar',
    );
    this.temporizador = window.setTimeout(() => {
      void this.router.navigate(['/inventario']);
    }, 1000);
  }

  descartar(): void {
    void this.router.navigate(['/inventario']);
  }

  private construirFilas(): FilaConteo[] {
    return REVISION.flatMap((insumoId) => {
      const insumo = this.inventario.porId(insumoId);
      if (!insumo) {
        return [];
      }
      return [
        {
          insumoId: insumo.id,
          nombre: insumo.nombre,
          categoria: CATEGORIAS[insumo.categoria] ?? 'Insumos',
          unidad: insumo.unidadMedida,
          stock: insumo.stockActual,
          conteo: CONTEO_INICIAL[insumoId] ?? insumo.stockActual,
          costo: insumo.costoPromedio,
        },
      ];
    });
  }
}
