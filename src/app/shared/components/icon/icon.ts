import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

export type IconName =
  | 'house'
  | 'receipt'
  | 'users'
  | 'storefront'
  | 'package'
  | 'chart-bar'
  | 'clipboard-text'
  | 'credit-card'
  | 'monitor'
  | 'gear'
  | 'flame'
  | 'shopping-cart'
  | 'money'
  | 'trash'
  | 'book-open'
  | 'cash-register'
  | 'wrench'
  | 'plus'
  | 'magnifying-glass'
  | 'arrow-left'
  | 'arrow-right'
  | 'check'
  | 'x'
  | 'warning-circle'
  | 'clock'
  | 'user'
  | 'phone'
  | 'map-pin'
  | 'printer'
  | 'download'
  | 'upload'
  | 'filter'
  | 'dots-three'
  | 'caret-right'
  | 'arrow-clockwise'
  | 'motorcycle'
  | 'bell-ringing'
  | 'check-circle'
  | 'fork-knife'
  | 'wine'
  | 'leaf'
  | 'note-pencil';

const ICONS: Record<IconName, string> = {
  house:
    '<path d="M3.5 10.5 12 3l8.5 7.5V21h-6v-6h-5v6h-6z"/>',
  receipt:
    '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20v-1.2a4.6 4.6 0 0 1 4.6-4.6h1.8a4.6 4.6 0 0 1 4.6 4.6V20"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M17.5 14.4a4.6 4.6 0 0 1 3 4.3V20"/>',
  storefront:
    '<path d="M4 10v10h16V10"/><path d="M3 10l1.6-6h14.8L21 10"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M9 20v-5h6v5"/>',
  package:
    '<path d="M12 3 21 8v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  'chart-bar':
    '<path d="M3 20h18M7 20v-8M12 20V5M17 20v-5"/>',
  'clipboard-text':
    '<path d="M9 4h6v3H9z"/><path d="M9 5.5H5.5V21h13V5.5H15"/><path d="M9 11h6M9 15h4"/>',
  'credit-card':
    '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h3"/>',
  monitor:
    '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  gear:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  flame:
    '<path d="M12 3c2.8 4 5.5 6 5.5 9.6A5.5 5.5 0 0 1 12 18a5.5 5.5 0 0 1-5.5-5.4c0-2 .9-3.3 2-4.6.1 1.9.9 3 2 3.4C10.4 8.6 11 6 12 3Z"/><path d="M12 21v-3"/>',
  'shopping-cart':
    '<circle cx="9.5" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2.5 3h2.8l2.4 12.5h11L21.5 7H6"/>',
  money:
    '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  trash:
    '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  'book-open':
    '<path d="M12 6.2C10.5 4.8 8.6 4.2 6.2 4.2H3v14.4h3.2c2.4 0 4.3.6 5.8 2 1.5-1.4 3.4-2 5.8-2H21V4.2h-3.2c-2.4 0-4.3.6-5.8 2Z"/><path d="M12 6.2v14.4"/>',
  'cash-register':
    '<rect x="3" y="8.5" width="18" height="7.5" rx="2"/><path d="M6.5 8.5 7.5 3.5h9l1 5M7.5 16v4.5h9V16"/><path d="M7.5 12h2M12 12h2M16.5 12h.5"/>',
  wrench:
    '<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18v3h3l5.3-5.3a5 5 0 0 0 6.4-6.4l-3 3-3-3 3-3Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  'magnifying-glass':
    '<circle cx="11" cy="11" r="7"/><path d="M16.2 16.2 21 21"/>',
  'arrow-left': '<path d="M20 12H4M10 6l-6 6 6 6"/>',
  'arrow-right': '<path d="M4 12h16M14 6l6 6-6 6"/>',
  check: '<path d="M4.5 12.5 9 17 20 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  'warning-circle':
    '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.6v.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  user:
    '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 21v-1.5A5.5 5.5 0 0 1 10 14h4a5.5 5.5 0 0 1 5.5 5.5V21"/>',
  phone:
    '<path d="M6.5 3h3l1.8 4.5-2.1 1.5a12.5 12.5 0 0 0 5.8 5.8l1.5-2.1L21 14.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 5.2 2 2 0 0 1 6 3Z"/>',
  'map-pin':
    '<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.6"/>',
  printer:
    '<path d="M7 9V3.5h10V9"/><rect x="4" y="9" width="16" height="7.5" rx="2"/><path d="M8 16.5h8V21H8z"/>',
  download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 21h16"/>',
  upload: '<path d="M12 21V9M7.5 13.5 12 9l4.5 4.5M4 3h16"/>',
  filter: '<path d="M3.5 5h17l-6.8 8v6l-3.4 1.5V13z"/>',
  'dots-three':
    '<g stroke-width="2.6"><path d="M6 12h.01M12 12h.01M18 12h.01"/></g>',
  'caret-right': '<path d="M9 6l6 6-6 6"/>',
  'arrow-clockwise':
    '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  motorcycle:
    '<circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M5.5 17h4l3.2-6h3.8l2 6"/><path d="M9 17l2.7-6"/><path d="M12.5 8H16l1.5 3"/><path d="M16 17h-2.5"/>',
  'bell-ringing':
    '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.6 2H4.4z"/><path d="M10 21a2.4 2.4 0 0 0 4 0"/><path d="M12 2.5v2"/><path d="M5.6 5.6 4.2 4.2M18.4 5.6l1.4-1.4"/>',
  'check-circle':
    '<circle cx="12" cy="12" r="9"/><path d="M8 12.2 10.8 15 16 9.5"/>',
  'fork-knife':
    '<path d="M7 3v7a2 2 0 0 0 4 0V3"/><path d="M9 10v11"/><path d="M16.5 3c1.6 1 2.5 3 2.5 5.5S18 13 16.5 14v7"/>',
  wine:
    '<path d="M7 3h10l-1 6a4 4 0 0 1-8 0z"/><path d="M12 15v6M8.5 21h7"/>',
  leaf:
    '<path d="M20 4C10 4 4 8 4 15a5 5 0 0 0 5 5c7 0 11-6 11-16Z"/><path d="M4 20c3-6 7-9 12-11"/>',
  'note-pencil':
    '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>',
};

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="icon"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [innerHTML]="markup()"
      aria-hidden="true"
    ></span>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
      color: currentColor;
    }
    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
  `,
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName>();
  readonly size = input<number>(18);

  readonly markup = computed<SafeHtml>(() => {
    const contenido = ICONS[this.name()];
    const svg = `<svg viewBox="0 0 24 24" width="${this.size()}" height="${this.size()}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${contenido}</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });
}
