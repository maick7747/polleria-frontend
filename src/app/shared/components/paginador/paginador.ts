import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-paginador',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="paginador">
      <span class="paginador__info">
        Mostrando {{ desde() }}–{{ hasta() }} de {{ total() }}
      </span>

      <label class="paginador__limit">
        Filas
        <select (change)="onLimit($event)" aria-label="Filas por página">
          @for (opcion of opciones; track opcion) {
            <option [value]="opcion" [selected]="opcion === limit()">{{ opcion }}</option>
          }
        </select>
      </label>

      <div class="paginador__nav">
        <button type="button" [disabled]="page() <= 1" (click)="ir(page() - 1)">Anterior</button>
        <span>Página {{ page() }} de {{ pages() || 1 }}</span>
        <button type="button" [disabled]="page() >= pages()" (click)="ir(page() + 1)">
          Siguiente
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .paginador {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding-top: 10px;
      border-top: 1px solid var(--c-border);
      font-family: var(--font-body);
      font-size: 12px;
      color: var(--c-text-2);
    }
    .paginador__info {
      white-space: nowrap;
    }
    .paginador__limit {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .paginador__limit select {
      height: 30px;
      padding: 0 8px;
      border: 1px solid var(--c-border);
      border-radius: var(--r-pill);
      background: var(--c-white);
      color: var(--c-text);
      font-family: var(--font-body);
      font-size: 12px;
      cursor: pointer;
    }
    .paginador__nav {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      white-space: nowrap;
    }
    .paginador__nav button {
      height: 30px;
      padding: 0 12px;
      border: 1px solid var(--c-border);
      border-radius: var(--r-pill);
      background: var(--c-white);
      color: var(--c-text);
      font-family: var(--font-body);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .paginador__nav button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .paginador__nav button:not(:disabled):hover {
      border-color: var(--c-brand);
      color: var(--c-brand-text);
    }
    @media (max-width: 720px) {
      .paginador {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PaginadorComponent {
  readonly page = input<number>(1);
  readonly pages = input<number>(0);
  readonly total = input<number>(0);
  readonly limit = input<number>(20);

  readonly pageChange = output<number>();
  readonly limitChange = output<number>();

  readonly opciones = [10, 20, 50, 100];

  readonly desde = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.limit() + 1,
  );

  readonly hasta = computed(() => Math.min(this.page() * this.limit(), this.total()));

  ir(pagina: number): void {
    if (pagina >= 1 && pagina <= Math.max(1, this.pages())) {
      this.pageChange.emit(pagina);
    }
  }

  onLimit(event: Event): void {
    const valor = Number((event.target as HTMLSelectElement).value);
    if (this.opciones.includes(valor)) {
      this.limitChange.emit(valor);
    }
  }
}
