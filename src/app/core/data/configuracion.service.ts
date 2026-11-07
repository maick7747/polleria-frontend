import { Injectable, signal } from '@angular/core';
import type { Configuracion, RolNombre, Usuario } from '../models';
import { MOCK_CONFIGURACION, MOCK_USUARIOS, PERMISOS_POR_ROL } from './mock-data';

@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private secuencia = 100;

  readonly configuracion = signal<Configuracion[]>(
    MOCK_CONFIGURACION.map((item) => ({ ...item })),
  );

  readonly usuarios = signal<Usuario[]>(
    MOCK_USUARIOS.map((usuario) => ({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      telefono: usuario.telefono,
      activo: usuario.activo,
      roles: [...usuario.roles],
      permisos: [...usuario.permisos],
      ultimoAcceso: usuario.ultimoAcceso,
    })),
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

  asignarRoles(usuarioId: number, roles: readonly RolNombre[]): void {
    const permisos = [...new Set(roles.flatMap((rol) => PERMISOS_POR_ROL[rol]))];
    this.usuarios.update((lista) =>
      lista.map((usuario) =>
        usuario.id === usuarioId ? { ...usuario, roles: [...roles], permisos } : usuario,
      ),
    );
  }

  permisosDe(roles: readonly RolNombre[]): readonly string[] {
    return [...new Set(roles.flatMap((rol) => PERMISOS_POR_ROL[rol]))];
  }

  cambiarActivo(usuarioId: number, activo: boolean): void {
    this.usuarios.update((lista) =>
      lista.map((usuario) => (usuario.id === usuarioId ? { ...usuario, activo } : usuario)),
    );
  }

  conRol(rol: RolNombre): Usuario[] {
    return this.usuarios().filter((usuario) => usuario.roles.includes(rol));
  }
}
