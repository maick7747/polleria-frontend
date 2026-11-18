import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PedidoDetalle, Plato } from '../../../core/models';
import { FichasService } from '../../../core/data/fichas.service';
import { InventarioService } from '../../../core/data/inventario.service';
import { MenuPlatosComponent } from './menu-platos';

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
  {
    id: 3,
    nombre: 'Papas fritas',
    descripcion: '',
    categoria: 'Guarniciones',
    precioVenta: 10,
    activo: true,
    ingredientes: [],
    disponible: false,
  },
];

const linea = (platilloId: number, cantidad: number): PedidoDetalle => ({
  id: platilloId,
  platilloId,
  nombre: PLATOS.find((plato) => plato.id === platilloId)?.nombre ?? '',
  cantidad,
  precioUnitario: 10,
  subtotal: 10 * cantidad,
  estadoPreparacion: 'pendiente',
});

const texto = (elemento: Element | null): string =>
  (elemento?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('MenuPlatosComponent', () => {
  const platos = signal<Plato[]>(PLATOS);

  const fichasStub = {
    platos,
    activos: computed(() => platos().filter((plato) => plato.activo)),
    cargando: signal(false),
    error: signal<string | null>(null),
    cargar: vi.fn(async () => true),
  };

  const inventarioStub = {
    porId: () => undefined,
  };

  const crear = (): ReturnType<typeof TestBed.createComponent<MenuPlatosComponent>> => {
    const fixture = TestBed.createComponent(MenuPlatosComponent);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    platos.set(PLATOS);
    TestBed.configureTestingModule({
      imports: [MenuPlatosComponent],
      providers: [
        { provide: FichasService, useValue: fichasStub },
        { provide: InventarioService, useValue: inventarioStub },
      ],
    });
  });

  it('muestra los platos activos del menú', () => {
    const host = crear().nativeElement as HTMLElement;
    expect(host.querySelectorAll('.plato')).toHaveLength(3);
  });

  it('filtra por búsqueda', () => {
    const fixture = crear();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('.buscador input') as HTMLInputElement;

    input.value = 'chicha';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(host.querySelectorAll('.plato')).toHaveLength(1);
    expect(texto(host.querySelector('.plato__name'))).toBe('Chicha morada');
  });

  it('filtra por categoría', () => {
    const fixture = crear();
    const host = fixture.nativeElement as HTMLElement;
    const categorias = Array.from(host.querySelectorAll('.cat')) as HTMLButtonElement[];
    const bebidas = categorias.find((boton) => boton.textContent?.trim() === 'Bebidas');

    bebidas?.click();
    fixture.detectChanges();

    expect(host.querySelectorAll('.plato')).toHaveLength(1);
    expect(texto(host.querySelector('.plato__name'))).toBe('Chicha morada');
  });

  it('emite agregar al pulsar el botón del plato', () => {
    const fixture = crear();
    const host = fixture.nativeElement as HTMLElement;
    const emitidos: Plato[] = [];
    fixture.componentInstance.agregar.subscribe((plato) => emitidos.push(plato));

    (host.querySelector('.plato__add') as HTMLButtonElement).click();

    expect(emitidos).toHaveLength(1);
    expect(emitidos[0].id).toBe(1);
  });

  it('pinta el badge de cantidad con las líneas del pedido', () => {
    const fixture = crear();
    fixture.componentRef.setInput('items', [linea(1, 2)]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(texto(host.querySelector('.plato__tags'))).toContain('x2');
  });

  it('marca "Sin stock" cuando el backend lo indica', () => {
    const host = crear().nativeElement as HTMLElement;
    const tarjetas = Array.from(host.querySelectorAll('.plato'));
    const papas = tarjetas.find((tarjeta) =>
      texto(tarjeta.querySelector('.plato__name')).includes('Papas'),
    );

    expect(texto(papas?.querySelector('.plato__tags') ?? null)).toContain('Sin stock');
  });
});
