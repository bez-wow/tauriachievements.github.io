import { Directive, ElementRef, inject, signal } from '@angular/core';

/**
 * Opens a CSS hover tooltip on touch screens. A tap with a finger or pen toggles the
 * `tooltip-open` class on the host, and a tap anywhere else or Escape removes it; the
 * component's stylesheet shows its tooltip for `.tooltip-open` as it does for `:hover`.
 * Mouse input is left to the existing hover styles.
 */
@Directive({
  selector: '[appTapTooltip]',
  standalone: true,
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
