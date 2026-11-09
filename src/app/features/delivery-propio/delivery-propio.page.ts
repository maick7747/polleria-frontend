import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ClienteResumen, DeliveryPropioVista } from '../../core/api/api.mappers';
import { USE_API } from '../../core/api/api.config';
import { ClientesService } from '../../core/data/clientes.service';
import {
  COSTO_DELIVERY_PROPIO,
  DeliveryService,
} from '../../core/data/delivery.service';
import { formatearMoneda, hora, round2 } from '../../core/utils/format';
import { ChipComponent, type ChipVariant } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type EstadoFiltro =
  | 'todos'
  | 'borrador'
  | 'en_cocina'
  | 'servido'
  | 'en_camino'
  | 'entregado'
  | 'cancelado';

type CanalPropio = 'whatsapp' | 'telefono';
type MetodoEntrega = 'efectivo' | 'yape' | 'plin' | 'tarjeta';

const LIMITES = [10, 20, 50, 100];

const ESTADOS: readonly { valor: EstadoFiltro; texto: string }[] = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'borrador', texto: 'Borrador' },
  { valor: 'en_cocina', texto: 'En cocina' },
  { valor: 'servido', texto: 'Servido' },
  { valor: 'en_camino', texto: 'En camino' },
  { valor: 'entregado', texto: 'Entregado' },
  { valor: 'cancelado', texto: 'Cancelado' },
];

const METODOS: readonly { valor: MetodoEntrega; texto: string }[] = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'yape', texto: 'Yape' },
  { valor: 'plin', texto: 'Plin' },
  { valor: 'tarjeta', texto: 'Tarjeta' },
];

const fechaLima = (fecha: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);

const HOY = fechaLima(new Date());
const HACE_SIETE = fechaLima(new Date(Date.now() - 6 * 86400000));
const DESDE_INICIAL = USE_API ? HACE_SIETE : '';
const HASTA_INICIAL = USE_API ? HOY : '';

@Component({
  selector: 'app-delivery-propio-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PaginadorComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delivery-propio.page.html',
  styleUrl: './delivery-propio.page.css',
})
export class DeliveryPropioPage {
  private readonly delivery = inject(DeliveryService);
  private readonly clientesService = inject(ClientesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;
  private buscarTimer: number | null = null;

  readonly moneda = formatearMoneda;
  readonly estados = ESTADOS;
  readonly metodos = METODOS;
  readonly costoFijo = COSTO_DELIVERY_PROPIO;

  readonly lista = this.delivery.propios;
  readonly meta = this.delivery.propiosMeta;
  readonly cargando = this.delivery.propiosCargando;
  readonly error = this.delivery.propiosError;
  readonly repartidores = this.delivery.repartidoresConocidos;

  readonly estado = signal<EstadoFiltro>('todos');
  readonly desde = signal<string>(DESDE_INICIAL);
  readonly hasta = signal<string>(HASTA_INICIAL);
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);
  readonly seleccionId = signal<number | null>(null);

  readonly mostrarAlta = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
  readonly asignando = signal<boolean>(false);

  readonly canal = signal<CanalPropio>('whatsapp');
  readonly cliente = signal<ClienteResumen | null>(null);
  readonly busquedaCliente = signal<string>('');
  readonly resultadosCliente = signal<ClienteResumen[]>([]);
  readonly buscandoCliente = signal<boolean>(false);
  readonly clientesLimite = signal<number>(6);
  readonly telefono = signal<string>('');
  readonly direccion = signal<string>('');
  readonly referencia = signal<string>('');
  readonly observaciones = signal<string>('');
  readonly costoDelivery = signal<string>(COSTO_DELIVERY_PROPIO.toFixed(2));

  readonly repartidorId = signal<string>('');
  readonly metodoPago = signal<MetodoEntrega>('efectivo');
  readonly montoRecibido = signal<string>('');

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly seleccionado = computed<DeliveryPropioVista | null>(() => {
    const id = this.seleccionId();
    const lista = this.lista();
    return lista.find((pedido) => pedido.id === id) ?? lista[0] ?? null;
  });

  readonly subtitulo = computed<string>(() => {
    const meta = this.meta();
    return `${meta.total} pedidos · página ${meta.page} de ${meta.pages || 1}`;
  });

  readonly puedeCrear = computed<boolean>(() => {
    const nombre = this.nombreCliente();
    return nombre.length > 1 && this.direccion().trim().length > 3 && !this.guardando();
  });

  readonly hayMasClientes = computed<boolean>(() => {
    const visibles = this.resultadosCliente().length;
    return visibles > 0 && visibles < this.clientesService.meta().total;
  });

  private nombreCliente(): string {
    return this.cliente()?.nombre ?? this.busquedaCliente().trim();
  }

  readonly puedeCobrar = computed<boolean>(() => {
    const pedido = this.seleccionado();
    return (
      pedido !== null &&
      pedido.estado !== 'cancelado' &&
      pedido.estadoPago !== 'pagado' &&
      Number(this.montoRecibido() || pedido.total) >= pedido.total - 0.009
    );
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const estado = params.get('estado') as EstadoFiltro | null;
    this.estado.set(ESTADOS.some((item) => item.valor === estado) ? (estado as EstadoFiltro) : 'todos');
    this.desde.set(params.get('desde') ?? DESDE_INICIAL);
    this.hasta.set(params.get('hasta') ?? HASTA_INICIAL);
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);
    const seleccion = Number(params.get('pedido'));
    if (Number.isFinite(seleccion) && seleccion > 0) {
      this.seleccionId.set(seleccion);
    }

    void this.cargar();

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
      if (this.buscarTimer !== null) {
        window.clearTimeout(this.buscarTimer);
      }
    });
  }

  onEstado(event: Event): void {
    this.estado.set((event.target as HTMLSelectElement).value as EstadoFiltro);
    this.pagina.set(1);
    void this.cargar();
  }

  onDesde(event: Event): void {
    this.desde.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargar();
  }

  onHasta(event: Event): void {
    this.hasta.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    void this.cargar();
  }

  cambiarPagina(page: number): void {
    this.pagina.set(page);
    void this.cargar();
  }

  cambiarLimite(limit: number): void {
    this.limite.set(limit);
    this.pagina.set(1);
    void this.cargar();
  }

  seleccionar(id: number): void {
    this.seleccionId.set(id);
    this.montoRecibido.set('');
    this.sincronizarUrl();
  }

  reintentar(): void {
    void this.cargar();
  }

  abrirAlta(): void {
    this.mostrarAlta.set(true);
    this.limpiarFormulario();
  }

  cerrarAlta(): void {
    this.mostrarAlta.set(false);
  }

  onClienteBuscar(event: Event): void {
    const valor = (event.target as HTMLInputElement).value;
    this.busquedaCliente.set(valor);
    if (this.buscarTimer !== null) {
      window.clearTimeout(this.buscarTimer);
    }
    if (valor.trim().length < 2) {
      this.resultadosCliente.set([]);
      return;
    }
    this.clientesLimite.set(6);
    this.buscarTimer = window.setTimeout(() => {
      void this.buscarClientes(valor);
    }, 350);
  }

  async masClientes(): Promise<void> {
    this.clientesLimite.update((limite) => limite + 6);
    await this.buscarClientes(this.busquedaCliente());
  }

  elegirCliente(cliente: ClienteResumen): void {
    this.cliente.set(cliente);
    this.busquedaCliente.set(cliente.nombre);
    this.resultadosCliente.set([]);
    this.telefono.set(cliente.telefono ?? '');
    this.direccion.set(cliente.direccion ?? '');
    this.referencia.set(cliente.referencia ?? '');
  }

  limpiarCliente(): void {
    this.cliente.set(null);
    this.busquedaCliente.set('');
    this.resultadosCliente.set([]);
  }

  onTelefono(event: Event): void {
    this.telefono.set((event.target as HTMLInputElement).value);
  }

  onDireccion(event: Event): void {
    this.direccion.set((event.target as HTMLInputElement).value);
  }

  onReferencia(event: Event): void {
    this.referencia.set((event.target as HTMLInputElement).value);
  }

  onObservaciones(event: Event): void {
    this.observaciones.set((event.target as HTMLTextAreaElement).value);
  }

  onCosto(event: Event): void {
    this.costoDelivery.set((event.target as HTMLInputElement).value);
  }

  onRepartidorInput(event: Event): void {
    this.repartidorId.set((event.target as HTMLInputElement).value);
  }

  onMetodo(metodo: MetodoEntrega): void {
    this.metodoPago.set(metodo);
  }

  onMontoRecibido(event: Event): void {
    this.montoRecibido.set((event.target as HTMLInputElement).value);
  }

  async crearPedido(): Promise<void> {
    if (!this.puedeCrear()) {
      this.avisar('Completa el cliente y la dirección de entrega.', true);
      return;
    }
    const nombre = this.nombreCliente();
    const costo = Number(this.costoDelivery());
    this.guardando.set(true);
    const creado = await this.delivery.crearPropio({
      canal: this.canal(),
      clienteNombre: nombre,
      clienteTelefono: this.telefono().trim() || undefined,
      direccionEntrega: this.direccion().trim(),
      referenciaEntrega: this.referencia().trim() || undefined,
      observaciones: this.observaciones().trim() || undefined,
      costoDelivery: Number.isFinite(costo) ? round2(Math.max(0, costo)) : this.costoFijo,
      items: [],
      enviarCocina: false,
    });
    this.guardando.set(false);

    if (!creado) {
      this.avisar(this.error() ?? 'No se pudo crear el pedido.', true);
      return;
    }

    this.mostrarAlta.set(false);
    this.seleccionId.set(creado.id);
    this.avisar(`${creado.numero} creado · agrega los ítems en caja para enviarlo a cocina`);
    await this.cargar();
  }

  async asignar(): Promise<void> {
    const pedido = this.seleccionado();
    const repartidorId = Number(this.repartidorId());
    if (!pedido) {
      return;
    }
    if (!Number.isFinite(repartidorId) || repartidorId <= 0) {
      this.avisar('Indica un ID de repartidor válido.', true);
      return;
    }
    this.asignando.set(true);
    const ok = await this.delivery.asignarRepartidor(pedido.id, repartidorId);
    this.asignando.set(false);
    if (!ok) {
      this.avisar(this.error() ?? 'No se pudo asignar el repartidor.', true);
      return;
    }
    this.repartidorId.set('');
    this.avisar(`Repartidor #${repartidorId} asignado a ${pedido.numero}`);
    await this.cargar();
  }

  async marcarEnCamino(): Promise<void> {
    const pedido = this.seleccionado();
    if (!pedido) {
      return;
    }
    if (pedido.repartidorId === null) {
      this.avisar('Asigna un repartidor antes de iniciar la entrega.', true);
      return;
    }
    const ok = await this.delivery.cambiarEstadoEntrega(pedido.id, 'en_camino');
    this.avisar(
      ok ? `${pedido.numero} en camino` : this.error() ?? 'No se pudo actualizar el estado.',
      !ok,
    );
    if (ok) {
      await this.cargar();
    }
  }

  async marcarEntregado(): Promise<void> {
    const pedido = this.seleccionado();
    if (!pedido) {
      return;
    }
    const ok = await this.delivery.cambiarEstadoEntrega(pedido.id, 'entregado');
    this.avisar(
      ok ? `${pedido.numero} marcado como entregado` : this.error() ?? 'No se pudo actualizar el estado.',
      !ok,
    );
    if (ok) {
      await this.cargar();
    }
  }

  async cobrar(): Promise<void> {
    const pedido = this.seleccionado();
    if (!pedido) {
      return;
    }
    if (!this.puedeCobrar()) {
      this.avisar('El monto recibido no cubre el total del pedido.', true);
      return;
    }
    const monto = Number(this.montoRecibido() || pedido.total);
    const vuelto = await this.delivery.registrarEntrega(
      pedido.id,
      this.metodoPago(),
      Number.isFinite(monto) ? round2(monto) : pedido.total,
    );
    if (vuelto === null) {
      this.avisar(this.error() ?? 'No se pudo registrar la entrega.', true);
      return;
    }
    this.montoRecibido.set('');
    this.avisar(`Entrega cobrada · vuelto ${this.moneda(vuelto)}`);
    await this.cargar();
  }

  estadoTexto(estado: string): string {
    return ESTADOS.find((item) => item.valor === estado)?.texto ?? estado.replace('_', ' ');
  }

  estadoTono(pedido: DeliveryPropioVista): ChipVariant {
    if (pedido.estado === 'cancelado') {
      return 'danger';
    }
    if (pedido.estadoEntrega === 'entregado' || pedido.estadoPago === 'pagado') {
      return 'success';
    }
    if (pedido.estadoEntrega === 'en_camino') {
      return 'info';
    }
    if (pedido.estado === 'en_cocina' || pedido.estado === 'servido') {
      return 'warning';
    }
    return 'neutral';
  }

  horaPedido(pedido: DeliveryPropioVista): string {
    return hora(pedido.fecha);
  }

  minutosTexto(minutos: number): string {
    if (minutos <= 0) {
      return '—';
    }
    return `${minutos} min`;
  }

  private async buscarClientes(texto: string): Promise<void> {
    this.buscandoCliente.set(true);
    await this.clientesService.cargar({
      page: 1,
      limit: this.clientesLimite(),
      q: texto,
    });
    this.buscandoCliente.set(false);
    this.resultadosCliente.set(this.clientesService.clientes());
  }

  private async cargar(): Promise<void> {
    const ok = await this.delivery.cargarPropios({
      page: this.pagina(),
      limit: this.limite(),
      estado: this.estado() === 'todos' ? undefined : this.estado(),
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
    });
    if (ok) {
      const meta = this.meta();
      this.pagina.set(meta.page);
      this.limite.set(meta.limit);
      const seleccion = this.seleccionado();
      this.seleccionId.set(seleccion ? seleccion.id : null);
      this.sincronizarUrl();
    }
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        estado: this.estado() === 'todos' ? null : this.estado(),
        desde: this.desde() || null,
        hasta: this.hasta() || null,
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        pedido: this.seleccionId(),
      },
      replaceUrl: true,
    });
  }

  private limpiarFormulario(): void {
    this.canal.set('whatsapp');
    this.cliente.set(null);
    this.busquedaCliente.set('');
    this.resultadosCliente.set([]);
    this.telefono.set('');
    this.direccion.set('');
    this.referencia.set('');
    this.observaciones.set('');
    this.costoDelivery.set(this.costoFijo.toFixed(2));
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toast.set('');
      this.toastTimer = null;
    }, 3200);
  }
}
