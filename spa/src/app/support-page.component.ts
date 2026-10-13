import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getArmoryUrl } from '../utils/armory';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { getClassColor } from './class-colors';
import { characterProfileLink } from './mythic-plus-profile';
import { RevealDirective } from './reveal.directive';
import { SpotlightDirective } from './spotlight.directive';
import {
  DONATIONS,
  PlayerName,
  TESTIMONIALS,
  donationIcon,
  formatDonation,
  quoteSpans,
  testimonialSourceLabel
} from './support';
import { UpdateBarComponent } from './update-bar.component';

const QUOTE_SPANS = quoteSpans(TESTIMONIALS.map(({ quote }) => quote));

/**
 * A name with its class colour and where it links: the Mythic+ profile when one is given, else the
 * armory page when its realm is.
 */
function shownName({ name, classId, realm, mythicPlusProfile }: PlayerName) {
  return {
    name,
    color: classId ? getClassColor(classId) : undefined,
    profileLink: realm && mythicPlusProfile ? characterProfileLink({ name: mythicPlusProfile, realm }) : null,
    armoryUrl: realm ? getArmoryUrl(name, realm) : null
  };
}

/**
 * /support: how to support the site, the people who have, and what players say about it.
 * The supporters and quotes are edited by hand in support.ts.
 */
@Component({
  selector: 'app-support-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UpdateBarComponent,
    BackToTopButtonComponent,
    RevealDirective,
    SpotlightDirective
  ],
  templateUrl: './support-page.component.html',
  styleUrl: './support-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SupportPageComponent {
  /** Opens Xyhop's Discord profile, where visitors can send a friend request or a DM. */
  protected readonly discordUrl = 'https://discord.com/users/415206422503096320';
  protected readonly donations = DONATIONS.map((donation) => ({
    ...donation,
    names: donation.names.map(shownName),
    icon: donationIcon(donation.currency),
    amountLabel: formatDonation(donation)
  }));
  /** Each quote's width in the six-column grid comes from quoteSpans. */
  protected readonly testimonials = TESTIMONIALS.map((testimonial, index) => ({
    ...testimonial,
    names: testimonial.names.map(shownName),
    fromLabel: testimonialSourceLabel(testimonial.from),
    span: QUOTE_SPANS[index]
  }));
}
