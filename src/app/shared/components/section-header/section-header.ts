import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-section-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="section">
      <div class="section__left">
        <span class="section__bar"></span>
        <h2 class="section__title">{{ title() }}</h2>
        @if (meta()) {
          <span class="section__meta">{{ meta() }}</span>
        }
      </div>
      <div class="section__right"><ng-content /></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .section {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 20px;
    }
    .section__left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .section__bar {
      width: 4px;
      height: 16px;
      background: var(--c-brand);
      border-radius: var(--r-pill);
      flex: 0 0 auto;
    }
    .section__title {
      font-family: var(--font-display);
      font-size: var(--fs-section);
      font-weight: 600;
      color: var(--c-text);
      white-space: nowrap;
    }
    .section__meta {
      color: var(--c-text-3);
      font-size: 11.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .section__right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 0 0 auto;
    }
  `,
})
export class SectionHeaderComponent {
  readonly title = input.required<string>();
  readonly meta = input<string>('');
}
