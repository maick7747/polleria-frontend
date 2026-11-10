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
import { toDetalle } from '../../core/api/api.mappers';
import { CocinaService } from '../../core/data/cocina.service';
import { NotificacionesService } from '../../core/data/notificaciones.service';
import { RealtimeService } from '../../core/data/realtime.service';
import type { Curso, EstadoLineaKds, Estacion } from '../../core/models';
import { hora as formatearHora, turnoActual } from '../../core/utils/format';
import {
  CURSO_LABEL,
  ESTACION_LABEL,
  cursoDe,
  estadoLinea,
  estacionDe,
} from '../../core/utils/kds';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type TipoEntrega = 'mesa' | 'llevar';

interface LineaLista {
  id: number;
  nombre: string;
  cantidad: number;
  estado: EstadoLineaKds;
  estacion: Estacion;
  curso: Curso;
  nota?: string;
}

interface PedidoListo {
  id: number;
  etiqueta: string;
  tipo: TipoEntrega;
  ronda: string;
  hora: string;
  minutos: number;
  meta: string;
  canal: string;
  lineas: LineaLista[];
  todosListos: boolean;
}

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

  readonly estacionLabel = ESTACION_LABEL;
  readonly cursoLabel = CURSO_LABEL;

  private temporizador: number | null = null;
  private ultimaRevision = 0;

  readonly pedidos = signal<PedidoListo[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly horaActualizacion = signal<string>('—');
  readonly toast = signal<string>('');
  readonly accionando = signal<string | null>(null);
  readonly noLeidos = this.notificaciones.noLeidos;

  readonly total = computed<number>(() => this.pedidos().length);

  readonly platosPendientes = computed<number>(() =>
    this.pedidos().reduce(
      (suma, pedido) =>
        suma + pedido.lineas.filter((linea) => linea.estado !== 'entregado').length,
      0,
    ),
  );

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
    return `Aviso de cocina al mozo · ${turnoActual()} · ${total} ${
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

  async cargar(silencioso = false): Promise<void> {
    if (!silencioso) {
      this.cargando.set(true);
      this.error.set(null);
    }
    try {
      const datos = await this.cocina.pedidosListos();
      this.pedidos.set(
        datos
          .filter((dto) => !dto.todos_entregados && this.esDeHoy(dto.fecha_listo))
          .map((dto) => this.aVista(dto))
          .filter((pedido) => pedido.lineas.length > 0),
      );
      this.marcarHora();
      this.notificaciones.marcarLeidos();
    } catch (error) {
      if (!silencioso || this.pedidos().length === 0) {
        this.error.set(mensajeError(error));
      }
    } finally {
      if (!silencioso) {
        this.cargando.set(false);
      }
    }
  }

  private async refrescar(): Promise<void> {
    if (document.visibilityState !== 'visible' || this.cargando()) {
      return;
    }
    await this.cargar(true);
  }

  puedeEntregarLinea(linea: LineaLista): boolean {
    return linea.estado === 'listo';
  }

  puedeEntregarPedido(pedido: PedidoListo): boolean {
    const activas = pedido.lineas.filter((linea) => linea.estado !== 'entregado');
    return activas.length > 0 && activas.every((linea) => linea.estado === 'listo');
  }

  async entregarLinea(pedido: PedidoListo, linea: LineaLista, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.accionando() || !this.puedeEntregarLinea(linea)) {
      return;
    }
    this.accionando.set(`linea-${linea.id}`);
    try {
      await this.cocina.entregarPlato(pedido.id, linea.id);
      this.avisar(`Entregado · ${linea.nombre}`);
      await this.cargar(true);
    } catch (error) {
      this.avisar(mensajeError(error));
    } finally {
      this.accionando.set(null);
    }
  }

  async entregarPedido(pedido: PedidoListo): Promise<void> {
    if (this.accionando() || !this.puedeEntregarPedido(pedido)) {
      return;
    }
    this.accionando.set(`pedido-${pedido.id}`);
    try {
      await this.cocina.entregarRonda(pedido.id);
      this.avisar(`${pedido.etiqueta} · entregado`);
      await this.cargar(true);
    } catch (error) {
      this.avisar(mensajeError(error));
    } finally {
      this.accionando.set(null);
    }
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

  estadoTexto(estado: EstadoLineaKds): string {
    switch (estado) {
      case 'en_preparacion':
        return 'En preparación';
      case 'listo':
        return 'Listo';
      case 'entregado':
        return 'Entregado';
      default:
        return 'Pendiente';
    }
  }

  private aVista(dto: PedidoListoDto): PedidoListo {
    const esMesa = dto.tipo_consumo === 'sala' || dto.mesa_numero !== null;
    const etiqueta = dto.mesa_numero
      ? `M${String(dto.mesa_numero).padStart(2, '0')}`
      : `#${dto.numero}`;
    const lineas = dto.detalles.map((detalle) => {
      const item = toDetalle(detalle);
      return {
        id: item.id,
        nombre: item.nombre,
        cantidad: item.cantidad,
        estado: estadoLinea(item),
        estacion: estacionDe(item),
        curso: cursoDe(item),
        nota: item.notas,
      };
    });
    const activas = lineas.filter((linea) => linea.estado !== 'entregado');
    return {
      id: dto.id,
      etiqueta,
      tipo: esMesa ? 'mesa' : 'llevar',
      ronda: `Pedido ${dto.numero}`,
      hora: dto.fecha_listo ? formatearHora(dto.fecha_listo) : '—',
      minutos: dto.minutos_esperando ?? 0,
      meta: `${lineas.length} ${lineas.length === 1 ? 'plato' : 'platos'} · ${this.canal(dto.canal)}`,
      canal: this.canal(dto.canal),
      lineas,
      todosListos: activas.length > 0 && activas.every((linea) => linea.estado === 'listo'),
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

  private avisar(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => this.toast.set(''), 2600);
  }
}
