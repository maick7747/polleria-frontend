import { ChangeDetectionStrategy, Component, inject, signal, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { USE_API } from '../../core/api/api.config';
import { environment } from '../../../environments/environment';

interface AccesoDemo {
  rol: string;
  email: string;
  password: string;
}

const ACCESOS_API: readonly AccesoDemo[] = [
  { rol: 'Dueño/Admin', email: 'maick@fratellis.pe', password: 'demo123' },
  { rol: 'Mozo + Cajero', email: 'cajero@fratellis.pe', password: 'demo123' },
  { rol: 'Cocinero', email: 'cocina@fratellis.pe', password: 'demo123' },
  { rol: 'Repartidor', email: 'repartidor@fratellis.pe', password: 'demo123' },
  { rol: 'Admin', email: 'tecnico@fratellis.pe', password: 'demo123' },
];

const ACCESOS_MOCK: readonly AccesoDemo[] = [
  { rol: 'Mozo', email: 'mozo@fratellis.pe', password: 'mozo123' },
  { rol: 'Cajero', email: 'cajero@fratellis.pe', password: 'cajero123' },
  { rol: 'Cocinero', email: 'cocina@fratellis.pe', password: 'cocina123' },
  { rol: 'Repartidor', email: 'reparto@fratellis.pe', password: 'reparto123' },
  { rol: 'Dueño/Admin', email: 'dueno@fratellis.pe', password: 'dueno123' },
  { rol: 'Admin', email: 'tecnico@fratellis.pe', password: 'tecnico123' },
];

const AVISO_LENTO_MS = 5_000;

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.page.html',
  styleUrl: './login.page.css',
})
export class LoginPage implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly error = signal<string>('');
  readonly cargando = signal<boolean>(false);
  readonly lento = signal<boolean>(false);
  private temporizadorLento: ReturnType<typeof setTimeout> | null = null;
  readonly usaApi = USE_API;
  readonly accesos: readonly AccesoDemo[] = USE_API ? ACCESOS_API : ACCESOS_MOCK;

  // En producción no se pre-rellenan credenciales: eran las de los usuarios
  // demo y el repo es público. En dev/demo se mantiene el autocompletado.
  private readonly inicial = environment.production ? undefined : this.accesos[0];

  readonly form = this.fb.nonNullable.group({
    email: [this.inicial?.email ?? '', [Validators.required, Validators.email]],
    password: [this.inicial?.password ?? '', [Validators.required]],
  });

  usarAcceso(acceso: AccesoDemo): void {
    this.form.setValue({ email: acceso.email, password: acceso.password });
    this.error.set('');
  }

  ngOnDestroy(): void {
    this.limpiarAvisoLento();
  }

  async ingresar(): Promise<void> {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    this.programarAvisoLento();
    const { email, password } = this.form.getRawValue();
    const resultado = await this.auth.login(email, password);
    this.limpiarAvisoLento();
    this.cargando.set(false);
    if (!resultado.ok) {
      this.error.set(resultado.error ?? 'No se pudo iniciar sesión.');
      return;
    }
    this.error.set('');
    // Cada rol entra a su pantalla operativa (no todos pueden ver el Dashboard).
    // Se usa una carga completa: si Vercel publicó una versión nueva mientras
    // la pestaña estaba abierta, la navegación SPA puede fallar al pedir un
    // chunk que ya no existe y dejar al usuario en /login hasta recargar.
    // La sesión ya quedó persistida, así que el arranque entra directo.
    const destino = this.auth.home();
    if (typeof window === 'undefined') {
      void this.router.navigateByUrl(destino);
      return;
    }
    window.location.assign(destino);
  }

  private programarAvisoLento(): void {
    this.limpiarAvisoLento();
    this.temporizadorLento = setTimeout(() => this.lento.set(true), AVISO_LENTO_MS);
  }

  private limpiarAvisoLento(): void {
    if (this.temporizadorLento !== null) {
      clearTimeout(this.temporizadorLento);
      this.temporizadorLento = null;
    }
    this.lento.set(false);
  }
}
