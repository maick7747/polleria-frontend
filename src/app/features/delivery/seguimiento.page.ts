import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { formatearMoneda } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SectionHeaderComponent } from '../../shared/components/section-header/section-header';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type PasoEstado = 'done' | 'current' | 'pending';

interface RepartoItem {
  nombre: string;
  precio: number;
}

interface Reparto {
  id: string;
  cliente: string;
  telefono: string;
  direccion: string;
  referencia: string;
  repartidor: string;
  vehiculo: string;
  telefonoRepartidor: string;
  etaMin: number;
  etaHora: string;
  distancia: string;
  total: number;
  items: readonly RepartoItem[];
  horas: readonly [string, string, string, string];
  paso: number;
  minutos: number;
  repartosHoy: number;
  entregasATiempo: number;
}

interface EstadoReparto {
  etiqueta: string;
  tono: ChipVariant;
  activo: boolean;
}

interface RepartoVista extends Reparto, EstadoReparto {}

interface PasoVista {
  titulo: string;
  detalle: string;
  hora: string;
  estado: PasoEstado;
}

const REPARTOS_INICIALES: readonly Reparto[] = [
  {
    id: '#D-118',
    cliente: 'Rosa Huamán',
    telefono: '+51 981 440 227',
    direccion: 'Jr. Puno 441, El Tambo',
    referencia: 'Frente al mercado, reja azul',
    repartidor: 'Jorge Quispe',
    vehiculo: 'Moto lineal · ABC-123',
    telefonoRepartidor: '+51 987 654 321',
    etaMin: 18,
    etaHora: '17:42',
    distancia: '2.4 km',
    total: 85,
    items: [
      { nombre: 'Pollo entero + papas familia', precio: 68 },
      { nombre: 'Chicha morada 1.5 L', precio: 12 },
    ],
    horas: ['16:52', '17:01', '17:24', '17:42'],
    paso: 2,
    minutos: 18,
    repartosHoy: 4,
    entregasATiempo: 96,
  },
  {
    id: '#D-117',
    cliente: 'Luis Paredes',
    telefono: '+51 964 118 320',
    direccion: 'Av. Huancavelica 220',
    referencia: 'Edificio gris, tercer piso',
    repartidor: 'Marco Sulca',
    vehiculo: 'Moto reparto · MTC-208',
    telefonoRepartidor: '+51 986 220 114',
    etaMin: 9,
    etaHora: '17:35',
    distancia: '1.1 km',
    total: 49,
    items: [
      { nombre: '1/2 Pollo a la brasa', precio: 32 },
      { nombre: 'Papas fritas', precio: 12 },
    ],
    horas: ['17:05', '17:12', '17:26', '17:35'],
    paso: 1,
    minutos: 9,
    repartosHoy: 3,
    entregasATiempo: 92,
  },
  {
    id: '#D-116',
    cliente: 'Diego Flores',
    telefono: '+51 992 774 501',
    direccion: 'Calle Real 815',
    referencia: 'Portón negro junto a la farmacia',
    repartidor: 'Luis Cóndor',
    vehiculo: 'Moto lineal · BRA-045',
    telefonoRepartidor: '+51 983 601 772',
    etaMin: 32,
    etaHora: '18:02',
    distancia: '3.6 km',
    total: 59,
    items: [
      { nombre: 'Pollo entero a la brasa', precio: 42 },
      { nombre: 'Ensalada fresca', precio: 12 },
    ],
    horas: ['16:40', '16:52', '17:14', '18:02'],
    paso: 2,
    minutos: 32,
    repartosHoy: 5,
    entregasATiempo: 88,
  },
];

@Component({
  selector: 'app-seguimiento-delivery-page',
  standalone: true,
  imports: [
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seguimiento.page.html',
  styleUrl: './seguimiento.page.css',
})
export class SeguimientoDeliveryPage {
  private readonly destroyRef = inject(DestroyRef);

  private temporizador: number | null = null;

  readonly moneda = formatearMoneda;
  readonly seleccionadoId = signal<string>(REPARTOS_INICIALES[0].id);
  readonly horaActualizacion = signal<string>('17:26');
  readonly toast = signal<string>('');

  readonly repartos = signal<Reparto[]>(
    REPARTOS_INICIALES.map((reparto) => ({
      ...reparto,
      items: reparto.items.map((item) => ({ ...item })),
    })),
  );

  readonly lista = computed<RepartoVista[]>(() =>
    this.repartos().map((reparto) => ({ ...reparto, ...this.estado(reparto) })),
  );

  readonly seleccionado = computed<Reparto>(() => {
    const lista = this.repartos();
    return lista.find((reparto) => reparto.id === this.seleccionadoId()) ?? lista[0];
  });

  readonly estadoSeleccionado = computed<EstadoReparto>(() =>
    this.estado(this.seleccionado()),
  );

  readonly activos = computed<number>(
    () => this.lista().filter((reparto) => reparto.activo).length,
  );

  readonly subtitulo = computed<string>(
    () => `Reparto ${this.seleccionado().id} · pedido para llevar · turno tarde`,
  );

  readonly iniciales = computed<string>(() =>
    this.seleccionado()
      .repartidor.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte.charAt(0).toUpperCase())
      .join(''),
  );

  readonly telHref = computed<string>(() => {
    const telefono = this.seleccionado().telefonoRepartidor;
    return `tel:${telefono.replace(/[^\d+]/g, '')}`;
  });

  readonly pasos = computed<PasoVista[]>(() => {
    const reparto = this.seleccionado();
    const titulos = ['Recibido', 'En cocina', 'En camino', 'Entregado'];
    const detalles = [
      `${reparto.cliente} · confirmado por WhatsApp`,
      'Comanda enviada a brasa',
      `${reparto.repartidor} · ${reparto.vehiculo}`,
      reparto.paso >= 3 ? 'Entregado al cliente' : `estimado ${reparto.etaHora}`,
    ];
    return titulos.map((titulo, indice) => {
      const estado: PasoEstado =
        reparto.paso >= 3
          ? 'done'
          : indice < reparto.paso
            ? 'done'
            : indice === reparto.paso
              ? 'current'
              : 'pending';
      return {
        titulo,
        detalle: detalles[indice],
        hora: estado === 'pending' ? '--:--' : reparto.horas[indice],
        estado,
      };
    });
  });

  readonly contadorPasos = computed<string>(
    () => `${Math.min(this.seleccionado().paso + 1, 4)} de 4 pasos`,
  );

  readonly metaLista = computed<string>(
    () => `${this.lista().filter((reparto) => reparto.activo).length} en curso · actualizado ${this.horaActualizacion()}`,
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  seleccionar(id: string): void {
    this.seleccionadoId.set(id);
  }

  avanzar(): void {
    const reparto = this.seleccionado();
    if (reparto.paso >= 3) {
      this.avisar(`${reparto.id} ya fue entregado`);
      return;
    }
    const paso = reparto.paso + 1;
    this.repartos.update((lista) =>
      lista.map((actual) =>
        actual.id === reparto.id
          ? { ...actual, paso, minutos: paso >= 3 ? 0 : actual.minutos }
          : actual,
      ),
    );
    this.avisar(`${reparto.id} · ${this.estado({ ...reparto, paso }).etiqueta}`);
  }

  actualizar(): void {
    const ahora = new Date();
    const hh = String(ahora.getHours()).padStart(2, '0');
    const mm = String(ahora.getMinutes()).padStart(2, '0');
    this.horaActualizacion.set(`${hh}:${mm}`);
    this.avisar('Seguimiento actualizado');
  }

  private estado(reparto: Reparto): EstadoReparto {
    if (reparto.paso >= 3) {
      return { etiqueta: 'Entregado', tono: 'success', activo: false };
    }
    if (reparto.paso === 2) {
      return reparto.minutos > 30
        ? { etiqueta: 'Demorado', tono: 'danger', activo: true }
        : { etiqueta: 'En camino', tono: 'warning', activo: true };
    }
    if (reparto.paso === 1) {
      return { etiqueta: 'Recogiendo', tono: 'info', activo: true };
    }
    return { etiqueta: 'En cocina', tono: 'info', activo: true };
  }

  private avisar(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => this.toast.set(''), 2600);
  }
}
