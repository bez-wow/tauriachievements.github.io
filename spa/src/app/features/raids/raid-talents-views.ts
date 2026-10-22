import { CLASS_NAMES } from '../../game/wow';
import { RaidBoss, RaidSpec, RaidTalent } from './raid-logs.types';
import {
  BossTalentShares,
  BuildSummary,
  NOTABLE_MIN_PICKS,
  TalentBuild,
  TalentChoice,
  TalentPicks,
  TalentSwaps,
  TalentTiers,
  agreementLabel,
  buildTalents,
  formatPoints,
  formatShare,
  mostContestedTier,
  mostSettledTier,
  notablePicks,
  talentAgreement,
  topPlayerEdge
} from './raid-talents';

const SHOWN_BUILDS = 10;

const MIN_SWAP_CHARACTERS = 5;

const EDGE_POINTS = .05;

export interface StatTile {
  label: string;
  value: string;
  note: string;
}

export interface Insight {
  id: string;
  label: string;
  title: string;
  text: string;
  talent?: RaidTalent;
  tone?: 'up' | 'down';
}

export interface ChoiceView extends TalentChoice {
  isLeader: boolean;
  edge?: string;
  edgeTone?: 'up' | 'down';
}

export interface TierView {
  tier: number;
  level: number;
  choices: ChoiceView[];
  swapNote?: string;
}

export interface BuildRow extends TalentBuild {
  rank: number;
  picked: Array<RaidTalent | undefined>;
  meter: number;
}

export interface HeatCell {
  share: number;
  label: string;
  notable: boolean;
  thin: boolean;
  tip: string;
  tipNote: string;
}

export interface HeatRow {
  key: string;
  level: number;
  first: boolean;
  tierSize: number;
  talent?: RaidTalent;
  cells: HeatCell[];
}

export interface InsightSources {
  picks: TalentPicks;
  spec: RaidSpec | undefined;
  boss: RaidBoss | undefined;
  bossShares: readonly BossTalentShares[];
  tiers: TalentTiers;
  swaps: TalentSwaps;
}

export function talentMetaTitle(difficulty: string, boss: string | undefined): string {
  return `Talent meta · ${difficulty} · ${boss ?? 'All bosses'}`;
}

export function talentStats(picks: TalentPicks, builds: BuildSummary, boss: RaidBoss | undefined): StatTile[] {
  const agreement = talentAgreement(picks);
  return [
    {
      label: 'Characters',
      value: picks.characters.toLocaleString('en-US'),
      note: boss ? `killed ${boss.shortName}` : `${picks.picks.toLocaleString('en-US')} boss kills counted`
    },
    { label: 'Agreement', value: formatShare(agreement), note: agreementLabel(agreement) },
    {
      label: 'Builds seen',
      value: builds.builds.length.toLocaleString('en-US'),
      note: builds.builds[0] ? `most played: ${formatShare(builds.builds[0].share)}` : '-'
    },
    {
      label: 'Top 10%',
      value: picks.topPicks.toLocaleString('en-US'),
      note: boss ? `best of the ${boss.shortName} ranking` : 'best of each boss ranking'
    }
  ];
}

export function talentTierViews(picks: TalentPicks, swaps: TalentSwaps): TierView[] {
  const showEdges = picks.topPicks >= 5;
  return picks.tiers.map(tier => {
    const changed = swaps.tiers[tier.tier] ?? 0;
    return {
      tier: tier.tier,
      level: tier.level,
      swapNote: swaps.characters >= MIN_SWAP_CHARACTERS ? `${formatShare(changed / swaps.characters)} changed it` : undefined,
      choices: tier.choices.map((choice): ChoiceView => {
        const difference = choice.topShare - choice.share;
        const isEdge = showEdges && Math.abs(difference) >= EDGE_POINTS;
        return {
          ...choice,
          isLeader: choice === tier.leader,
          edge: isEdge ? formatPoints(difference) : undefined,
          edgeTone: isEdge ? (difference > 0 ? 'up' : 'down') : undefined
        };
      })
    };
  });
}

export function talentSwapExplanation(swaps: TalentSwaps, boss: RaidBoss | undefined): string {
  if (swaps.characters < MIN_SWAP_CHARACTERS) {
    return '';
  }
  return boss
    ? `"Changed it": of the ${swaps.characters.toLocaleString('en-US')} who also killed another boss, those who played something else on ${boss.shortName} than they usually do.`
    : `"Changed it": of the ${swaps.characters.toLocaleString('en-US')} who killed two or more bosses, those who didn't play the same talent on all of them.`;
}

export function talentInsights({ picks, spec, boss, bossShares, tiers, swaps }: InsightSources): Insight[] {
  if (!spec || !picks.picks) {
    return [];
  }

  const insights: Insight[] = [];
  const plural = `${spec.name} ${CLASS_NAMES[spec.classId] ?? ''}s`;

  const favoured = topPlayerEdge(picks, 'more');
  if (favoured) {
    insights.push({
      id: 'favoured',
      label: 'Top players favour',
      title: favoured.choice.talent?.name ?? 'Unknown talent',
      talent: favoured.choice.talent,
      tone: 'up',
      text: `${formatShare(favoured.choice.topShare)} of the top 10% take it at level ${favoured.tier.level}, against ${formatShare(favoured.choice.share)} of everyone.`
    });
  }

  const avoided = topPlayerEdge(picks, 'less');
  if (avoided) {
    insights.push({
      id: 'avoided',
      label: 'Top players avoid',
      title: avoided.choice.talent?.name ?? 'Unknown talent',
      talent: avoided.choice.talent,
      tone: 'down',
      text: `Only ${formatShare(avoided.choice.topShare)} of the top 10% take it, against ${formatShare(avoided.choice.share)} of everyone.`
    });
  }

  const contested = mostContestedTier(picks);
  if (contested?.leader) {
    insights.push({
      id: 'contested',
      label: 'Closest call',
      title: `Level ${contested.level}`,
      talent: contested.leader.talent,
      text: contested.choices
        .filter(choice => choice.count)
        .sort((a, b) => b.count - a.count)
        .map(choice => `${choice.talent?.name ?? 'Unknown'} ${formatShare(choice.share)}`)
        .join(' · ')
    });
  }

  const settled = mostSettledTier(picks);
  if (settled?.leader && settled !== contested) {
    insights.push({
      id: 'settled',
      label: 'Most agreed',
      title: settled.leader.talent?.name ?? 'Unknown talent',
      talent: settled.leader.talent,
      text: `${formatShare(settled.leader.share)} of ${plural} take it at level ${settled.level}.`
    });
  }

  const shares = boss ? bossShares.find(entry => entry.boss === boss) : undefined;
  const notable = shares ? notablePicks(shares)[0] : undefined;
  if (boss && notable) {
    const talent = tiers[notable.tier]?.[notable.column];
    insights.push({
      id: 'boss',
      label: `Picked for ${boss.shortName}`,
      title: talent?.name ?? 'Unknown talent',
      talent,
      tone: 'up',
      text: `${formatShare(notable.share)} take it on ${boss.shortName}, against ${formatShare(notable.elsewhere)} on the other bosses.`
    });
  }

  if (swaps.characters >= MIN_SWAP_CHARACTERS) {
    const most = swaps.tiers.reduce((best, count, tier) => count > swaps.tiers[best] ? tier : best, 0);
    const level = picks.tiers[most]?.level;
    insights.push(boss
      ? {
        id: 'swaps',
        label: `Changed for ${boss.shortName}`,
        title: `${formatShare(swaps.changed / swaps.characters)} of players`,
        text: `who also killed other bosses played a talent on ${boss.shortName} that they usually don't. Level ${level} changes the most (${formatShare(swaps.tiers[most] / swaps.characters)}).`
      }
      : {
        id: 'swaps',
        label: 'Changed between bosses',
        title: `${formatShare(swaps.changed / swaps.characters)} of players`,
        text: `who killed two or more bosses didn't play one build on all of them. Level ${level} changes the most (${formatShare(swaps.tiers[most] / swaps.characters)}).`
      });
  }

  return insights;
}

export function talentBuildRows(builds: readonly TalentBuild[], tiers: TalentTiers): BuildRow[] {
  const most = builds[0]?.share ?? 0;
  return builds.slice(0, SHOWN_BUILDS).map((build, index) => ({
    ...build,
    rank: index + 1,
    picked: buildTalents(build.talents, tiers),
    meter: most ? build.share / most : 0
  }));
}

export function talentHeatRows(shares: readonly BossTalentShares[], tiers: TalentTiers, levels: readonly number[]): HeatRow[] {
  const notable = shares.map(entry => new Set(notablePicks(entry).map(pick => `${pick.tier}|${pick.column}`)));

  return tiers.flatMap((choices, tier) => choices.map((talent, column): HeatRow => ({
    key: `${tier}|${column}`,
    level: levels[tier] ?? 0,
    first: column === 0,
    tierSize: choices.length,
    talent,
    cells: shares.map((entry, bossIndex): HeatCell => {
      const share = entry.shares[tier]?.[column] ?? 0;
      const elsewhere = entry.elsewhere[tier]?.[column] ?? 0;
      return {
        share,
        label: entry.picks ? formatShare(share) : '-',
        notable: notable[bossIndex].has(`${tier}|${column}`),
        thin: entry.picks < NOTABLE_MIN_PICKS,
        tip: `${talent?.name ?? 'Unknown talent'} on ${entry.boss.shortName}`,
        tipNote: entry.picks
          ? `${formatShare(share)} of ${entry.picks.toLocaleString('en-US')} · ${formatShare(elsewhere)} on the other bosses`
          : 'Nobody played the spec here'
      };
    })
  })));
}

export function heatColor(share: number): string {
  return `rgba(247, 181, 0, ${(.04 + share * .5).toFixed(3)})`;
}
