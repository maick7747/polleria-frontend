import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/api/api.helpers';
import { ClientesService } from '../../core/data/clientes.service';
import { CuadreService } from '../../core/data/cuadre.service';
import { CuentasService } from '../../core/data/cuentas.service';
import { MesasService } from '../../core/data/mesas.service';
import type { DatosCliente, TipoDocumentoCliente } from '../../core/models';
import { turnoActual } from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type EstadoValidacion = 'inicial' | 'validando' | 'valido' | 'manual' | 'error';

@Component({
  selector: 'app-datos-cliente-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './datos-cliente.page.html',
  styleUrl: './datos-cliente.page.css',
})
export class DatosClientePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly mesas = inject(MesasService);
  private readonly cuentas = inject(CuentasService);
  private readonly cuadre = inject(CuadreService);
  private readonly clientes = inject(ClientesService);

  readonly mesaId = Number(this.route.snapshot.queryParamMap.get('mesaId'));

  readonly tipo = signal<TipoDocumentoCliente>('DNI');
  readonly numero = signal<string>('');
  readonly nombre = signal<string>('');
  readonly telefono = signal<string>('');
  readonly correo = signal<string>('');
  readonly estado = signal<EstadoValidacion>('inicial');
  readonly fuente = signal<string>('');
  readonly modo = signal<string>('');
  readonly motivo = signal<string>('');
  readonly validez = signal<boolean | null>(null);
  readonly error = signal<string>('');
  readonly guardando = signal(false);
  readonly cargando = signal(true);

  readonly mesa = computed(() => this.mesas.porId(this.mesaId) ?? null);
  readonly cuenta = computed(() => this.cuentas.cuentaDeMesa(this.mesaId) ?? null);
  readonly turno = turnoActual();
  readonly cajaAbierta = computed(() => this.cuadre.estado() === 'abierta');
  readonly cajaCerradaEstado = computed(() => {
    const estado = this.cuadre.estado();
    return estado === 'cerrada' || estado === 'sin_cuadre';
  });

  readonly subtitulo = computed(() => {
    const numeroMesa = String(this.mesa()?.numero ?? 0).padStart(2, '0');
    const ronda = (this.cuenta()?.rondas.length ?? 0) + 1;
    return `Venta en local · Mesa ${numeroMesa} · ronda ${ronda} · paso opcional`;
  });

  readonly docHint = computed(() => (this.tipo() === 'DNI' ? '8 dígitos' : '11 dígitos'));

  readonly modoEtiqueta = computed(() => {
    switch (this.modo()) {
      case 'mock':
        return 'Simulado';
      case 'sandbox':
        return 'Sandbox';
      case 'manual':
        return 'Manual';
      default:
        return '—';
    }
  });

  readonly fuenteEtiqueta = computed(() => {
    switch (this.fuente()) {
      case 'apiperu':
        return 'ApiPerú';
      case 'openruc':
        return 'OpenRUC';
      case 'mock':
        return 'Mock local';
      case 'ninguno':
        return 'Sin fuente';
      default:
        return '—';
    }
  });

  readonly resultadoEtiqueta = computed(() => {
    const valido = this.validez();
    if (valido === null) {
      return '—';
    }
    return valido ? 'Válido' : 'No válido';
  });

  readonly etiquetaComprobante = computed(() =>
    this.cuenta()?.comprobanteTipo === 'ticket' ? 'Ticket' : 'Boleta',
  );

  readonly clienteResumen = computed(() => this.nombre().trim() || 'Sin datos');
  readonly documentoResumen = computed(() => {
    const numero = this.numero().trim();
    return numero ? `${this.tipo()} ${numero}` : '—';
  });
  readonly telefonoResumen = computed(() => this.telefono().trim() || '—');
  readonly pedidoResumen = computed(() => {
    const numeroMesa = String(this.mesa()?.numero ?? 0).padStart(2, '0');
    return `Mesa ${numeroMesa} · ${this.cuenta()?.rondas.length ?? 0} rondas`;
  });
  readonly totalCuentaNumero = computed(() => (this.cuenta()?.total ?? 0).toFixed(2));

  constructor() {
    void this.inicializar();
    void this.cuadre.cargar();
  }

  private async inicializar(): Promise<void> {
    this.cargando.set(true);
    try {
      // El tablero agregado trae mesas + cuentas en una sola petición.
      await this.cuentas.cargar();
    } finally {
      this.cargando.set(false);
    }
    if (!this.mesa()) {
      void this.router.navigate(['/venta-local']);
      return;
    }
    // Cuenta perezosa: no se crea aquí. El cliente se guarda como pendiente
    // y se aplica cuando la cuenta se cree al enviar la primera ronda.
    const cliente = this.cuenta()?.cliente ?? this.cuentas.clientePendiente(this.mesaId);
    if (cliente) {
      this.tipo.set(cliente.tipoDocumento);
      this.numero.set(cliente.numeroDocumento);
      this.nombre.set(cliente.nombre);
      this.telefono.set(cliente.telefono ?? '');
      this.correo.set(cliente.correo ?? '');
      // Los datos guardados no traen el resultado de la validación: no se
      // inventa fuente ni coincidencia. El usuario puede volver a validar.
      this.estado.set('inicial');
    }
  }

  onNumero(event: Event): void {
    const digitos = (event.target as HTMLInputElement).value.replace(/\D/g, '');
    const maximo = this.tipo() === 'DNI' ? 8 : 11;
    this.numero.set(digitos.slice(0, maximo));
    this.reiniciarValidacion();
  }

  onNombre(event: Event): void {
    this.nombre.set((event.target as HTMLInputElement).value);
    this.estado.set('inicial');
  }

  onTelefono(event: Event): void {
    this.telefono.set((event.target as HTMLInputElement).value);
  }

  onCorreo(event: Event): void {
    this.correo.set((event.target as HTMLInputElement).value);
  }

  setTipo(tipo: TipoDocumentoCliente): void {
    this.tipo.set(tipo);
    this.numero.set(this.numero().slice(0, tipo === 'DNI' ? 8 : 11));
    this.reiniciarValidacion();
  }

  async validar(): Promise<void> {
    const largo = this.tipo() === 'DNI' ? 8 : 11;
    if (this.numero().length !== largo) {
      this.estado.set('error');
      this.error.set(`El ${this.tipo()} debe tener ${largo} dígitos.`);
      return;
    }
    if (this.estado() === 'validando') {
      return;
    }

    this.estado.set('validando');
    this.error.set('');
    this.motivo.set('');
    try {
      const resultado = await this.clientes.validarDocumento(
        this.tipo(),
        this.numero(),
      );
      this.validez.set(resultado.valido);
      this.fuente.set(resultado.fuente);
      this.modo.set(resultado.modo);
      this.motivo.set(resultado.motivo ?? '');

      if (resultado.valido) {
        if (resultado.nombre) {
          this.nombre.set(resultado.nombre);
        }
        this.estado.set('valido');
        return;
      }

      if (resultado.modo === 'manual') {
        // El backend no pudo validar: se permite registrar el cliente a mano.
        this.estado.set('manual');
        return;
      }

      this.estado.set('error');
      this.error.set(resultado.motivo ?? 'El documento no es válido.');
    } catch (error) {
      this.estado.set('error');
      this.error.set(mensajeError(error));
    }
  }

  private reiniciarValidacion(): void {
    this.estado.set('inicial');
    this.error.set('');
    this.fuente.set('');
    this.modo.set('');
    this.motivo.set('');
    this.validez.set(null);
  }

  async guardar(): Promise<void> {
    if (this.guardando()) {
      return;
    }
    const largo = this.tipo() === 'DNI' ? 8 : 11;
    if (this.numero().length !== largo) {
      this.estado.set('error');
      this.error.set(`El ${this.tipo()} debe tener ${largo} dígitos.`);
      return;
    }
    const nombre = this.nombre().trim();
    if (!nombre) {
      this.estado.set('error');
      this.error.set('Ingresa el nombre del cliente.');
      return;
    }
    const cliente: DatosCliente = {
      tipoDocumento: this.tipo(),
      numeroDocumento: this.numero(),
      nombre,
      telefono: this.telefono().trim() || undefined,
      correo: this.correo().trim() || undefined,
    };
    const cuenta = this.cuenta();
    this.guardando.set(true);
    try {
      if (cuenta) {
        const actualizada = await this.cuentas.guardarCliente(cuenta.id, cliente);
        if (!actualizada) {
          this.estado.set('error');
          this.error.set('No se pudo guardar el cliente. Intenta de nuevo.');
          return;
        }
      } else {
        this.cuentas.guardarClientePendiente(this.mesaId, cliente);
      }
      await this.router.navigate(['/venta-local/pedido', this.mesaId]);
    } catch (error) {
      this.estado.set('error');
      this.error.set(mensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  omitir(): void {
    void this.router.navigate(['/venta-local/pedido', this.mesaId]);
  }
}
