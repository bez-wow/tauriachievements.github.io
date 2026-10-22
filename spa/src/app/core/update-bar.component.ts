import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { DISCORD_INVITE_URL, NAV_SECTIONS, NavSection, findNavLocation } from './nav-sections';
import { PageHeaderService } from './page-header';

@Component({
  selector: 'app-update-bar',
  templateUrl: './update-bar.component.html',
  styleUrls: ['./update-bar.component.scss'],
  imports: [RouterLink, RouterLinkActive, DatePipe, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UpdateBarComponent {
  private readonly pageHeader = inject(PageHeaderService);
  protected readonly lastEdited = this.pageHeader.lastEdited;
  protected readonly lastEditedLabel = this.pageHeader.label;
  protected readonly lastEditedTimeZoneLabel = this.pageHeader.timeZoneLabel;
  protected readonly lastEditedTimeZone = this.pageHeader.timeZone;

  protected readonly sections = NAV_SECTIONS;
  protected readonly discordUrl = DISCORD_INVITE_URL;
  protected readonly dropdownWidths = new Map(
    NAV_SECTIONS.map((section) => {
      const longestLabel = Math.max(...section.pages.map((page) => Array.from(page.label).length));
      return [section.id, `calc(60px + ${Math.ceil(longestLabel * 1.2)}ch)`] as const;
    })
  );
  protected readonly openSectionId = signal<string | null>(null);
  protected readonly drawerOpen = signal(false);

  private readonly drawer = viewChild.required<ElementRef<HTMLDialogElement>>('drawer');
  private readonly router = inject(Router);
  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private hoverOpenedId: string | null = null;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  protected readonly location = computed(() => findNavLocation(this.url()));

  protected readonly menuText = computed(() => this.location()?.page.label ?? 'Menu');
  protected readonly menuLabel = computed(() => (this.location() ? `Menu: ${this.menuText()}` : null));

  constructor() {
    this.router.events.pipe(
      filter((event): event is NavigationStart => event instanceof NavigationStart),
      takeUntilDestroyed()
    ).subscribe(() => {
      this.closeMenu();
      if (this.drawerOpen()) {
        this.closeDrawer();
      }
    });
  }

  openDrawer(): void {
    const dialog = this.drawer().nativeElement;
    this.closeMenu();

    if (!dialog.open) {
      dialog.showModal();
    }
    this.drawerOpen.set(true);

    const list = dialog.querySelector<HTMLElement>('.site-drawer-nav');
    const current = list?.querySelector<HTMLElement>('.is-current');
    if (list && current) {
      list.scrollTop = current.offsetTop - (list.clientHeight - current.offsetHeight) / 2;
    }
  }

  closeDrawer(): void {
    const dialog = this.drawer().nativeElement;
    if (dialog.open) {
      dialog.close();
    }
    this.drawerOpen.set(false);
  }

  onDrawerClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeDrawer();
    }
  }

  toggleSection(section: NavSection): void {
    const keepOpen = this.hoverOpenedId === section.id && this.openSectionId() === section.id;
    this.hoverOpenedId = null;

    if (!keepOpen) {
      this.openSectionId.update((openId) => (openId === section.id ? null : section.id));
    }
  }

  onTriggerPointerEnter(section: NavSection, event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      return;
    }

    this.hoverOpenedId = section.id;
    this.openSectionId.set(section.id);
  }

  onSectionPointerLeave(section: NavSection, event: PointerEvent): void {
    if (event.pointerType === 'mouse' && this.openSectionId() === section.id) {
      this.closeMenu();
    }
  }

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

  private openSectionItem(): HTMLElement | null {
    const openId = this.openSectionId();
    return openId === null ? null : this.host.querySelector<HTMLElement>(`[data-nav-section="${openId}"]`);
  }
}
