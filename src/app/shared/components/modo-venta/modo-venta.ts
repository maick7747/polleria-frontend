import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { IconComponent, type IconName } from '../icon/icon';

export type ModoVenta = 'mesas' | 'mostrador' | 'delivery' | 'apps';

interface ModoItem {
  id: ModoVenta;
  label: string;
  detalle: string;
  icon: IconName;
  ruta: string;
  query?: Record<string, string>;
}

const MODOS: readonly ModoItem[] = [
  {
    id: 'mesas',
    label: 'Mesas',
    detalle: 'Salón · mapa de mesas',
    icon: 'storefront',
    ruta: '/venta-local',
  },
  {
    id: 'mostrador',
    label: 'Mostrador',
    detalle: 'Para llevar · sin mesa',
    icon: 'receipt',
    ruta: '/venta',
    query: { modo: 'mostrador' },
  },
  {
    id: 'delivery',
    label: 'Delivery',
    detalle: 'Propio · WhatsApp y teléfono',
    icon: 'motorcycle',
    ruta: '/venta',
    query: { modo: 'delivery' },
  },
  {
    id: 'apps',
    label: 'Apps',
    detalle: 'Rappi · LlamaFood',
    icon: 'package',
    ruta: '/venta',
    query: { modo: 'apps' },
  },
];

/**
 * Selector de modo de venta. Es la entrada única a los cuatro canales; el
 * menú y el carrito son los mismos, solo cambia el origen del pedido.
 */
@Component({
  selector: 'app-modo-venta',
  standalone: true,
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modebar">
      <span class="modebar__label">Tipo de venta</span>
      <div class="modes">
        @for (modo of visibles(); track modo.id) {
          <a
            class="mode"
            [class.is-active]="activo() === modo.id"
            [routerLink]="modo.ruta"
            [queryParams]="modo.query ?? {}"
            [attr.aria-current]="activo() === modo.id ? 'page' : null"
          >
            <app-icon [name]="modo.icon" [size]="20" />
            <span class="mode__texto">
              <b>{{ modo.label }}</b>
              <span>{{ modo.detalle }}</span>
            </span>
          </a>
        }
      </div>
      <span class="modebar__hint">
        El menú y el carrito son los mismos. Solo cambia el <b>origen</b>.
      </span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .modebar {
      display: flex;
      align-items: stretch;
      gap: 8px;
      padding: 6px;
      border: 1px solid var(--c-border);
      border-radius: var(--r-md);
      background: var(--c-white);
      box-shadow: var(--sh-panel);
    }

    .modebar__label {
      align-self: center;
      padding: 0 10px 0 6px;
      color: var(--c-text-3);
      font-family: var(--font-body);
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.7px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .modes {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      flex: 1;
      min-width: 0;
    }

    .mode {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 8px 12px;
      border: 1px solid transparent;
      border-radius: 11px;
      color: var(--c-text-2);
      text-decoration: none;
      transition:
        background var(--dur) var(--ease),
        color var(--dur) var(--ease);
    }

    .mode:hover {
      background: var(--c-neutral-soft);
    }

    .mode app-icon {
      color: #8b8b96;
      flex: 0 0 auto;
    }

    .mode__texto {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .mode__texto b {
      color: var(--c-text);
      font-family: var(--font-display);
      font-size: 12.5px;
      font-weight: 600;
      line-height: 1.15;
      white-space: nowrap;
    }

    .mode__texto span {
      margin-top: 2px;
      color: var(--c-text-3);
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mode.is-active {
      background: var(--c-ink);
      border-color: var(--c-ink);
      box-shadow: 0 6px 16px rgba(21, 21, 26, 0.18);
    }

    .mode.is-active app-icon,
    .mode.is-active .mode__texto b {
      color: var(--c-white);
    }

    .mode.is-active .mode__texto span {
      color: #9b9ba6;
    }

    .modebar__hint {
      align-self: center;
      width: 168px;
      flex: 0 0 168px;
      padding-right: 6px;
      color: var(--c-text-3);
      font-size: 10px;
      line-height: 1.35;
    }

    @media (max-width: 1200px) {
      .modebar__hint {
        display: none;
      }
    }
  `,
})
export class ModoVentaComponent {
  private readonly auth = inject(AuthService);

  readonly activo = input<ModoVenta>('mesas');

  readonly visibles = computed<readonly ModoItem[]>(() =>
    MODOS.filter((modo) => {
      if (modo.id === 'delivery') {
        return this.auth.hasPermission('delivery.propio');
      }
      if (modo.id === 'apps') {
        return this.auth.hasPermission('delivery.externo');
      }
      return true;
    }),
  );
}
