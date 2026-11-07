export type RolNombre =
  | 'Mozo'
  | 'Cajero'
  | 'Cocinero'
  | 'Repartidor'
  | 'Dueño/Admin'
  | 'Admin';

export interface Rol {
  id: number;
  nombre: RolNombre;
  descripcion: string;
  activo: boolean;
}

export interface Permiso {
  id: number;
  codigo: string;
  descripcion: string;
  modulo: string;
  activo: boolean;
}

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  activo: boolean;
  roles: RolNombre[];
  permisos: string[];
  ultimoAcceso?: string;
}

export interface Sesion {
  usuario: Usuario;
  token: string;
  expiraEn: number;
}

export type PermisosPorRol = Readonly<Record<RolNombre, readonly string[]>>;
