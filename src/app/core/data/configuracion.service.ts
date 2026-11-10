import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import type { Configuracion, Permiso, RolNombre } from '../models';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { esApiError, mensajeError } from '../api/api.helpers';
import type { ApiList, PageMeta, PermisoDto, RolDto, UsuarioDto } from '../api/api.types';
import {
  toPermiso,
  toRol,
  toUsuario,
  type RolCatalogo,
  type UsuarioVista,
} from '../api/api.mappers';
import {
  MOCK_CONFIGURACION,
  MOCK_PERMISOS,
  MOCK_ROLES,
  MOCK_USUARIOS,
  PERMISOS_POR_ROL,
} from './mock-data';

export type { RolCatalogo, UsuarioVista } from '../api/api.mappers';

export interface UsuariosQuery {
  page?: number;
  limit?: number;
  q?: string;
  activo?: boolean;
  sort?: string;
}

export interface UsuarioEntrada {
  nombre: string;
  email: string;
  usuario?: string;
  telefono?: string;
  clave?: string;
  activo?: boolean;
  turnos?: string[];
  roles: RolNombre[];
}

export interface UsuarioCambios {
  nombre?: string;
  email?: string;
  usuario?: string;
  telefono?: string;
  clave?: string;
  activo?: boolean;
  turnos?: string[];
}

export interface ParametrosConfiguracion {
  igv: number | null;
  igvMinSoles: number | null;
  kdsSlaMin: number | null;
  comisionRappi: number | null;
  comisionLlamaFood: number | null;
  slaDeliveryMin: number | null;
  umbralMermaPolloPct: number | null;
}

interface ConfiguracionDto {
  igv?: number | string | null;
  igv_min_soles?: number | string | null;
  kds_sla_min?: number | string | null;
  comision_rappi?: number | string | null;
  comision_llamafood?: number | string | null;
  sla_delivery_min?: number | string | null;
  umbral_merma_pollo_pct?: number | string | null;
  raw?: Record<string, unknown> | null;
}

const DESCRIPCIONES_PARAMETROS: Record<string, string> = {
  igv_pct: 'IGV aplicado a las ventas (%)',
  igv_min_soles: 'Monto mínimo para aplicar IGV (S/)',
  kds_sla_min: 'Minutos antes de marcar una comanda como prioritaria',
  comision_rappi_pct: 'Comisión de Rappi (%)',
  comision_llamafood_pct: 'Comisión de LlamaFood (%)',
  sla_delivery_min: 'Minutos objetivo de entrega',
  umbral_merma_pollo_pct: 'Umbral de merma de pollo (%)',
  tarifa_delivery: 'Tarifa de delivery propio (S/)',
  redondeo_activo: 'Redondeo de totales al sol',
  aviso_mozo_activo: 'Aviso al mozo cuando el plato está listo',
  canal_local: 'Canal: atención en local',
  canal_llevar: 'Canal: para llevar',
  canal_delivery_propio: 'Canal: delivery propio',
  canal_delivery_externo: 'Canal: delivery externo',
  pago_efectivo: 'Método de pago: efectivo',
  pago_tarjeta: 'Método de pago: tarjeta',
  pago_yape: 'Método de pago: Yape',
  pago_plin: 'Método de pago: Plin',
};

const PARAMETROS_VACIOS: ParametrosConfiguracion = {
  igv: null,
  igvMinSoles: null,
  kdsSlaMin: null,
  comisionRappi: null,
  comisionLlamaFood: null,
  slaDeliveryMin: null,
  umbralMermaPolloPct: null,
};

function aNumeroOpcional(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function aTextoConfig(valor: unknown): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  if (typeof valor === 'boolean') {
    return valor ? '1' : '0';
  }
  return String(valor);
}

const META_INICIAL: PageMeta = {
  page: 1,
  limit: 20,
  total: USE_API ? 0 : MOCK_USUARIOS.length,
  pages: USE_API ? 0 : Math.ceil(MOCK_USUARIOS.length / 20),
};

function paginar<T>(
  lista: readonly T[],
  page: number,
  limit: number,
): { items: T[]; meta: PageMeta } {
  const total = lista.length;
  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  const inicio = (Math.max(1, page) - 1) * limit;
  return {
    items: lista.slice(inicio, inicio + limit),
    meta: { page: Math.max(1, page), limit, total, pages },
  };
}

const rolesDemo = (): RolCatalogo[] =>
  MOCK_ROLES.map((rol) => ({
    id: rol.id,
    nombre: rol.nombre,
    descripcion: rol.descripcion,
    activo: rol.activo,
    permisos: [...PERMISOS_POR_ROL[rol.nombre]],
  }));

@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private readonly api = inject(ApiClient);

  private secuencia = 100;
  private ultimaConsulta: UsuariosQuery = {};

  readonly usaApi = USE_API;
  readonly cargando = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly configuracion = signal<Configuracion[]>(
    USE_API ? [] : MOCK_CONFIGURACION.map((item) => ({ ...item })),
  );

  readonly parametros = signal<ParametrosConfiguracion>({ ...PARAMETROS_VACIOS });
  readonly actualizadoEn = signal<string | null>(null);

  readonly usuarios = signal<UsuarioVista[]>(
    USE_API ? [] : MOCK_USUARIOS.map((usuario) => ({ ...usuario, turnos: [], roles: [...usuario.roles] })),
  );

  private readonly todosDemo = signal<UsuarioVista[]>(
    MOCK_USUARIOS.map((usuario) => ({ ...usuario, turnos: [], roles: [...usuario.roles] })),
  );

  readonly meta = signal<PageMeta>({ ...META_INICIAL });

  readonly rolesCatalogo = signal<RolCatalogo[]>(USE_API ? [] : rolesDemo());

  readonly permisosCatalogo = signal<Permiso[]>(
    USE_API ? [] : MOCK_PERMISOS.map((permiso) => ({ ...permiso })),
  );

  valor(clave: string): string | undefined {
    return this.configuracion().find((item) => item.clave === clave)?.valor;
  }

  actualizar(clave: string, valor: string): void {
    this.configuracion.update((lista) =>
      lista.map((item) =>
        item.clave === clave
          ? { ...item, valor, actualizadoEn: new Date().toISOString() }
          : item,
      ),
    );
  }

  guardar(clave: string, valor: string, descripcion = clave): void {
    if (this.configuracion().some((item) => item.clave === clave)) {
      this.actualizar(clave, valor);
      return;
    }
    const nuevo: Configuracion = {
      id: ++this.secuencia,
      clave,
      valor,
      descripcion,
      actualizadoEn: new Date().toISOString(),
    };
    this.configuracion.update((lista) => [...lista, nuevo]);
  }

  /**
   * Lee los parámetros reales del backend y los expone como `Configuracion[]`
   * para que `valor(clave)` siga funcionando en la vista.
   */
  async cargarParametros(): Promise<boolean> {
    if (!USE_API) {
      this.configuracion.set(MOCK_CONFIGURACION.map((item) => ({ ...item })));
      this.refrescarParametros();
      this.actualizadoEn.set(new Date().toISOString());
      this.error.set(null);
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.get<ConfiguracionDto>('/configuracion'),
      );
      this.aplicarConfiguracion(dto);
      this.error.set(null);
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  /**
   * Envía al backend solo las claves que difieren del último snapshot conocido
   * (el mapeo compara valores numéricos y flags '0'/'1').
   */
  async guardarParametros(
    cambios: Record<string, string | number | boolean>,
  ): Promise<boolean> {
    const payload = this.soloCambiadas(cambios);

    if (!USE_API) {
      for (const [clave, valor] of Object.entries(payload)) {
        this.guardar(
          clave,
          aTextoConfig(valor) ?? '',
          DESCRIPCIONES_PARAMETROS[clave] ?? clave,
        );
      }
      this.refrescarParametros();
      this.actualizadoEn.set(new Date().toISOString());
      this.error.set(null);
      return true;
    }

    if (Object.keys(payload).length === 0) {
      this.error.set(null);
      return true;
    }

    this.guardando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.put<ConfiguracionDto>('/configuracion', payload),
      );
      this.aplicarConfiguracion(dto);
      this.error.set(null);
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.guardando.set(false);
    }
  }

  async cargar(opciones: UsuariosQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? 20;
    const q = opciones.q?.trim() || undefined;

    this.ultimaConsulta = {
      page,
      limit,
      q,
      activo: opciones.activo,
      sort: opciones.sort ?? 'id:asc',
    };

    if (!USE_API) {
      return this.cargarDemo(this.ultimaConsulta);
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<UsuarioDto>>('/configuracion/usuarios', {
          page,
          limit,
          q,
          activo:
            this.ultimaConsulta.activo === undefined
              ? undefined
              : String(this.ultimaConsulta.activo),
          sort: this.ultimaConsulta.sort,
        }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.usuarios.set(lista.data.map(toUsuario));
      this.meta.set({
        page: lista.meta.page ?? page,
        limit: lista.meta.limit ?? limit,
        total,
        pages: lista.meta.pages ?? (limit > 0 ? Math.ceil(total / limit) : 0),
      });
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  async recargar(): Promise<boolean> {
    return this.cargar(this.ultimaConsulta);
  }

  async cargarCatalogos(): Promise<boolean> {
    if (!USE_API) {
      this.rolesCatalogo.set(rolesDemo());
      this.permisosCatalogo.set(MOCK_PERMISOS.map((permiso) => ({ ...permiso })));
      return true;
    }

    try {
      const [roles, permisos] = await Promise.all([
        firstValueFrom(this.api.get<ApiList<RolDto>>('/configuracion/roles')),
        firstValueFrom(this.api.get<ApiList<PermisoDto>>('/configuracion/permisos')),
      ]);
      this.rolesCatalogo.set(roles.data.map(toRol));
      this.permisosCatalogo.set(permisos.data.map(toPermiso));
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    }
  }

  async crearUsuario(entrada: UsuarioEntrada): Promise<UsuarioVista | null> {
    if (!USE_API) {
      const nuevo: UsuarioVista = {
        id: ++this.secuencia,
        nombre: entrada.nombre,
        email: entrada.email,
        telefono: entrada.telefono ?? '',
        activo: entrada.activo ?? true,
        roles: [...entrada.roles],
        permisos: [...this.permisosDe(entrada.roles)],
        usuario: entrada.usuario,
        turnos: [...(entrada.turnos ?? [])],
        creadoEn: new Date().toISOString(),
      };
      this.todosDemo.update((lista) => [nuevo, ...lista]);
      this.usuarios.update((lista) => [nuevo, ...lista]);
      this.meta.update((meta) => ({ ...meta, total: meta.total + 1 }));
      return nuevo;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await this.enviarConRoles<UsuarioDto>('/configuracion/usuarios', 'post', {
        nombre: entrada.nombre,
        email: entrada.email,
        usuario: entrada.usuario || undefined,
        telefono: entrada.telefono || undefined,
        clave: entrada.clave || undefined,
        activo: entrada.activo ?? true,
        turnos: entrada.turnos ?? [],
      }, entrada.roles);
      await this.cargar(this.ultimaConsulta);
      return toUsuario(dto);
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  async actualizarUsuario(
    id: number,
    cambios: UsuarioCambios,
  ): Promise<UsuarioVista | null> {
    if (!USE_API) {
      const actual = this.todosDemo().find((usuario) => usuario.id === id);
      if (!actual) {
        return null;
      }
      const actualizado: UsuarioVista = {
        ...actual,
        ...cambios,
        turnos: cambios.turnos ? [...cambios.turnos] : actual.turnos,
      };
      this.todosDemo.update((lista) =>
        lista.map((usuario) => (usuario.id === id ? actualizado : usuario)),
      );
      this.usuarios.update((lista) =>
        lista.map((usuario) => (usuario.id === id ? actualizado : usuario)),
      );
      return actualizado;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const dto = await firstValueFrom(
        this.api.patch<UsuarioDto>(`/configuracion/usuarios/${id}`, {
          nombre: cambios.nombre,
          email: cambios.email,
          usuario: cambios.usuario,
          telefono: cambios.telefono,
          activo: cambios.activo,
          clave: cambios.clave || undefined,
          turnos: cambios.turnos,
        }),
      );
      await this.cargar(this.ultimaConsulta);
      return toUsuario(dto);
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.cargando.set(false);
    }
  }

  async asignarRoles(usuarioId: number, roles: readonly RolNombre[]): Promise<boolean> {
    if (!USE_API) {
      const permisos = [...this.permisosDe(roles)];
      const aplicar = (usuario: UsuarioVista): UsuarioVista =>
        usuario.id === usuarioId ? { ...usuario, roles: [...roles], permisos } : usuario;
      this.todosDemo.update((lista) => lista.map(aplicar));
      this.usuarios.update((lista) => lista.map(aplicar));
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      await this.enviarConRoles<UsuarioDto>(
        `/configuracion/usuarios/${usuarioId}/roles`,
        'put',
        {},
        roles,
      );
      await this.cargar(this.ultimaConsulta);
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  permisosDe(roles: readonly string[]): readonly string[] {
    const catalogo = this.rolesCatalogo();
    const union = new Set<string>();
    for (const nombre of roles) {
      const rol = catalogo.find((item) => item.nombre === nombre);
      const permisos = rol
        ? rol.permisos
        : (PERMISOS_POR_ROL[nombre as RolNombre] ?? []);
      for (const permiso of permisos) {
        union.add(permiso);
      }
    }
    return [...union];
  }

  cambiarActivo(usuarioId: number, activo: boolean): void {
    void this.actualizarUsuario(usuarioId, { activo });
  }

  conRol(rol: RolNombre): UsuarioVista[] {
    return this.usuarios().filter((usuario) => usuario.roles.includes(rol));
  }

  private async enviarConRoles<T>(
    ruta: string,
    metodo: 'post' | 'put',
    cuerpo: Record<string, unknown>,
    roles: readonly RolNombre[],
  ): Promise<T> {
    const ids = roles
      .map((nombre) => this.rolesCatalogo().find((rol) => rol.nombre === nombre)?.id)
      .filter((id): id is number => typeof id === 'number');

    const enviar = (payload: unknown[]): Observable<T> =>
      metodo === 'post'
        ? this.api.post<T>(ruta, { ...cuerpo, roles: payload })
        : this.api.put<T>(ruta, { ...cuerpo, roles: payload });

    try {
      return await firstValueFrom(enviar(ids.length > 0 ? ids : [...roles]));
    } catch (error) {
      const validacion = esApiError(error) && (error.status === 400 || error.status === 422);
      if (!validacion) {
        throw error;
      }
      return await firstValueFrom(enviar([...roles]));
    }
  }

  private aplicarConfiguracion(dto: ConfiguracionDto): void {
    const ahora = new Date().toISOString();
    const valores = new Map<string, string>();

    const raw = dto.raw && typeof dto.raw === 'object' ? dto.raw : {};
    for (const [clave, valor] of Object.entries(raw)) {
      const texto = aTextoConfig(valor);
      if (texto !== null) {
        valores.set(clave, texto);
      }
    }

    const alias: Record<string, unknown> = {
      igv_pct: dto.igv,
      igv_min_soles: dto.igv_min_soles,
      kds_sla_min: dto.kds_sla_min,
      comision_rappi_pct: dto.comision_rappi,
      comision_llamafood_pct: dto.comision_llamafood,
      sla_delivery_min: dto.sla_delivery_min,
      umbral_merma_pollo_pct: dto.umbral_merma_pollo_pct,
    };
    for (const [clave, valor] of Object.entries(alias)) {
      if (valores.has(clave)) {
        continue;
      }
      const texto = aTextoConfig(valor);
      if (texto !== null) {
        valores.set(clave, texto);
      }
    }

    this.configuracion.set(
      [...valores.entries()].map(([clave, valor], index) => ({
        id: index + 1,
        clave,
        valor,
        descripcion: DESCRIPCIONES_PARAMETROS[clave] ?? clave,
        actualizadoEn: ahora,
      })),
    );
    this.refrescarParametros();
    this.actualizadoEn.set(ahora);
  }

  private refrescarParametros(): void {
    this.parametros.set({
      igv: aNumeroOpcional(this.valor('igv_pct')),
      igvMinSoles: aNumeroOpcional(this.valor('igv_min_soles')),
      kdsSlaMin: aNumeroOpcional(this.valor('kds_sla_min')),
      comisionRappi: aNumeroOpcional(this.valor('comision_rappi_pct')),
      comisionLlamaFood: aNumeroOpcional(this.valor('comision_llamafood_pct')),
      slaDeliveryMin: aNumeroOpcional(this.valor('sla_delivery_min')),
      umbralMermaPolloPct: aNumeroOpcional(this.valor('umbral_merma_pollo_pct')),
    });
  }

  private soloCambiadas(
    cambios: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean> {
    const actuales = new Map(
      this.configuracion().map((item) => [item.clave, item.valor]),
    );
    const salida: Record<string, string | number | boolean> = {};
    for (const [clave, valor] of Object.entries(cambios)) {
      const texto = aTextoConfig(valor);
      if (texto === null) {
        continue;
      }
      const previo = actuales.get(clave);
      if (previo !== undefined && this.sonIguales(previo, texto)) {
        continue;
      }
      salida[clave] = valor;
    }
    return salida;
  }

  private sonIguales(a: string, b: string): boolean {
    if (a === b) {
      return true;
    }
    const numeroA = Number(a);
    const numeroB = Number(b);
    return Number.isFinite(numeroA) && Number.isFinite(numeroB) && numeroA === numeroB;
  }

  private cargarDemo(opciones: UsuariosQuery): boolean {
    const page = opciones.page ?? 1;
    const limit = opciones.limit ?? 20;
    const termino = opciones.q?.trim().toLowerCase() ?? '';

    const filtradas = this.todosDemo().filter((usuario) => {
      const coincideTexto =
        termino.length === 0 ||
        usuario.nombre.toLowerCase().includes(termino) ||
        usuario.email.toLowerCase().includes(termino) ||
        (usuario.usuario ?? '').toLowerCase().includes(termino);
      const coincideActivo =
        opciones.activo === undefined || usuario.activo === opciones.activo;
      return coincideTexto && coincideActivo;
    });

    const { items, meta } = paginar(filtradas, page, limit);
    this.usuarios.set(items);
    this.meta.set(meta);
    return true;
  }
}
