import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { USE_API } from '../../core/api/api.config';

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

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.page.html',
  styleUrl: './login.page.css',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly error = signal<string>('');
  readonly cargando = signal<boolean>(false);
  readonly accesos: readonly AccesoDemo[] = USE_API ? ACCESOS_API : ACCESOS_MOCK;

  private readonly inicial = this.accesos[0];

  readonly form = this.fb.nonNullable.group({
    email: [this.inicial?.email ?? '', [Validators.required, Validators.email]],
    password: [this.inicial?.password ?? '', [Validators.required]],
  });

  usarAcceso(acceso: AccesoDemo): void {
    this.form.setValue({ email: acceso.email, password: acceso.password });
    this.error.set('');
  }

  async ingresar(): Promise<void> {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    const { email, password } = this.form.getRawValue();
    const resultado = await this.auth.login(email, password);
    this.cargando.set(false);
    if (!resultado.ok) {
      this.error.set(resultado.error ?? 'No se pudo iniciar sesión.');
      return;
    }
    this.error.set('');
    void this.router.navigateByUrl('/dashboard');
  }
}
