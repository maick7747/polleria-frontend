import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import {
  UploadsService,
  type CarpetaImagen,
} from '../../../core/data/uploads.service';
import { IconComponent } from '../icon/icon';

const FORMATOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Subida de una imagen con vista previa. Sube al backend y guarda la URL en
 * el `model` (`[(imagenUrl)]`). En modo compacto sirve para filas de listas.
 */
@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './image-upload.html',
  styleUrl: './image-upload.css',
})
export class ImageUploadComponent {
  private readonly uploads = inject(UploadsService);

  readonly imagenUrl = model<string | null>(null);
  readonly carpeta = input<CarpetaImagen>('platillos');
  readonly etiqueta = input<string>('Imagen');
  readonly aspecto = input<'cuadrado' | 'ancho'>('ancho');
  readonly compacto = input<boolean>(false);
  readonly deshabilitado = input<boolean>(false);

  readonly subiendo = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.error.set(null);
    if (!FORMATOS.includes(file.type)) {
      this.error.set('Formato no permitido. Usa JPG, PNG o WebP.');
      input.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set('La imagen supera 2 MB.');
      input.value = '';
      return;
    }

    this.subiendo.set(true);
    const subida = await this.uploads.subir(file, this.carpeta());
    this.subiendo.set(false);
    input.value = '';

    if (!subida) {
      this.error.set(this.uploads.error() ?? 'No se pudo subir la imagen.');
      return;
    }
    this.imagenUrl.set(subida.url);
  }

  quitar(): void {
    if (this.deshabilitado() || this.subiendo()) {
      return;
    }
    this.imagenUrl.set(null);
    this.error.set(null);
  }
}
