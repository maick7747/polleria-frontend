import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type {
  ApiList,
  ClienteListaDto,
  DocumentoValidacionDto,
  PageMeta,
} from '../api/api.types';
import { toClienteResumen, type ClienteResumen } from '../api/api.mappers';

export interface ClientesQuery {
  page?: number;
  limit?: number;
  q?: string;
}

const MOCK_CLIENTES: readonly ClienteResumen[] = [
  { id: 1, nombre: 'María Fernanda Rojas', tipoDocumento: 'DNI', numeroDocumento: '45781233', telefono: '+51 987 654 321', direccion: 'Jr. Puno 441', referencia: 'Portón azul frente al parque' },
  { id: 2, nombre: 'Lucía Ramírez', tipoDocumento: 'DNI', numeroDocumento: '41230987', telefono: '+51 964 221 908', direccion: 'Av. Ferrocarril 512, El Tambo', referencia: 'Portón negro, segundo piso' },
  { id: 3, nombre: 'Marco Antonio Torres', tipoDocumento: 'DNI', numeroDocumento: '70891234', telefono: '+51 951 330 117', direccion: 'Jr. Puno 512', referencia: 'Frente a la bodega' },
  { id: 4, nombre: 'Andrea Requena', tipoDocumento: 'DNI', numeroDocumento: '73445566', telefono: '+51 933 210 554', direccion: 'Jr. Puno 245', referencia: 'Casa de dos pisos' },
  { id: 5, nombre: 'Diego Salazar', tipoDocumento: 'DNI', numeroDocumento: '44556677', telefono: '+51 900 112 233', direccion: 'Calle Real 120', referencia: 'Al costado del mercado' },
  { id: 6, nombre: 'Paola Medina', tipoDocumento: 'DNI', numeroDocumento: '72331100', telefono: '+51 977 884 001', direccion: 'Jr. Loreto 88', referencia: 'Edificio azul' },
  { id: 7, nombre: 'Lucía Paredes', tipoDocumento: 'DNI', numeroDocumento: '46778899', telefono: '+51 966 554 332', direccion: 'Av. Ferrocarril 973', referencia: 'Reja blanca' },
  { id: 8, nombre: 'Pollos Andinos S.A.C.', tipoDocumento: 'RUC', numeroDocumento: '20601234567', telefono: '+51 64 221 100', direccion: 'Av. Huancavelica 330', referencia: 'Oficina administrativa' },
];

const META_INICIAL: PageMeta = {
  page: 1,
  limit: 10,
  total: USE_API ? 0 : MOCK_CLIENTES.length,
  pages: USE_API ? 0 : Math.ceil(MOCK_CLIENTES.length / 10),
};

const paginar = (
  lista: readonly ClienteResumen[],
  page: number,
  limit: number,
): { items: ClienteResumen[]; meta: PageMeta } => {
  const total = lista.length;
  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  const inicio = (Math.max(1, page) - 1) * limit;
  return {
    items: lista.slice(inicio, inicio + limit),
    meta: { page: Math.max(1, page), limit, total, pages },
  };
};

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly api = inject(ApiClient);

  readonly usaApi = USE_API;
  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly clientes = signal<ClienteResumen[]>(USE_API ? [] : [...MOCK_CLIENTES]);
  readonly meta = signal<PageMeta>({ ...META_INICIAL });

  async cargar(opciones: ClientesQuery = {}): Promise<boolean> {
    const page = Math.max(1, opciones.page ?? 1);
    const limit = opciones.limit ?? 10;
    const q = opciones.q?.trim() || undefined;

    if (!USE_API) {
      const termino = (q ?? '').toLowerCase();
      const filtrados = MOCK_CLIENTES.filter(
        (cliente) =>
          !termino ||
          cliente.nombre.toLowerCase().includes(termino) ||
          (cliente.numeroDocumento ?? '').includes(termino),
      );
      const { items, meta } = paginar(filtrados, page, limit);
      this.clientes.set(items.map((cliente) => ({ ...cliente })));
      this.meta.set(meta);
      this.error.set(null);
      return true;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const lista = await firstValueFrom(
        this.api.get<ApiList<ClienteListaDto>>('/clientes', { page, limit, q }),
      );
      const total = lista.meta.total ?? lista.data.length;
      this.clientes.set(lista.data.map(toClienteResumen));
      this.meta.set({
        page: lista.meta.page ?? page,
        limit: lista.meta.limit ?? limit,
        total,
        pages: lista.meta.pages ?? (limit > 0 ? Math.ceil(total / limit) : 0),
      });
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  porId(id: number | null | undefined): ClienteResumen | undefined {
    if (id === null || id === undefined) {
      return undefined;
    }
    return this.clientes().find((cliente) => cliente.id === id);
  }

  /**
   * Valida un DNI/RUC contra el backend (`POST /api/clientes/validar-documento`).
   * El backend usa el patrón Strategy (mock/apiperu/openruc) y nunca bloquea la
   * venta: si no puede validar devuelve `modo: 'manual'`. Los errores de red o
   * de permisos se propagan como `ApiError`.
   */
  async validarDocumento(
    tipo: 'DNI' | 'RUC',
    numero: string,
  ): Promise<DocumentoValidacionDto> {
    return firstValueFrom(
      this.api.post<DocumentoValidacionDto>('/clientes/validar-documento', {
        tipo_documento: tipo,
        numero_documento: numero,
      }),
    );
  }
}
