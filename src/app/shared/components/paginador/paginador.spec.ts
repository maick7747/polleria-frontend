import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PaginadorComponent } from './paginador';

describe('PaginadorComponent', () => {
  const crearPaginador = (entradas: {
    page?: number;
    pages?: number;
    total?: number;
    limit?: number;
  }): ReturnType<typeof TestBed.createComponent<PaginadorComponent>> => {
    const fixture = TestBed.createComponent(PaginadorComponent);
    if (entradas.page !== undefined) {
      fixture.componentRef.setInput('page', entradas.page);
    }
    if (entradas.pages !== undefined) {
      fixture.componentRef.setInput('pages', entradas.pages);
    }
    if (entradas.total !== undefined) {
      fixture.componentRef.setInput('total', entradas.total);
    }
    if (entradas.limit !== undefined) {
      fixture.componentRef.setInput('limit', entradas.limit);
    }
    fixture.detectChanges();
    return fixture;
  };

  const texto = (elemento: Element | null): string =>
    (elemento?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PaginadorComponent] });
  });

  it('muestra el rango de filas de la página actual', () => {
    const fixture = crearPaginador({ page: 2, limit: 20, total: 45, pages: 3 });
    const host = fixture.nativeElement as HTMLElement;

    expect(texto(host.querySelector('.paginador__info'))).toBe(
      'Mostrando 21–40 de 45',
    );
  });

  it('muestra 0–0 cuando no hay registros', () => {
    const fixture = crearPaginador({ page: 1, limit: 20, total: 0, pages: 0 });
    const host = fixture.nativeElement as HTMLElement;

    expect(texto(host.querySelector('.paginador__info'))).toBe('Mostrando 0–0 de 0');
  });

  it('recorta el límite superior al total en la última página', () => {
    const fixture = crearPaginador({ page: 3, limit: 20, total: 45, pages: 3 });
    const host = fixture.nativeElement as HTMLElement;

    expect(texto(host.querySelector('.paginador__info'))).toBe(
      'Mostrando 41–45 de 45',
    );
  });

  it('deshabilita "Anterior" en la primera página y "Siguiente" en la última', () => {
    const primera = crearPaginador({ page: 1, pages: 3, total: 45, limit: 20 });
    const botonesPrimera = Array.from(
      (primera.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    expect(botonesPrimera[0].disabled).toBe(true);
    expect(botonesPrimera[1].disabled).toBe(false);

    const ultima = crearPaginador({ page: 3, pages: 3, total: 45, limit: 20 });
    const botonesUltima = Array.from(
      (ultima.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    expect(botonesUltima[0].disabled).toBe(false);
    expect(botonesUltima[1].disabled).toBe(true);
  });

  it('emite pageChange al pulsar "Siguiente" y "Anterior"', () => {
    const fixture = crearPaginador({ page: 2, pages: 3, total: 45, limit: 20 });
    const emitidos: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => emitidos.push(page));

    const botones = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    botones[1].click();
    botones[0].click();

    expect(emitidos).toEqual([3, 1]);
  });

  it('no emite pageChange fuera de los límites', () => {
    const fixture = crearPaginador({ page: 1, pages: 3, total: 45, limit: 20 });
    const emitidos: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => emitidos.push(page));

    fixture.componentInstance.ir(0);
    fixture.componentInstance.ir(4);
    expect(emitidos).toEqual([]);

    fixture.componentInstance.ir(1);
    fixture.componentInstance.ir(3);
    expect(emitidos).toEqual([1, 3]);
  });

  it('emite limitChange al cambiar el tamaño de página', () => {
    const fixture = crearPaginador({ page: 1, pages: 5, total: 45, limit: 20 });
    const emitidos: number[] = [];
    fixture.componentInstance.limitChange.subscribe((limit) => emitidos.push(limit));

    const select = (fixture.nativeElement as HTMLElement).querySelector(
      'select',
    ) as HTMLSelectElement;
    select.value = '50';
    select.dispatchEvent(new Event('change'));

    expect(emitidos).toEqual([50]);
  });

  it('ignora valores de límite no permitidos', () => {
    const fixture = crearPaginador({ page: 1, pages: 5, total: 45, limit: 20 });
    const emitidos: number[] = [];
    fixture.componentInstance.limitChange.subscribe((limit) => emitidos.push(limit));
    const host = fixture.nativeElement as HTMLElement;

    const eventoFalso = new Event('change');
    Object.defineProperty(eventoFalso, 'target', {
      value: { value: '13' },
      configurable: true,
    });
    fixture.componentInstance.onLimit(eventoFalso);

    expect(emitidos).toEqual([]);
    expect(host.querySelector('.paginador__limit select')).not.toBeNull();
  });
});
