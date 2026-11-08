export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export const formatearMoneda = (monto: number): string =>
  `S/ ${monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatearNumero = (monto: number): string =>
  monto.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const minutosEntre = (desde: string, hasta: number): number =>
  Math.max(0, Math.floor((hasta - Date.parse(desde)) / 60000));

const ZONA_LIMA = 'America/Lima';

export const hora = (iso?: string | null): string => {
  if (!iso) {
    return '—';
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ZONA_LIMA,
  }).format(fecha);
};

export const fechaLarga = (fecha: Date = new Date()): string =>
  new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: ZONA_LIMA,
  }).format(fecha);

export const turnoActual = (fecha: Date = new Date()): string => {
  const horaDia = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: ZONA_LIMA,
    }).format(fecha),
  );
  return horaDia < 17 ? 'turno tarde' : 'turno noche';
};


export const abreviarNombre = (nombre: string): string => {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) {
    return '—';
  }
  if (partes.length === 1) {
    return partes[0];
  }
  const ultimo = partes[partes.length - 1];
  return `${partes[0]} ${ultimo.charAt(0).toUpperCase()}.`;
};
