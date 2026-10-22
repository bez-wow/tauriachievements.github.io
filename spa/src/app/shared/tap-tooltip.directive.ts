import { Directive, ElementRef, inject, signal } from '@angular/core';

@Directive({
  selector: '[appTapTooltip]',
  host: {
    '[class.tooltip-open]': 'isOpen()',
    '(pointerup)': 'onPointerUp($event)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'close()'
  }
})
export class TapTooltipDirective {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  readonly isOpen = signal(false);

  onPointerUp(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      this.isOpen.update((open) => !open);
    }
  }

  onDocumentPointerDown(event: PointerEvent): void {
    if (this.isOpen() && !this.host.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }

  close(): void {
    this.isOpen.set(false);
  }
}
