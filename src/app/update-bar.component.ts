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

  protected readonly isNavOpen = signal(false);

  private readonly hostRef = inject(ElementRef<HTMLElement>);

  toggleNav(): void {
    this.isNavOpen.update((isOpen) => !isOpen);
  }

  closeNav(): void {
    this.isNavOpen.set(false);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (!this.isNavOpen()) {
      return;
    }

    event.preventDefault();
    this.closeNav();
  }
}
