import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dark-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styles: `
    :host {
      display: block;
      background: var(--c-ink);
      border: 1px solid var(--c-dark-line);
      border-radius: var(--r-lg);
      box-shadow: var(--sh-dark);
      color: var(--c-on-dark);
      min-width: 0;
    }
  `,
})
export class DarkPanelComponent {}
