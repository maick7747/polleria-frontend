import { afterEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { RealtimeService } from './realtime.service';

// `environment` es `as const`; el cast permite simular configuraciones sin
// tocar los archivos reales. Se restaura al terminar cada prueba.
const ENV = environment as unknown as {
  useRealtime: boolean;
  supabaseUrl: string;
  supabaseKey: string;
};

const ORIGINAL = {
  useRealtime: ENV.useRealtime,
  supabaseUrl: ENV.supabaseUrl,
  supabaseKey: ENV.supabaseKey,
};

afterEach(() => {
  ENV.useRealtime = ORIGINAL.useRealtime;
  ENV.supabaseUrl = ORIGINAL.supabaseUrl;
  ENV.supabaseKey = ORIGINAL.supabaseKey;
});

describe('RealtimeService', () => {
  it('queda deshabilitado cuando useRealtime es false', () => {
    ENV.useRealtime = false;
    ENV.supabaseUrl = 'https://mcfkcqwvlztyexqixfhk.supabase.co';
    ENV.supabaseKey = 'sb_publishable_prueba';

    const servicio = new RealtimeService();

    expect(servicio.disponible()).toBe(false);
    expect(servicio.estado()).toBe('deshabilitado');
    expect(servicio.conectado()).toBe(false);
    expect(servicio.revision()).toBe(0);
    expect(servicio.iniciar()).toBe(false);
    expect(servicio.estado()).toBe('deshabilitado');
    expect(() => servicio.detener()).not.toThrow();
  });

  it('queda deshabilitado si faltan las credenciales de Supabase', () => {
    ENV.useRealtime = true;
    ENV.supabaseUrl = '';
    ENV.supabaseKey = '';

    const servicio = new RealtimeService();

    expect(servicio.disponible()).toBe(false);
    expect(servicio.iniciar()).toBe(false);
    expect(servicio.estado()).toBe('deshabilitado');
    expect(servicio.conectado()).toBe(false);
  });
});
