import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ChipVariant =
  | 'neutral'
  | 'danger'
  | 'success'
  | 'warning'
  | 'info'
  | 'brand';

@Component({
  selector: 'app-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="'chip chip--' + variant()">
      @if (dot()) {
        <span class="dot"></span>
      }
      <ng-content />
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: var(--r-pill);
      font-family: var(--font-body);
      font-size: 10.5px;
      font-weight: 600;
      line-height: 1.5;
      white-space: nowrap;
    }
    .chip--neutral {
      background: var(--c-neutral-soft);
      color: var(--c-text-2);
    }
    .chip--danger {
      background: var(--c-danger-soft);
      color: var(--c-brand-text);
    }
    .chip--success {
      background: var(--c-success-soft);
      color: var(--c-success);
    }
    .chip--warning {
      background: var(--c-warning-soft);
      color: var(--c-warning);
    }
    .chip--info {
      background: var(--c-info-soft);
      color: var(--c-info);
    }
    .chip--brand {
      background: var(--c-brand);
      color: var(--c-white);
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
  `,
})
export class ChipComponent {
  readonly variant = input<ChipVariant>('neutral');
  readonly dot = input<boolean>(false);
}
