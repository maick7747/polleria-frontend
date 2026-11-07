import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type IconName } from '../icon/icon';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="empty">
      <span class="empty__icon"><app-icon [name]="icon()" [size]="26" /></span>
      <h2 class="empty__title">{{ title() }}</h2>
      @if (description()) {
        <p class="empty__desc">{{ description() }}</p>
      }
      <div class="empty__actions"><ng-content /></div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 10px;
      padding: 56px 24px;
      border: 1.5px dashed var(--c-hairline);
      border-radius: var(--r-lg);
      background: rgba(255, 255, 255, 0.55);
    }
    .empty__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 16px;
      background: var(--c-brand-soft);
      color: var(--c-brand);
      margin-bottom: 4px;
    }
    .empty__title {
      font-family: var(--font-display);
      font-size: 18px;
      font-weight: 600;
      color: var(--c-text);
    }
    .empty__desc {
      max-width: 460px;
      color: var(--c-text-2);
      font-size: 12.5px;
      line-height: 1.55;
    }
    .empty__actions:empty {
      display: none;
    }
    .empty__actions {
      margin-top: 8px;
      display: flex;
      gap: 10px;
    }
  `,
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('package');
  readonly title = input.required<string>();
  readonly description = input<string>('');
}
