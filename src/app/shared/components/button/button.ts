import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type IconName } from '../icon/icon';

export type ButtonVariant = 'primary' | 'brand' | 'ghost' | 'dark';
export type ButtonSize = 'sm' | 'md';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [class]="'btn btn--' + variant() + ' btn--' + size()"
      [type]="type()"
      [disabled]="disabled()"
    >
      @if (icon(); as iconoInicio) {
        <app-icon [name]="iconoInicio" [size]="size() === 'sm' ? 15 : 16" />
      }
      <span class="label"><ng-content /></span>
      @if (iconEnd(); as iconoFin) {
        <app-icon [name]="iconoFin" [size]="size() === 'sm' ? 15 : 16" />
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 0;
      border-radius: var(--r-pill);
      padding: 11px 18px;
      font-family: var(--font-body);
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
      transition:
        filter var(--dur) var(--ease),
        transform var(--dur) var(--ease);
    }
    .btn:hover {
      filter: brightness(1.07);
    }
    .btn:active {
      transform: translateY(1px);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn--primary,
    .btn--dark {
      background: var(--c-ink);
      color: var(--c-white);
    }
    .btn--brand {
      background: var(--c-brand);
      color: var(--c-white);
    }
    .btn--ghost {
      background: var(--c-white);
      border: 1px solid var(--c-border);
      color: var(--c-text);
    }
    .btn--sm {
      padding: 7px 12px;
      font-size: 12px;
    }
    .label {
      display: inline-flex;
      align-items: center;
    }
  `,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly icon = input<IconName | null>(null);
  readonly iconEnd = input<IconName | null>(null);
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input<boolean>(false);
}
