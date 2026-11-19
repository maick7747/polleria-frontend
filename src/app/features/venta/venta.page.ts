import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CuadreService } from '../../core/data/cuadre.service';
import {
  COMISION_PLATAFORMA,
  COSTO_DELIVERY_PROPIO,
  DeliveryService,
  type PlataformaExterna,
} from '../../core/data/delivery.service';
import { PedidosService } from '../../core/data/pedidos.service';
import type { PedidoDetalle } from '../../core/models';
import { formatearMoneda, round2, turnoActual } from '../../core/utils/format';
import { iniciarRefresco } from '../../core/utils/refresco';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import {
  ModoVentaComponent,
  type ModoVenta,
} from '../../shared/components/modo-venta/modo-venta';
import { PanelComponent } from '../../shared/components/panel/panel';
import { SelectorPlatosComponent } from '../../shared/components/selector-platos/selector-platos';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

// Misma regla que el backend: 18 % de IGV sobre el subtotal de platos, con
// mínimo de S/ 70. El costo de delivery se suma después, sin IGV.
const IGV_PCT = 18;
const IGV_MIN = 70;

/** Modos que se atienden en esta pantalla; `mesas` vive en `/venta-local`. */
type ModoVentaFormulario = Exclude<ModoVenta, 'mesas'>;

type CanalPropio = 'whatsapp' | 'telefono';

interface ModoInfo {
  label: string;
  detalle: string;
  icon: IconName;
  menuTitulo: string;
  menuDescripcion: string;
  boton: string;
  exito: string;
  nota: string;
}

const MODO_INFO: Record<ModoVentaFormulario, ModoInfo> = {
  mostrador: {
    label: 'Mostrador',
    detalle: 'Para llevar · sin mesa',
    icon: 'receipt',
    menuTitulo: 'Platos para llevar',
    menuDescripcion: 'Elige los platos; se envían a cocina al guardar el pedido.',
    boton: 'Enviar a cocina y ver pedido',
    exito: 'enviado a cocina',
    nota: 'El pedido se envía a cocina y se cobra en Caja cuando el cliente lo recoja.',
  },
  delivery: {
    label: 'Delivery propio',
    detalle: 'WhatsApp o teléfono · contraentrega',
    icon: 'motorcycle',
    menuTitulo: 'Platos del delivery',
    menuDescripcion: 'Se descuenta stock al crear el pedido y entra directo a cocina.',
    boton: 'Crear delivery y ver pedido',
    exito: 'creado y enviado a cocina',
    nota: 'El contraentrega se registra en Caja cuando el repartidor vuelve con el cobro.',
  },
  apps: {
    label: 'Apps',
    detalle: 'Rappi · LlamaFood · registro manual',
    icon: 'package',
    menuTitulo: 'Platos del pedido de app',
    menuDescripcion: 'Registra el pedido tal como llegó por la plataforma.',
    boton: 'Guardar en Pedidos',
    exito: 'guardado en borrador · acéptalo en Pedidos',
    nota: 'Rappi y LlamaFood no están integrados por API: el pedido nace en borrador y se acepta en Pedidos.',
  },
};

const normalizarModo = (valor: string | null): ModoVentaFormulario => {
  if (valor === 'delivery' || valor === 'apps') {
    return valor;
  }
  return 'mostrador';
};

/**
 * Compositor de venta (mostrador, delivery propio y apps).
 *
 * Es el mismo menú y el mismo carrito para los tres orígenes: lo único que
 * cambia son los datos del origen y el total (IGV, delivery o comisión).
 * El modo se toma de `?modo=` para que cada canal tenga su propia URL.
 */
@Component({
  selector: 'app-venta-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    ModoVentaComponent,
    PanelComponent,
    SelectorPlatosComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './venta.page.html',
  styleUrl: './venta.page.css',
})
export class VentaPage {
  private readonly auth = inject(AuthService);
  private readonly pedidos = inject(PedidosService);
  private readonly delivery = inject(DeliveryService);
  private readonly cuadre = inject(CuadreService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;
  private navegarTimer: number | null = null;

  readonly moneda = formatearMoneda;
  readonly turno = turnoActual();

  // ---------------------------------------------------------------------------
  // Modo de venta (viene de la URL para poder enlazarlo)
  // ---------------------------------------------------------------------------

  private readonly modoParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('modo'))),
    { initialValue: this.route.snapshot.queryParamMap.get('modo') },
  );

  readonly modo = computed<ModoVentaFormulario>(() => normalizarModo(this.modoParam()));

  readonly modoInfo = computed<ModoInfo>(() => MODO_INFO[this.modo()]);

  readonly subtitulo = computed<string>(() => `${this.modoInfo().detalle} · una sola caja`);

  // ---------------------------------------------------------------------------
  // Carrito y origen del pedido
  // ---------------------------------------------------------------------------

  readonly items = signal<PedidoDetalle[]>([]);

  readonly cliente = signal<string>('');
  readonly observaciones = signal<string>('');

  // Delivery propio.
  readonly canal = signal<CanalPropio>('whatsapp');
  readonly telefono = signal<string>('');
  readonly direccion = signal<string>('');
  readonly referencia = signal<string>('');
  readonly costoDelivery = signal<string>(COSTO_DELIVERY_PROPIO.toFixed(2));

  // Apps.
  readonly plataforma = signal<PlataformaExterna>('rappi');

  readonly enviando = signal<boolean>(false);
  private readonly guardado = signal<boolean>(false);

  readonly error = signal<string | null>(null);
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  // ---------------------------------------------------------------------------
  // Caja
  // ---------------------------------------------------------------------------

  readonly cajaAbierta = computed<boolean>(() => this.cuadre.estado() === 'abierta');
  // Solo mientras corre la petición: si falla, `estado` queda vacío y la
  // pantalla debe mostrar el banner (con enlace a apertura).
  readonly cajaVerificando = computed<boolean>(() => this.cuadre.cargando());
  readonly cajaError = this.cuadre.error;

  readonly puedeOperar = computed<boolean>(() => this.auth.hasPermission('venta.registrar'));

  // ---------------------------------------------------------------------------
  // Importes
  // ---------------------------------------------------------------------------

  readonly unidades = computed<number>(() =>
    this.items().reduce((suma, item) => suma + item.cantidad, 0),
  );

  readonly subtotal = computed<number>(() =>
    round2(this.items().reduce((suma, item) => suma + item.subtotal, 0)),
  );

  readonly igv = computed<number>(() =>
    this.subtotal() >= IGV_MIN && this.subtotal() > 0
      ? round2((this.subtotal() * IGV_PCT) / 100)
      : 0,
  );

  readonly costoDeliveryNumero = computed<number>(() => {
    const costo = Number(this.costoDelivery());
    return Number.isFinite(costo) ? round2(Math.max(0, costo)) : 0;
  });

  /** El delivery propio suma el envío al total; los otros modos no. */
  readonly envio = computed<number>(() =>
    this.modo() === 'delivery' ? this.costoDeliveryNumero() : 0,
  );

  readonly total = computed<number>(() => round2(this.subtotal() + this.igv() + this.envio()));

  readonly comisionPct = computed<number>(() =>
    this.modo() === 'apps' ? COMISION_PLATAFORMA[this.plataforma()] : 0,
  );

  readonly comision = computed<number>(() =>
    this.modo() === 'apps' ? round2((this.total() * this.comisionPct()) / 100) : 0,
  );

  readonly neto = computed<number>(() => round2(this.total() - this.comision()));

  // ---------------------------------------------------------------------------
  // Validación
  // ---------------------------------------------------------------------------

  readonly canalTexto = computed<string>(() =>
    this.canal() === 'telefono' ? 'Teléfono' : 'WhatsApp',
  );

  readonly plataformaTexto = computed<string>(() =>
    this.plataforma() === 'llamafood' ? 'LlamaFood' : 'Rappi',
  );

  /** Etiqueta corta del origen para el encabezado del carrito. */
  readonly origenChip = computed<string>(() => {
    switch (this.modo()) {
      case 'delivery':
        return this.canalTexto();
      case 'apps':
        return this.plataformaTexto();
      default:
        return 'Sin mesa';
    }
  });

  readonly resumenLineas = computed<string>(() => {
    const lineas = this.items().length;
    if (lineas === 0) {
      return 'Sin platos todavía';
    }
    const unidades = this.unidades();
    return `${lineas} ${lineas === 1 ? 'línea' : 'líneas'} · ${unidades} ${
      unidades === 1 ? 'unidad' : 'unidades'
    }`;
  });

  /** Explica por qué el botón está deshabilitado. Vacío = listo para enviar. */
  readonly motivo = computed<string>(() => {
    if (!this.cajaAbierta()) {
      return 'Abre la caja del día para registrar pedidos.';
    }
    if (!this.puedeOperar()) {
      return 'Tu rol no registra ventas.';
    }
    if (this.items().length === 0) {
      return 'Agrega al menos un plato del menú.';
    }
    if (this.modo() !== 'mostrador') {
      if (this.cliente().trim().length < 2) {
        return 'Escribe el nombre del cliente.';
      }
      if (this.direccion().trim().length < 4) {
        return 'Completa la dirección de entrega.';
      }
    }
    if (this.enviando()) {
      return 'Guardando el pedido…';
    }
    return '';
  });

  readonly puedeEnviar = computed<boolean>(() => this.motivo() === '');

  readonly mostrarMotivo = computed<boolean>(() => !this.guardado() && this.motivo() !== '');

  constructor() {
    void this.cuadre.cargar();

    // Al cambiar de canal se descarta el error del intento anterior: los
    // datos del origen ya no son los mismos.
    effect(() => {
      this.modo();
      this.error.set(null);
    });

    // Si la caja se abre en otra pestaña, la pantalla se entera sin recargar.
    iniciarRefresco({
      intervaloMs: 60000,
      destroyRef: this.destroyRef,
      tarea: async () => {
        await this.cuadre.cargar(true);
      },
    });

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
      if (this.navegarTimer !== null) {
        window.clearTimeout(this.navegarTimer);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Formulario
  // ---------------------------------------------------------------------------

  onCliente(event: Event): void {
    this.cliente.set((event.target as HTMLInputElement).value);
  }

  onObservaciones(event: Event): void {
    this.observaciones.set((event.target as HTMLTextAreaElement).value);
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

  onCosto(event: Event): void {
    this.costoDelivery.set((event.target as HTMLInputElement).value);
  }

  quitar(itemId: number): void {
    if (this.enviando()) {
      return;
    }
    this.items.update((lista) =>
      lista.flatMap((item) => {
        if (item.id !== itemId) {
          return [item];
        }
        if (item.cantidad <= 1) {
          return [];
        }
        const cantidad = item.cantidad - 1;
        return [{ ...item, cantidad, subtotal: round2(cantidad * item.precioUnitario) }];
      }),
    );
  }

  vaciar(): void {
    if (this.enviando()) {
      return;
    }
    this.items.set([]);
  }

  reintentarCaja(): void {
    void this.cuadre.cargar();
  }

  // ---------------------------------------------------------------------------
  // Alta del pedido
  // ---------------------------------------------------------------------------

  async enviar(): Promise<void> {
    if (this.enviando()) {
      return;
    }
    if (!this.cajaAbierta()) {
      this.avisar('Abre la caja del día antes de registrar pedidos.', true);
      return;
    }
    if (!this.puedeEnviar()) {
      this.avisar(this.motivo(), true);
      return;
    }

    this.enviando.set(true);
    this.guardado.set(false);
    this.error.set(null);

    const modo = this.modo();
    let creadoId: number | null = null;
    let creadoNumero = '';

    if (modo === 'mostrador') {
      const pedido = await this.pedidos.crearParaLlevar({
        items: this.items(),
        clienteNombre: this.cliente().trim() || undefined,
        observaciones: this.observaciones().trim() || undefined,
      });
      if (pedido) {
        creadoId = pedido.id;
        creadoNumero = pedido.numero;
      } else {
        this.error.set(
          this.pedidos.paraLLevarError() ?? 'No se pudo enviar el pedido a cocina.',
        );
      }
    } else if (modo === 'delivery') {
      const pedido = await this.delivery.crearPropio({
        canal: this.canal(),
        clienteNombre: this.cliente().trim(),
        clienteTelefono: this.telefono().trim() || undefined,
        direccionEntrega: this.direccion().trim(),
        referenciaEntrega: this.referencia().trim() || undefined,
        observaciones: this.observaciones().trim() || undefined,
        costoDelivery: this.costoDeliveryNumero(),
        items: this.items(),
        enviarCocina: true,
      });
      if (pedido) {
        creadoId = pedido.id;
        creadoNumero = pedido.numero;
      } else {
        this.error.set(this.delivery.propiosError() ?? 'No se pudo crear el delivery.');
      }
    } else {
      const pedido = await this.delivery.crearExterno({
        plataforma: this.plataforma(),
        clienteNombre: this.cliente().trim(),
        direccionEntrega: this.direccion().trim(),
        referenciaEntrega: this.referencia().trim() || undefined,
        observaciones: this.observaciones().trim() || undefined,
        items: this.items(),
      });
      if (pedido) {
        creadoId = pedido.id;
        creadoNumero = pedido.numero;
      } else {
        this.error.set(
          this.delivery.externosError() ?? 'No se pudo guardar el pedido de la app.',
        );
      }
    }

    this.enviando.set(false);

    if (creadoId === null) {
      this.avisar(this.error() ?? 'No se pudo crear el pedido.', true);
      return;
    }

    this.guardado.set(true);
    this.limpiar();
    this.avisar(`${creadoNumero} ${this.modoInfo().exito}`);
    this.irAlPedido(creadoId);
  }

  /**
   * Confirmación visible antes de cambiar de pantalla: el toast dura unos
   * cientos de milisegundos y luego abre el pedido en la bandeja.
   */
  private irAlPedido(pedidoId: number): void {
    if (this.navegarTimer !== null) {
      window.clearTimeout(this.navegarTimer);
    }
    this.navegarTimer = window.setTimeout(() => {
      this.navegarTimer = null;
      void this.router.navigate(['/pedidos'], { queryParams: { pedido: pedidoId } });
    }, 900);
  }

  private limpiar(): void {
    this.items.set([]);
    this.cliente.set('');
    this.observaciones.set('');
    this.telefono.set('');
    this.direccion.set('');
    this.referencia.set('');
    this.costoDelivery.set(COSTO_DELIVERY_PROPIO.toFixed(2));
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
    }, 3600);
  }
}
