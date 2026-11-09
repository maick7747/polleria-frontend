import type { Routes } from '@angular/router';
import { guestGuard, roleGuard } from './core/auth/role.guard';
import type { RolNombre } from './core/models';

const roles = (...valores: RolNombre[]): RolNombre[] => valores;

export const routes: Routes = [
  {
    path: 'login',
    title: "Ingresar · Fratelli's",
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'dashboard',
    title: "Pulso del turno · Fratelli's",
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
  },

  {
    path: 'venta-local/pedido/:mesaId',
    title: "Pedido Local · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Mozo', 'Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/venta-local/pedido-local.page').then((m) => m.PedidoLocalPage),
  },
  {
    path: 'venta-local/cliente',
    title: "Datos del Cliente · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Mozo', 'Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/venta-local/datos-cliente.page').then((m) => m.DatosClientePage),
  },
  {
    path: 'venta-local',
    title: "Venta en Local · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Mozo', 'Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/venta-local/venta-local.page').then((m) => m.VentaLocalPage),
  },

  {
    path: 'cocina',
    title: "Cocina KDS · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cocinero', 'Dueño/Admin') },
    loadComponent: () => import('./features/cocina/cocina.page').then((m) => m.CocinaPage),
  },

  {
    path: 'cerrar-cuenta/:cuentaId',
    title: "Detalle de Cuenta · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/cerrar-cuenta/cuenta-detalle.page').then((m) => m.CuentaDetallePage),
  },
  {
    path: 'cerrar-cuenta',
    title: "Mesas Abiertas · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/cerrar-cuenta/cerrar-cuenta.page').then((m) => m.CerrarCuentaPage),
  },

  {
    path: 'comandas',
    title: "Comandas · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Mozo', 'Cajero', 'Cocinero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/comandas/comandas.page').then((m) => m.ComandasPage),
  },

  {
    path: 'historial-pedidos',
    title: "Historial de pedidos · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Mozo', 'Cajero', 'Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/historial-pedidos/historial-pedidos.page').then(
        (m) => m.HistorialPedidosPage,
      ),
  },

  {
    path: 'historial-cuentas',
    title: "Historial de cuentas · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Mozo', 'Cajero', 'Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/historial-cuentas/historial-cuentas.page').then(
        (m) => m.HistorialCuentasPage,
      ),
  },

  {
    path: 'delivery-propio',
    title: "Delivery Propio · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Repartidor', 'Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/delivery-propio/delivery-propio.page').then(
        (m) => m.DeliveryPropioPage,
      ),
  },
  {
    path: 'delivery-externo',
    title: "Delivery Externo · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/delivery-externo/delivery-externo.page').then(
        (m) => m.DeliveryExternoPage,
      ),
  },
  {
    path: 'cancelacion-delivery/:pedidoId',
    title: "Cancelación de Delivery · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/delivery/cancelacion.page').then((m) => m.CancelacionDeliveryPage),
  },

  {
    path: 'pedidos-listos',
    title: "Pedidos Listos · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Mozo', 'Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/pedidos-listos/pedidos-listos.page').then((m) => m.PedidosListosPage),
  },

  {
    path: 'compras/plantilla',
    title: "Plantilla de WhatsApp · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/compras/plantilla.page').then((m) => m.PlantillaComprasPage),
  },
  {
    path: 'compras',
    title: "Compra de Insumos · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/compras/compras.page').then((m) => m.ComprasPage),
  },

  {
    path: 'inventario/verificar',
    title: "Verificar Stock · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cocinero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/inventario/verificar.page').then((m) => m.InventarioVerificarPage),
  },
  {
    path: 'inventario/ajustar',
    title: "Ajustar Stock Mínimo · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cocinero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/inventario/ajustar.page').then((m) => m.InventarioAjustarPage),
  },
  {
    path: 'inventario/historial',
    title: "Historial de Movimientos · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cocinero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/inventario/historial.page').then((m) => m.InventarioHistorialPage),
  },
  {
    path: 'inventario',
    title: "Control de Inventario · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cocinero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/inventario/inventario.page').then((m) => m.InventarioPage),
  },

  {
    path: 'fichas-tecnicas/ingredientes',
    title: "Ingredientes de Ficha · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cocinero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/fichas/ingredientes.page').then((m) => m.FichasIngredientesPage),
  },
  {
    path: 'fichas-tecnicas',
    title: "Fichas Técnicas · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cocinero', 'Dueño/Admin') },
    loadComponent: () => import('./features/fichas/fichas.page').then((m) => m.FichasPage),
  },

  {
    path: 'merma',
    title: "Control de Merma · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cocinero', 'Dueño/Admin') },
    loadComponent: () => import('./features/merma/merma.page').then((m) => m.MermaPage),
  },

  {
    path: 'devoluciones/reembolso',
    title: "Registro de Reembolso · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/devoluciones/reembolso.page').then((m) => m.ReembolsoPage),
  },
  {
    path: 'devoluciones',
    title: "Devoluciones · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/devoluciones/devoluciones.page').then((m) => m.DevolucionesPage),
  },

  {
    path: 'gastos',
    title: "Registro de Gastos · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () => import('./features/gastos/gastos.page').then((m) => m.GastosPage),
  },

  {
    path: 'cuadre-caja/apertura',
    title: "Apertura de Caja · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cajero', 'Dueño/Admin') },
    loadComponent: () =>
      import('./features/cuadre/apertura.page').then((m) => m.AperturaCajaPage),
  },
  {
    path: 'cuadre-caja',
    title: "Cuadre de Caja · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Cajero', 'Dueño/Admin') },
    loadComponent: () => import('./features/cuadre/cuadre.page').then((m) => m.CuadrePage),
  },

  {
    path: 'reportes',
    title: "Reportes · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/reportes/reportes.page').then((m) => m.ReportesPage),
  },

  {
    path: 'activos/registrar',
    title: "Registrar Activo · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/activos/registrar.page').then((m) => m.ActivosRegistrarPage),
  },
  {
    path: 'activos/autorizar',
    title: "Autorizar Mantenimiento · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/activos/autorizar.page').then((m) => m.ActivosAutorizarPage),
  },
  {
    path: 'activos/alertas',
    title: "Alertas de Mantenimiento · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/activos/alertas.page').then((m) => m.ActivosAlertasPage),
  },
  {
    path: 'activos',
    title: "Mantenimiento de Activos · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () => import('./features/activos/activos.page').then((m) => m.ActivosPage),
  },

  {
    path: 'configuracion/usuarios',
    title: "Usuarios y Roles · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/configuracion/usuarios.page').then((m) => m.UsuariosPage),
  },
  {
    path: 'configuracion',
    title: "Configuración · Fratelli's",
    canActivate: [roleGuard],
    data: { roles: roles('Dueño/Admin', 'Admin') },
    loadComponent: () =>
      import('./features/configuracion/configuracion.page').then((m) => m.ConfiguracionPage),
  },

  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
