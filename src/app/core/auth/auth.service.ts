import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { RolNombre, Sesion, Usuario } from '../models';
import { MOCK_USUARIOS, PERMISOS_POR_ROL } from '../data/mock-data';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esFalloRed, mensajeError } from '../api/api.helpers';
import type { LoginResponseDto } from '../api/api.types';

const STORAGE_KEY = 'fratelli.session.v1';
const DURACION_SESION_MS = 8 * 60 * 60 * 1000;
const ROLES: readonly RolNombre[] = [
  'Mozo',
  'Cajero',
  'Cocinero',
  'Repartidor',
  'Dueño/Admin',
  'Admin',
];

const USUARIOS_API_COMPAT: readonly {
  email: string;
  password: string;
  usuarioId: number;
  roles: readonly RolNombre[];
}[] = [
  { email: 'maick@fratellis.pe', password: 'demo123', usuarioId: 1, roles: ['Dueño/Admin'] },
  { email: 'cajero@fratellis.pe', password: 'demo123', usuarioId: 3, roles: ['Mozo', 'Cajero'] },
  { email: 'cocina@fratellis.pe', password: 'demo123', usuarioId: 4, roles: ['Cocinero'] },
  { email: 'repartidor@fratellis.pe', password: 'demo123', usuarioId: 5, roles: ['Repartidor'] },
  { email: 'tecnico@fratellis.pe', password: 'demo123', usuarioId: 6, roles: ['Admin'] },
];

const esRol = (valor: string): valor is RolNombre =>
  ROLES.some((rol) => rol === valor);

export interface LoginResult {
  ok: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);
  private readonly sesion = signal<Sesion | null>(this.hidratar());

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('fratelli:sesion-expirada', () => this.sesion.set(null));
    }
  }

  readonly usuario = computed<Usuario | null>(() => this.sesion()?.usuario ?? null);
  readonly roles = computed<readonly RolNombre[]>(() => this.usuario()?.roles ?? []);
  readonly permisos = computed<readonly string[]>(() => this.usuario()?.permisos ?? []);

  /**
   * Pantalla de inicio según el perfil: cada rol entra donde puede trabajar,
   * así nadie cae en el Dashboard y recibe un 403.
   */
  readonly home = computed<string>(() => {
    const usuario = this.usuario();
    if (!usuario) {
      return '/login';
    }
    const roles = usuario.roles;
    if (roles.includes('Dueño/Admin') || roles.includes('Admin')) {
      return '/dashboard';
    }
    if (roles.includes('Cocinero')) {
      return '/cocina';
    }
    if (roles.includes('Mozo') || roles.includes('Cajero')) {
      return '/venta-local';
    }
    if (roles.includes('Repartidor')) {
      return '/delivery-propio';
    }
    return '/login';
  });

  isAuthenticated(): boolean {
    const actual = this.sesion();
    return actual !== null && actual.expiraEn > Date.now();
  }

  async login(email: string, password: string): Promise<LoginResult> {
    if (USE_API) {
      try {
        const respuesta = await firstValueFrom(
          this.api.post<LoginResponseDto>('/auth/login', { email, password }),
        );
        const roles = respuesta.roles.filter(esRol);
        const usuario: Usuario = {
          id: respuesta.usuario.id,
          nombre: respuesta.usuario.nombre,
          email: respuesta.usuario.email,
          telefono: respuesta.usuario.telefono ?? '',
          activo: respuesta.usuario.activo,
          roles,
          permisos: [...respuesta.permisos],
          ultimoAcceso: new Date().toISOString(),
        };
        const nueva: Sesion = {
          usuario,
          token: respuesta.token,
          expiraEn: Date.now() + respuesta.expires_in * 1000,
        };
        this.sesion.set(nueva);
        this.persistir(nueva);
        return { ok: true };
      } catch (error) {
        if (!esFalloRed(error)) {
          return { ok: false, error: mensajeError(error) };
        }
      }
    }

    return this.loginMock(email, password);
  }

  logout(): void {
    if (USE_API) {
      void firstValueFrom(this.api.post<void>('/auth/logout')).catch(() => undefined);
    }
    this.sesion.set(null);
    this.api.limpiarCacheEtag();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    void this.router.navigateByUrl('/login');
  }

  hasRole(role: RolNombre): boolean {
    return this.roles().includes(role);
  }

  hasAnyRole(roles: readonly RolNombre[]): boolean {
    if (roles.length === 0) {
      return true;
    }
    return roles.some((role) => this.roles().includes(role));
  }

  hasPermission(codigo: string): boolean {
    const actual = this.usuario();
    if (!actual) {
      return false;
    }
    const derivados = new Set(actual.roles.flatMap((rol) => PERMISOS_POR_ROL[rol]));
    return actual.permisos.includes(codigo) || derivados.has(codigo);
  }

  private loginMock(email: string, password: string): LoginResult {
    const correo = email.trim().toLowerCase();
    const encontrado = MOCK_USUARIOS.find(
      (candidato) =>
        candidato.email.toLowerCase() === correo &&
        candidato.password === password &&
        candidato.activo,
    );

    if (encontrado) {
      return this.establecerSesion({
        id: encontrado.id,
        nombre: encontrado.nombre,
        email: encontrado.email,
        telefono: encontrado.telefono,
        activo: encontrado.activo,
        roles: [...encontrado.roles],
        permisos: [...encontrado.permisos],
      });
    }

    const compat = USUARIOS_API_COMPAT.find(
      (candidato) =>
        candidato.email.toLowerCase() === correo && candidato.password === password,
    );
    if (!compat) {
      return { ok: false, error: 'Credenciales inválidas. Verifica tu correo y contraseña.' };
    }

    const base = MOCK_USUARIOS.find((candidato) => candidato.id === compat.usuarioId);
    const permisos = Array.from(
      new Set(compat.roles.flatMap((rol) => PERMISOS_POR_ROL[rol])),
    );
    return this.establecerSesion({
      id: base?.id ?? compat.usuarioId,
      nombre: base?.nombre ?? correo,
      email: compat.email,
      telefono: base?.telefono ?? '',
      activo: true,
      roles: [...compat.roles],
      permisos,
    });
  }

  private establecerSesion(datos: Omit<Usuario, 'ultimoAcceso'>): LoginResult {
    const usuario: Usuario = { ...datos, ultimoAcceso: new Date().toISOString() };
    const nueva: Sesion = {
      usuario,
      token: `mock-${usuario.id}-${Date.now()}`,
      expiraEn: Date.now() + DURACION_SESION_MS,
    };
    this.sesion.set(nueva);
    this.persistir(nueva);
    return { ok: true };
  }

  private persistir(sesion: Sesion): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
  }

  private hidratar(): Sesion | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const almacenada = JSON.parse(raw) as Sesion;
      if (!almacenada.usuario || almacenada.expiraEn <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return almacenada;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
}
