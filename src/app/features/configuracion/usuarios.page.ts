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
import {
  ConfiguracionService,
  type UsuarioVista,
} from '../../core/data/configuracion.service';
import type { RolNombre } from '../../core/models';
import { abreviarNombre } from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PaginadorComponent } from '../../shared/components/paginador/paginador';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

type FiltroActivo = 'todos' | 'activos' | 'inactivos';
type Modo = 'editar' | 'nuevo';

interface FiltroVista {
  id: FiltroActivo;
  label: string;
}

const FILTROS: readonly FiltroVista[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'activos', label: 'Activos' },
  { id: 'inactivos', label: 'Inactivos' },
];

const LIMITES = [10, 20, 50, 100];

@Component({
  selector: 'app-usuarios-page',
  standalone: true,
  imports: [
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PaginadorComponent,
    PanelComponent,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usuarios.page.html',
  styleUrl: './usuarios.page.css',
})
export class UsuariosPage {
  private readonly config = inject(ConfiguracionService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private toastTimer: number | null = null;
  private buscarTimer: number | null = null;

  readonly filtros = FILTROS;
  readonly abreviar = abreviarNombre;

  readonly busqueda = signal<string>('');
  readonly filtroActivo = signal<FiltroActivo>('todos');
  readonly pagina = signal<number>(1);
  readonly limite = signal<number>(20);
  readonly seleccionadoId = signal<number | null>(null);
  readonly modo = signal<Modo>('editar');

  readonly nombre = signal<string>('');
  readonly email = signal<string>('');
  readonly usuario = signal<string>('');
  readonly telefono = signal<string>('');
  readonly clave = signal<string>('');
  readonly activo = signal<boolean>(true);
  readonly rolesDraft = signal<string[]>([]);

  readonly errorRoles = signal<boolean>(false);
  readonly toast = signal<string>('');
  readonly toastError = signal<boolean>(false);

  readonly usuarios = this.config.usuarios;
  readonly meta = this.config.meta;
  readonly cargando = this.config.cargando;
  readonly error = this.config.error;
  readonly roles = this.config.rolesCatalogo;
  readonly permisos = this.config.permisosCatalogo;

  readonly seleccionado = computed<UsuarioVista | null>(() => {
    const id = this.seleccionadoId();
    if (id !== null) {
      const encontrado = this.usuarios().find((usuario) => usuario.id === id);
      if (encontrado) {
        return encontrado;
      }
    }
    return this.usuarios()[0] ?? null;
  });

  readonly permisosDraft = computed<readonly string[]>(() =>
    this.config.permisosDe(this.rolesDraft()),
  );

  readonly hayCambios = computed<boolean>(() => {
    const actual = this.seleccionado();
    if (!actual || this.modo() === 'nuevo') {
      return true;
    }
    return (
      [...this.rolesDraft()].sort().join('|') !== [...actual.roles].sort().join('|') ||
      this.nombre() !== actual.nombre ||
      this.telefono() !== actual.telefono ||
      this.activo() !== actual.activo
    );
  });

  readonly puedeGuardar = computed<boolean>(() => {
    if (this.rolesDraft().length === 0) {
      return false;
    }
    if (this.nombre().trim().length === 0 || this.email().trim().length === 0) {
      return false;
    }
    return this.modo() === 'editar' || this.clave().trim().length > 0;
  });

  readonly subtitulo = computed<string>(
    () =>
      `${this.meta().total} usuarios · ${this.roles().length} roles del sistema · RBAC con permisos granulares`,
  );

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.busqueda.set(params.get('q') ?? '');
    const activoParam = params.get('activo');
    this.filtroActivo.set(
      activoParam === 'true' ? 'activos' : activoParam === 'false' ? 'inactivos' : 'todos',
    );
    this.pagina.set(Math.max(1, Number(params.get('page')) || 1));
    const limite = Number(params.get('limit'));
    this.limite.set(LIMITES.includes(limite) ? limite : 20);

    void this.inicializar();

    this.destroyRef.onDestroy(() => {
      if (this.toastTimer !== null) {
        window.clearTimeout(this.toastTimer);
      }
      if (this.buscarTimer !== null) {
        window.clearTimeout(this.buscarTimer);
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

  detalle(usuario: UsuarioVista): string {
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

  acceso(usuario: UsuarioVista): string {
    if (usuario.ultimoAcceso) {
      const fecha = new Date(usuario.ultimoAcceso);
      if (!Number.isNaN(fecha.getTime())) {
        return `${fecha.getDate()}/${fecha.getMonth() + 1}`;
      }
    }
    return '—';
  }

  esSesion(usuario: UsuarioVista): boolean {
    return this.auth.usuario()?.id === usuario.id;
  }

  rolClase(rol: string): string {
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
    if (this.buscarTimer !== null) {
      window.clearTimeout(this.buscarTimer);
    }
    this.buscarTimer = window.setTimeout(() => {
      this.pagina.set(1);
      void this.cargar();
    }, 350);
  }

  filtrar(filtro: FiltroActivo): void {
    if (this.filtroActivo() === filtro) {
      return;
    }
    this.filtroActivo.set(filtro);
    this.pagina.set(1);
    void this.cargar();
  }

  seleccionar(usuario: UsuarioVista): void {
    this.seleccionadoId.set(usuario.id);
    this.modo.set('editar');
    this.cargarFormulario(usuario);
    this.errorRoles.set(false);
  }

  cambiarPagina(page: number): void {
    this.pagina.set(page);
    void this.cargar();
  }

  cambiarLimite(limit: number): void {
    this.limite.set(limit);
    this.pagina.set(1);
    void this.cargar();
  }

  recargar(): void {
    void this.inicializar();
  }

  nuevoUsuario(): void {
    this.modo.set('nuevo');
    this.seleccionadoId.set(null);
    this.nombre.set('');
    this.email.set('');
    this.usuario.set('');
    this.telefono.set('');
    this.clave.set('');
    this.activo.set(true);
    this.rolesDraft.set([]);
    this.errorRoles.set(false);
  }

  onCampo(
    event: Event,
    campo: 'nombre' | 'email' | 'usuario' | 'telefono' | 'clave',
  ): void {
    const valor = (event.target as HTMLInputElement).value;
    switch (campo) {
      case 'nombre':
        this.nombre.set(valor);
        return;
      case 'email':
        this.email.set(valor);
        return;
      case 'usuario':
        this.usuario.set(valor);
        return;
      case 'telefono':
        this.telefono.set(valor);
        return;
      default:
        this.clave.set(valor);
    }
  }

  cambiarActivo(event: Event): void {
    this.activo.set((event.target as HTMLInputElement).checked);
  }

  toggleRol(rol: string): void {
    this.rolesDraft.update((actuales) =>
      actuales.includes(rol)
        ? actuales.filter((actual) => actual !== rol)
        : [...actuales, rol],
    );
    if (this.rolesDraft().length > 0) {
      this.errorRoles.set(false);
    }
  }

  origen(codigo: string): string {
    const rol = this.roles().find((item) => item.permisos.includes(codigo));
    return rol ? rol.nombre : '';
  }

  async guardar(): Promise<void> {
    if (this.rolesDraft().length === 0) {
      this.errorRoles.set(true);
      this.avisar('El usuario debe tener al menos un rol', true);
      return;
    }
    if (this.nombre().trim().length === 0 || this.email().trim().length === 0) {
      this.avisar('Nombre y correo son obligatorios', true);
      return;
    }

    if (this.modo() === 'nuevo') {
      if (this.clave().trim().length === 0) {
        this.avisar('Define una clave para el nuevo usuario', true);
        return;
      }
      const creado = await this.config.crearUsuario({
        nombre: this.nombre().trim(),
        email: this.email().trim(),
        usuario: this.usuario().trim() || undefined,
        telefono: this.telefono().trim() || undefined,
        clave: this.clave().trim(),
        activo: this.activo(),
        roles: this.rolesDraft() as RolNombre[],
      });
      if (!creado) {
        this.avisar(this.config.error() ?? 'No se pudo crear el usuario', true);
        return;
      }
      this.modo.set('editar');
      this.seleccionadoId.set(creado.id);
      this.cargarFormulario(creado);
      this.avisar(`Usuario creado · ${creado.nombre}`);
      return;
    }

    const actual = this.seleccionado();
    if (!actual) {
      this.avisar('Selecciona un usuario', true);
      return;
    }

    const actualizado = await this.config.actualizarUsuario(actual.id, {
      nombre: this.nombre().trim(),
      telefono: this.telefono().trim(),
      activo: this.activo(),
    });
    if (!actualizado) {
      this.avisar(this.config.error() ?? 'No se pudo actualizar el usuario', true);
      return;
    }

    const okRoles = await this.config.asignarRoles(
      actual.id,
      this.rolesDraft() as RolNombre[],
    );
    if (!okRoles) {
      this.avisar(this.config.error() ?? 'No se pudieron actualizar los roles', true);
      return;
    }

    this.avisar(`Usuario actualizado · ${actualizado.nombre}`);
    await this.cargar();
  }

  private async inicializar(): Promise<void> {
    await Promise.all([this.cargar(), this.config.cargarCatalogos()]);
    if (this.modo() === 'editar') {
      const seleccionado = this.seleccionado();
      if (seleccionado) {
        this.cargarFormulario(seleccionado);
      }
    }
  }

  private async cargar(): Promise<void> {
    const filtro = this.filtroActivo();
    const ok = await this.config.cargar({
      page: this.pagina(),
      limit: this.limite(),
      q: this.busqueda(),
      activo: filtro === 'todos' ? undefined : filtro === 'activos',
      sort: 'id:asc',
    });
    if (!ok) {
      return;
    }
    this.pagina.set(this.config.meta().page);
    this.limite.set(this.config.meta().limit);
    this.sincronizarUrl();
    if (this.modo() === 'editar') {
      const seleccionado = this.seleccionado();
      if (seleccionado) {
        this.seleccionadoId.set(seleccionado.id);
        this.cargarFormulario(seleccionado);
      }
    }
  }

  private cargarFormulario(usuario: UsuarioVista): void {
    this.nombre.set(usuario.nombre);
    this.email.set(usuario.email);
    this.usuario.set(usuario.usuario ?? '');
    this.telefono.set(usuario.telefono);
    this.clave.set('');
    this.activo.set(usuario.activo);
    this.rolesDraft.set([...usuario.roles]);
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.pagina() > 1 ? this.pagina() : null,
        limit: this.limite() !== 20 ? this.limite() : null,
        q: this.busqueda().trim() || null,
        activo:
          this.filtroActivo() === 'todos' ? null : this.filtroActivo() === 'activos',
      },
      replaceUrl: true,
    });
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
    }, 2800);
  }
}
