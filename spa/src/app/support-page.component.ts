import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { RevealDirective } from './reveal.directive';
import { DONATIONS, TESTIMONIALS, donationIcon, formatDonation } from './support';
import { UpdateBarComponent } from './update-bar.component';

/**
 * /support: how to support the site, the people who have, and what players say about it.
 * The supporters and quotes are edited by hand in support.ts.
 */
@Component({
  selector: 'app-support-page',
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent, RevealDirective],
  templateUrl: './support-page.component.html',
  styleUrl: './support-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SupportPageComponent {
  /** Opens Xyhop's Discord profile, where visitors can send a friend request or a DM. */
  protected readonly discordUrl = 'https://discord.com/users/415206422503096320';
  protected readonly donations = DONATIONS.map((donation) => ({
    ...donation,
    icon: donationIcon(donation.currency),
    amountLabel: formatDonation(donation)
  }));
  /** Long quotes take both columns, so short ones can pair up beside each other. */
  protected readonly testimonials = TESTIMONIALS.map((testimonial) => ({
    ...testimonial,
    isWide: testimonial.quote.length > 180
  }));
}
