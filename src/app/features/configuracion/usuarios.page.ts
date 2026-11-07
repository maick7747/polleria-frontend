import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ConfiguracionService } from '../../core/data/configuracion.service';
import { MOCK_PERMISOS, PERMISOS_POR_ROL } from '../../core/data/mock-data';
import type { RolNombre, Usuario } from '../../core/models';
import { abreviarNombre } from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type FiltroRol = 'todos' | RolNombre;

interface FiltroVista {
  id: FiltroRol;
  label: string;
}

const ROLES: readonly RolNombre[] = [
  'Mozo',
  'Cajero',
  'Cocinero',
  'Repartidor',
  'Dueño/Admin',
  'Admin',
];

const FILTROS: readonly FiltroVista[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'Dueño/Admin', label: 'Dueño/Admin' },
  { id: 'Mozo', label: 'Mozo' },
  { id: 'Cajero', label: 'Cajero' },
  { id: 'Cocinero', label: 'Cocina' },
];

const ACCESOS: Readonly<Record<number, string>> = {
  1: 'hace 9 min',
  2: 'hace 4 min',
  3: 'hace 26 min',
  4: 'hace 12 min',
  5: 'ayer',
  6: 'hace 2 h',
};

@Component({
  selector: 'app-usuarios-page',
  standalone: true,
  imports: [
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usuarios.page.html',
  styleUrl: './usuarios.page.css',
})
export class UsuariosPage {
  private readonly config = inject(ConfiguracionService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;

  readonly roles = ROLES;
  readonly filtros = FILTROS;
  readonly permisos = MOCK_PERMISOS;
  readonly abreviar = abreviarNombre;

  readonly busqueda = signal<string>('');
  readonly filtroRol = signal<FiltroRol>('todos');
  readonly seleccionadoId = signal<number | null>(null);
  readonly rolesDraft = signal<RolNombre[]>([]);
  readonly errorRoles = signal<boolean>(false);
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly usuarios = this.config.usuarios;

  readonly seleccionado = computed<Usuario | null>(() => {
    const id = this.seleccionadoId();
    const lista = this.usuarios();
    if (id !== null) {
      const encontrado = lista.find((usuario) => usuario.id === id);
      if (encontrado) {
        return encontrado;
      }
    }
    return lista[0] ?? null;
  });

  readonly conteos = computed<Record<string, number>>(() => {
    const lista = this.usuarios();
    const mapa: Record<string, number> = { todos: lista.length };
    for (const rol of ROLES) {
      mapa[rol] = lista.filter((usuario) => usuario.roles.includes(rol)).length;
    }
    return mapa;
  });

  readonly visibles = computed<Usuario[]>(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const filtro = this.filtroRol();
    return this.usuarios().filter((usuario) => {
      const coincideRol = filtro === 'todos' || usuario.roles.includes(filtro);
      const coincideTexto =
        termino.length === 0 ||
        usuario.nombre.toLowerCase().includes(termino) ||
        usuario.email.toLowerCase().includes(termino);
      return coincideRol && coincideTexto;
    });
  });

  readonly permisosDraft = computed<readonly string[]>(() =>
    this.config.permisosDe(this.rolesDraft()),
  );

  readonly hayCambios = computed<boolean>(() => {
    const actual = this.seleccionado();
    if (!actual) {
      return false;
    }
    return [...this.rolesDraft()].sort().join('|') !== [...actual.roles].sort().join('|');
  });

  readonly subtitulo = computed<string>(
    () =>
      `${this.usuarios().length} usuarios · ${ROLES.length} roles del sistema · RBAC con permisos granulares`,
  );

  constructor() {
    const inicial = this.seleccionado();
    if (inicial) {
      this.rolesDraft.set([...inicial.roles]);
    }

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
    });
  }

  iniciales(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte.charAt(0).toUpperCase())
      .join('');
  }

  detalle(usuario: Usuario): string {
    if (usuario.roles.includes('Dueño/Admin')) {
      return 'Dueño del local';
    }
    if (usuario.roles.includes('Cocinero')) {
      return 'Cocina · turno tarde';
    }
    if (usuario.roles.includes('Repartidor')) {
      return 'Reparto · moto propia';
    }
    if (usuario.roles.includes('Cajero')) {
      return 'Turno mañana';
    }
    if (usuario.roles.includes('Admin')) {
      return 'Soporte técnico';
    }
    return 'Turno tarde';
  }

  acceso(usuario: Usuario): string {
    if (usuario.ultimoAcceso) {
      const fecha = new Date(usuario.ultimoAcceso);
      return `${fecha.getDate()}/${fecha.getMonth() + 1}`;
    }
    return ACCESOS[usuario.id] ?? '—';
  }

  esSesion(usuario: Usuario): boolean {
    return this.auth.usuario()?.id === usuario.id;
  }

  rolClase(rol: RolNombre): string {
    switch (rol) {
      case 'Mozo':
        return 'role--mozo';
      case 'Cajero':
        return 'role--cajero';
      case 'Cocinero':
        return 'role--cocinero';
      case 'Repartidor':
        return 'role--repartidor';
      case 'Dueño/Admin':
        return 'role--owner';
      default:
        return 'role--admin';
    }
  }

  onBusqueda(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  filtrar(filtro: FiltroRol): void {
    this.filtroRol.set(filtro);
  }

  seleccionar(usuario: Usuario): void {
    this.seleccionadoId.set(usuario.id);
    this.rolesDraft.set([...usuario.roles]);
    this.errorRoles.set(false);
  }

  toggleRol(rol: RolNombre): void {
    this.rolesDraft.update((actuales) => {
      if (actuales.includes(rol)) {
        return actuales.filter((actual) => actual !== rol);
      }
      return [...actuales, rol];
    });
    if (this.rolesDraft().length > 0) {
      this.errorRoles.set(false);
    }
  }

  origen(codigo: string): string {
    return (
      this.rolesDraft().find((rol) =>
        PERMISOS_POR_ROL[rol].includes(codigo),
      ) ?? ''
    );
  }

  nuevoUsuario(): void {
    this.avisar('Alta de usuarios disponible en el próximo avance');
  }

  guardar(): void {
    const actual = this.seleccionado();
    if (!actual) {
      this.avisar('Selecciona un usuario', true);
      return;
    }
    if (this.rolesDraft().length === 0) {
      this.errorRoles.set(true);
      this.avisar('El usuario debe tener al menos un rol', true);
      return;
    }

    this.config.asignarRoles(actual.id, this.rolesDraft());
    this.errorRoles.set(false);
    this.avisar(`Roles actualizados · ${actual.nombre}`);
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
