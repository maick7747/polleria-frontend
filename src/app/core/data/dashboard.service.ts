import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ComandaResumen, KpiResumen, Pedido, TopPlato } from '../models';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type { DashboardDto } from '../api/api.types';
import { round2 } from '../utils/format';
import { CocinaService } from './cocina.service';
import { CuentasService } from './cuentas.service';
import { InventarioService } from './inventario.service';
import { MermaService } from './merma.service';
import { MOCK_KPIS } from './mock-data';
import { PedidosService } from './pedidos.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiClient);
  private readonly pedidos = inject(PedidosService);
  private readonly inventario = inject(InventarioService);
  private readonly merma = inject(MermaService);
  private readonly cuentas = inject(CuentasService);
  private readonly cocina = inject(CocinaService);

  readonly cargando = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly kpis = signal<KpiResumen>(MOCK_KPIS);
  readonly fecha = "Fratelli's · miércoles 14 de octubre · turno tarde";

  readonly comandas = computed<ComandaResumen[]>(() =>
    this.cocina.comandas().slice(0, 4).map((comanda) => {
      const monto = round2(
        comanda.items.reduce((suma, item) => suma + item.subtotal, 0),
      );
      return {
        id: comanda.pedidoId,
        numero: comanda.numero,
        estado: comanda.prioritaria
          ? `${comanda.minutos} min`
          : comanda.origen === 'Local'
            ? 'En mesa'
            : 'En camino',
        estadoTono: comanda.prioritaria
          ? 'danger'
          : comanda.origen === 'Local'
            ? 'neutral'
            : 'warning',
        canal: comanda.origen,
        detalle: `${comanda.origen} · ${comanda.referencia}`,
        monto,
        hora: comanda.creadoEn.slice(11, 16),
      };
    }),
  );

  readonly pedidosActivos = computed<number>(() => this.pedidos.activos().length);

  readonly desglose = computed<{ local: number; delivery: number; apps: number }>(() => {
    const activos = this.pedidos.activos();
    return {
      local: activos.filter(
        (pedido: Pedido) => pedido.canal === 'local' || pedido.canal === 'whatsapp',
      ).length,
      delivery: activos.filter((pedido: Pedido) => pedido.canal === 'delivery_propio').length,
      apps: activos.filter(
        (pedido: Pedido) => pedido.canal === 'rappi' || pedido.canal === 'llamafood',
      ).length,
    };
  });

  readonly stockBajo = this.inventario.stockBajo;
  readonly mermasHoy = this.merma.costoHoy;
  readonly registrosMerma = this.merma.registrosHoy;
  readonly totalAbierto = this.cuentas.totalAbierto;

  readonly faltanteMeta = computed<number>(() =>
    Math.max(0, this.kpis().metaVentas - this.kpis().ventasHoy),
  );

  readonly porcentajeMeta = computed<number>(() =>
    this.kpis().metaVentas > 0
      ? Math.round((this.kpis().ventasHoy / this.kpis().metaVentas) * 100)
      : 0,
  );

  readonly nombresStockBajo = computed<string>(() =>
    this.stockBajo()
      .map((insumo) => insumo.nombre.toLowerCase())
      .join(', '),
  );

  async cargarDatos(): Promise<void> {
    this.error.set(null);
    const [dashboardOk, pedidosOk, cuentasOk, inventarioOk] = await Promise.all([
      this.cargar(),
      this.pedidos.cargarKds(),
      this.cuentas.cargar(),
      this.inventario.cargar(),
    ]);
    if (!dashboardOk || !pedidosOk || !cuentasOk || !inventarioOk) {
      this.error.set(
        this.error() ?? 'No se pudieron cargar todos los datos del turno. Reintenta.',
      );
    }
  }

  async cargar(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    this.cargando.set(true);
    try {
      const dto = await firstValueFrom(this.api.get<DashboardDto>('/dashboard'));
      const base = MOCK_KPIS;
      const totalTop = dto.top_platillos.reduce((suma, item) => suma + item.monto, 0);
      const topPlatos: TopPlato[] = dto.top_platillos.map((item) => ({
        nombre: item.platillo ?? `Platillo ${item.platillo_id}`,
        monto: item.monto,
        unidades: item.cantidad,
        porcentaje:
          totalTop > 0 ? Math.round((item.monto / totalTop) * 100) : 0,
      }));
      const ventasHoy = dto.kpis.ventas;
      const deltaPct =
        base.ventasAyer > 0
          ? Math.round(((ventasHoy - base.ventasAyer) / base.ventasAyer) * 100)
          : 0;
      this.kpis.set({
        ...base,
        ventasHoy,
        deltaPct,
        actualizado: new Date().toISOString().slice(11, 16),
        pedidosTop: dto.kpis.pedidos,
        topPlatos,
      });
      return true;
    } catch (error) {
      this.error.set(mensajeError(error));
      return false;
    } finally {
      this.cargando.set(false);
    }
  }
}
