/** How a donation was paid: real money through PayPal, or in-game Tauri Credits or gold. */
export type DonationCurrency = 'eur' | 'usd' | 'credits' | 'gold';

/** One entry on the /support page's list of supporters. */
export interface Donation {
  /** Character or Discord name, as the supporter wants to be shown. */
  readonly name: string;
  readonly amount: number;
  readonly currency: DonationCurrency;
}

/** Something nice a player said about the site. */
export interface Testimonial {
  readonly quote: string;
  /** Character or Discord name. */
  readonly author: string;
  /** Where the name is from, shown as a small tag beside it. */
  readonly from: 'character' | 'discord';
}

// Shown in this order: add a new supporter at the bottom.
export const DONATIONS: readonly Donation[] = [
  { name: 'Gailia', amount: 50, currency: 'eur' },
  { name: 'Clouds', amount: 100_000, currency: 'gold' }
];

// Shown in this order: add a new quote, and the name of the person who said it, at the bottom.
export const TESTIMONIALS: readonly Testimonial[] = [
  { quote: 'Our entire guild is going back to your website fairly often though and I often refer people there as well when they are asking questions.', author: 'Cloud', from: 'discord' },
  { quote: 'I wouldn\'t have thought that a so seamless and detailed implementation of a rio-like system - including an add-on - was possible in basically a couple of days on a private server. Cheers to you for making THE most important third-party contribution to the tauri realms, probably ever!', author: 'Etiiri/Táncoslány', from: 'discord' },
  { quote: 'U did some OP dev job there, thanks for the contribution. The addon is even more amazing.', author: 'Musadon', from: 'discord' }
];

const CURRENCY_ICONS: Record<DonationCurrency, string> = {
  eur: '💶',
  usd: '💵',
  credits: '💠',
  gold: '🪙'
};

export function donationIcon(currency: DonationCurrency): string {
  return CURRENCY_ICONS[currency];
}

/** The amount as it reads on the page: "€50", "$12.50", "500 Tauri Credits", "100,000 gold". */
export function formatDonation({ amount, currency }: Donation): string {
  if (currency === 'eur' || currency === 'usd') {
    return amount.toLocaleString('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
    });
  }

  const count = amount.toLocaleString('en-US');
  return currency === 'gold' ? `${count} gold` : `${count} Tauri Credits`;
}
