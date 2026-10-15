import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender, inject, viewChild } from '@angular/core';

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

/**
 * Wraps rows of small icons (talents, trinkets) and shows one tooltip for whichever element with
 * `data-tip` the mouse is over or keyboard focus is on: the name, in `data-tip-color` if set, and
 * a `data-tip-note` line under it. One element serves every icon, so a page of 25 rows doesn't
 * carry 225 hidden tooltips. It is fixed to the viewport because the tables these icons sit in
 * scroll sideways, and an absolutely placed tooltip would be cut off at their edges.
 *
 * Touch screens get no tooltip: the icons link to TauriShoot, which describes them in full. Screen
 * readers read the links' own labels; the tooltip is hidden from them.
 *
 * The listeners run outside Angular and only touch the tooltip's DOM, so moving the mouse across a
 * table runs no change detection.
 */
@Component({
  selector: 'app-icon-tips',
  standalone: true,
  template: `<ng-content /><span #tip class="icon-tip" aria-hidden="true"><b #name></b><span #note class="icon-tip-note"></span></span>`,
  styleUrl: './icon-tips.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IconTipsComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly tip = viewChild.required<ElementRef<HTMLElement>>('tip');
  private readonly name = viewChild.required<ElementRef<HTMLElement>>('name');
  private readonly note = viewChild.required<ElementRef<HTMLElement>>('note');
  private anchor?: HTMLElement;
  private shownByFocus = false;
  private followFrame = 0;

  private readonly hide = () => {
    if (!this.anchor) {
      return;
    }
    this.anchor = undefined;
    this.tip().nativeElement.classList.remove('shown');
    const view = this.document.defaultView;
    view?.cancelAnimationFrame(this.followFrame);
    view?.removeEventListener('scroll', this.onScroll, true);
    view?.removeEventListener('resize', this.hide);
    this.document.removeEventListener('keydown', this.onKeyDown);
  };

  /**
   * A scroll moves the icon away from its tooltip. Under the mouse the tooltip just goes; for
   * keyboard focus it follows the icon, since focusing an icon is often what scrolled the page or
   * the table to it.
   */
  private readonly onScroll = () => {
    if (!this.shownByFocus) {
      this.hide();
      return;
    }

    const view = this.document.defaultView;
    view?.cancelAnimationFrame(this.followFrame);
    this.followFrame = view?.requestAnimationFrame(() => {
      if (this.anchor) {
        this.place(this.tip().nativeElement, this.anchor.getBoundingClientRect());
      }
    }) ?? 0;
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.hide();
    }
  };

  constructor() {
    const zone = inject(NgZone);
    const listeners: Array<[string, EventListener]> = [
      ['pointerover', event => {
        if ((event as PointerEvent).pointerType === 'mouse') {
          this.showFor(event.target, false);
        }
      }],
      ['pointerleave', this.hide],
      ['focusin', event => this.showFor(event.target, true)],
      ['focusout', this.hide]
    ];

    afterNextRender(() => zone.runOutsideAngular(() => {
      for (const [type, listener] of listeners) {
        this.host.addEventListener(type, listener);
      }
    }));

    inject(DestroyRef).onDestroy(() => {
      this.hide();
      for (const [type, listener] of listeners) {
        this.host.removeEventListener(type, listener);
      }
    });
  }

  /** Shows the tooltip of the `data-tip` element the event came from, or hides it for anything else. */
  private showFor(target: EventTarget | null, byFocus: boolean): void {
    const anchor = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null;
    // Focus from a mouse click or a tap shows nothing: only keyboard focus does.
    if (!anchor || !this.host.contains(anchor) || (byFocus && !anchor.matches(':focus-visible'))) {
      this.hide();
      return;
    }
    if (anchor === this.anchor) {
      return;
    }

    const tip = this.tip().nativeElement;
    this.name().nativeElement.textContent = anchor.dataset['tip'] ?? '';
    this.name().nativeElement.style.color = anchor.dataset['tipColor'] ?? '';
    this.note().nativeElement.textContent = anchor.dataset['tipNote'] ?? '';
    this.place(tip, anchor.getBoundingClientRect());
    tip.classList.add('shown');

    if (!this.anchor) {
      // Capturing on the window also hears the table's own sideways scroll.
      const view = this.document.defaultView;
      view?.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
      view?.addEventListener('resize', this.hide, { passive: true });
      this.document.addEventListener('keydown', this.onKeyDown);
    }
    this.anchor = anchor;
    this.shownByFocus = byFocus;
  }

  /** Under the icon, centred on it, or over it when there's no room below; never off screen. */
  private place(tip: HTMLElement, anchor: DOMRect): void {
    const viewportWidth = this.document.documentElement.clientWidth;
    const viewportHeight = this.document.defaultView?.innerHeight ?? 0;
    const { width, height } = tip.getBoundingClientRect();

    const below = anchor.bottom + ANCHOR_GAP;
    const top = below + height + VIEWPORT_MARGIN > viewportHeight ? anchor.top - ANCHOR_GAP - height : below;
    const centred = anchor.left + anchor.width / 2 - width / 2;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(centred, viewportWidth - width - VIEWPORT_MARGIN));

    tip.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`;
    tip.style.left = `${left}px`;
  }
}
