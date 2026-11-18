import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadsService } from '../../../core/data/uploads.service';
import { ImageUploadComponent } from './image-upload';

const subir = vi.fn(async () => ({
  url: 'https://cdn.test/imagen.png',
  path: 'platillos/imagen.png',
  content_type: 'image/png',
  size: 120,
}));

const uploadsStub = {
  subir,
  subiendo: signal(false),
  error: signal<string | null>(null),
};

const crear = (): ReturnType<typeof TestBed.createComponent<ImageUploadComponent>> => {
  const fixture = TestBed.createComponent(ImageUploadComponent);
  fixture.detectChanges();
  return fixture;
};

const seleccionarArchivo = (
  fixture: ReturnType<typeof TestBed.createComponent<ImageUploadComponent>>,
  file: File,
): void => {
  const input = fixture.nativeElement.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  input.dispatchEvent(new Event('change'));
};

describe('ImageUploadComponent', () => {
  beforeEach(() => {
    subir.mockClear();
    TestBed.configureTestingModule({
      imports: [ImageUploadComponent],
      providers: [{ provide: UploadsService, useValue: uploadsStub }],
    });
  });

  it('sube una imagen válida y actualiza el modelo', async () => {
    const fixture = crear();
    fixture.componentRef.setInput('carpeta', 'platillos');
    fixture.detectChanges();

    seleccionarArchivo(
      fixture,
      new File(['x'], 'foto.png', { type: 'image/png' }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(subir).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.imagenUrl()).toBe(
      'https://cdn.test/imagen.png',
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('img')?.getAttribute('src'),
    ).toBe('https://cdn.test/imagen.png');
  });

  it('rechaza formatos no permitidos sin subir', async () => {
    const fixture = crear();
    seleccionarArchivo(
      fixture,
      new File(['x'], 'foto.gif', { type: 'image/gif' }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(subir).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('Formato no permitido');
  });

  it('rechaza imágenes mayores a 2 MB sin subir', async () => {
    const fixture = crear();
    const grande = new File(['x'], 'grande.png', { type: 'image/png' });
    Object.defineProperty(grande, 'size', { value: 2 * 1024 * 1024 + 1 });
    seleccionarArchivo(fixture, grande);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(subir).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('2 MB');
  });

  it('quita la imagen del modelo', () => {
    const fixture = crear();
    fixture.componentRef.setInput('imagenUrl', 'https://cdn.test/imagen.png');
    fixture.detectChanges();

    fixture.componentInstance.quitar();
    fixture.detectChanges();

    expect(fixture.componentInstance.imagenUrl()).toBeNull();
  });
});
