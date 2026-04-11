import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Input, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

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
  @Input() lastEditedTimeZoneLabel = 'Local time';

  protected readonly isMobileMenuOpen = signal(false);

  private readonly hostRef = inject(ElementRef<HTMLElement>);

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((isOpen) => !isOpen);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isMobileMenuOpen()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node) || this.hostRef.nativeElement.contains(target)) {
      return;
    }

    this.closeMobileMenu();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (!this.isMobileMenuOpen()) {
      return;
    }

    event.preventDefault();
    this.closeMobileMenu();
  }
}
