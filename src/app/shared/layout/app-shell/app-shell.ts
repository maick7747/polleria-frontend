import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
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
  /** Prefijos que también activan el ítem (una sola entrada para varios modos). */
  match?: readonly string[];
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', route: '/dashboard', icon: 'house', roles: ['Dueño/Admin', 'Admin'], exact: true },
  {
    label: 'Venta',
    route: '/venta-local',
    icon: 'receipt',
    roles: ['Mozo', 'Cajero', 'Dueño/Admin'],
    exact: false,
    match: ['/venta-local', '/venta'],
  },
  {
    label: 'Pedidos',
    route: '/pedidos',
    icon: 'clipboard-text',
    roles: ['Mozo', 'Cajero', 'Cocinero', 'Dueño/Admin', 'Repartidor'],
    exact: false,
  },
  { label: 'Historial de pedidos', route: '/historial-pedidos', icon: 'clock', roles: ['Mozo', 'Cajero', 'Dueño/Admin', 'Admin'], exact: false },
  { label: 'Historial de cuentas', route: '/historial-cuentas', icon: 'receipt', roles: ['Mozo', 'Cajero', 'Dueño/Admin', 'Admin'], exact: false },
  { label: 'Pedidos listos', route: '/pedidos-listos', icon: 'bell-ringing', roles: ['Mozo', 'Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Cocina KDS', route: '/cocina', icon: 'flame', roles: ['Cocinero', 'Dueño/Admin'], exact: false },
  { label: 'Caja', route: '/cerrar-cuenta', icon: 'cash-register', roles: ['Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Compras', route: '/compras', icon: 'shopping-cart', roles: ['Dueño/Admin', 'Admin'], exact: false },
  { label: 'Inventario', route: '/inventario', icon: 'monitor', roles: ['Cocinero', 'Dueño/Admin'], exact: false },
  { label: 'Fichas técnicas', route: '/fichas-tecnicas', icon: 'book-open', roles: ['Cocinero', 'Dueño/Admin'], exact: false },
  { label: 'Merma', route: '/merma', icon: 'trash', roles: ['Cocinero', 'Dueño/Admin'], exact: false },
  { label: 'Devoluciones', route: '/devoluciones', icon: 'arrow-left', roles: ['Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Gastos', route: '/gastos', icon: 'money', roles: ['Dueño/Admin', 'Admin'], exact: false },
  { label: 'Cuadre de caja', route: '/cuadre-caja', icon: 'credit-card', roles: ['Cajero', 'Dueño/Admin'], exact: false },
  { label: 'Reportes', route: '/reportes', icon: 'chart-bar', roles: ['Dueño/Admin', 'Admin'], exact: false },
  { label: 'Activos', route: '/activos', icon: 'wrench', roles: ['Dueño/Admin', 'Admin'], exact: false },
  { label: 'Configuración', route: '/configuracion', icon: 'gear', roles: ['Dueño/Admin', 'Admin'], exact: true },
  { label: 'Usuarios y roles', route: '/configuracion/usuarios', icon: 'users', roles: ['Dueño/Admin', 'Admin'], exact: true },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly url = signal<string>(this.router.url);

  constructor() {
    this.router.events
      .pipe(
        filter((evento) => evento instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.url.set(this.router.url));
  }

  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly usuario = this.auth.usuario;
  readonly noLeidos = this.notificaciones.noLeidos;

  readonly nav = computed<readonly NavItem[]>(() =>
    NAV_ITEMS.filter((item) => this.auth.hasAnyRole(item.roles)),
  );

  // El logo lleva a la pantalla de inicio del rol (no todos ven el Dashboard).
  readonly inicio = this.auth.home;

  readonly iniciales = computed<string>(() => {
    const nombre = this.usuario()?.nombre ?? '';
    return nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte.charAt(0).toUpperCase())
      .join('');
  });

  esActivo(item: NavItem): boolean {
    const url = this.url();
    if (item.match?.some((prefijo) => url.startsWith(prefijo))) {
      return true;
    }
    if (item.exact) {
      return url === item.route;
    }
    return url === item.route || url.startsWith(`${item.route}/`);
  }

  marcarLeidos(item: NavItem): void {
    if (item.route === '/pedidos-listos') {
      this.notificaciones.marcarLeidos();
    }
  }

  logout(): void {
    this.auth.logout();
  }
}
