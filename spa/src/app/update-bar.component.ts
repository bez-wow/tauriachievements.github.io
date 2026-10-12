import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  afterNextRender,
  computed,
  inject,
  signal
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { NAV_SECTIONS, NavSection, findNavLocation } from './nav-sections';

@Component({
  selector: 'app-update-bar',
  templateUrl: './update-bar.component.html',
  styleUrls: ['./update-bar.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UpdateBarComponent {
  @Input() lastEdited?: Date;
  /** What the shown time is, e.g. "Last updated:" or, for match data, "Latest match:". */
  @Input() lastEditedLabel = 'Last updated:';
  @Input() lastEditedTimeZoneLabel = 'Local time';
  @Input() lastEditedTimeZone?: string;
  @Input() showLastUpdated = true;

  protected readonly sections = NAV_SECTIONS;
  /** The section whose dropdown is open, if any. */
  protected readonly openSectionId = signal<string | null>(null);

  private readonly router = inject(Router);
  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  /** A section opened by pointing at it; the click that usually follows keeps it open. */
  private hoverOpenedId: string | null = null;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /** Where the current page sits in the navigation. */
  protected readonly location = computed(() => findNavLocation(this.url()));

  constructor() {
    // On narrow screens the sections scroll sideways; start with the current one in view.
    afterNextRender(() => {
      for (const scroller of this.host.querySelectorAll<HTMLElement>('.site-nav-list')) {
        const current = scroller.querySelector<HTMLElement>('.is-current');
        if (current && scroller.scrollWidth > scroller.clientWidth) {
          scroller.scrollLeft = current.offsetLeft - (scroller.clientWidth - current.offsetWidth) / 2;
        }
      }
    });
  }

  toggleSection(section: NavSection): void {
    const keepOpen = this.hoverOpenedId === section.id && this.openSectionId() === section.id;
    this.hoverOpenedId = null;

    if (!keepOpen) {
      this.openSectionId.update((openId) => (openId === section.id ? null : section.id));
    }
  }

  /** With a dropdown already open, pointing at another section switches to it, as in a menu bar. */
  onTriggerPointerEnter(section: NavSection, event: PointerEvent): void {
    const openId = this.openSectionId();
    if (event.pointerType !== 'mouse' || openId === null || openId === section.id) {
      return;
    }

    this.hoverOpenedId = section.id;
    this.openSectionId.set(section.id);
  }

  /** Tabbing out of a section closes its dropdown. Clicks elsewhere are handled on the document. */
  onSectionFocusOut(section: NavSection, event: FocusEvent): void {
    const next = event.relatedTarget;
    const item = event.currentTarget as HTMLElement;

    if (this.openSectionId() === section.id && next instanceof Node && !item.contains(next)) {
      this.closeMenu();
    }
  }

  closeMenu(): void {
    this.hoverOpenedId = null;
    this.openSectionId.set(null);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const openItem = this.openSectionItem();
    if (openItem && !(event.target instanceof Node && openItem.contains(event.target))) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    const openItem = this.openSectionItem();
    if (!openItem) {
      return;
    }

    event.preventDefault();
    this.closeMenu();

    if (openItem.contains(document.activeElement)) {
      openItem.querySelector<HTMLElement>('.site-nav-trigger')?.focus();
    }
  }

  // Looked up by id, not by an open class: the click that opens a section reaches the document
  // before the change is rendered.
  private openSectionItem(): HTMLElement | null {
    const openId = this.openSectionId();
    return openId === null ? null : this.host.querySelector<HTMLElement>(`[data-nav-section="${openId}"]`);
  }
}
