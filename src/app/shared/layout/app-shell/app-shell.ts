import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificacionesService } from '../../../core/data/notificaciones.service';
import type { RolNombre } from '../../../core/models';
import { IconComponent, type IconName } from '../../components/icon/icon';

interface NavItem {
  label: string;
  route: string;
  icon: IconName;
  roles: readonly RolNombre[];
  exact: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', route: '/dashboard', icon: 'house', roles: [], exact: true },
  { label: 'Venta en Local', route: '/venta-local', icon: 'receipt', roles: ['Mozo', 'Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Comandas', route: '/comandas', icon: 'clipboard-text', roles: ['Mozo', 'Cajero', 'Cocinero', 'Dueño/Admin'], exact: false },
  { label: 'Historial de pedidos', route: '/historial-pedidos', icon: 'clock', roles: ['Mozo', 'Cajero', 'Dueño/Admin', 'Admin'], exact: false },
  { label: 'Historial de cuentas', route: '/historial-cuentas', icon: 'receipt', roles: ['Mozo', 'Cajero', 'Dueño/Admin', 'Admin'], exact: false },
  { label: 'Pedidos listos', route: '/pedidos-listos', icon: 'bell-ringing', roles: ['Mozo', 'Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Cocina KDS', route: '/cocina', icon: 'flame', roles: ['Cocinero', 'Dueño/Admin'], exact: false },
  { label: 'Cerrar cuenta', route: '/cerrar-cuenta', icon: 'cash-register', roles: ['Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Delivery propio', route: '/delivery-propio', icon: 'storefront', roles: ['Repartidor', 'Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Delivery externo', route: '/delivery-externo', icon: 'package', roles: ['Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Compras', route: '/compras', icon: 'shopping-cart', roles: ['Dueño/Admin', 'Admin'], exact: false },
  { label: 'Inventario', route: '/inventario', icon: 'monitor', roles: ['Cocinero', 'Dueño/Admin'], exact: false },
  { label: 'Fichas técnicas', route: '/fichas-tecnicas', icon: 'book-open', roles: ['Cocinero', 'Dueño/Admin'], exact: false },
  { label: 'Merma', route: '/merma', icon: 'trash', roles: ['Cocinero', 'Dueño/Admin'], exact: false },
  { label: 'Devoluciones', route: '/devoluciones', icon: 'arrow-left', roles: ['Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Gastos', route: '/gastos', icon: 'money', roles: ['Dueño/Admin', 'Admin'], exact: false },
  { label: 'Cuadre de caja', route: '/cuadre-caja', icon: 'credit-card', roles: ['Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Reportes', route: '/reportes', icon: 'chart-bar', roles: ['Dueño/Admin', 'Admin'], exact: false },
  { label: 'Activos', route: '/activos', icon: 'wrench', roles: ['Dueño/Admin', 'Admin'], exact: false },
  { label: 'Configuración', route: '/configuracion', icon: 'gear', roles: ['Dueño/Admin', 'Admin'], exact: false },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  private readonly notificaciones = inject(NotificacionesService);

  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly usuario = this.auth.usuario;
  readonly noLeidos = this.notificaciones.noLeidos;

  readonly nav = computed<readonly NavItem[]>(() =>
    NAV_ITEMS.filter((item) => this.auth.hasAnyRole(item.roles)),
  );

  readonly iniciales = computed<string>(() => {
    const nombre = this.usuario()?.nombre ?? '';
    return nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte.charAt(0).toUpperCase())
      .join('');
  });

  marcarLeidos(item: NavItem): void {
    if (item.route === '/pedidos-listos') {
      this.notificaciones.marcarLeidos();
    }
  }

  logout(): void {
    this.auth.logout();
  }
}
