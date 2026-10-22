import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getArmoryUrl } from '../../game/armory';
import { getClassColor } from '../../game/class-colors';
import { DecodeDirective } from '../../shared/motion/decode.directive';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { ScrollRiseDirective } from '../../shared/motion/scroll-rise.directive';
import { SpotlightDirective } from '../../shared/motion/spotlight.directive';
import {
  DONATIONS,
  PlayerName,
  TESTIMONIALS,
  donationIcon,
  formatDonation,
  quoteSpans,
  testimonialSourceLabel
} from './support';
import { mythicPlusProfileLink } from '../../core/page-links';

const QUOTE_SPANS = quoteSpans(TESTIMONIALS.map(({ quote }) => quote));

function shownName({ name, classId, realm, mythicPlusProfile }: PlayerName) {
  return {
    name,
    color: classId ? getClassColor(classId) : undefined,
    profileLink: realm && mythicPlusProfile ? mythicPlusProfileLink({ name: mythicPlusProfile, realm }) : null,
    armoryUrl: realm ? getArmoryUrl(name, realm) : null
  };
}

@Component({
  selector: 'app-support-page',
  imports: [
    RouterLink,
    DecodeDirective,
    RevealDirective,
    ScrollRiseDirective,
    SpotlightDirective,
    NgTemplateOutlet
  ],
  templateUrl: './support-page.component.html',
  styleUrls: ['./support-page.component.scss', './support-page.motion.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SupportPageComponent {
  protected readonly discordUrl = 'https://discord.com/users/415206422503096320';
  protected readonly donations = DONATIONS.map((donation) => ({
    ...donation,
    names: donation.names.map(shownName),
    icon: donationIcon(donation.currency),
    amountLabel: formatDonation(donation)
  }));
  protected readonly testimonials = TESTIMONIALS.map((testimonial, index) => ({
    ...testimonial,
    names: testimonial.names.map(shownName),
    fromLabel: testimonialSourceLabel(testimonial.from),
    span: QUOTE_SPANS[index]
  }));
}
