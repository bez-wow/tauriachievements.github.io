import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { DISCORD_INVITE_URL } from './nav-sections';
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
  protected readonly discordUrl = DISCORD_INVITE_URL;
  protected readonly donations = DONATIONS.map((donation) => ({
    ...donation,
    icon: donationIcon(donation.currency),
    amountLabel: formatDonation(donation)
  }));
  protected readonly testimonials = TESTIMONIALS;
}
