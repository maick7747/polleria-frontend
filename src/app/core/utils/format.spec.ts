import { describe, expect, it } from 'vitest';
import {
  abreviarNombre,
  fechaLarga,
  formatearMoneda,
  formatearNumero,
  hora,
  minutosEntre,
  round2,
  round3,
  turnoActual,
} from './format';

describe('round2', () => {
  it('redondea a dos decimales', () => {
    expect(round2(64.5)).toBe(64.5);
    expect(round2(64.4999)).toBe(64.5);
    expect(round2(64.4949)).toBe(64.49);
    expect(round2(1.015)).toBe(1.02);
    expect(round2(2.5)).toBe(2.5);
  });

  it('redondea los casos con artefacto binario (medio centavo hacia arriba)', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1234.565)).toBe(1234.57);
    expect(round2(-1.005)).toBe(-1);
  });

  it('corrige el error de coma flotante de 0.1 + 0.2', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('maneja cero y negativos', () => {
    expect(round2(0)).toBe(0);
    expect(round2(-1.239)).toBe(-1.24);
  });
});

describe('round3', () => {
  it('redondea a tres decimales', () => {
    expect(round3(1.23456)).toBe(1.235);
    expect(round3(1.2332)).toBe(1.233);
    expect(round3(0.1 + 0.7)).toBe(0.8);
  });
});

describe('formatearMoneda', () => {
  it('siempre muestra dos decimales con el prefijo S/', () => {
    expect(formatearMoneda(64.5)).toBe('S/ 64.50');
    expect(formatearMoneda(0)).toBe('S/ 0.00');
    expect(formatearMoneda(1234.5)).toBe('S/ 1,234.50');
  });

  it('redondea los decimales sobrantes al formatear', () => {
    expect(formatearMoneda(10.005)).toBe('S/ 10.01');
  });
});

describe('formatearNumero', () => {
  it('muestra enteros sin decimales y con separador de miles', () => {
    expect(formatearNumero(1234)).toBe('1,234');
    expect(formatearNumero(1234.56)).toBe('1,235');
    expect(formatearNumero(0)).toBe('0');
  });
});

describe('minutosEntre', () => {
  it('calcula los minutos transcurridos sin devolver negativos', () => {
    const desde = '2026-10-14T16:00:00-05:00';
    const hasta = Date.parse('2026-10-14T16:25:00-05:00');
    expect(minutosEntre(desde, hasta)).toBe(25);
  });

  it('devuelve 0 si la marca final es anterior al inicio', () => {
    const desde = '2026-10-14T16:00:00-05:00';
    const hasta = Date.parse('2026-10-14T15:00:00-05:00');
    expect(minutosEntre(desde, hasta)).toBe(0);
  });
});

describe('hora', () => {
  it('formatea en hora de Lima sin importar la zona del runner', () => {
    // 16:56 en Lima (UTC-5) equivale a 21:56 UTC.
    expect(hora('2026-10-14T16:56:00-05:00')).toBe('16:56');
    expect(hora('2026-10-14T21:56:00Z')).toBe('16:56');
  });

  it('devuelve un guion para entradas vacías o inválidas', () => {
    expect(hora(undefined)).toBe('—');
    expect(hora(null)).toBe('—');
    expect(hora('')).toBe('—');
    expect(hora('no-es-una-fecha')).toBe('—');
  });
});

describe('fechaLarga', () => {
  it('escribe la fecha en español con la zona de Lima', () => {
    const fecha = new Date('2026-10-14T12:00:00Z');
    expect(fechaLarga(fecha)).toBe('miércoles, 14 de octubre de 2026');
  });

  it('respeta la zona de Lima cuando el UTC ya es el día siguiente', () => {
    // 2026-10-15 03:00 UTC = 2026-10-14 22:00 en Lima.
    const fecha = new Date('2026-10-15T03:00:00Z');
    expect(fechaLarga(fecha)).toBe('miércoles, 14 de octubre de 2026');
  });
});

describe('turnoActual', () => {
  it('marca turno mañana antes de las 11:00 de Lima', () => {
    // 13:00 UTC = 08:00 en Lima.
    expect(turnoActual(new Date('2026-10-14T13:00:00Z'))).toBe('turno mañana');
  });

  it('marca turno tarde entre 11:00 y 16:59 de Lima', () => {
    // 18:00 UTC = 13:00 en Lima.
    expect(turnoActual(new Date('2026-10-14T18:00:00Z'))).toBe('turno tarde');
  });

  it('marca turno noche a partir de las 17:00 de Lima', () => {
    // 23:00 UTC = 18:00 en Lima.
    expect(turnoActual(new Date('2026-10-14T23:00:00Z'))).toBe('turno noche');
  });
});

describe('abreviarNombre', () => {
  it('abrevia al primer nombre y la inicial del apellido', () => {
    expect(abreviarNombre('Maick Fernando Vicente Guadalupe')).toBe('Maick G.');
  });

  it('devuelve el nombre completo si es una sola palabra', () => {
    expect(abreviarNombre('Maick')).toBe('Maick');
  });

  it('devuelve un guion si el nombre está vacío', () => {
    expect(abreviarNombre('   ')).toBe('—');
  });
});
