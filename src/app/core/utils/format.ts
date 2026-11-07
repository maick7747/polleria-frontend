export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export const formatearMoneda = (monto: number): string =>
  `S/ ${monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatearNumero = (monto: number): string =>
  monto.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const minutosEntre = (desde: string, hasta: number): number =>
  Math.max(0, Math.floor((hasta - Date.parse(desde)) / 60000));

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
