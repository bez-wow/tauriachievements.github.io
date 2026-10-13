/** How a donation was paid: real money through PayPal, or in-game Tauri Credits or gold. */
export type DonationCurrency = 'eur' | 'usd' | 'credits' | 'gold';

/** A character, Discord or Stoat name, as the person wants to be shown. */
export interface PlayerName {
  readonly name: string;
  /** The character's class id (1 Warrior, 2 Paladin, 6 Death Knight, 10 Monk, 11 Druid…), to colour the name. */
  readonly classId?: number;
  /** The character's realm ('tauri', 'evermoon', 'wod'), to link the name to its armory page. */
  readonly realm?: string;
  /** Links the name to this character's Mythic+ profile on `realm` instead of the armory. */
  readonly mythicPlusProfile?: string;
}

/** One entry on the /support page's list of supporters. */
export interface Donation {
  /** One person's names, sharing one row. */
  readonly names: readonly PlayerName[];
  readonly amount: number;
  readonly currency: DonationCurrency;
}

/** Where a quote's author name is from: an in-game character, or the Discord or Stoat chat. */
export type TestimonialSource = 'character' | 'discord' | 'stoat';

/** Something nice a player said about the site. */
export interface Testimonial {
  readonly quote: string;
  /** Who said it: one person's names, shown together. */
  readonly names: readonly PlayerName[];
  /** Where the names are from, shown as a small tag beside them. */
  readonly from: TestimonialSource;
}

// Shown in this order: add a new supporter at the bottom.
export const DONATIONS: readonly Donation[] = [
  {
    names: [
      { name: 'Etiiri', classId: 1, realm: 'tauri' },
      { name: 'Táncoslány', classId: 10, realm: 'tauri' },
      { name: 'Gailia', classId: 2, realm: 'tauri' }
    ],
    amount: 50,
    currency: 'eur'
  },
  {
    names: [{ name: 'Clouds' }, { name: 'Faenrin', classId: 6, realm: 'evermoon' }],
    amount: 150_000,
    currency: 'gold'
  }
];

// Shown in this order: add a new quote, and the names of the person who said it, at the bottom.
export const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote: 'Our entire guild is going back to your website fairly often though and I often refer people there as well when they are asking questions.',
    names: [{ name: 'Cloud' }, { name: 'Faenrin', classId: 6, realm: 'evermoon' }],
    from: 'discord'
  },
  {
    quote: 'I wouldn\'t have thought that a so seamless and detailed implementation of a rio-like system - including an add-on - was possible in basically a couple of days on a private server. Cheers to you for making THE most important third-party contribution to the tauri realms, probably ever!',
    names: [
      { name: 'Etiiri', classId: 1, realm: 'tauri' },
      { name: 'Táncoslány', classId: 10, realm: 'tauri' },
      { name: 'Gailia', classId: 2, realm: 'tauri' }
    ],
    from: 'discord'
  },
  {
    quote: 'U did some OP dev job there, thanks for the contribution. The addon is even more amazing.',
    names: [{ name: 'Musadon' }],
    from: 'discord'
  },
  { quote: 'Ty Xyhop, god\'s work', names: [{ name: 'Tomir' }], from: 'stoat' },
  { quote: 'ridiculously good work', names: [{ name: 'hecker' }], from: 'stoat' },
  { quote: 'absolutely amazing work', names: [{ name: 'Bragorn', classId: 1, realm: 'evermoon' }], from: 'stoat' },
  {
    quote: 'thanks for ur efforts. 🫡',
    names: [{ name: 'Yoda', classId: 11, realm: 'evermoon', mythicPlusProfile: 'Yodadru' }],
    from: 'discord'
  },
  {
    quote: 'shit, that\'s dope, great work then!',
    names: [{ name: 'Shaterhand', classId: 2, realm: 'evermoon' }],
    from: 'discord'
  },
  { quote: 'nice job, the addon works awesome!', names: [{ name: 'Zago' }], from: 'discord' },
  {
    quote: 'amazing, the animations add a nice touch 🙂 encourages pushing other specs',
    names: [{ name: 'Nap', classId: 11, realm: 'evermoon' }],
    from: 'discord'
  }
];

const SOURCE_LABELS: Record<TestimonialSource, string> = {
  character: 'Character',
  discord: 'Discord',
  stoat: 'Stoat'
};

export function testimonialSourceLabel(from: TestimonialSource): string {
  return SOURCE_LABELS[from];
}

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
