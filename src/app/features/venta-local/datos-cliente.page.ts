import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CuentasService } from '../../core/data/cuentas.service';
import { MesasService } from '../../core/data/mesas.service';
import type { DatosCliente, TipoDocumentoCliente } from '../../core/models';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type EstadoValidacion = 'inicial' | 'validando' | 'valido' | 'error';

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
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mesaId = Number(this.route.snapshot.queryParamMap.get('mesaId'));
  private readonly usuarioId = this.auth.usuario()?.id ?? 3;
  private temporizador: number | null = null;

  readonly tipo = signal<TipoDocumentoCliente>('DNI');
  readonly numero = signal<string>('');
  readonly nombre = signal<string>('');
  readonly telefono = signal<string>('');
  readonly correo = signal<string>('');
  readonly estado = signal<EstadoValidacion>('inicial');
  readonly fuente = signal<string>('');
  readonly consultado = signal<string>('');
  readonly coincidencia = signal<number>(0);
  readonly error = signal<string>('');

  readonly mesa = computed(() => this.mesas.porId(this.mesaId) ?? null);
  readonly cuenta = computed(() => this.cuentas.cuentaDeMesa(this.mesaId) ?? null);

  readonly subtitulo = computed(() => {
    const numeroMesa = String(this.mesa()?.numero ?? 0).padStart(2, '0');
    const ronda = (this.cuenta()?.rondas.length ?? 0) + 1;
    return `Venta en local · Mesa ${numeroMesa} · ronda ${ronda} · paso opcional`;
  });

  readonly docHint = computed(() => (this.tipo() === 'DNI' ? '8 dígitos' : '11 dígitos'));

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
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });

    if (!this.mesa()) {
      void this.router.navigate(['/venta-local']);
      return;
    }
    if (!this.cuentas.cuentaDeMesa(this.mesaId)) {
      void this.cuentas.abrirCuenta(this.mesaId, this.usuarioId);
    }
    const cliente = this.cuenta()?.cliente;
    if (cliente) {
      this.tipo.set(cliente.tipoDocumento);
      this.numero.set(cliente.numeroDocumento);
      this.nombre.set(cliente.nombre);
      this.telefono.set(cliente.telefono ?? '');
      this.correo.set(cliente.correo ?? '');
      this.estado.set('valido');
      this.fuente.set(cliente.tipoDocumento === 'DNI' ? 'RENIEC' : 'SUNAT');
      this.coincidencia.set(100);
    }
  }

  onNumero(event: Event): void {
    const digitos = (event.target as HTMLInputElement).value.replace(/\D/g, '');
    const maximo = this.tipo() === 'DNI' ? 8 : 11;
    this.numero.set(digitos.slice(0, maximo));
    this.estado.set('inicial');
    this.error.set('');
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
    this.estado.set('inicial');
    this.error.set('');
  }

  validar(): void {
    const largo = this.tipo() === 'DNI' ? 8 : 11;
    if (this.numero().length !== largo) {
      this.estado.set('error');
      this.error.set(`El ${this.tipo()} debe tener ${largo} dígitos.`);
      return;
    }
    this.estado.set('validando');
    this.error.set('');
    this.temporizador = window.setTimeout(() => {
      const esDni = this.tipo() === 'DNI';
      this.fuente.set(esDni ? 'RENIEC' : 'SUNAT');
      this.consultado.set('17:41');
      this.coincidencia.set(100);
      this.estado.set('valido');
      if (!this.nombre().trim()) {
        this.nombre.set(
          esDni ? 'Lucía Ramos Quispe' : "Inversiones Fratelli's S.A.C.",
        );
      }
    }, 650);
  }

  guardar(): void {
    const cuenta = this.cuenta();
    if (!cuenta) {
      void this.router.navigate(['/venta-local']);
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
    this.cuentas.guardarCliente(cuenta.id, cliente);
    void this.router.navigate(['/venta-local/pedido', this.mesaId]);
  }

  omitir(): void {
    void this.router.navigate(['/venta-local/pedido', this.mesaId]);
  }
}
