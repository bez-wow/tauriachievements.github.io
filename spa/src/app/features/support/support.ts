export type DonationCurrency = 'eur' | 'usd' | 'credits' | 'gold';

export interface PlayerName {
  readonly name: string;
  readonly classId?: number;
  readonly realm?: string;
  readonly mythicPlusProfile?: string;
}

export interface Donation {
  readonly names: readonly PlayerName[];
  readonly amount: number;
  readonly currency: DonationCurrency;
}

export type TestimonialSource = 'character' | 'discord' | 'stoat';

export interface Testimonial {
  readonly quote: string;
  readonly names: readonly PlayerName[];
  readonly from: TestimonialSource;
}

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

const QUOTE_COLUMNS = 6;

export function quoteSpans(quotes: readonly string[]): number[] {
  const spans = quotes.map(({ length }) => (length > 180 ? QUOTE_COLUMNS : length <= 30 ? 2 : 3));
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
