import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type IconName } from '../icon/icon';

export type StatTone = 'neutral' | 'brand' | 'warning' | 'success' | 'danger';

@Component({
  selector: 'app-stat',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stat" [class]="'stat stat--' + tone()">
      <div class="stat__label">
        @if (icon(); as icono) {
          <app-icon [name]="icono" [size]="14" />
        }
        <span>{{ label() }}</span>
      </div>
      <div class="stat__value">{{ value() }}</div>
      @if (hint()) {
        <div class="stat__hint">{{ hint() }}</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .stat__label {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--c-text-2);
      font-size: 12px;
      white-space: nowrap;
    }
    .stat__value {
      font-family: var(--font-display);
      font-size: var(--fs-kpi);
      font-weight: 700;
      line-height: 1;
      color: var(--c-text);
      font-variant-numeric: tabular-nums;
    }
    .stat__hint {
      color: var(--c-text-3);
      font-size: 11px;
      line-height: 1.3;
    }
    .stat--brand .stat__label app-icon,
    .stat--brand .stat__value {
      color: var(--c-brand);
    }
    .stat--warning .stat__label app-icon,
    .stat--warning .stat__value {
      color: var(--c-warning);
    }
    .stat--success .stat__label app-icon,
    .stat--success .stat__value {
      color: var(--c-success);
    }
    .stat--danger .stat__label app-icon,
    .stat--danger .stat__value {
      color: var(--c-brand-text);
    }
  `,
})
export class StatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input<string>('');
  readonly icon = input<IconName | null>(null);
  readonly tone = input<StatTone>('neutral');
}
