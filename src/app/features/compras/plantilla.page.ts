import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ComprasService } from '../../core/data/compras.service';
import { formatearMoneda, formatearNumero } from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

@Component({
  selector: 'app-plantilla-compras-page',
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
  templateUrl: './plantilla.page.html',
  styleUrl: './plantilla.page.css',
})
export class PlantillaComprasPage {
  private readonly compras = inject(ComprasService);
  private readonly destroyRef = inject(DestroyRef);
  private temporizador: number | null = null;

  readonly telefono = '51964118220';
  readonly entrega = 'Mañana 07:00';

  readonly seleccionadas = this.compras.seleccionadas;
  readonly total = this.compras.total;
  readonly subtotal = this.compras.subtotal;
  readonly igv = this.compras.igv;
  readonly ordenActiva = this.compras.ordenActiva;

  readonly mensaje = signal<string>('');
  readonly feedback = signal<string>('');

  readonly moneda = formatearMoneda;
  readonly numero = formatearNumero;

  readonly codigo = computed(() => this.ordenActiva()?.codigo ?? 'OC-0148');
  readonly proveedor = computed(
    () => this.ordenActiva()?.proveedor ?? 'Distribuidora El Sol',
  );
  readonly items = computed(() => this.seleccionadas().length);

  readonly subtitulo = computed(
    () => `Compra de insumos · mensaje para ${this.proveedor()} · 3 variables`,
  );

  constructor() {
    this.mensaje.set(this.construirMensaje());
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  onMensaje(event: Event): void {
    this.mensaje.set((event.target as HTMLTextAreaElement).value);
  }

  copiar(): void {
    const texto = this.mensaje();
    if (!navigator.clipboard) {
      this.mostrarFeedback('Copia manual: selecciona el mensaje y pulsa Ctrl+C');
      return;
    }
    void navigator.clipboard
      .writeText(texto)
      .then(() => this.mostrarFeedback('Mensaje copiado al portapapeles'))
      .catch(() =>
        this.mostrarFeedback('No se pudo copiar. Selecciona el mensaje manualmente.'),
      );
  }

  abrirWhatsapp(): void {
    const url = `https://wa.me/${this.telefono}?text=${encodeURIComponent(this.mensaje())}`;
    window.open(url, '_blank', 'noopener');
  }

  cantidad(valor: number, unidad: string): string {
    const redondeado = Math.round(valor * 10) / 10;
    const texto = Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1);
    return `${texto} ${unidad}`;
  }

  private construirMensaje(): string {
    const lineas = this.seleccionadas().map(
      (sugerencia) =>
        `• ${sugerencia.nombre} — ${this.cantidad(sugerencia.sugerido, sugerencia.unidad)}`,
    );
    if (lineas.length === 0) {
      return `Buenas tardes, ${this.proveedor()}. Le escribo para coordinar el pedido de insumos de la orden ${this.codigo()}.\n\nQuedo atento a su confirmación.`;
    }
    return [
      `Buenas tardes, ${this.proveedor()}. Le envío el pedido de la orden ${this.codigo()}:`,
      '',
      ...lineas,
      '',
      `Total: ${this.moneda(this.total())} (IGV incluido)`,
      `Entrega: ${this.entrega} · Av. Ferrocarril 973, El Tambo`,
      '',
      'Gracias, quedamos atentos a su confirmación.',
    ].join('\n');
  }

  private mostrarFeedback(mensaje: string): void {
    this.feedback.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => {
      this.feedback.set('');
      this.temporizador = null;
    }, 2400);
  }
}
