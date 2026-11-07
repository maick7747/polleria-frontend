import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styles: `
    :host {
      display: block;
      background: var(--c-white);
      border: 1px solid var(--c-border);
      border-radius: var(--r-xl);
      box-shadow: var(--sh-panel);
      min-width: 0;
    }
  `,
})
export class PanelComponent {}
