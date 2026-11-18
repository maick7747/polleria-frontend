import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { mensajeError } from '../api/api.helpers';

export type CarpetaImagen = 'platillos' | 'activos' | 'insumos' | 'proveedores';

export interface ImagenSubida {
  url: string;
  path: string | null;
  content_type: string;
  size: number;
}

/**
 * Subida de imágenes al backend (`POST /api/uploads/imagen`). El backend
 * valida tipo/tamaño y guarda en Supabase Storage; en modo demo devuelve un
 * data URL para que la vista previa funcione.
 */
@Injectable({ providedIn: 'root' })
export class UploadsService {
  private readonly api = inject(ApiClient);

  readonly subiendo = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  async subir(file: File, carpeta: CarpetaImagen): Promise<ImagenSubida | null> {
    if (this.subiendo()) {
      return null;
    }
    this.subiendo.set(true);
    this.error.set(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('carpeta', carpeta);
      return await firstValueFrom(
        this.api.postFormData<ImagenSubida>('/uploads/imagen', formData),
      );
    } catch (error) {
      this.error.set(mensajeError(error));
      return null;
    } finally {
      this.subiendo.set(false);
    }
  }
}
