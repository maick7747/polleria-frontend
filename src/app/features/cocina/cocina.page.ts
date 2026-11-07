import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { CocinaService, UMBRAL_KDS_MIN, type ComandaKds } from '../../core/data/cocina.service';
import { mensajeError } from '../../core/api/api.helpers';
import { CuentasService } from '../../core/data/cuentas.service';
import { FichasService } from '../../core/data/fichas.service';
import { PedidosService } from '../../core/data/pedidos.service';
import type { PedidoDetalle } from '../../core/models';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

const AHORA = Date.now();
const TARJETAS_KDS = 6;

type CanalTono = 'local' | 'delivery' | 'rappi' | 'llamafood';
type RitmoTono = 'neutral' | 'brand' | 'warning' | 'success';

interface ComandaVista {
  pedidoId: number;
  etiqueta: string;
  tipo: string;
  canal: string;
  canalTono: CanalTono;
  ronda: number;
  items: PedidoDetalle[];
  listos: number;
  segundos: number;
  minutos: number;
  prioritaria: boolean;
  progreso: number;
  faltan: number;
}

interface PlatoFoco {
  comanda: ComandaVista;
  item: PedidoDetalle;
  ingredientes: string[];
  observacion: string;
}

interface RitmoItem {
  label: string;
  value: number;
  detalle: string;
  tono: RitmoTono;
  icon: 'clipboard-text' | 'flame' | 'shopping-cart' | 'check';
}

interface Estacion {
  nombre: string;
  cantidad: number;
  porcentaje: number;
  tono: 'brand' | 'warning' | 'info';
}

const pad2 = (valor: number): string => String(valor).padStart(2, '0');

const reloj = (segundos: number): string =>
  `${pad2(Math.floor(segundos / 60))}:${pad2(segundos % 60)}`;

@Component({
  selector: 'app-cocina-page',
  standalone: true,
  imports: [
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cocina.page.html',
  styleUrl: './cocina.page.css',
})
export class CocinaPage {
  private readonly cocina = inject(CocinaService);
  private readonly pedidos = inject(PedidosService);
  private readonly cuentas = inject(CuentasService);
  private readonly fichas = inject(FichasService);
  private readonly destroyRef = inject(DestroyRef);

  readonly umbral = UMBRAL_KDS_MIN;
  readonly reloj = reloj;
  private temporizador: number | null = null;

  readonly seleccionadaId = signal<number>(this.cocina.comandas()[0]?.pedidoId ?? 0);
  readonly toast = signal<string>('');

  constructor() {
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    await Promise.all([this.pedidos.cargar(), this.cuentas.cargar()]);
    const primera = this.cocina.comandas()[0];
    if (primera) {
      this.seleccionadaId.set(primera.pedidoId);
    }
  }

  readonly comandas = computed<ComandaVista[]>(() =>
    this.cocina
      .comandas()
      .slice(0, TARJETAS_KDS)
      .map((comanda) => this.vista(comanda)),
  );

  readonly seleccionada = computed<ComandaVista | null>(() => {
    const lista = this.comandas();
    return lista.find((comanda) => comanda.pedidoId === this.seleccionadaId()) ?? lista[0] ?? null;
  });

  readonly foco = computed<PlatoFoco | null>(() => {
    const comanda = this.seleccionada();
    if (!comanda || comanda.items.length === 0) {
      return null;
    }
    const item =
      comanda.items.find((detalle) => detalle.estadoPreparacion !== 'listo') ?? comanda.items[0];
    const plato = this.fichas.porId(item.platilloId);
    const pedido = this.pedidos.porId(comanda.pedidoId);
    return {
      comanda,
      item,
      ingredientes:
        plato?.ingredientes.map(
          (ingrediente) =>
            `${ingrediente.nombre} ${ingrediente.cantidad} ${ingrediente.unidadMedida}`,
        ) ?? [],
      observacion: item.notas ?? pedido?.observaciones ?? 'Sin observaciones',
    };
  });

  readonly subtitulo = computed<string>(() => {
    const lista = this.comandas();
    if (lista.length === 0) {
      return 'Turno tarde · sin comandas activas';
    }
    const promedio = Math.round(
      lista.reduce((suma, comanda) => suma + comanda.minutos, 0) / lista.length,
    );
    return `Turno tarde · ${lista.length} comandas activas · promedio ${promedio} min`;
  });

  readonly ritmo = computed<RitmoItem[]>(() => {
    const lista = this.comandas();
    const items = lista.flatMap((comanda) => comanda.items);
    const guarniciones = items.filter((item) => this.esGuarnicion(item.nombre)).length;
    const enBrasa = items.filter(
      (item) => item.estadoPreparacion === 'en_preparacion',
    ).length;
    const enCola = lista.filter((comanda) =>
      comanda.items.every((item) => item.estadoPreparacion === 'pendiente'),
    ).length;
    const listos = items.filter((item) => item.estadoPreparacion === 'listo').length;
    return [
      { label: 'En cola', value: enCola, detalle: 'comandas', tono: 'neutral', icon: 'clipboard-text' },
      { label: 'En brasa', value: enBrasa, detalle: 'platos', tono: 'brand', icon: 'flame' },
      { label: 'Guarniciones', value: guarniciones, detalle: 'porciones', tono: 'warning', icon: 'shopping-cart' },
      { label: 'Listos', value: listos, detalle: 'para servir', tono: 'success', icon: 'check' },
    ];
  });

  readonly prioritarias = computed<number>(
    () => this.comandas().filter((comanda) => comanda.prioritaria).length,
  );

  readonly estaciones = computed<Estacion[]>(() => {
    const items = this.comandas()
      .flatMap((comanda) => comanda.items)
      .filter((item) => item.estadoPreparacion !== 'listo');
    const brasa = items.filter(
      (item) => !this.esGuarnicion(item.nombre) && !this.esBebida(item.nombre),
    ).length;
    const guarniciones = items.filter((item) => this.esGuarnicion(item.nombre)).length;
    const bebidas = items.filter((item) => this.esBebida(item.nombre)).length;
    const maximo = Math.max(brasa, guarniciones, bebidas, 1);
    return [
      { nombre: 'Brasa', cantidad: brasa, porcentaje: (brasa / maximo) * 100, tono: 'brand' },
      {
        nombre: 'Guarniciones',
        cantidad: guarniciones,
        porcentaje: (guarniciones / maximo) * 100,
        tono: 'warning',
      },
      { nombre: 'Bebidas', cantidad: bebidas, porcentaje: (bebidas / maximo) * 100, tono: 'info' },
    ];
  });

  readonly ritmoPromedio = computed<number>(() => {
    const lista = this.comandas();
    if (lista.length === 0) {
      return 0;
    }
    return Math.round(lista.reduce((suma, comanda) => suma + comanda.minutos, 0) / lista.length);
  });

  seleccionar(pedidoId: number): void {
    this.seleccionadaId.set(pedidoId);
  }

  esSeleccionada(pedidoId: number): boolean {
    return this.seleccionadaId() === pedidoId;
  }

  async marcarItem(comanda: ComandaVista, item: PedidoDetalle, event: Event): Promise<void> {
    event.stopPropagation();
    if (item.estadoPreparacion === 'listo') {
      return;
    }
    this.seleccionadaId.set(comanda.pedidoId);
    try {
      await this.cocina.marcarListo(comanda.pedidoId, item.id);
      this.avisar(`Plato listo · ${item.nombre}`);
    } catch (error) {
      this.avisar(mensajeError(error));
    }
  }

  async marcarFocoListo(): Promise<void> {
    const foco = this.foco();
    if (!foco || foco.item.estadoPreparacion === 'listo') {
      return;
    }
    try {
      await this.cocina.marcarListo(foco.comanda.pedidoId, foco.item.id);
      this.avisar(`Plato listo · ${foco.item.nombre}`);
    } catch (error) {
      this.avisar(mensajeError(error));
    }
  }

  avisarMozo(): void {
    const comanda = this.seleccionada();
    if (!comanda) {
      return;
    }
    this.avisar(`Aviso enviado al mozo · ${comanda.etiqueta}`);
  }

  estadoItem(item: PedidoDetalle): string {
    if (item.estadoPreparacion === 'listo') {
      return 'listo';
    }
    return item.estadoPreparacion === 'en_preparacion' ? 'en brasa' : 'en cola';
  }

  private avisar(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => this.toast.set(''), 2600);
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  private vista(comanda: ComandaKds): ComandaVista {
    const pedido = this.pedidos.porId(comanda.pedidoId);
    const cuenta = pedido?.cuentaId != null ? this.cuentas.porId(pedido.cuentaId) : null;
    const ronda = cuenta?.rondas.length ?? 1;
    const listos = comanda.items.filter((item) => item.estadoPreparacion === 'listo').length;
    const segundos = Math.max(0, Math.floor((AHORA - Date.parse(comanda.creadoEn)) / 1000));
    const referenciaMesa = comanda.referencia.startsWith('Mesa ');
    return {
      pedidoId: comanda.pedidoId,
      etiqueta: referenciaMesa
        ? `M${comanda.referencia.replace('Mesa ', '')}`
        : comanda.numero,
      tipo: referenciaMesa ? `Ronda ${ronda}` : comanda.origen,
      canal: this.canalEtiqueta(comanda),
      canalTono: this.canalTono(comanda),
      ronda,
      items: comanda.items,
      listos,
      segundos,
      minutos: comanda.minutos,
      prioritaria:
        comanda.minutos > UMBRAL_KDS_MIN && listos < comanda.items.length,
      progreso:
        comanda.items.length === 0 ? 0 : Math.round((listos / comanda.items.length) * 100),
      faltan: comanda.items.length - listos,
    };
  }

  private canalEtiqueta(comanda: ComandaKds): string {
    if (comanda.referencia === 'Rappi' || comanda.referencia === 'LlamaFood') {
      return comanda.referencia;
    }
    return comanda.origen;
  }

  private canalTono(comanda: ComandaKds): CanalTono {
    if (comanda.origen === 'Local') {
      return 'local';
    }
    if (comanda.referencia === 'Rappi') {
      return 'rappi';
    }
    if (comanda.referencia === 'LlamaFood') {
      return 'llamafood';
    }
    return 'delivery';
  }

  private esGuarnicion(nombre: string): boolean {
    const texto = nombre.toLowerCase();
    return texto.includes('papa') || texto.includes('ensalada') || texto.includes('arroz');
  }

  private esBebida(nombre: string): boolean {
    const texto = nombre.toLowerCase();
    return (
      texto.includes('chicha') ||
      texto.includes('gaseosa') ||
      texto.includes('limonada') ||
      texto.includes('bebida')
    );
  }
}
