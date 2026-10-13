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
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { DISCORD_INVITE_URL, NAV_SECTIONS, NavSection, findNavLocation } from './nav-sections';

@Component({
  selector: 'app-update-bar',
  templateUrl: './update-bar.component.html',
  styleUrls: ['./update-bar.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
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
  protected readonly discordUrl = DISCORD_INVITE_URL;
  /** Content-sized dropdown widths: longest label plus roughly 20% breathing room. */
  protected readonly dropdownWidths = new Map(
    NAV_SECTIONS.map((section) => {
      const longestLabel = Math.max(...section.pages.map((page) => Array.from(page.label).length));
      return [section.id, `calc(60px + ${Math.ceil(longestLabel * 1.2)}ch)`] as const;
    })
  );
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

  /** Mouse users can browse the menus without clicking; touch and keyboard users still toggle them. */
  onTriggerPointerEnter(section: NavSection, event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      return;
    }

    this.hoverOpenedId = section.id;
    this.openSectionId.set(section.id);
  }

  /** Keep the menu open while the pointer is over either its trigger or its dropdown. */
  onSectionPointerLeave(section: NavSection, event: PointerEvent): void {
    if (event.pointerType === 'mouse' && this.openSectionId() === section.id) {
      this.closeMenu();
    }
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
