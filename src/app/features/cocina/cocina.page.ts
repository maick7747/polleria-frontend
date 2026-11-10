import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  CocinaService,
  UMBRAL_KDS_MIN,
  type KdsMeta,
} from '../../core/data/cocina.service';
import { mensajeError } from '../../core/api/api.helpers';
import { CuentasService } from '../../core/data/cuentas.service';
import { FichasService } from '../../core/data/fichas.service';
import { RealtimeService } from '../../core/data/realtime.service';
import type {
  Curso,
  EstadoLineaKds,
  Estacion,
  Pedido,
  PedidoDetalle,
} from '../../core/models';
import { minutosEntre, turnoActual } from '../../core/utils/format';
import {
  CURSO_LABEL,
  ESTACION_LABEL,
  agruparAllDay,
  agruparAllDayMeta,
  cursoDe,
  estadoLinea,
  estacionDe,
  listoParaEntregar,
  pedidoCerrado,
  progresoRonda,
  type AllDayResumen,
  type ProgresoRonda,
} from '../../core/utils/kds';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type CanalTono = 'local' | 'delivery' | 'rappi' | 'llamafood';

interface LineaVista {
  item: PedidoDetalle;
  estado: EstadoLineaKds;
  estacion: Estacion;
  curso: Curso;
  prepMin: number | null;
  auto: boolean;
}

interface RondaVista {
  pedido: Pedido;
  pedidoId: number;
  etiqueta: string;
  ronda: string;
  canal: string;
  canalTono: CanalTono;
  minutos: number;
  prioritaria: boolean;
  lista: boolean;
  estadoEntrega: string | null;
  lineas: LineaVista[];
  progreso: ProgresoRonda;
  puedeTodoListo: boolean;
  puedeEntregar: boolean;
}

interface FocoVista {
  ronda: RondaVista;
  linea: LineaVista;
  ingredientes: string[];
  observacion: string;
}

interface Seleccion {
  pedidoId: number;
  detalleId: number;
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
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cocina.page.html',
  styleUrl: './cocina.page.css',
})
export class CocinaPage {
  private readonly cocina = inject(CocinaService);
  private readonly cuentas = inject(CuentasService);
  private readonly fichas = inject(FichasService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly umbral = UMBRAL_KDS_MIN;
  readonly reloj = reloj;
  readonly estacionLabel = ESTACION_LABEL;
  readonly cursoLabel = CURSO_LABEL;
  readonly estaciones: ReadonlyArray<{ valor: Estacion | 'todas'; label: string }> = [
    { valor: 'todas', label: 'Todas' },
    { valor: 'parrilla', label: 'Parrilla' },
    { valor: 'frituras', label: 'Frituras' },
    { valor: 'frios', label: 'Fríos' },
    { valor: 'bar', label: 'Bar' },
  ];
  readonly cursos: ReadonlyArray<{ valor: Curso | 'todos'; label: string }> = [
    { valor: 'todos', label: 'Todos' },
    { valor: 'entrada', label: 'Entradas' },
    { valor: 'fondo', label: 'Fondos' },
    { valor: 'postre', label: 'Postres' },
  ];

  private temporizador: number | null = null;
  private ultimaRevision = 0;

  readonly ahora = signal(Date.now());
  readonly pedidosKds = signal<Pedido[]>([]);
  readonly metaKds = signal<KdsMeta | null>(null);
  readonly filtroEstacion = signal<Estacion | 'todas'>('todas');
  readonly filtroCurso = signal<Curso | 'todos'>('todos');
  readonly seleccion = signal<Seleccion | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly accionando = signal<string | null>(null);
  readonly toast = signal<string>('');

  constructor() {
    const relojIntervalo = setInterval(() => this.ahora.set(Date.now()), 10000);
    const refresco = setInterval(() => void this.refrescar(true), 10000);
    this.realtime.iniciar();
    // Realtime adelanta el refresco del KDS; el intervalo de 10 s se mantiene.
    effect(() => {
      const revision = this.realtime.revision();
      if (revision === this.ultimaRevision) {
        return;
      }
      this.ultimaRevision = revision;
      if (revision > 0) {
        void this.refrescar(true);
      }
    });
    this.destroyRef.onDestroy(() => {
      clearInterval(relojIntervalo);
      clearInterval(refresco);
      this.realtime.detener();
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    this.cargando.set(true);
    try {
      await Promise.all([
        this.cargarKds(false),
        this.fichas.cargar(),
        this.cuentas.cargar(),
      ]);
      this.ajustarSeleccion();
    } finally {
      this.cargando.set(false);
    }
  }

  // Refresco periódico del KDS (silencioso salvo el botón Reintentar).
  private async refrescar(silencioso = true): Promise<void> {
    if (silencioso && document.visibilityState !== 'visible') {
      return;
    }
    await Promise.all([
      this.cargarKds(silencioso),
      this.cuentas.cargar(true),
    ]);
  }

  private async cargarKds(silencioso: boolean): Promise<boolean> {
    if (!silencioso) {
      this.error.set(null);
    }
    try {
      const resultado = await this.cocina.listKds();
      if (resultado.changed) {
        this.pedidosKds.set(resultado.pedidos);
        this.metaKds.set(resultado.meta);
        this.ajustarSeleccion();
      }
      this.error.set(null);
      return true;
    } catch (error) {
      if (!silencioso || this.pedidosKds().length === 0) {
        this.error.set(mensajeError(error));
      }
      return false;
    }
  }

  reintentar(): void {
    void this.inicializar();
  }

  private ajustarSeleccion(): void {
    const actual = this.seleccion();
    if (!actual) {
      return;
    }
    const pedido = this.pedidosKds().find((p) => p.id === actual.pedidoId);
    if (!pedido || pedidoCerrado(pedido)) {
      this.seleccion.set(null);
    }
  }

  readonly rondas = computed<RondaVista[]>(() => {
    const filtroEst = this.filtroEstacion();
    const filtroCurso = this.filtroCurso();
    const ahora = this.ahora();
    return this.pedidosKds()
      .filter((pedido) => !pedidoCerrado(pedido))
      .map((pedido) => this.aRonda(pedido, ahora, filtroEst, filtroCurso))
      .filter((ronda): ronda is RondaVista => ronda !== null)
      .sort((a, b) => b.minutos - a.minutos);
  });

  readonly stats = computed(() => {
    const activos = this.pedidosKds().filter((pedido) => !pedidoCerrado(pedido));
    const ahora = this.ahora();
    const listas = activos.filter((pedido) => listoParaEntregar(pedido)).length;
    const retrasadas = activos.filter(
      (pedido) =>
        minutosEntre(pedido.fechaPedido, ahora) > this.umbral &&
        !listoParaEntregar(pedido),
    ).length;
    return {
      enCocina: activos.length,
      listas,
      retrasadas,
      sla: this.umbral,
      rondas: activos.length,
    };
  });

  readonly allDay = computed<AllDayResumen>(() => {
    const filtro = { estacion: this.filtroEstacion(), curso: this.filtroCurso() };
    const meta = this.metaKds();
    // El meta del backend es global y no trae `curso`; para el filtro de curso
    // se recalcula con las líneas de esta página (el KDS carga todas).
    if (filtro.curso === 'todos' && meta && meta.allDay.length > 0) {
      return agruparAllDayMeta(
        meta.allDay.map((item) => ({
          platillo_id: item.platilloId,
          platillo_nombre: item.platilloNombre,
          estacion: item.estacion,
          cantidad: item.cantidad,
          en_fuego: item.enFuego,
        })),
        filtro,
      );
    }
    const items = this.pedidosKds()
      .filter((pedido) => !pedidoCerrado(pedido))
      .flatMap((pedido) => pedido.items);
    return agruparAllDay(items, filtro);
  });

  readonly subtitulo = computed<string>(() => {
    const rondas = this.rondas().length;
    const turno = turnoActual();
    if (rondas === 0) {
      return `${turno} · sin comandas activas`;
    }
    const ahora = this.ahora();
    const activos = this.pedidosKds().filter((pedido) => !pedidoCerrado(pedido));
    const promedio = Math.round(
      activos.reduce(
        (suma, pedido) => suma + minutosEntre(pedido.fechaPedido, ahora),
        0,
      ) / Math.max(1, activos.length),
    );
    return `${turno} · ${rondas} rondas visibles · promedio ${promedio} min`;
  });

  readonly foco = computed<FocoVista | null>(() => {
    const rondas = this.rondas();
    if (rondas.length === 0) {
      return null;
    }
    const seleccion = this.seleccion();
    let ronda =
      (seleccion && rondas.find((actual) => actual.pedidoId === seleccion.pedidoId)) || null;
    if (!ronda) {
      ronda =
        rondas.find((actual) =>
          actual.lineas.some((linea) => linea.estado !== 'entregado'),
        ) ?? rondas[0];
    }
    const linea =
      (seleccion &&
        ronda.lineas.find((actual) => actual.item.id === seleccion.detalleId)) ||
      ronda.lineas.find((actual) => actual.estado !== 'entregado') ||
      ronda.lineas[0] ||
      null;
    if (!linea) {
      return null;
    }
    const plato = this.fichas.porId(linea.item.platilloId);
    return {
      ronda,
      linea,
      ingredientes:
        plato?.ingredientes.map(
          (ingrediente) =>
            `${ingrediente.nombre} ${ingrediente.cantidad} ${ingrediente.unidadMedida}`,
        ) ?? [],
      observacion:
        linea.item.notas ?? ronda.pedido.observaciones ?? 'Sin observaciones',
    };
  });

  filtrarEstacion(valor: Estacion | 'todas'): void {
    this.filtroEstacion.set(valor);
  }

  filtrarCurso(valor: Curso | 'todos'): void {
    this.filtroCurso.set(valor);
  }

  seleccionarLinea(ronda: RondaVista, linea: LineaVista, event?: Event): void {
    event?.stopPropagation();
    this.seleccion.set({ pedidoId: ronda.pedidoId, detalleId: linea.item.id });
  }

  esFoco(ronda: RondaVista, linea: LineaVista): boolean {
    const seleccion = this.seleccion();
    return (
      seleccion?.pedidoId === ronda.pedidoId &&
      seleccion?.detalleId === linea.item.id
    );
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

  accionTexto(estado: EstadoLineaKds): string {
    switch (estado) {
      case 'pendiente':
        return 'Iniciar';
      case 'en_preparacion':
        return 'Listo';
      case 'listo':
        return 'Entregar';
      default:
        return '';
    }
  }

  async accionLinea(
    ronda: RondaVista,
    linea: LineaVista,
    event: Event,
  ): Promise<void> {
    event.stopPropagation();
    if (this.accionando() || linea.estado === 'entregado') {
      return;
    }
    this.seleccion.set({ pedidoId: ronda.pedidoId, detalleId: linea.item.id });
    const clave = `linea-${linea.item.id}`;
    this.accionando.set(clave);
    try {
      if (linea.estado === 'pendiente') {
        await this.cocina.marcarEstado(ronda.pedidoId, linea.item.id, 'en_preparacion');
        this.avisar(`En preparación · ${linea.item.nombre}`);
      } else if (linea.estado === 'en_preparacion') {
        await this.cocina.marcarEstado(ronda.pedidoId, linea.item.id, 'listo');
        this.avisar(`Listo · ${linea.item.nombre}`);
      } else {
        await this.cocina.entregarPlato(ronda.pedidoId, linea.item.id);
        this.avisar(`Entregado · ${linea.item.nombre}`);
      }
      await this.refrescar(true);
    } catch (error) {
      this.avisar(mensajeError(error));
    } finally {
      this.accionando.set(null);
    }
  }

  async marcarTodoListo(ronda: RondaVista): Promise<void> {
    if (this.accionando() || !ronda.puedeTodoListo) {
      return;
    }
    this.accionando.set(`ronda-${ronda.pedidoId}`);
    try {
      await this.cocina.marcarTodoListo(ronda.pedidoId);
      this.avisar(`${ronda.etiqueta} · lista para entregar`);
      await this.refrescar(true);
    } catch (error) {
      this.avisar(mensajeError(error));
    } finally {
      this.accionando.set(null);
    }
  }

  async entregarRonda(ronda: RondaVista): Promise<void> {
    if (this.accionando() || !ronda.puedeEntregar) {
      return;
    }
    this.accionando.set(`ronda-${ronda.pedidoId}`);
    try {
      await this.cocina.entregarRonda(ronda.pedidoId);
      this.avisar(`${ronda.etiqueta} · ronda entregada`);
      await this.refrescar(true);
    } catch (error) {
      this.avisar(mensajeError(error));
    } finally {
      this.accionando.set(null);
    }
  }

  async marcarFocoListo(): Promise<void> {
    const foco = this.foco();
    if (!foco || foco.linea.estado === 'listo' || foco.linea.estado === 'entregado') {
      return;
    }
    if (this.accionando()) {
      return;
    }
    this.accionando.set(`foco-${foco.linea.item.id}`);
    try {
      await this.cocina.marcarEstado(foco.ronda.pedidoId, foco.linea.item.id, 'listo');
      this.avisar(`Listo · ${foco.linea.item.nombre}`);
      await this.refrescar(true);
    } catch (error) {
      this.avisar(mensajeError(error));
    } finally {
      this.accionando.set(null);
    }
  }

  rechazarFoco(): void {
    const foco = this.foco();
    if (!foco) {
      return;
    }
    this.avisar(`Rechazo registrado (demo) · ${foco.linea.item.nombre}`);
  }

  private aRonda(
    pedido: Pedido,
    ahora: number,
    filtroEst: Estacion | 'todas',
    filtroCurso: Curso | 'todos',
  ): RondaVista | null {
    const visibles = pedido.items.filter((item) => {
      const estacion = estacionDe(item);
      const curso = cursoDe(item);
      return (
        (filtroEst === 'todas' || estacion === filtroEst) &&
        (filtroCurso === 'todos' || curso === filtroCurso)
      );
    });
    if (visibles.length === 0) {
      return null;
    }
    const minutos = minutosEntre(pedido.fechaPedido, ahora);
    const lista = listoParaEntregar(pedido);
    return {
      pedido,
      pedidoId: pedido.id,
      etiqueta: this.etiquetaDe(pedido),
      ronda: this.rondaDe(pedido),
      canal: this.canalEtiqueta(pedido),
      canalTono: this.canalTono(pedido),
      minutos,
      prioritaria: minutos > this.umbral && !lista,
      lista,
      estadoEntrega: pedido.estadoEntrega ?? null,
      lineas: visibles.map((item) => this.aLinea(item)),
      progreso: progresoRonda(pedido.items),
      puedeTodoListo: pedido.items.some(
        (item) =>
          !item.entregadoEn &&
          (item.estadoPreparacion === 'pendiente' ||
            item.estadoPreparacion === 'en_preparacion'),
      ),
      puedeEntregar: lista,
    };
  }

  private aLinea(item: PedidoDetalle): LineaVista {
    const estado = estadoLinea(item);
    const estacion = estacionDe(item);
    return {
      item,
      estado,
      estacion,
      curso: cursoDe(item),
      prepMin: item.prepMin ?? null,
      auto: estacion === 'bar' && estado === 'listo',
    };
  }

  private etiquetaDe(pedido: Pedido): string {
    if (pedido.mesaNumero != null) {
      return `MESA ${pad2(pedido.mesaNumero)}`;
    }
    const canal = this.canalEtiqueta(pedido).toUpperCase();
    return `${canal} ${pedido.numero}`;
  }

  private rondaDe(pedido: Pedido): string {
    const cuenta =
      pedido.cuentaId != null ? this.cuentas.porId(pedido.cuentaId) : undefined;
    const indice = cuenta?.rondas.findIndex((ronda) => ronda.id === pedido.id) ?? -1;
    if (indice >= 0) {
      return `Ronda ${indice + 1}`;
    }
    if (pedido.mesaId != null) {
      const mismaMesa = this.pedidosKds()
        .filter(
          (actual) =>
            actual.mesaId === pedido.mesaId && actual.cuentaId === pedido.cuentaId,
        )
        .sort((a, b) => Date.parse(a.fechaPedido) - Date.parse(b.fechaPedido));
      const posicion = mismaMesa.findIndex((actual) => actual.id === pedido.id);
      return `Ronda ${posicion >= 0 ? posicion + 1 : 1}`;
    }
    return pedido.tipoConsumo === 'delivery' ? 'Delivery' : 'Para llevar';
  }

  private canalEtiqueta(pedido: Pedido): string {
    switch (pedido.canal) {
      case 'whatsapp':
        return 'WhatsApp';
      case 'delivery_propio':
        return 'Delivery propio';
      case 'rappi':
        return 'Rappi';
      case 'llamafood':
        return 'LlamaFood';
      default:
        return pedido.tipoConsumo === 'para_llevar' ? 'Para llevar' : 'Local';
    }
  }

  private canalTono(pedido: Pedido): CanalTono {
    if (pedido.canal === 'local') {
      return 'local';
    }
    if (pedido.canal === 'rappi') {
      return 'rappi';
    }
    if (pedido.canal === 'llamafood') {
      return 'llamafood';
    }
    return 'delivery';
  }

  private avisar(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => this.toast.set(''), 2600);
  }
}
