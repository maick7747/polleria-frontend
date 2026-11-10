import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ComandaResumen, KpiResumen, Pedido, TopPlato } from '../models';
import { ApiClient } from '../api/api.client';
import { USE_API } from '../api/api.config';
import { mensajeError } from '../api/api.helpers';
import type { DashboardDto } from '../api/api.types';
import { fechaCorta, horaActual, round2, turnoActual } from '../utils/format';
import { CocinaService } from './cocina.service';
import { CuentasService } from './cuentas.service';
import { InventarioService } from './inventario.service';
import { MermaService } from './merma.service';
import { MOCK_KPIS } from './mock-data';
import { PedidosService } from './pedidos.service';

// En modo API no se arranca con los KPIs de demostración: hasta que llegue la
// primera respuesta no hay ventas de hoy, ni "ayer", ni serie semanal.
const KPIS_VACIOS: KpiResumen = {
  ventasHoy: 0,
  ventasAyer: null,
  metaVentas: null,
  deltaPct: null,
  actualizado: '--:--',
  totalPlatosCarta: 0,
  pedidosTop: 0,
  ingresosTop: 0,
  mejorDia: '—',
  mejorDiaMonto: 0,
  topPlatos: [],
  serieSemana: [],
};

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

  readonly kpis = signal<KpiResumen>(USE_API ? KPIS_VACIOS : MOCK_KPIS);
  // Hora Lima (HH:mm) de la última respuesta CON datos nuevos.
  readonly actualizado = signal<string>('--:--');

  private readonly ahora = signal<Date>(new Date());
  readonly fecha = computed<string>(
    () => `Fratelli's · ${fechaCorta(this.ahora())} · ${turnoActual(this.ahora())}`,
  );
  readonly turno = computed<string>(() => turnoActual(this.ahora()));

  // Evita solapar refrescos silenciosos y decide cuándo mostrar el banner
  // de error (solo si nunca se cargaron datos).
  private refrescando = false;
  private primeraCarga = true;

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

  readonly faltanteMeta = computed<number>(() => {
    const meta = this.kpis().metaVentas;
    if (meta === null || meta <= 0) {
      return 0;
    }
    return Math.max(0, meta - this.kpis().ventasHoy);
  });

  readonly tieneMeta = computed<boolean>(() => {
    const meta = this.kpis().metaVentas;
    return meta !== null && meta > 0;
  });

  readonly porcentajeMeta = computed<number>(() => {
    const meta = this.kpis().metaVentas;
    return meta !== null && meta > 0
      ? Math.round((this.kpis().ventasHoy / meta) * 100)
      : 0;
  });

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
    } else {
      this.primeraCarga = false;
      this.error.set(null);
    }
  }

  async cargar(): Promise<boolean> {
    if (!USE_API) {
      return false;
    }
    this.cargando.set(true);
    try {
      return await this.solicitarDashboard(false);
    } finally {
      this.cargando.set(false);
    }
  }

  /**
   * Refresco periódico: misma carga que `cargarDatos()` pero sin spinner y sin
   * pisar el error si ya hay datos. Si una petición sigue en curso, se ignora.
   */
  async refrescarSilencioso(): Promise<void> {
    if (!USE_API || this.refrescando) {
      return;
    }
    this.refrescando = true;
    try {
      const [dashboardOk, pedidosOk, cuentasOk, inventarioOk] = await Promise.all([
        this.solicitarDashboard(true),
        this.pedidos.cargarKds(),
        this.cuentas.cargar(true),
        this.inventario.cargar(),
      ]);
      if (dashboardOk && pedidosOk && cuentasOk && inventarioOk) {
        this.error.set(null);
      } else if (this.primeraCarga) {
        this.error.set(
          this.error() ?? 'No se pudieron cargar todos los datos del turno. Reintenta.',
        );
      }
    } finally {
      this.refrescando = false;
    }
  }

  private async solicitarDashboard(silencioso: boolean): Promise<boolean> {
    try {
      const respuesta = await firstValueFrom(
        this.api.getConEtag<DashboardDto>('/dashboard'),
      );
      // 304: llega el cuerpo cacheado. Se aplica si cambió o en la primera
      // carga (pantalla recién abierta), sin repintar las siguientes veces.
      if (respuesta.data !== null && (respuesta.changed || this.primeraCarga)) {
        this.aplicarKpis(respuesta.data);
      } else {
        // Mantiene la fecha y el turno al día aunque la respuesta sea un 304
        // (p. ej. si el turno cambia a medianoche sin movimientos).
        this.ahora.set(new Date());
      }
      this.primeraCarga = false;
      return true;
    } catch (error) {
      if (!silencioso || this.primeraCarga) {
        this.error.set(mensajeError(error));
      }
      return false;
    }
  }

  private aplicarKpis(dto: DashboardDto): void {
    const base = KPIS_VACIOS;
    const totalTop = dto.top_platillos.reduce((suma, item) => suma + item.monto, 0);
    const topPlatos: TopPlato[] = dto.top_platillos.map((item) => ({
      nombre: item.platillo ?? `Platillo ${item.platillo_id}`,
      monto: item.monto,
      unidades: item.cantidad,
      porcentaje: totalTop > 0 ? Math.round((item.monto / totalTop) * 100) : 0,
    }));

    const ventasHoy = dto.kpis.ventas;
    const ventasAyer =
      typeof dto.ventas_ayer === 'number' && dto.ventas_ayer > 0
        ? dto.ventas_ayer
        : null;
    // Sin base real de "ayer" no hay comparación: el chip se oculta en la UI.
    const deltaPct =
      ventasAyer !== null
        ? Math.round(((ventasHoy - ventasAyer) / ventasAyer) * 100)
        : null;

    const serieSemana = (dto.serie_semana ?? []).map((punto) => ({
      dia: punto.dia,
      monto: Number(punto.monto) || 0,
    }));
    const mejor = serieSemana.reduce<{ dia: string; monto: number } | null>(
      (actual, punto) => (actual === null || punto.monto > actual.monto ? punto : actual),
      null,
    );

    const metaVentas =
      typeof dto.kpis.meta_ventas === 'number' && dto.kpis.meta_ventas > 0
        ? dto.kpis.meta_ventas
        : null;

    const ahora = new Date();
    const hora = horaActual(ahora);
    this.kpis.set({
      ...base,
      ventasHoy,
      ventasAyer,
      metaVentas,
      deltaPct,
      actualizado: hora,
      pedidosTop: dto.kpis.pedidos,
      topPlatos,
      serieSemana,
      mejorDia: mejor?.dia ?? '—',
      mejorDiaMonto: mejor?.monto ?? 0,
    });
    this.ahora.set(ahora);
    this.actualizado.set(hora);
  }
}
