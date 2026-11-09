import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { StepperComponent, type PasoStepper } from './stepper';

const PASOS: readonly PasoStepper[] = [
  { numero: 1, etiqueta: 'Apertura', meta: '11:00 · S/ 200.00', estado: 'done' },
  { numero: 2, etiqueta: 'Operación', meta: '3 cobros', estado: 'active' },
  { numero: 3, etiqueta: 'Cierre', meta: 'pendiente', estado: 'pending' },
];

describe('StepperComponent', () => {
  const crear = (
    pasos: readonly PasoStepper[],
    meta = '',
  ): ReturnType<typeof TestBed.createComponent<StepperComponent>> => {
    TestBed.configureTestingModule({
      imports: [StepperComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(StepperComponent);
    fixture.componentRef.setInput('pasos', pasos);
    fixture.componentRef.setInput('meta', meta);
    fixture.detectChanges();
    return fixture;
  };

  const texto = (elemento: Element | null): string =>
    (elemento?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('renderiza las etiquetas y sus metas', () => {
    const host = crear(PASOS, 'turno tarde').nativeElement as HTMLElement;

    const etiquetas = Array.from(host.querySelectorAll('.paso__label')).map((nodo) =>
      texto(nodo),
    );
    const metas = Array.from(host.querySelectorAll('.paso__meta')).map((nodo) =>
      texto(nodo),
    );

    expect(etiquetas).toEqual(['Apertura', 'Operación', 'Cierre']);
    expect(metas).toEqual(['11:00 · S/ 200.00', '3 cobros', 'pendiente']);
    expect(texto(host.querySelector('.stepper__meta'))).toBe('turno tarde');
  });

  it('marca el paso hecho con check y sin número', () => {
    const host = crear(PASOS).nativeElement as HTMLElement;

    expect(host.querySelector('.paso-done')).not.toBeNull();
    expect(host.querySelector('.paso-done')?.textContent?.trim()).toBe('');
    expect(host.querySelectorAll('.paso-done').length).toBe(1);
  });

  it('numera los pasos activo y pendiente y resalta solo el activo', () => {
    const host = crear(PASOS).nativeElement as HTMLElement;

    const numeros = Array.from(host.querySelectorAll('.paso')).map((nodo) =>
      texto(nodo),
    );
    expect(numeros).toEqual(['2', '3']);

    const activos = host.querySelectorAll('.paso--activo');
    expect(activos.length).toBe(1);
    expect(texto(activos[0])).toBe('2');
    expect(host.querySelector('.paso__label--activo')?.textContent?.trim()).toBe(
      'Operación',
    );
  });

  it('dibuja una línea entre pasos y no al final', () => {
    const host = crear(PASOS).nativeElement as HTMLElement;

    expect(host.querySelectorAll('.paso__linea').length).toBe(PASOS.length - 1);
  });

  it('convierte círculo y etiqueta en enlaces cuando hay link', () => {
    const pasos: readonly PasoStepper[] = [
      { numero: 1, etiqueta: 'Apertura', estado: 'done', link: '/cuadre-caja' },
      { numero: 2, etiqueta: 'Operación', estado: 'active', link: '/cuadre-caja' },
    ];
    const host = crear(pasos).nativeElement as HTMLElement;

    const enlaces = Array.from(host.querySelectorAll('a'));
    expect(enlaces.length).toBe(4);
    expect(enlaces.every((enlace) => enlace.getAttribute('href') === '/cuadre-caja')).toBe(
      true,
    );
  });
});
