import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-wrap">
      <table class="app-table">
        <thead>
          <tr>
            @for (columna of columns(); track columna.key) {
              <th
                [style.text-align]="columna.align ?? 'left'"
                [class.num]="columna.align === 'right'"
              >
                {{ columna.label }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          <ng-content />
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
    }
  `,
})
export class DataTableComponent {
  readonly columns = input.required<readonly TableColumn[]>();
}
