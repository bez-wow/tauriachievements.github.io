import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener } from '@angular/core';

@Component({
  selector: 'app-back-to-top-button',
  templateUrl: './back-to-top-button.component.html',
  styleUrls: ['./back-to-top-button.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BackToTopButtonComponent {
  isVisible = false;

  constructor(private cdr: ChangeDetectorRef) {}

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    const shouldBeVisible = scrollTop > 400;

    if (shouldBeVisible === this.isVisible) {
      return;
    }

    this.isVisible = shouldBeVisible;
    this.cdr.markForCheck();
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
