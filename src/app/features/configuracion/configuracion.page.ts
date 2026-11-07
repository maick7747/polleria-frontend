import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ConfiguracionService } from '../../core/data/configuracion.service';
import { formatearMoneda, round2 } from '../../core/utils/format';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type Tab = 'parametros' | 'canales' | 'pagos';

interface OpcionToggle {
  clave: string;
  nombre: string;
  detalle: string;
  activo: boolean;
}

interface Cambio {
  etiqueta: string;
  antes: string;
  ahora: string;
}

interface Snapshot {
  igv: string;
  kds: string;
  rappi: string;
  llamafood: string;
  delivery: string;
  redondeo: boolean;
  aviso: boolean;
  canales: OpcionToggle[];
  pagos: OpcionToggle[];
}

interface Errores {
  igv: boolean;
  kds: boolean;
  rappi: boolean;
  llamafood: boolean;
  delivery: boolean;
}

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'parametros', label: 'Parámetros' },
  { id: 'canales', label: 'Canales' },
  { id: 'pagos', label: 'Pagos' },
];

@Component({
  selector: 'app-configuracion-page',
  standalone: true,
  imports: [
    AppShellComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './configuracion.page.html',
  styleUrl: './configuracion.page.css',
})
export class ConfiguracionPage {
  private readonly config = inject(ConfiguracionService);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;

  readonly tabs = TABS;
  readonly moneda = formatearMoneda;

  readonly tab = signal<Tab>('parametros');

  readonly igv = signal<string>(this.config.valor('igv_pct') ?? '18');
  readonly kds = signal<string>(this.config.valor('kds_sla_min') ?? '30');
  readonly rappi = signal<string>(this.config.valor('comision_rappi_pct') ?? '25');
  readonly llamafood = signal<string>(this.config.valor('comision_llamafood_pct') ?? '20');
  readonly delivery = signal<string>(this.config.valor('tarifa_delivery') ?? '5');

  readonly redondeo = signal<boolean>(this.config.valor('redondeo_activo') === '1');
  readonly aviso = signal<boolean>(this.config.valor('aviso_mozo_activo') !== '0');

  readonly canales = signal<OpcionToggle[]>([
    {
      clave: 'canal_local',
      nombre: 'Atención en local',
      detalle: 'Mesas, rondas y cuenta por mesa',
      activo: this.config.valor('canal_local') !== '0',
    },
    {
      clave: 'canal_llevar',
      nombre: 'Para llevar',
      detalle: 'Recojo en mostrador al cerrar el pedido',
      activo: this.config.valor('canal_llevar') !== '0',
    },
    {
      clave: 'canal_delivery_propio',
      nombre: 'Delivery propio',
      detalle: 'Reparto con motorizado del restaurante',
      activo: this.config.valor('canal_delivery_propio') !== '0',
    },
    {
      clave: 'canal_delivery_externo',
      nombre: 'Delivery externo',
      detalle: 'Rappi y LlamaFood con comisión',
      activo: this.config.valor('canal_delivery_externo') !== '0',
    },
  ]);

  readonly pagos = signal<OpcionToggle[]>([
    {
      clave: 'pago_efectivo',
      nombre: 'Efectivo',
      detalle: 'Cobro contra entrega y caja del turno',
      activo: this.config.valor('pago_efectivo') !== '0',
    },
    {
      clave: 'pago_tarjeta',
      nombre: 'Tarjeta',
      detalle: 'Débito o crédito sin pasarela integrada',
      activo: this.config.valor('pago_tarjeta') !== '0',
    },
    {
      clave: 'pago_yape',
      nombre: 'Yape',
      detalle: 'Pago móvil con confirmación manual',
      activo: this.config.valor('pago_yape') !== '0',
    },
    {
      clave: 'pago_plin',
      nombre: 'Plin',
      detalle: 'Pago móvil con confirmación manual',
      activo: this.config.valor('pago_plin') !== '0',
    },
  ]);

  readonly guardado = signal<Snapshot>(this.crearSnapshot());

  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly errores = computed<Errores>(() => ({
    igv: !this.enRango(this.numero(this.igv()), 0, 30),
    kds: !this.enRango(this.numero(this.kds()), 5, 120) || this.numero(this.kds()) % 1 !== 0,
    rappi: !this.enRango(this.numero(this.rappi()), 0, 50),
    llamafood: !this.enRango(this.numero(this.llamafood()), 0, 50),
    delivery: !this.enRango(this.numero(this.delivery()), 0, 50),
  }));

  readonly valido = computed<boolean>(() => {
    const actuales = this.errores();
    return (
      !actuales.igv &&
      !actuales.kds &&
      !actuales.rappi &&
      !actuales.llamafood &&
      !actuales.delivery
    );
  });

  readonly cambios = computed<Cambio[]>(() => {
    const base = this.guardado();
    const items: Cambio[] = [];

    if (!this.igual(this.numero(this.igv()), this.numero(base.igv))) {
      items.push({
        etiqueta: 'IGV',
        antes: `${this.numero(base.igv)} %`,
        ahora: `${this.numero(this.igv())} %`,
      });
    }
    if (!this.igual(this.numero(this.kds()), this.numero(base.kds))) {
      items.push({
        etiqueta: 'SLA de cocina (KDS)',
        antes: `${this.numero(base.kds)} min`,
        ahora: `${this.numero(this.kds())} min`,
      });
    }
    if (!this.igual(this.numero(this.rappi()), this.numero(base.rappi))) {
      items.push({
        etiqueta: 'Comisión Rappi',
        antes: `${this.numero(base.rappi)} %`,
        ahora: `${this.numero(this.rappi())} %`,
      });
    }
    if (!this.igual(this.numero(this.llamafood()), this.numero(base.llamafood))) {
      items.push({
        etiqueta: 'Comisión LlamaFood',
        antes: `${this.numero(base.llamafood)} %`,
        ahora: `${this.numero(this.llamafood())} %`,
      });
    }
    if (!this.igual(this.numero(this.delivery()), this.numero(base.delivery))) {
      items.push({
        etiqueta: 'Tarifa de delivery propio',
        antes: this.moneda(this.numero(base.delivery)),
        ahora: this.moneda(this.numero(this.delivery())),
      });
    }
    if (this.redondeo() !== base.redondeo) {
      items.push({
        etiqueta: 'Redondeo de totales',
        antes: base.redondeo ? 'Activado' : 'Desactivado',
        ahora: this.redondeo() ? 'Activado' : 'Desactivado',
      });
    }
    if (this.aviso() !== base.aviso) {
      items.push({
        etiqueta: 'Aviso al mozo',
        antes: base.aviso ? 'Activado' : 'Desactivado',
        ahora: this.aviso() ? 'Activado' : 'Desactivado',
      });
    }

    for (const canal of this.canales()) {
      const previo = base.canales.find((item) => item.clave === canal.clave);
      if (previo && previo.activo !== canal.activo) {
        items.push({
          etiqueta: canal.nombre,
          antes: previo.activo ? 'Activado' : 'Desactivado',
          ahora: canal.activo ? 'Activado' : 'Desactivado',
        });
      }
    }

    for (const pago of this.pagos()) {
      const previo = base.pagos.find((item) => item.clave === pago.clave);
      if (previo && previo.activo !== pago.activo) {
        items.push({
          etiqueta: pago.nombre,
          antes: previo.activo ? 'Activado' : 'Desactivado',
          ahora: pago.activo ? 'Activado' : 'Desactivado',
        });
      }
    }

    return items;
  });

  readonly hayCambios = computed<boolean>(() => this.cambios().length > 0);

  readonly subtitulo = computed<string>(
    () =>
      "Parámetros del sistema · Fratelli's El Tambo · última actualización 12 oct 2026, 18:40",
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  numero(valor: string): number {
    const numero = Number.parseFloat(valor.replace(',', '.'));
    return Number.isFinite(numero) ? round2(numero) : 0;
  }

  cambiarTab(tab: Tab): void {
    this.tab.set(tab);
  }

  onIgv(event: Event): void {
    this.igv.set((event.target as HTMLInputElement).value);
  }

  onKds(event: Event): void {
    this.kds.set((event.target as HTMLInputElement).value);
  }

  onRappi(event: Event): void {
    this.rappi.set((event.target as HTMLInputElement).value);
  }

  onLlamaFood(event: Event): void {
    this.llamafood.set((event.target as HTMLInputElement).value);
  }

  onDelivery(event: Event): void {
    this.delivery.set((event.target as HTMLInputElement).value);
  }

  toggleRedondeo(): void {
    this.redondeo.update((valor) => !valor);
  }

  toggleAviso(): void {
    this.aviso.update((valor) => !valor);
  }

  toggleCanal(clave: string): void {
    this.canales.update((lista) =>
      lista.map((canal) =>
        canal.clave === clave ? { ...canal, activo: !canal.activo } : canal,
      ),
    );
  }

  togglePago(clave: string): void {
    this.pagos.update((lista) =>
      lista.map((pago) => (pago.clave === clave ? { ...pago, activo: !pago.activo } : pago)),
    );
  }

  auditoria(): void {
    this.avisar('Auditoría de configuración · registro simulado');
  }

  guardar(): void {
    if (!this.valido()) {
      this.tab.set('parametros');
      this.avisar('Revisa los parámetros marcados: hay valores fuera de rango', true);
      return;
    }

    const total = this.cambios().length;
    this.config.actualizar('igv_pct', this.numero(this.igv()).toFixed(1));
    this.config.actualizar('kds_sla_min', String(this.numero(this.kds())));
    this.config.actualizar('comision_rappi_pct', this.numero(this.rappi()).toFixed(1));
    this.config.actualizar('comision_llamafood_pct', this.numero(this.llamafood()).toFixed(1));
    this.config.guardar(
      'tarifa_delivery',
      this.numero(this.delivery()).toFixed(2),
      'Tarifa de delivery propio (S/)',
    );
    this.config.guardar(
      'redondeo_activo',
      this.redondeo() ? '1' : '0',
      'Redondeo de totales al sol',
    );
    this.config.guardar(
      'aviso_mozo_activo',
      this.aviso() ? '1' : '0',
      'Aviso al mozo cuando el plato está listo',
    );

    for (const canal of this.canales()) {
      this.config.guardar(canal.clave, canal.activo ? '1' : '0', `Canal ${canal.nombre}`);
    }
    for (const pago of this.pagos()) {
      this.config.guardar(pago.clave, pago.activo ? '1' : '0', `Método de pago ${pago.nombre}`);
    }

    this.guardado.set(this.crearSnapshot());
    this.avisar(
      total === 0
        ? 'Configuración sin cambios'
        : `Configuración guardada · ${total} cambio${total === 1 ? '' : 's'} aplicado${
            total === 1 ? '' : 's'
          }`,
    );
  }

  descartar(): void {
    const base = this.guardado();
    this.igv.set(base.igv);
    this.kds.set(base.kds);
    this.rappi.set(base.rappi);
    this.llamafood.set(base.llamafood);
    this.delivery.set(base.delivery);
    this.redondeo.set(base.redondeo);
    this.aviso.set(base.aviso);
    this.canales.set(base.canales.map((canal) => ({ ...canal })));
    this.pagos.set(base.pagos.map((pago) => ({ ...pago })));
    this.avisar('Cambios descartados');
  }

  private crearSnapshot(): Snapshot {
    return {
      igv: this.igv(),
      kds: this.kds(),
      rappi: this.rappi(),
      llamafood: this.llamafood(),
      delivery: this.delivery(),
      redondeo: this.redondeo(),
      aviso: this.aviso(),
      canales: this.canales().map((canal) => ({ ...canal })),
      pagos: this.pagos().map((pago) => ({ ...pago })),
    };
  }

  private enRango(valor: number, minimo: number, maximo: number): boolean {
    return valor >= minimo && valor <= maximo;
  }

  private igual(a: number, b: number): boolean {
    return Math.abs(a - b) < 0.005;
  }

  private avisar(mensaje: string, error = false): void {
    this.toast.set(mensaje);
    this.toastError.set(error);
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => this.toast.set(''), 2800);
  }
}
