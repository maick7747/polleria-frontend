import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PedidoDetalle, Plato } from '../../../core/models';
import { FichasService } from '../../../core/data/fichas.service';
import { InventarioService } from '../../../core/data/inventario.service';
import { SelectorPlatosComponent } from './selector-platos';

const PLATOS: Plato[] = [
  {
    id: 1,
    nombre: 'Pollo a la brasa',
    descripcion: '',
    categoria: 'Pollos',
    precioVenta: 25,
    activo: true,
    ingredientes: [],
    disponible: true,
  },
  {
    id: 2,
    nombre: 'Chicha morada',
    descripcion: '',
    categoria: 'Bebidas',
    precioVenta: 8,
    activo: true,
    ingredientes: [],
    disponible: true,
  },
];

const linea = (
  platilloId: number,
  nombre: string,
  cantidad: number,
  precio: number,
): PedidoDetalle => ({
  id: platilloId,
  platilloId,
  nombre,
  cantidad,
  precioUnitario: precio,
  subtotal: cantidad * precio,
  estadoPreparacion: 'pendiente',
});

const texto = (elemento: Element | null): string =>
  (elemento?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('SelectorPlatosComponent', () => {
  const platos = signal<Plato[]>(PLATOS);

  const fichasStub = {
    platos,
    activos: computed(() => platos().filter((plato) => plato.activo)),
    cargando: signal(false),
    error: signal<string | null>(null),
    cargar: vi.fn(async () => true),
  };

  const inventarioStub = { porId: () => undefined };

  const crear = (): ReturnType<typeof TestBed.createComponent<SelectorPlatosComponent>> => {
    const fixture = TestBed.createComponent(SelectorPlatosComponent);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    platos.set(PLATOS);
    TestBed.configureTestingModule({
      imports: [SelectorPlatosComponent],
      providers: [
        { provide: FichasService, useValue: fichasStub },
        { provide: InventarioService, useValue: inventarioStub },
      ],
    });
  });

  it('agrega un plato al carrito y calcula el subtotal', () => {
    const fixture = crear();
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('.plato__add') as HTMLButtonElement).click();
    fixture.detectChanges();

    const items = fixture.componentInstance.items();
    expect(items).toHaveLength(1);
    expect(items[0].platilloId).toBe(1);
    expect(items[0].cantidad).toBe(1);
    expect(texto(host.querySelector('.carrito__total'))).toContain('S/ 25.00');
  });

  it('suma cantidades del mismo plato', () => {
    const fixture = crear();
    const host = fixture.nativeElement as HTMLElement;
    const boton = host.querySelector('.plato__add') as HTMLButtonElement;

    boton.click();
    boton.click();
    fixture.detectChanges();

    const items = fixture.componentInstance.items();
    expect(items).toHaveLength(1);
    expect(items[0].cantidad).toBe(2);
    expect(items[0].subtotal).toBe(50);
    expect(texto(host.querySelector('.selector__meta'))).toContain('2 unidades');
  });

  it('quita una unidad y elimina la línea cuando llega a cero', () => {
    const fixture = crear();
    fixture.componentRef.setInput('items', [
      linea(2, 'Chicha morada', 2, 8),
    ]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const menos = host.querySelector('.linea__minus') as HTMLButtonElement;

    menos.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.items()[0].cantidad).toBe(1);

    menos.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.items()).toHaveLength(0);
    expect(texto(host.querySelector('.carrito__vacio'))).toContain('Elige platos');
  });

  it('vacía el carrito', () => {
    const fixture = crear();
    fixture.componentRef.setInput('items', [
      linea(1, 'Pollo a la brasa', 1, 25),
      linea(2, 'Chicha morada', 3, 8),
    ]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('.carrito__vaciar') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.items()).toHaveLength(0);
  });

  it('no modifica el carrito cuando está bloqueado', () => {
    const fixture = crear();
    fixture.componentRef.setInput('bloqueado', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    (host.querySelector('.plato__add') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.items()).toHaveLength(0);
  });
});
