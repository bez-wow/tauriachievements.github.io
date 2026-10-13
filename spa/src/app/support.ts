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

/** The quote grid has six columns, so quotes can sit two (three columns each) or three (two) to a row. */
export const QUOTE_COLUMNS = 6;

/**
 * How many columns each quote takes: a long one the whole row, a one-liner a third, the rest half.
 * Places them the way the grid's dense packing does, then widens the last quote of each row to its
 * end, so no row is left with a gap.
 */
export function quoteSpans(quotes: readonly string[]): number[] {
  const spans = quotes.map(({ length }) => (length > 180 ? QUOTE_COLUMNS : length <= 30 ? 2 : 3));
  // Columns filled in each row, and the quote placed last in it. Rows fill from the left.
  const filled: number[] = [];
  const lastInRow: number[] = [];

  spans.forEach((span, index) => {
    let row = filled.findIndex((columns) => columns + span <= QUOTE_COLUMNS);
    if (row < 0) {
      row = filled.push(0) - 1;
    }
    filled[row] += span;
    lastInRow[row] = index;
  });
  filled.forEach((columns, row) => {
    spans[lastInRow[row]] += QUOTE_COLUMNS - columns;
  });
  return spans;
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
