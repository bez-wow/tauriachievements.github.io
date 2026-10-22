import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-load-state',
  template: `
    @if (loading()) {
      <section class="feedback" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <p>{{ loadingText() }}</p>
      </section>
    } @else if (error(); as message) {
      <section class="feedback error">
        <p>{{ message }}</p>
        <ng-content />
        <button type="button" (click)="retry.emit()">Try again</button>
      </section>
    }
  `,
  styleUrl: './load-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadStateComponent {
  readonly loading = input.required<boolean>();
  readonly error = input<string>();
  readonly loadingText = input('Loading...');
  readonly retry = output<void>();
}
