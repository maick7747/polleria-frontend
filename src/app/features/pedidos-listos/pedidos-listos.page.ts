import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
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

const PEDIDOS_INICIALES: readonly PedidoListo[] = [
  {
    id: 'M04',
    etiqueta: 'M04',
    tipo: 'mesa',
    ronda: 'Ronda 2',
    hora: '17:42',
    minutos: 2,
    meta: 'Ronda 2 · 3 platos · mozo asignado Yair',
    items: [
      { nombre: '1/2 Pollo a la brasa', cantidad: 1 },
      { nombre: 'Papas fritas', cantidad: 1 },
      { nombre: 'Chicha morada', cantidad: 2 },
    ],
  },
  {
    id: 'M02',
    etiqueta: 'M02',
    tipo: 'mesa',
    ronda: 'Ronda 1',
    hora: '17:38',
    minutos: 4,
    meta: 'Ronda 1 · 3 platos · hace 4 min en barra',
    items: [
      { nombre: 'Pollo entero a la brasa', cantidad: 1 },
      { nombre: 'Ensalada fresca', cantidad: 1 },
      { nombre: 'Chicha morada 1 L', cantidad: 1 },
    ],
  },
  {
    id: '#0121',
    etiqueta: '#0121',
    tipo: 'llevar',
    ronda: 'Ronda 1',
    hora: '17:35',
    minutos: 6,
    meta: 'Ronda 1 · 2 platos · esperando en mostrador',
    items: [
      { nombre: '1/4 Pollo a la brasa', cantidad: 2 },
      { nombre: 'Papas fritas', cantidad: 1 },
      { nombre: 'Sin ají · empaque sellado', cantidad: 0, nota: 'obs.' },
    ],
  },
];

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
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;

  readonly pedidos = signal<PedidoListo[]>(
    PEDIDOS_INICIALES.map((pedido) => ({
      ...pedido,
      items: pedido.items.map((item) => ({ ...item })),
    })),
  );

  readonly horaActualizacion = signal<string>('17:46');
  readonly toast = signal<string>('');

  readonly total = computed<number>(() => this.pedidos().length);

  readonly mayorEspera = computed<number>(() =>
    this.pedidos().reduce((mayor, pedido) => Math.max(mayor, pedido.minutos), 0),
  );

  readonly subtitulo = computed<string>(() => {
    const total = this.total();
    return `Aviso de cocina al mozo · turno tarde · ${total} ${
      total === 1 ? 'pedido esperando entrega' : 'pedidos esperando entrega'
    }`;
  });

  readonly metaTablero = computed<string>(() => `actualizado ${this.horaActualizacion()}`);

  readonly metaPie = computed<string>(
    () => `${this.total()} de ${PEDIDOS_INICIALES.length} avisos pendientes`,
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  entregar(id: string): void {
    const pedido = this.pedidos().find((actual) => actual.id === id);
    if (!pedido) {
      return;
    }
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
    const ahora = new Date();
    const hh = String(ahora.getHours()).padStart(2, '0');
    const mm = String(ahora.getMinutes()).padStart(2, '0');
    this.horaActualizacion.set(`${hh}:${mm}`);
    this.avisar('Tablero actualizado');
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

  private avisar(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => this.toast.set(''), 2600);
  }
}
