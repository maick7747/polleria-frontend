import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { USE_API } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import {
  COMISION_PLATAFORMA,
  DeliveryService,
} from '../../core/data/delivery.service';
import { PedidosService } from '../../core/data/pedidos.service';
import type { Pedido, PedidoDetalle } from '../../core/models';
import {
  formatearMoneda,
  hora,
  minutosEntre,
  round2,
  turnoActual,
} from '../../core/utils/format';
import { iniciarRefresco } from '../../core/utils/refresco';
import {
  ChipComponent,
  type ChipVariant,
} from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type GrupoCanal = 'mesa' | 'mostrador' | 'delivery' | 'apps';
type CanalVista = 'mesa' | 'mostrador' | 'delivery' | 'rappi' | 'llamafood';
type FiltroCanal = 'todas' | GrupoCanal;
type FiltroEstado =
  | 'todos'
  | 'borrador'
  | 'en_cocina'
  | 'servido'
  | 'listo'
  | 'en_camino'
  | 'entregado';
type EstadoVista = Exclude<FiltroEstado, 'todos'>;
type TipoAccion =
  'aceptar' | 'asignar' | 'entregar' | 'cobrar' | 'liquidar' | 'ver';
type TonoAccion = 'brand' | 'dark' | 'ghost';

interface FilaPedido {
  id: number;
  pedido: Pedido;
  numero: string;
  canal: CanalVista;
  grupo: GrupoCanal;
  canalLabel: string;
  destinoTitulo: string;
  destinoMeta: string;
  items: number;
  minutos: number;
  estado: EstadoVista;
  estadoLabel: string;
  tono: ChipVariant;
  total: number;
  comisionPct: number;
  comision: number;
  neto: number;
  accionTipo: TipoAccion;
  accionLabel: string;
  accionTono: TonoAccion;
}

interface Etapa {
  label: string;
  detalle: string;
  done: boolean;
  active: boolean;
}

const REFRESCO_MS = 20000;
const RELOJ_MS = 30000;

const CANALES: readonly { id: FiltroCanal; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'mesa', label: 'Mesas' },
  { id: 'mostrador', label: 'Mostrador' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'apps', label: 'Apps' },
];

const ESTADOS: readonly { id: FiltroEstado; label: string }[] = [
  { id: 'todos', label: 'Todos los estados' },
  { id: 'borrador', label: 'Borrador' },
  { id: 'en_cocina', label: 'En cocina' },
  { id: 'servido', label: 'Servido' },
  { id: 'listo', label: 'Listo' },
  { id: 'en_camino', label: 'En camino' },
  { id: 'entregado', label: 'Entregado' },
];

/**
 * Bandeja única de pedidos: mesa, mostrador, delivery propio y apps.
 *
 * El canal deja de ser un módulo y pasa a ser un atributo del pedido. Cada
 * fila muestra la acción propia de su canal y estado; el detalle conserva la
 * información específica (ítems, comisión de apps, repartidor de delivery).
 */
@Component({
  selector: 'app-pedidos-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pedidos.page.html',
  styleUrl: './pedidos.page.css',
})
export class PedidosPage {
  private readonly pedidosService = inject(PedidosService);
  private readonly delivery = inject(DeliveryService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;

  readonly moneda = formatearMoneda;
  readonly canales = CANALES;
  readonly estados = ESTADOS;

  // Permisos por acción. El Admin es de solo lectura: ve la bandeja, pero los
  // botones quedan deshabilitados en lugar de fallar con un 403.
  readonly puedeCaja = this.auth.hasPermission('caja.cobrar');
  readonly puedeApps = this.auth.hasPermission('delivery.externo');
  readonly puedeDelivery = this.auth.hasPermission('delivery.propio');

  readonly filtroCanal = signal<FiltroCanal>('todas');
  readonly filtroEstado = signal<FiltroEstado>('todos');
  readonly busqueda = signal<string>('');
  readonly seleccionadoId = signal<number | null>(null);
  readonly repartidor = signal<string>('');

  readonly cargandoInicial = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly actualizado = signal<string>('—');
  readonly ahora = signal<number>(Date.now());

  readonly accionando = signal<string | null>(null);
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly esRepartidor = computed<boolean>(() =>
    this.auth.hasRole('Repartidor'),
  );

  readonly repartidoresDisponibles = computed<
    readonly { id: number; nombre: string }[]
  >(() => {
    const mapa = new Map<number, string>();
    for (const usuario of this.delivery.repartidores()) {
      mapa.set(usuario.id, usuario.nombre);
    }
    for (const conocido of this.delivery.repartidoresConocidos()) {
      if (!mapa.has(conocido.id)) {
        mapa.set(conocido.id, conocido.nombre);
      }
    }
    return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre }));
  });

  /** Pedidos vivos (sin cobrar ni cancelar), acotados al repartidor si aplica. */
  readonly filas = computed<FilaPedido[]>(() => {
    const usuario = this.auth.usuario();
    const usuarioId = usuario?.id ?? null;
    const soloPropias = this.esRepartidor();
    return this.pedidosService
      .pedidos()
      .filter(
        (pedido) =>
          pedido.estado !== 'cobrado' && pedido.estado !== 'cancelado',
      )
      .filter(
        (pedido) =>
          !soloPropias ||
          (usuarioId !== null && pedido.repartidorId === usuarioId),
      )
      .slice()
      .sort((a, b) => Date.parse(b.fechaPedido) - Date.parse(a.fechaPedido))
      .map((pedido) => this.aFila(pedido));
  });

  readonly totalVivas = computed<number>(() => this.filas().length);

  readonly visibles = computed<FilaPedido[]>(() => {
    const canal = this.filtroCanal();
    const estado = this.filtroEstado();
    const texto = this.busqueda().trim().toLowerCase();
    return this.filas().filter((fila) => {
      if (canal !== 'todas' && fila.grupo !== canal) {
        return false;
      }
      if (estado !== 'todos' && fila.estado !== estado) {
        return false;
      }
      return !texto || this.coincide(fila, texto);
    });
  });

  readonly seleccionada = computed<FilaPedido | null>(() => {
    const id = this.seleccionadoId();
    if (id === null) {
      return null;
    }
    return this.filas().find((fila) => fila.id === id) ?? null;
  });

  readonly resumen = computed(() => {
    const filas = this.filas();
    const sumar = (grupo: GrupoCanal): number =>
      filas.filter((fila) => fila.grupo === grupo).length;
    return {
      total: filas.length,
      mesas: sumar('mesa'),
      mostrador: sumar('mostrador'),
      delivery: sumar('delivery'),
      apps: sumar('apps'),
      porAceptar: filas.filter(
        (fila) => fila.grupo === 'apps' && fila.estado === 'borrador',
      ).length,
      mayorEspera: filas.reduce(
        (mayor, fila) => Math.max(mayor, fila.minutos),
        0,
      ),
      totalMonto: round2(filas.reduce((suma, fila) => suma + fila.total, 0)),
    };
  });

  readonly subtitulo = computed<string>(() => {
    // `actualizado` cambia en cada carga y fuerza a reevaluar el turno real.
    this.actualizado();
    const total = this.totalVivas();
    const porAceptar = this.resumen().porAceptar;
    const aceptacion =
      porAceptar === 1
        ? '1 espera aceptación'
        : `${porAceptar} esperan aceptación`;
    const ordenes = total === 1 ? '1 orden viva' : `${total} órdenes vivas`;
    return `${ordenes} · ${aceptacion} · ${turnoActual()}`;
  });

  readonly turnoCapitalizado = computed<string>(() => {
    const turno = turnoActual();
    return `${turno.charAt(0).toUpperCase()}${turno.slice(1)}`;
  });

  readonly mensajeVacio = computed<string>(() => {
    if (this.filas().length === 0) {
      return this.esRepartidor()
        ? 'No tienes pedidos asignados en este momento. Los nuevos repartos aparecerán aquí.'
        : 'No hay pedidos vivos. Los pedidos aparecen al crearse y salen de la bandeja al cobrarse o cancelarse.';
    }
    return 'Ningún pedido coincide con el canal, el estado o la búsqueda seleccionados.';
  });

  /** Etapas del pedido seleccionado: Recibido → Aceptado → En cocina → Entregado → Liquidado. */
  readonly etapas = computed<Etapa[]>(() => {
    const fila = this.seleccionada();
    if (!fila) {
      return [];
    }
    const pedido = fila.pedido;
    const aceptado = pedido.estado !== 'borrador';
    const enCocina =
      aceptado &&
      (pedido.estado === 'en_cocina' ||
        pedido.estado === 'servido' ||
        fila.estado === 'listo' ||
        fila.estado === 'en_camino' ||
        fila.estado === 'entregado');
    const entregado =
      fila.grupo === 'delivery'
        ? pedido.estadoEntrega === 'entregado' || Boolean(pedido.fechaEntrega)
        : pedido.estado === 'servido' ||
          pedido.estadoEntrega === 'entregado' ||
          Boolean(pedido.fechaEntrega);

    const base: Omit<Etapa, 'active'>[] = [
      {
        label: 'Recibido',
        detalle: `${hora(pedido.fechaPedido)} · ${fila.canalLabel}`,
        done: true,
      },
      {
        label: 'Aceptado',
        detalle: aceptado ? 'Enviado a cocina' : 'Pendiente de aceptación',
        done: aceptado,
      },
      {
        label: 'En cocina',
        detalle: enCocina ? 'Preparación en curso o completada' : 'Pendiente',
        done: enCocina,
      },
      {
        label: 'Entregado',
        detalle: entregado
          ? 'Entregado al cliente'
          : fila.grupo === 'delivery'
            ? 'Pendiente de reparto'
            : 'Pendiente de entrega',
        done: entregado,
      },
      {
        label: 'Liquidado',
        detalle:
          fila.grupo === 'apps'
            ? 'Se cierra en Caja → Liquidaciones'
            : fila.grupo === 'delivery'
              ? 'El contraentrega se registra en Caja'
              : 'Se cobra en Caja',
        done: false,
      },
    ];

    let marcado = false;
    return base.map((etapa) => {
      const active = !marcado && !etapa.done;
      if (active) {
        marcado = true;
      }
      return { ...etapa, active };
    });
  });

  constructor() {
    const reloj = window.setInterval(
      () => this.ahora.set(Date.now()),
      RELOJ_MS,
    );
    iniciarRefresco({
      intervaloMs: REFRESCO_MS,
      destroyRef: this.destroyRef,
      tarea: async () => {
        await this.cargar(true);
      },
    });
    this.destroyRef.onDestroy(() => {
      window.clearInterval(reloj);
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
    void this.cargar();
  }

  // -------------------------------------------------------------------------
  // Carga y filtros
  // -------------------------------------------------------------------------

  private async cargar(silencioso = false): Promise<void> {
    const ok = await this.pedidosService.cargar({ limit: 100 });
    // En modo demo `cargar` devuelve false sin pedir a la API: los mocks ya
    // están en el servicio y son válidos.
    if (ok || !USE_API) {
      this.error.set(null);
      this.actualizado.set(hora(new Date().toISOString()));
    } else if (!silencioso || this.pedidosService.pedidos().length === 0) {
      this.error.set(
        this.pedidosService.error() ?? 'No se pudieron cargar los pedidos.',
      );
    }
    this.cargandoInicial.set(false);
  }

  actualizar(): void {
    void this.cargar();
  }

  reintentar(): void {
    this.error.set(null);
    void this.cargar();
  }

  cambiarCanal(canal: FiltroCanal): void {
    this.filtroCanal.set(canal);
  }

  onEstado(event: Event): void {
    this.filtroEstado.set(
      (event.target as HTMLSelectElement).value as FiltroEstado,
    );
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  limpiarFiltros(): void {
    this.filtroCanal.set('todas');
    this.filtroEstado.set('todos');
    this.busqueda.set('');
  }

  conteo(canal: FiltroCanal): number {
    const filas = this.filas();
    return canal === 'todas'
      ? filas.length
      : filas.filter((fila) => fila.grupo === canal).length;
  }

  // -------------------------------------------------------------------------
  // Selección y detalle
  // -------------------------------------------------------------------------

  seleccionar(id: number): void {
    if (this.seleccionadoId() === id) {
      this.cerrarDetalle();
      return;
    }
    this.abrirDetalle(id);
  }

  private abrirDetalle(id: number): void {
    this.seleccionadoId.set(id);
    const fila = this.filas().find((actual) => actual.id === id);
    this.repartidor.set(
      fila?.pedido.repartidorId != null ? String(fila.pedido.repartidorId) : '',
    );
  }

  cerrarDetalle(): void {
    this.seleccionadoId.set(null);
  }

  onRepartidor(event: Event): void {
    this.repartidor.set((event.target as HTMLSelectElement).value);
  }

  nombreRepartidor(id: number): string {
    return (
      this.repartidoresDisponibles().find((repartidor) => repartidor.id === id)
        ?.nombre ?? `Repartidor ${id}`
    );
  }

  puedeAccion(fila: FilaPedido): boolean {
    switch (fila.accionTipo) {
      case 'aceptar':
        return this.puedeApps;
      case 'liquidar':
        return this.puedeApps || this.puedeCaja;
      case 'asignar':
      case 'entregar':
        return this.puedeDelivery;
      case 'cobrar':
        return this.puedeCaja;
      default:
        return true;
    }
  }

  puedeCancelar(fila: FilaPedido): boolean {
    if (fila.estado === 'entregado') {
      return false;
    }
    if (fila.grupo === 'delivery') {
      return this.puedeDelivery;
    }
    if (fila.grupo === 'apps') {
      return this.puedeApps;
    }
    return false;
  }

  notaAccion(fila: FilaPedido): string {
    if (fila.grupo === 'apps') {
      return 'Al liquidar, el pedido aparecerá en Caja → Liquidaciones.';
    }
    if (fila.grupo === 'delivery') {
      return 'La entrega se confirma aquí; el contraentrega se registra en Caja.';
    }
    return 'El cobro se realiza en Caja, con un comprobante único por cuenta.';
  }

  etiquetaAccion(fila: FilaPedido): string {
    return this.puedeAccion(fila)
      ? fila.accionLabel
      : `Sin permiso para ${fila.accionLabel.toLowerCase()}`;
  }

  // -------------------------------------------------------------------------
  // Acciones de la bandeja
  // -------------------------------------------------------------------------

  ejecutarAccion(fila: FilaPedido, event: Event): void {
    event.stopPropagation();
    if (!this.puedeAccion(fila) || this.accionando() !== null) {
      return;
    }
    switch (fila.accionTipo) {
      case 'aceptar':
        void this.aceptar(fila);
        break;
      case 'asignar':
        this.abrirDetalle(fila.id);
        break;
      case 'entregar':
        void this.entregar(fila);
        break;
      case 'cobrar':
        this.cobrar(fila);
        break;
      case 'liquidar':
        this.liquidar();
        break;
      default:
        this.abrirDetalle(fila.id);
        break;
    }
  }

  async aceptarSeleccionado(): Promise<void> {
    const fila = this.seleccionada();
    if (fila) {
      await this.aceptar(fila);
    }
  }

  async entregarSeleccionado(): Promise<void> {
    const fila = this.seleccionada();
    if (fila) {
      await this.entregar(fila);
    }
  }

  cobrarSeleccionado(): void {
    const fila = this.seleccionada();
    if (fila) {
      this.cobrar(fila);
    }
  }

  liquidar(): void {
    void this.router.navigate(['/cerrar-cuenta'], {
      queryParams: { tab: 'apps' },
    });
  }

  async asignarRepartidor(): Promise<void> {
    const fila = this.seleccionada();
    if (!fila || fila.grupo !== 'delivery') {
      return;
    }
    const repartidorId = Number(this.repartidor());
    if (!Number.isInteger(repartidorId) || repartidorId <= 0) {
      this.avisar('Selecciona un repartidor para asignar el pedido.', true);
      return;
    }
    if (!this.puedeDelivery || this.accionando() !== null) {
      return;
    }

    this.accionando.set(`asignar-${fila.id}`);
    const ok = await this.delivery.asignarRepartidor(fila.id, repartidorId);
    this.accionando.set(null);

    if (!ok) {
      this.avisar(
        this.delivery.propiosError() ?? 'No se pudo asignar el repartidor.',
        true,
      );
      return;
    }
    this.avisar(
      `${fila.numero} asignado a ${this.nombreRepartidor(repartidorId)}`,
    );
    await this.cargar(true);
  }

  private async aceptar(fila: FilaPedido): Promise<void> {
    if (!this.puedeApps || this.accionando() !== null) {
      return;
    }
    this.abrirDetalle(fila.id);
    this.accionando.set(`aceptar-${fila.id}`);
    const ok = await this.delivery.aceptarExterno(fila.id);
    this.accionando.set(null);

    if (!ok) {
      this.avisar(
        this.delivery.externosError() ?? 'No se pudo aceptar el pedido.',
        true,
      );
      return;
    }
    this.avisar(`${fila.numero} aceptado · enviado a cocina`);
    if (!USE_API) {
      // El servicio de delivery actualiza su propia bandeja; el pedido vive en
      // PedidosService, así que en demo se refleja también aquí.
      this.pedidosService.cambiarEstado(fila.id, 'en_cocina');
    }
    await this.cargar(true);
  }

  private async entregar(fila: FilaPedido): Promise<void> {
    if (!this.puedeDelivery || this.accionando() !== null) {
      return;
    }
    this.abrirDetalle(fila.id);
    this.accionando.set(`entregar-${fila.id}`);
    const ok = await this.delivery.cambiarEstadoEntrega(fila.id, 'entregado');
    this.accionando.set(null);

    if (!ok) {
      this.avisar(
        this.delivery.propiosError() ??
          'No se pudo marcar el pedido como entregado.',
        true,
      );
      return;
    }
    this.avisar(`${fila.numero} entregado`);
    if (!USE_API) {
      this.pedidosService.cambiarEstado(fila.id, 'cobrado');
    }
    await this.cargar(true);
  }

  private cobrar(fila: FilaPedido): void {
    const cuentaId = fila.pedido.cuentaId;
    if (cuentaId != null) {
      void this.router.navigate(['/cerrar-cuenta', cuentaId]);
      return;
    }
    void this.router.navigate(['/cerrar-cuenta']);
  }

  // -------------------------------------------------------------------------
  // Construcción de filas
  // -------------------------------------------------------------------------

  private aFila(pedido: Pedido): FilaPedido {
    const canal = this.canalDe(pedido);
    const grupo: GrupoCanal =
      canal === 'rappi' || canal === 'llamafood' ? 'apps' : canal;
    const items = pedido.items ?? [];
    const cantidad = items.reduce(
      (suma, item) => suma + (Number(item.cantidad) || 0),
      0,
    );
    const minutos = minutosEntre(pedido.fechaPedido, this.ahora());
    const estado = this.estadoDe(pedido, items);
    const accion = this.accionDe(grupo, estado.key, pedido);
    const comisionPct =
      canal === 'rappi'
        ? COMISION_PLATAFORMA.rappi
        : canal === 'llamafood'
          ? COMISION_PLATAFORMA.llamafood
          : 0;
    const total = Number(pedido.total) || 0;
    const comisionGuardada = Number(pedido.comisionPlataforma) || 0;
    const comision =
      comisionPct > 0
        ? comisionGuardada > 0
          ? comisionGuardada
          : round2((total * comisionPct) / 100)
        : 0;

    return {
      id: pedido.id,
      pedido,
      numero: pedido.numero,
      canal,
      grupo,
      canalLabel: this.canalLabel(pedido, canal),
      destinoTitulo: this.destinoTitulo(pedido, grupo),
      destinoMeta: this.destinoMeta(pedido, grupo),
      items: cantidad,
      minutos: Number.isFinite(minutos) ? minutos : 0,
      estado: estado.key,
      estadoLabel: estado.label,
      tono: estado.tono,
      total,
      comisionPct,
      comision,
      neto: round2(total - comision),
      accionTipo: accion.tipo,
      accionLabel: accion.label,
      accionTono: accion.tono,
    };
  }

  private canalDe(pedido: Pedido): CanalVista {
    const canal = String(pedido.canal);
    if (canal === 'local') {
      return pedido.tipoConsumo === 'para_llevar' ? 'mostrador' : 'mesa';
    }
    if (canal === 'rappi') {
      return 'rappi';
    }
    if (canal === 'llamafood') {
      return 'llamafood';
    }
    // whatsapp, telefono y delivery_propio comparten la operación de reparto.
    return 'delivery';
  }

  private canalLabel(pedido: Pedido, canal: CanalVista): string {
    switch (canal) {
      case 'mesa': {
        const numero = pedido.mesaNumero ?? pedido.mesaId;
        return numero != null
          ? `Mesa ${String(numero).padStart(2, '0')}`
          : 'Mesa';
      }
      case 'mostrador':
        return 'Mostrador';
      case 'delivery': {
        const origen = String(pedido.canal);
        if (origen === 'whatsapp') {
          return 'WhatsApp';
        }
        if (origen === 'telefono') {
          return 'Teléfono';
        }
        return 'Delivery';
      }
      case 'rappi':
        return 'Rappi';
      case 'llamafood':
        return 'LlamaFood';
    }
  }

  private destinoTitulo(pedido: Pedido, grupo: GrupoCanal): string {
    const cliente = pedido.clienteNombre?.trim();
    if (cliente) {
      return cliente;
    }
    switch (grupo) {
      case 'mesa':
        return 'Salón principal';
      case 'mostrador':
        return 'Cliente mostrador';
      case 'delivery':
        return 'Cliente delivery';
      case 'apps':
        return 'Cliente app';
    }
  }

  private destinoMeta(pedido: Pedido, grupo: GrupoCanal): string {
    switch (grupo) {
      case 'mesa':
        return `Ronda · ${hora(pedido.fechaPedido)}`;
      case 'mostrador':
        return 'Para llevar · sin mesa';
      case 'delivery': {
        const direccion = pedido.direccionEntrega?.trim() || 'Sin dirección';
        const repartidor =
          pedido.repartidorId != null
            ? this.nombreRepartidor(pedido.repartidorId)
            : 'sin repartidor';
        return `${direccion} · ${repartidor}`;
      }
      case 'apps': {
        const direccion = pedido.direccionEntrega?.trim() || 'Sin dirección';
        const referencia = pedido.referenciaEntrega?.trim() || 'sin referencia';
        return `${direccion} · ${referencia}`;
      }
    }
  }

  private estadoDe(
    pedido: Pedido,
    items: readonly PedidoDetalle[],
  ): { key: EstadoVista; label: string; tono: ChipVariant } {
    if (pedido.estado === 'borrador') {
      return { key: 'borrador', label: 'Borrador', tono: 'neutral' };
    }
    if (pedido.estadoEntrega === 'en_camino') {
      return { key: 'en_camino', label: 'En camino', tono: 'info' };
    }
    if (pedido.estadoEntrega === 'entregado' || pedido.fechaEntrega) {
      return { key: 'entregado', label: 'Entregado', tono: 'success' };
    }
    if (pedido.estado === 'servido') {
      return { key: 'servido', label: 'Servido', tono: 'warning' };
    }
    const todosListos =
      items.length > 0 &&
      items.every((item) => item.estadoPreparacion === 'listo');
    if (todosListos) {
      return { key: 'listo', label: 'Listo', tono: 'success' };
    }
    return { key: 'en_cocina', label: 'En cocina', tono: 'info' };
  }

  private accionDe(
    grupo: GrupoCanal,
    estado: EstadoVista,
    pedido: Pedido,
  ): { tipo: TipoAccion; label: string; tono: TonoAccion } {
    if (grupo === 'apps') {
      if (estado === 'borrador') {
        return { tipo: 'aceptar', label: 'Aceptar', tono: 'brand' };
      }
      return { tipo: 'liquidar', label: 'Liquidar', tono: 'ghost' };
    }
    if (grupo === 'delivery') {
      if (pedido.repartidorId == null) {
        return { tipo: 'asignar', label: 'Asignar', tono: 'dark' };
      }
      if (estado !== 'entregado') {
        return { tipo: 'entregar', label: 'Entregar', tono: 'dark' };
      }
      return { tipo: 'ver', label: 'Ver', tono: 'ghost' };
    }
    return { tipo: 'cobrar', label: 'Cobrar', tono: 'ghost' };
  }

  private coincide(fila: FilaPedido, texto: string): boolean {
    const partes = [
      fila.numero,
      fila.pedido.clienteNombre ?? '',
      fila.canalLabel,
      fila.destinoTitulo,
      fila.destinoMeta,
    ];
    const numeroMesa = fila.pedido.mesaNumero ?? fila.pedido.mesaId;
    if (numeroMesa != null) {
      partes.push(
        `mesa ${numeroMesa}`,
        `m${numeroMesa}`,
        `m${String(numeroMesa).padStart(2, '0')}`,
      );
    }
    return partes.some((parte) => parte.toLowerCase().includes(texto));
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 3000);
  }
}
