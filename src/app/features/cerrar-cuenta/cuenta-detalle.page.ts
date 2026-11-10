import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { esApiError, mensajeError } from '../../core/api/api.helpers';
import { CuadreService } from '../../core/data/cuadre.service';
import { ClientesService } from '../../core/data/clientes.service';
import { CuentasService } from '../../core/data/cuentas.service';
import type { ComprobanteTipo, MetodoPago, TipoDocumentoCliente } from '../../core/models';
import {
  abreviarNombre,
  formatearMoneda,
  hora as formatearHora,
  minutosEntre,
  round2,
  turnoActual,
} from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { IconComponent, type IconName } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

const AHORA = Date.now();

type EstadoValidacion = 'inicial' | 'valido' | 'manual' | 'error';

interface MetodoVista {
  id: MetodoPago;
  label: string;
  icon: IconName;
}

const METODOS: readonly MetodoVista[] = [
  { id: 'efectivo', label: 'Efectivo', icon: 'money' },
  { id: 'yape', label: 'Yape', icon: 'phone' },
  { id: 'plin', label: 'Plin', icon: 'phone' },
  { id: 'tarjeta', label: 'Tarjeta', icon: 'credit-card' },
];

@Component({
  selector: 'app-cuenta-detalle-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    DarkPanelComponent,
    EmptyStateComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cuenta-detalle.page.html',
  styleUrl: './cuenta-detalle.page.css',
})
export class CuentaDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cuentas = inject(CuentasService);
  private readonly cuadre = inject(CuadreService);
  private readonly clientes = inject(ClientesService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly cuentaId = Number(this.route.snapshot.paramMap.get('cuentaId'));
  readonly metodos = METODOS;
  readonly moneda = formatearMoneda;
  readonly turno = turnoActual();
  readonly cajaAbierta = computed(() => this.cuadre.estado() === 'abierta');
  readonly cajaCerradaEstado = computed(() => {
    const estado = this.cuadre.estado();
    return estado === 'cerrada' || estado === 'sin_cuadre';
  });

  readonly cuenta = computed(() => this.cuentas.porId(this.cuentaId) ?? null);
  readonly metodo = signal<MetodoPago>('efectivo');
  readonly recibido = signal('100');
  readonly procesando = signal(false);
  readonly cargando = signal(true);
  readonly avisoLento = signal(false);
  readonly error = signal<string | null>(null);
  readonly toast = signal('');
  readonly toastError = signal(false);
  readonly cajaCerrada = signal('');

  // Datos de cobro: el cliente y el comprobante se piden aquí, al cerrar la
  // cuenta, no al abrir la mesa (por defecto "Consumidor final").
  readonly comprobanteSel = signal<ComprobanteTipo>('boleta');

  // Formulario de cliente (modal): DNI/RUC validado contra la API, nombre,
  // teléfono y correo. Solo se persiste si el cajero guarda.
  readonly clienteAbierto = signal(false);
  readonly tipoDoc = signal<TipoDocumentoCliente>('DNI');
  readonly docNumero = signal('');
  readonly docNombre = signal('');
  readonly docTelefono = signal('');
  readonly docCorreo = signal('');
  readonly docEstado = signal<EstadoValidacion>('inicial');
  readonly docFuente = signal('');
  readonly docModo = signal('');
  readonly docError = signal('');
  readonly validando = signal(false);
  readonly guardandoCliente = signal(false);

  private toastTimer: number | null = null;
  private navTimer: number | null = null;

  constructor() {
    void this.cargar();
    void this.cuadre.cargar();
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
      if (this.navTimer !== null) {
        window.clearTimeout(this.navTimer);
      }
    });
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.avisoLento.set(false);
    const temporizador = window.setTimeout(() => this.avisoLento.set(true), 5000);
    try {
      const ok = await this.cuentas.cargarDetalle(this.cuentaId);
      if (!ok) {
        const detalle = this.cuentas.errorDetalle();
        this.error.set(
          detalle?.status === 404
            ? 'La cuenta no existe o ya fue cerrada.'
            : detalle?.message ?? 'No se pudo cargar la cuenta.',
        );
      } else {
        this.sincronizarDatosCobro();
      }
    } finally {
      window.clearTimeout(temporizador);
      this.avisoLento.set(false);
      this.cargando.set(false);
    }
  }

  reintentar(): void {
    void this.cargar();
  }

  readonly numeroMesa = computed<string>(() =>
    String(this.cuenta()?.mesaId ?? 0).padStart(2, '0'),
  );
  readonly titulo = computed<string>(() =>
    this.abierta()
      ? `Cerrar cuenta · Mesa ${this.numeroMesa()}`
      : `Detalle de cuenta · Mesa ${this.numeroMesa()}`,
  );
  readonly subtitulo = computed<string>(() => {
    const cuenta = this.cuenta();
    if (!cuenta) {
      return 'Cuenta no encontrada';
    }
    const mozo = abreviarNombre(cuenta.usuarioAperturaNombre ?? '');
    if (cuenta.estado !== 'abierta') {
      return `${this.estadoEtiqueta()} · ${cuenta.rondas.length} rondas · Mozo ${mozo}`;
    }
    const minutos = minutosEntre(cuenta.fechaApertura, AHORA);
    return `Abierta ${minutos} min · ${cuenta.rondas.length} rondas · Mozo ${mozo}`;
  });

  readonly abierta = computed<boolean>(() => this.cuenta()?.estado === 'abierta');
  readonly estadoEtiqueta = computed<string>(() => {
    switch (this.cuenta()?.estado) {
      case 'cobrada': return 'Cuenta cobrada · solo lectura';
      case 'cancelada': return 'Cuenta cancelada · solo lectura';
      default: return 'Cuenta abierta';
    }
  });
  readonly total = computed<number>(() => this.cuenta()?.total ?? 0);
  readonly subtotal = computed<number>(() => round2(this.total() / 1.18));
  readonly igv = computed<number>(() => round2(this.total() - this.subtotal()));
  readonly rondas = computed<number>(() => this.cuenta()?.rondas.length ?? 0);
  readonly platos = computed<number>(() =>
    (this.cuenta()?.rondas ?? []).reduce((suma, ronda) => suma + ronda.items.length, 0),
  );

  readonly mozo = computed<string>(() =>
    abreviarNombre(this.cuenta()?.usuarioAperturaNombre ?? ''),
  );

  readonly cliente = computed<string>(() => this.cuenta()?.cliente?.nombre ?? 'Consumidor final');
  readonly documento = computed<string>(() => {
    const cliente = this.cuenta()?.cliente;
    return cliente ? `${cliente.tipoDocumento} ${cliente.numeroDocumento}` : '—';
  });
  readonly comprobante = computed<string>(() => {
    const tipo = this.cuenta()?.comprobanteTipo;
    if (tipo === 'boleta') {
      return 'Boleta';
    }
    if (tipo === 'ticket') {
      return 'Ticket';
    }
    return 'Sin comprobante';
  });

  readonly tieneCliente = computed<boolean>(() => Boolean(this.cuenta()?.cliente));
  readonly clienteAccion = computed<string>(() =>
    this.tieneCliente() ? 'Editar' : 'Agregar',
  );
  readonly docLargo = computed<number>(() => (this.tipoDoc() === 'DNI' ? 8 : 11));

  readonly fuenteEtiqueta = computed<string>(() => {
    switch (this.docFuente()) {
      case 'apiperu':
        return 'ApiPerú';
      case 'openruc':
        return 'OpenRUC';
      case 'mock':
        return 'Mock local';
      case 'ninguno':
        return 'Sin fuente';
      default:
        return '';
    }
  });

  readonly modoEtiqueta = computed<string>(() => {
    switch (this.docModo()) {
      case 'mock':
        return 'Simulado';
      case 'sandbox':
        return 'Sandbox';
      case 'manual':
        return 'Manual';
      default:
        return '';
    }
  });

  readonly validacionEtiqueta = computed<string>(() => {
    switch (this.docEstado()) {
      case 'valido':
        return 'Documento válido';
      case 'manual':
        return 'Sin proveedor · registrar a mano';
      case 'error':
        return 'Revisar documento';
      default:
        return '';
    }
  });

  readonly recibidoNumero = computed<number>(() => {
    const valor = Number.parseFloat(this.recibido().replace(',', '.'));
    return Number.isFinite(valor) ? valor : 0;
  });
  readonly vuelto = computed<number>(() =>
    Math.max(0, round2(this.recibidoNumero() - this.total())),
  );
  readonly faltante = computed<number>(() =>
    Math.max(0, round2(this.total() - this.recibidoNumero())),
  );

  readonly puedeCobrar = computed<boolean>(() => {
    if (!this.abierta() || this.procesando()) {
      return false;
    }
    if (this.metodo() === 'efectivo') {
      return this.recibidoNumero() >= this.total();
    }
    return true;
  });

  elegirMetodo(metodo: MetodoPago): void {
    if (this.procesando()) {
      return;
    }
    this.metodo.set(metodo);
  }

  onRecibido(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.recibido.set(input.value);
  }

  // Copia a los campos lo que ya tenga guardado la cuenta.
  private sincronizarDatosCobro(): void {
    const cuenta = this.cuenta();
    if (!cuenta) {
      return;
    }
    this.comprobanteSel.set(cuenta.comprobanteTipo);
    this.cargarFormularioCliente();
  }

  elegirComprobante(tipo: ComprobanteTipo): void {
    if (this.procesando()) {
      return;
    }
    this.comprobanteSel.set(tipo);
  }

  private cargarFormularioCliente(): void {
    const cliente = this.cuenta()?.cliente;
    this.tipoDoc.set(cliente?.tipoDocumento ?? 'DNI');
    this.docNumero.set(cliente?.numeroDocumento ?? '');
    this.docNombre.set(cliente?.nombre ?? '');
    this.docTelefono.set(cliente?.telefono ?? '');
    this.docCorreo.set(cliente?.correo ?? '');
    this.reiniciarValidacion();
  }

  abrirCliente(): void {
    if (this.procesando()) {
      return;
    }
    this.cargarFormularioCliente();
    this.clienteAbierto.set(true);
  }

  cerrarCliente(): void {
    if (this.guardandoCliente()) {
      return;
    }
    this.clienteAbierto.set(false);
  }

  @HostListener('document:keydown.escape')
  cerrarConEscape(): void {
    if (this.clienteAbierto()) {
      this.cerrarCliente();
    }
  }

  setTipoDoc(tipo: TipoDocumentoCliente): void {
    this.tipoDoc.set(tipo);
    this.docNumero.set(this.docNumero().slice(0, tipo === 'DNI' ? 8 : 11));
    this.reiniciarValidacion();
  }

  onDocNumero(event: Event): void {
    const digitos = (event.target as HTMLInputElement).value.replace(/\D/g, '');
    const maximo = this.tipoDoc() === 'DNI' ? 8 : 11;
    this.docNumero.set(digitos.slice(0, maximo));
    this.reiniciarValidacion();
  }

  onDocNombre(event: Event): void {
    this.docNombre.set((event.target as HTMLInputElement).value);
  }

  onDocTelefono(event: Event): void {
    this.docTelefono.set((event.target as HTMLInputElement).value);
  }

  onDocCorreo(event: Event): void {
    this.docCorreo.set((event.target as HTMLInputElement).value);
  }

  private reiniciarValidacion(): void {
    this.docEstado.set('inicial');
    this.docFuente.set('');
    this.docModo.set('');
    this.docError.set('');
  }

  /** `POST /clientes/validar-documento` (RENIEC/SUNAT vía Strategy). */
  async validarDocumento(): Promise<void> {
    const largo = this.tipoDoc() === 'DNI' ? 8 : 11;
    if (this.docNumero().length !== largo) {
      this.docEstado.set('error');
      this.docError.set(`El ${this.tipoDoc()} debe tener ${largo} dígitos.`);
      return;
    }
    if (this.validando()) {
      return;
    }
    this.validando.set(true);
    this.docError.set('');
    try {
      const resultado = await this.clientes.validarDocumento(
        this.tipoDoc(),
        this.docNumero(),
      );
      this.docFuente.set(resultado.fuente);
      this.docModo.set(resultado.modo);
      if (resultado.valido) {
        if (resultado.nombre) {
          this.docNombre.set(resultado.nombre);
        }
        this.docEstado.set('valido');
      } else if (resultado.modo === 'manual') {
        // Sin proveedor disponible: se permite registrar el nombre a mano.
        this.docEstado.set('manual');
        this.docError.set(resultado.motivo ?? 'No se pudo validar; escribe el nombre.');
      } else {
        this.docEstado.set('error');
        this.docError.set(resultado.motivo ?? 'El documento no es válido.');
      }
    } catch (error) {
      this.docEstado.set('error');
      this.docError.set(mensajeError(error));
    } finally {
      this.validando.set(false);
    }
  }

  async guardarCliente(): Promise<void> {
    const cuenta = this.cuenta();
    if (!cuenta || this.guardandoCliente()) {
      return;
    }
    const largo = this.tipoDoc() === 'DNI' ? 8 : 11;
    if (this.docNumero().length !== largo) {
      this.docEstado.set('error');
      this.docError.set(`El ${this.tipoDoc()} debe tener ${largo} dígitos.`);
      return;
    }
    const nombre = this.docNombre().trim();
    if (!nombre) {
      this.docEstado.set('error');
      this.docError.set('Ingresa el nombre del cliente.');
      return;
    }

    this.guardandoCliente.set(true);
    try {
      const actualizada = await this.cuentas.guardarDatosCobro(cuenta.id, {
        cliente: {
          tipoDocumento: this.tipoDoc(),
          numeroDocumento: this.docNumero(),
          nombre,
          telefono: this.docTelefono().trim() || undefined,
          correo: this.docCorreo().trim() || undefined,
        },
      });
      if (!actualizada) {
        this.docEstado.set('error');
        this.docError.set('No se pudo guardar el cliente. Intenta de nuevo.');
        return;
      }
      this.clienteAbierto.set(false);
      this.avisar('Cliente guardado en la cuenta.');
    } catch (error) {
      this.docEstado.set('error');
      this.docError.set(mensajeError(error));
    } finally {
      this.guardandoCliente.set(false);
    }
  }

  // Vuelve a "Consumidor final" (quita el cliente de la cuenta).
  async quitarCliente(): Promise<void> {
    const cuenta = this.cuenta();
    if (!cuenta || this.guardandoCliente()) {
      return;
    }
    this.guardandoCliente.set(true);
    try {
      const actualizada = await this.cuentas.guardarDatosCobro(cuenta.id, {
        quitarCliente: true,
      });
      if (!actualizada) {
        this.docError.set('No se pudo quitar el cliente. Intenta de nuevo.');
        return;
      }
      this.clienteAbierto.set(false);
      this.avisar('Comprobante a consumidor final.');
    } catch (error) {
      this.docError.set(mensajeError(error));
    } finally {
      this.guardandoCliente.set(false);
    }
  }

  async registrarPago(): Promise<void> {
    const cuenta = this.cuenta();
    if (!cuenta || cuenta.estado !== 'abierta' || this.procesando()) {
      this.avisar('La cuenta ya fue cobrada.', true);
      return;
    }
    if (this.clienteAbierto()) {
      this.avisar('Guarda o cierra los datos del cliente primero.', true);
      return;
    }
    if (this.metodo() === 'efectivo' && this.recibidoNumero() < cuenta.total) {
      this.avisar('El efectivo recibido no cubre el total.', true);
      return;
    }

    this.procesando.set(true);
    this.cajaCerrada.set('');
    try {
      // El cliente ya se guardó al grabarlo; aquí solo se persiste el tipo de
      // comprobante si el cajero lo cambió.
      if (this.comprobanteSel() !== cuenta.comprobanteTipo) {
        await this.cuentas.guardarDatosCobro(cuenta.id, {
          comprobanteTipo: this.comprobanteSel(),
        });
      }

      const numero = this.numeroComprobante(this.comprobanteSel());
      const cerrada = await this.cuentas.cerrar(
        cuenta.id,
        this.auth.usuario()?.id ?? 3,
        this.comprobanteSel(),
        numero,
        this.metodo(),
      );

      if (!cerrada) {
        this.procesando.set(false);
        this.avisar('No se pudo registrar el pago.', true);
        return;
      }

      this.avisar(`Pago registrado · ${cerrada.comprobanteNumero ?? numero}`);
      this.navTimer = window.setTimeout(() => {
        this.procesando.set(false);
        void this.router.navigate(['/cerrar-cuenta']);
      }, 1600);
    } catch (error) {
      this.procesando.set(false);
      const mensaje = mensajeError(error);
      if (esApiError(error) && error.code === 'CAJA_CERRADA') {
        this.cajaCerrada.set(mensaje);
      }
      this.avisar(mensaje, true);
    }
  }

  hora(iso: string): string {
    return formatearHora(iso);
  }

  unidades(cantidad: number): string {
    return cantidad === 1 ? 'unidad' : 'unidades';
  }

  private numeroComprobante(tipo: string): string {
    const correlativo = String(1234 + this.cuentaId).padStart(6, '0');
    if (tipo === 'boleta') {
      return `B001-${correlativo}`;
    }
    if (tipo === 'ticket') {
      return `T001-${correlativo}`;
    }
    return `SIN-${correlativo}`;
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 2600);
  }
}
