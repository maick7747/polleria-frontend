import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon';

export type EstadoPaso = 'done' | 'active' | 'pending';

export interface PasoStepper {
  numero?: number;
  etiqueta: string;
  meta?: string;
  estado: EstadoPaso;
  link?: string;
}

@Component({
  selector: 'app-stepper',
  standalone: true,
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stepper.html',
  styleUrl: './stepper.css',
})
export class StepperComponent {
  readonly pasos = input.required<readonly PasoStepper[]>();
  readonly meta = input<string>('');
}
