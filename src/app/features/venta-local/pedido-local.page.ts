import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { esApiError, mensajeError } from '../../core/api/api.helpers';
import { USE_API } from '../../core/api/api.config';
import { CuadreService } from '../../core/data/cuadre.service';
import { CuentasService } from '../../core/data/cuentas.service';
import { FichasService } from '../../core/data/fichas.service';
import { InventarioService } from '../../core/data/inventario.service';
import { MesasService } from '../../core/data/mesas.service';
import {
  nuevaClave,
  PedidoBorradorService,
} from '../../core/data/pedido-borrador.service';
import type { PedidoDetalle, Plato } from '../../core/models';
import {
  abreviarNombre,
  formatearMoneda,
  minutosEntre,
  round2,
  turnoActual,
} from '../../core/utils/format';
import { ChipComponent } from '../../shared/components/chip/chip';
import { DarkPanelComponent } from '../../shared/components/dark-panel/dark-panel';
import { IconComponent } from '../../shared/components/icon/icon';
import { PanelComponent } from '../../shared/components/panel/panel';
import { AppShellComponent } from '../../shared/layout/app-shell/app-shell';

interface StockPlato {
  etiqueta: string;
  tono: 'success' | 'warning';
}

@Component({
  selector: 'app-pedido-local-page',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    ChipComponent,
    DarkPanelComponent,
    IconComponent,
    PanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pedido-local.page.html',
  styleUrl: './pedido-local.page.css',
})
export class PedidoLocalPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly mesas = inject(MesasService);
  private readonly cuentas = inject(CuentasService);
  private readonly cuadre = inject(CuadreService);
  private readonly fichas = inject(FichasService);
  private readonly inventario = inject(InventarioService);
  private readonly auth = inject(AuthService);
  private readonly borrador = inject(PedidoBorradorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mesaId = Number(this.route.snapshot.paramMap.get('mesaId'));
  private readonly usuarioId = this.auth.usuario()?.id ?? 3;
  private readonly ahora = Date.now();

  private secuenciaItem = 1000;
  private temporizador: number | null = null;
  private claveRonda = nuevaClave();

  readonly categoriaActiva = signal<string>('');
  readonly busqueda = signal<string>('');
  readonly items = signal<PedidoDetalle[]>([]);
  readonly observacion = signal<string>('');
  readonly toast = signal<string>('');
  readonly cajaCerrada = signal<string>('');
  readonly turno = turnoActual();
  readonly cajaAbierta = computed(() => this.cuadre.estado() === 'abierta');
  readonly cajaCerradaEstado = computed(() => {
    const estado = this.cuadre.estado();
    return estado === 'cerrada' || estado === 'sin_cuadre';
  });
  readonly enviando = signal(false);
  readonly moneda = formatearMoneda;

  readonly mesa = computed(() => this.mesas.porId(this.mesaId) ?? null);
  readonly cuenta = computed(() => this.cuentas.cuentaDeMesa(this.mesaId) ?? null);

  readonly categorias = computed<string[]>(() => {
    const lista: string[] = [];
    for (const plato of this.fichas.activos()) {
      if (!lista.includes(plato.categoria)) {
        lista.push(plato.categoria);
      }
    }
    return lista;
  });

  readonly numeroMesa = computed(() =>
    String(this.mesa()?.numero ?? 0).padStart(2, '0'),
  );
  readonly rondasPrevias = computed(() => this.cuenta()?.rondas.length ?? 0);
  readonly rondaActual = computed(() => this.rondasPrevias() + 1);
  readonly titulo = computed(
    () => `Mesa ${this.numeroMesa()} · Ronda ${this.rondaActual()}`,
  );

  readonly subtitulo = computed(() => {
    const cuenta = this.cuenta();
    const rondas = cuenta?.rondas.length ?? 0;
    const total = formatearMoneda(cuenta?.total ?? 0);
    const minutos = cuenta ? minutosEntre(cuenta.fechaApertura, this.ahora) : 0;
    const mozo = abreviarNombre(cuenta?.usuarioAperturaNombre ?? '');
    return `${rondas} rondas · ${total} · abierta ${minutos} min · Mozo ${mozo}`;
  });

  readonly platosVisibles = computed<Plato[]>(() => {
    const categoria = this.categoriaActiva();
    const termino = this.busqueda().trim().toLowerCase();
    return this.fichas.activos().filter((plato) => {
      const coincideCategoria = !categoria || plato.categoria === categoria;
      const coincideTexto =
        !termino || plato.nombre.toLowerCase().includes(termino);
      return coincideCategoria && coincideTexto;
    });
  });

  readonly totalRonda = computed(() =>
    round2(this.items().reduce((suma, item) => suma + item.subtotal, 0)),
  );
  readonly subtotalRonda = computed(() => round2(this.totalRonda() / 1.18));
  readonly igvRonda = computed(() => round2(this.totalRonda() - this.subtotalRonda()));
  readonly totalCuenta = computed(() =>
    round2((this.cuenta()?.total ?? 0) + this.totalRonda()),
  );

  readonly clientePendiente = computed(
    () => this.cuentas.clientePendiente(this.mesaId) ?? null,
  );
  readonly clienteNombre = computed(
    () => this.cuenta()?.cliente?.nombre ?? this.clientePendiente()?.nombre ?? 'Sin datos',
  );
  readonly clienteAccion = computed(
    () => ((this.cuenta()?.cliente ?? this.clientePendiente()) ? 'Editar' : 'Agregar'),
  );
  readonly puedeEnviar = computed(() => this.items().length > 0 && !this.enviando());

  readonly stockBajoTexto = computed(() => {
    const bajos = this.inventario.stockBajo();
    if (bajos.length === 0) {
      return '';
    }
    const primero = bajos[0];
    const plural = bajos.length === 1 ? '' : 's';
    return `${bajos.length} insumo${plural} bajo${plural}: ${primero.nombre.toLowerCase()} (${primero.stockActual} ${primero.unidadMedida})`;
  });

  constructor() {
    this.restaurarBorrador();
    void this.inicializar();
    void this.cuadre.cargar();
    this.destroyRef.onDestroy(() => {
      if (this.temporizador !== null) {
        window.clearTimeout(this.temporizador);
      }
    });
  }

  private restaurarBorrador(): void {
    const borrador = this.borrador.obtener(this.mesaId);
    if (!borrador) {
      return;
    }
    this.items.set(borrador.items);
    this.observacion.set(borrador.observacion);
    this.claveRonda = borrador.clave;
    const mayor = borrador.items.reduce(
      (maximo, item) => Math.max(maximo, item.id),
      0,
    );
    this.secuenciaItem = Math.max(1000, mayor);
  }

  private persistirBorrador(): void {
    this.borrador.guardar(this.mesaId, {
      clave: this.claveRonda,
      items: this.items(),
      observacion: this.observacion(),
      actualizadoEn: new Date().toISOString(),
    });
  }

  private async inicializar(): Promise<void> {
    // El tablero agregado trae mesas + cuentas en una sola petición.
    await this.cuentas.cargar();

    // Catálogos: solo se piden si aún no están en memoria.
    // InventarioService arranca con mocks incluso en modo API, así que su
    // signal nunca está vacía; en modo API se mantiene la carga (1 request)
    // para no mostrar stock simulado.
    const tareas: Promise<boolean>[] = [];
    if (this.inventario.insumos().length === 0 || USE_API) {
      tareas.push(this.inventario.cargar({ limit: 100 }));
    }
    if (this.fichas.platos().length === 0) {
      tareas.push(this.fichas.cargar());
    }
    if (tareas.length > 0) {
      await Promise.all(tareas);
    }

    if (!this.mesa()) {
      void this.router.navigate(['/venta-local']);
      return;
    }
    // Cuenta perezosa: no se crea aquí. Se crea al enviar la primera ronda,
    // así "Tomar pedido" por error no deja una mesa ocupada.
    const primeraCategoria = this.categorias()[0];
    if (primeraCategoria) {
      this.categoriaActiva.set(primeraCategoria);
    }
  }

  stockDe(plato: Plato): StockPlato {
    const insuficiente = plato.ingredientes.some((ingrediente) => {
      const insumo = this.inventario.porId(ingrediente.insumoId);
      return insumo ? insumo.stockActual <= insumo.stockMinimo : false;
    });
    return insuficiente
      ? { etiqueta: 'Stock bajo', tono: 'warning' }
      : { etiqueta: 'Stock ok', tono: 'success' };
  }

  cantidadEnRonda(platoId: number): number {
    return this.items()
      .filter((item) => item.platilloId === platoId)
      .reduce((suma, item) => suma + item.cantidad, 0);
  }

  agregar(plato: Plato): void {
    const existente = this.items().find((item) => item.platilloId === plato.id);
    if (existente) {
      this.items.update((lista) =>
        lista.map((item) => {
          if (item.platilloId !== plato.id) {
            return item;
          }
          const cantidad = item.cantidad + 1;
          return {
            ...item,
            cantidad,
            subtotal: round2(cantidad * item.precioUnitario),
          };
        }),
      );
    } else {
      const nuevo: PedidoDetalle = {
        id: ++this.secuenciaItem,
        platilloId: plato.id,
        nombre: plato.nombre,
        cantidad: 1,
        precioUnitario: plato.precioVenta,
        subtotal: plato.precioVenta,
        estadoPreparacion: 'pendiente',
      };
      this.items.update((lista) => [...lista, nuevo]);
    }
    this.claveRonda = nuevaClave();
    this.persistirBorrador();
  }

  quitar(itemId: number): void {
    if (!this.items().some((item) => item.id === itemId)) {
      return;
    }
    this.items.update((lista) => {
      const encontrado = lista.find((item) => item.id === itemId);
      if (!encontrado) {
        return lista;
      }
      if (encontrado.cantidad > 1) {
        return lista.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          const cantidad = item.cantidad - 1;
          return {
            ...item,
            cantidad,
            subtotal: round2(cantidad * item.precioUnitario),
          };
        });
      }
      return lista.filter((item) => item.id !== itemId);
    });
    this.claveRonda = nuevaClave();
    this.persistirBorrador();
  }

  onBusqueda(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  onObservacion(event: Event): void {
    this.observacion.set((event.target as HTMLTextAreaElement).value);
    this.persistirBorrador();
  }

  async enviar(): Promise<void> {
    if (this.enviando() || this.items().length === 0) {
      return;
    }
    this.enviando.set(true);
    this.cajaCerrada.set('');
    try {
      let cuenta = this.cuenta();
      const items = this.items();
      const notas = this.observacion().trim();
      const conNotas = items.map((item) => ({
        ...item,
        notas: notas ? notas : undefined,
      }));
      // La cuenta se crea recién aquí (al enviar la primera ronda).
      if (!cuenta) {
        cuenta = await this.cuentas.abrirCuenta(this.mesaId, this.usuarioId);
        if (!cuenta) {
          this.avisar('No se pudo abrir la cuenta.');
          return;
        }
      }
      const ronda = await this.cuentas.agregarRonda(
        cuenta.id,
        conNotas,
        this.claveRonda,
      );
      if (!ronda) {
        this.avisar('No se pudo enviar la ronda.');
        return;
      }
      this.toast.set(`Ronda ${ronda.numero} enviada a cocina`);
      this.items.set([]);
      this.observacion.set('');
      this.borrador.limpiar(this.mesaId);
      this.temporizador = window.setTimeout(() => {
        void this.router.navigate(['/venta-local']);
      }, 950);
    } catch (error) {
      const mensaje = mensajeError(error);
      if (esApiError(error) && error.code === 'CAJA_CERRADA') {
        this.cajaCerrada.set(mensaje);
      }
      this.avisar(mensaje);
    } finally {
      this.enviando.set(false);
    }
  }

  private avisar(mensaje: string): void {
    this.toast.set(mensaje);
    if (this.temporizador !== null) {
      window.clearTimeout(this.temporizador);
    }
    this.temporizador = window.setTimeout(() => this.toast.set(''), 2600);
  }
}
