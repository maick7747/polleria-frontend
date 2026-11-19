import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { ModoVentaComponent, type ModoVenta } from './modo-venta';

const crearAuth = (permisos: readonly string[]): Partial<AuthService> => ({
  hasPermission: (permiso: string) => permisos.includes(permiso),
});

const crear = (
  permisos: readonly string[],
  activo: ModoVenta = 'mesas',
): ReturnType<typeof TestBed.createComponent<ModoVentaComponent>> => {
  TestBed.configureTestingModule({
    imports: [ModoVentaComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: crearAuth(permisos) },
    ],
  });
  const fixture = TestBed.createComponent(ModoVentaComponent);
  fixture.componentRef.setInput('activo', activo);
  fixture.detectChanges();
  return fixture;
};

const texto = (elemento: Element | null): string =>
  (elemento?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('ModoVentaComponent', () => {
  it('muestra los 4 modos para un usuario con todos los permisos', () => {
    const host = crear([
      'venta.registrar',
      'delivery.propio',
      'delivery.externo',
    ]).nativeElement as HTMLElement;

    const modos = Array.from(host.querySelectorAll('.mode'));
    expect(modos).toHaveLength(4);
    expect(modos.map((modo) => texto(modo.querySelector('b')))).toEqual([
      'Mesas',
      'Mostrador',
      'Delivery',
      'Apps',
    ]);
  });

  it('oculta delivery y apps sin sus permisos', () => {
    const host = crear(['venta.registrar']).nativeElement as HTMLElement;

    const modos = Array.from(host.querySelectorAll('.mode'));
    expect(modos).toHaveLength(2);
    expect(modos.map((modo) => texto(modo.querySelector('b')))).toEqual([
      'Mesas',
      'Mostrador',
    ]);
  });

  it('marca el modo activo y enlaza las rutas de venta', () => {
    const host = crear(
      ['venta.registrar', 'delivery.propio', 'delivery.externo'],
      'apps',
    ).nativeElement as HTMLElement;

    const activo = host.querySelector('.mode.is-active');
    expect(texto(activo ? activo.querySelector('b') : null)).toBe('Apps');

    const enlaces = Array.from(host.querySelectorAll('a.mode')).map((nodo) =>
      nodo.getAttribute('href'),
    );
    expect(enlaces).toEqual([
      '/venta-local',
      '/venta?modo=mostrador',
      '/venta?modo=delivery',
      '/venta?modo=apps',
    ]);
  });
});
