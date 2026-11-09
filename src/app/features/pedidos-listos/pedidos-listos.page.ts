import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { mensajeError } from '../../core/api/api.helpers';
import type { PedidoListoDto } from '../../core/api/api.types';
import { CocinaService } from '../../core/data/cocina.service';
import { NotificacionesService } from '../../core/data/notificaciones.service';
import { RealtimeService } from '../../core/data/realtime.service';
import { hora as formatearHora } from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type TipoEntrega = 'mesa' | 'llevar';

interface PlatoListo {
  nombre: string;
  cantidad: number;
  nota?: string;
}

interface PedidoListo {
  id: string;
  etiqueta: string;
  tipo: TipoEntrega;
  ronda: string;
  hora: string;
  minutos: number;
  meta: string;
  items: readonly PlatoListo[];
}

const CLAVE_ENTREGADOS = 'fratelli.avisos.entregados';
const REFRESCO_MS = 15000;
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });

@Component({
  selector: 'app-pedidos-listos-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pedidos-listos.page.html',
  styleUrl: './pedidos-listos.page.css',
})
export class PedidosListosPage {
  private readonly cocina = inject(CocinaService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;
  private ultimaRevision = 0;
  private entregados = this.leerEntregados();

  readonly pedidos = signal<PedidoListo[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly horaActualizacion = signal<string>('—');
  readonly toast = signal<string>('');
  readonly noLeidos = this.notificaciones.noLeidos;

  readonly total = computed<number>(() => this.pedidos().length);

  readonly mayorEspera = computed<number>(() =>
    this.pedidos().reduce((mayor, pedido) => Math.max(mayor, pedido.minutos), 0),
  );

  readonly avisoHace = computed<number>(() =>
    this.pedidos().reduce(
      (menor, pedido) => Math.min(menor, pedido.minutos),
      Number.POSITIVE_INFINITY,
    ),
  );

  readonly subtitulo = computed<string>(() => {
    const total = this.total();
    return `Aviso de cocina al mozo · turno tarde · ${total} ${
      total === 1 ? 'pedido esperando entrega' : 'pedidos esperando entrega'
    }`;
  });

  readonly metaTablero = computed<string>(() => `actualizado ${this.horaActualizacion()}`);

  readonly metaPie = computed<string>(
    () => `${this.total()} ${this.total() === 1 ? 'aviso pendiente' : 'avisos pendientes'}`,
  );

  constructor() {
    const refresco = setInterval(() => void this.refrescar(), REFRESCO_MS);
    this.realtime.iniciar();
    // Realtime (si está disponible) adelanta el mismo refresco silencioso;
    // el intervalo de 15 s se conserva como respaldo. La revisión 0 no cuenta.
    effect(() => {
      const revision = this.realtime.revision();
      if (revision === this.ultimaRevision) {
        return;
      }
      this.ultimaRevision = revision;
      if (revision > 0) {
        void this.refrescar();
      }
    });
    this.destroyRef.onDestroy(() => {
      clearInterval(refresco);
      this.realtime.detener();
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const datos = await this.cocina.pedidosListos();
      this.pedidos.set(
        datos
          .filter((dto) => this.esDeHoy(dto.fecha_listo) && !this.entregados.has(String(dto.id)))
          .map((dto) => this.aVista(dto)),
      );
      this.marcarHora();
      this.notificaciones.marcarLeidos();
    } catch (error) {
      this.error.set(mensajeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  private async refrescar(): Promise<void> {
    if (document.visibilityState !== 'visible' || this.cargando()) {
      return;
    }
    try {
      const datos = await this.cocina.pedidosListos();
      this.pedidos.set(
        datos
          .filter((dto) => this.esDeHoy(dto.fecha_listo) && !this.entregados.has(String(dto.id)))
          .map((dto) => this.aVista(dto)),
      );
      this.marcarHora();
    } catch {
      // refresco silencioso: se conserva la última lista
    }
  }

  entregar(id: string): void {
    const pedido = this.pedidos().find((actual) => actual.id === id);
    if (!pedido) {
      return;
    }
    this.entregados.add(id);
    this.guardarEntregados();
    this.pedidos.update((lista) => lista.filter((actual) => actual.id !== id));
    this.avisar(`${pedido.etiqueta} entregado · aviso archivado`);
  }

  marcarEntregado(): void {
    const siguiente = this.pedidos()[0];
    if (!siguiente) {
      this.avisar('Sin pedidos listos por entregar');
      return;
    }
    this.entregar(siguiente.id);
  }

  actualizar(): void {
    void this.cargar();
  }

  iconoPlato(nombre: string): IconName {
    const texto = nombre.toLowerCase();
    if (texto.includes('chicha') || texto.includes('gaseosa') || texto.includes('limonada')) {
      return 'wine';
    }
    if (texto.includes('ensalada') || texto.includes('verdura')) {
      return 'leaf';
    }
    if (texto.includes('sin ají') || texto.includes('empaque')) {
      return 'note-pencil';
    }
    if (texto.includes('papa') || texto.includes('arroz')) {
      return 'fork-knife';
    }
    return 'flame';
  }

  private aVista(dto: PedidoListoDto): PedidoListo {
    const esMesa = dto.tipo_consumo === 'sala' || dto.mesa_numero !== null;
    const etiqueta = dto.mesa_numero
      ? `M${String(dto.mesa_numero).padStart(2, '0')}`
      : `#${dto.numero}`;
    const platos = dto.detalles.length;
    return {
      id: String(dto.id),
      etiqueta,
      tipo: esMesa ? 'mesa' : 'llevar',
      ronda: `Pedido ${dto.numero}`,
      hora: dto.fecha_listo ? formatearHora(dto.fecha_listo) : '—',
      minutos: dto.minutos_esperando ?? 0,
      meta: `${platos} ${platos === 1 ? 'plato' : 'platos'} · ${this.canal(dto.canal)}`,
      items: dto.detalles.map((detalle) => ({
        nombre: detalle.platillo_nombre ?? `Platillo ${detalle.platillo_id}`,
        cantidad: detalle.cantidad,
        nota: detalle.notas ?? undefined,
      })),
    };
  }

  private canal(canal: string): string {
    switch (canal) {
      case 'local':
        return 'Salón';
      case 'delivery_propio':
        return 'Delivery propio';
      case 'rappi':
        return 'Rappi';
      case 'llamafood':
        return 'LlamaFood';
      default:
        return canal;
    }
  }

  private marcarHora(): void {
    const ahora = new Date();
    const hh = String(ahora.getHours()).padStart(2, '0');
    const mm = String(ahora.getMinutes()).padStart(2, '0');
    this.horaActualizacion.set(`${hh}:${mm}`);
  }

  // La bandeja es del turno: solo avisos de hoy (zona Lima).
  private esDeHoy(fechaIso: string | null): boolean {
    if (!fechaIso) {
      return false;
    }
    return FORMATO_DIA.format(new Date(fechaIso)) === FORMATO_DIA.format(new Date());
  }

  private leerEntregados(): Set<string> {
    try {
      const bruto = sessionStorage.getItem(CLAVE_ENTREGADOS);
      const lista = bruto ? (JSON.parse(bruto) as unknown) : [];
      return new Set(Array.isArray(lista) ? lista.map((id) => String(id)) : []);
    } catch {
      return new Set();
    }
  }

  private guardarEntregados(): void {
    try {
      sessionStorage.setItem(CLAVE_ENTREGADOS, JSON.stringify([...this.entregados]));
    } catch {
      // sin sessionStorage: el aviso reaparece al recargar
    }
  }

  private avisar(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => this.toast.set(''), 2600);
  }
}
